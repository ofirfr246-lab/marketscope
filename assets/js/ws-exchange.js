/* MarketScope Exchange: trading-terminal layout. SIMULATION ONLY (virtual credits, no real money).
   A symbol's index value is the Opportunity score (0–100) of the user's newest live snapshot of that
   product. Every candle, volume bar and research field comes from the user's own stored snapshots. */
import { $, $$, esc, num, fmt, money, pct, fdate, verdictPill, toast, errMsg, boot, loadSnapshots, groupProducts, candleChart, monthlyPoints } from "./ms-workspace.js";

var S = { sb: null, products: [], acct: null, pos: [], orders: [], watch: [], sel: null, wl: "all", filter: "",
  metric: "opportunity", interval: "D", range: 0, ind: { ma3: true, ma7: false, spread: false, vol: true }, side: "buy", tab: "positions", rt: "research" };
var C = { chart: null, main: null, vol: null, ma3: null, ma7: null, spread: null, lines: [] };
var START = 100000;
var METRIC = { opportunity: "Opportunity", demand: "Demand", price_median: "Median price", searches: "Monthly searches" };

function vc(n, d) { n = num(n); return n == null ? "—" : fmt(n, d == null ? 2 : d) + " VC"; }
function prod(sym) { return S.products.find(function (p) { return p.symbol === sym; }); }
function tradable() { return S.products.filter(function (p) { return num(p.latest.opportunity) != null; }); }
function last(sym) { var p = prod(sym); return p ? num(p.latest.opportunity) : null; }
function starred(p) { return S.watch.some(function (w) { return w.product_key === p.key && w.market === p.market; }); }
function rel(iso) {
  var d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(d)) return "—";
  if (d < 3600) return Math.max(1, Math.round(d / 60)) + " min ago";
  if (d < 86400) return Math.round(d / 3600) + " h ago";
  return Math.round(d / 86400) + " days ago";
}

/* ---------------- data ---------------- */
async function load() {
  await S.sb.rpc("exchange_open_account");
  var r = await Promise.all([
    loadSnapshots(S.sb),
    S.sb.from("exchange_accounts").select("*").maybeSingle(),
    S.sb.from("exchange_positions").select("*"),
    S.sb.from("exchange_orders").select("*").order("created_at", { ascending: false }).limit(300),
    S.sb.from("research_watchlist").select("id, product_key, market")
  ]);
  S.products = groupProducts(r[0]); S.acct = r[1].data; S.pos = r[2].data || []; S.orders = r[3].data || []; S.watch = r[4].data || [];
  var t = tradable();
  if ((!S.sel || !prod(S.sel)) && t.length) S.sel = t[t.length - 1].symbol;
}
function reservedSell() {
  var m = {};
  S.orders.filter(function (o) { return o.status === "open" && o.side === "sell"; }).forEach(function (o) { m[o.symbol] = (m[o.symbol] || 0) + num(o.reserved); });
  return m;
}
function account() {
  var rs = reservedSell(), mv = 0, cost = 0;
  S.pos.forEach(function (p) { var q = num(p.qty) + (rs[p.symbol] || 0), l = last(p.symbol); if (q > 0 && l != null) { mv += q * l; cost += q * num(p.avg_cost); } });
  var rb = S.orders.filter(function (o) { return o.status === "open" && o.side === "buy"; }).reduce(function (a, o) { return a + num(o.reserved); }, 0);
  var cash = S.acct ? num(S.acct.balance) : 0;
  var fees = S.orders.reduce(function (a, o) { return a + (num(o.fee) || 0); }, 0);
  return { cash: cash, reservedBuy: rb, mv: mv, unreal: mv - cost, equity: cash + rb + mv, fees: fees };
}

/* ---------------- series building ---------------- */
function bucketKey(iso, interval) {
  var d = new Date(iso);
  if (interval === "M") return d.toISOString().slice(0, 7) + "-01";
  if (interval === "W") { var day = (d.getUTCDay() + 6) % 7; var m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)); return m.toISOString().slice(0, 10); }
  return d.toISOString().slice(0, 10);
}
export function buildCandles(series, field, interval, rangeDays) {
  var cut = rangeDays ? Date.now() - rangeDays * 864e5 : 0;
  var by = {}, order = [];
  series.forEach(function (s) {
    if (new Date(s.captured_at).getTime() < cut) return;
    var v = num(s[field]); if (v == null) return;
    var k = bucketKey(s.captured_at, interval);
    if (!by[k]) { by[k] = { time: k, open: v, high: v, low: v, close: v, n: 0, vol: null, demand: null, comp: null }; order.push(k); }
    var c = by[k]; c.high = Math.max(c.high, v); c.low = Math.min(c.low, v); c.close = v; c.n++;
    if (num(s.search_volume) != null) c.vol = num(s.search_volume);
    if (num(s.demand) != null) c.demand = num(s.demand);
    if (num(s.competition) != null) c.comp = num(s.competition);
  });
  /* Like a market chart, each candle opens where the previous one closed, so a single
     snapshot per bucket still shows the move since the last report. */
  var out = order.sort().map(function (k) { return by[k]; });
  for (var i = 1; i < out.length; i++) { var o = out[i - 1].close; out[i].open = o; out[i].high = Math.max(out[i].high, o); out[i].low = Math.min(out[i].low, o); }
  return out;
}
function sma(c, n) {
  var out = [];
  for (var i = n - 1; i < c.length; i++) { var s = 0; for (var j = i - n + 1; j <= i; j++) s += c[j].close; out.push({ time: c[i].time, value: Math.round(s / n * 100) / 100 }); }
  return out;
}

/* ---------------- chart ---------------- */
function LC() { return window.LightweightCharts; }
function ensureChart() {
  if (C.chart || !LC()) return !!C.chart;
  var el = $("[data-chart]");
  var L = LC();
  C.chart = L.createChart(el, {
    autoSize: true,
    layout: { background: { type: "solid", color: "transparent" }, textColor: "#8b95a3", fontFamily: "JetBrains Mono, ui-monospace, monospace", fontSize: 11, attributionLogo: false },
    grid: { vertLines: { color: "rgba(26,32,40,.55)" }, horzLines: { color: "rgba(26,32,40,.55)" } },
    crosshair: { mode: L.CrosshairMode ? L.CrosshairMode.Normal : 0, vertLine: { color: "rgba(255,176,0,.45)", labelBackgroundColor: "#ffb000" }, horzLine: { color: "rgba(255,176,0,.45)", labelBackgroundColor: "#ffb000" } },
    rightPriceScale: { borderColor: "#1a2028" },
    timeScale: { borderColor: "#1a2028", rightOffset: 4, barSpacing: 14, minBarSpacing: 4 },
    handleScroll: true, handleScale: true
  });
  $("[data-attr]").hidden = false;
  C.chart.subscribeCrosshairMove(function (p) { legend(p && p.time ? p.time : null); });
  return true;
}
function clearSeries() {
  ["main", "vol", "ma3", "ma7", "spread"].forEach(function (k) { if (C[k]) { C.chart.removeSeries(C[k]); C[k] = null; } });
  C.lines = [];
}
var LEG = { candles: [], line: [], ma3: [], ma7: [] };
function legend(time) {
  var host = $("[data-legend]"); if (!host) return;
  var p = prod(S.sel); if (!p) { host.innerHTML = ""; return; }
  var title = "<span><b>" + esc(p.product) + "</b> · " + esc(METRIC[S.metric]) + (S.metric === "searches" ? "" : " · " + S.interval) + "</span>";
  if (S.metric === "searches") {
    var pt = time ? LEG.line.find(function (x) { return x.time === time; }) : LEG.line[LEG.line.length - 1];
    host.innerHTML = title + (pt ? "<span>" + esc(pt.time.slice(0, 7)) + " <b>" + fmt(pt.value, 0) + "</b> searches</span>" : "");
    return;
  }
  var c = time ? LEG.candles.find(function (x) { return x.time === time; }) : LEG.candles[LEG.candles.length - 1];
  if (!c) { host.innerHTML = title; return; }
  var col = c.close >= c.open ? "up" : "down";
  host.innerHTML = title + '<span class="' + col + '">O <b>' + fmt(c.open) + "</b> H <b>" + fmt(c.high) + "</b> L <b>" + fmt(c.low) + "</b> C <b>" + fmt(c.close) + "</b></span>" +
    "<span>" + c.n + " snapshot" + (c.n === 1 ? "" : "s") + "</span>" + (S.ind.vol && c.vol != null ? "<span>Vol <b>" + fmt(c.vol, 0) + "</b>/mo</span>" : "");
}
function chartEmpty(title, text, cta) {
  var e = $("[data-chart-empty]");
  if (!title) { e.hidden = true; e.innerHTML = ""; return; }
  e.hidden = false;
  e.innerHTML = '<div class="box"><svg class="ghost" viewBox="0 0 420 120" aria-hidden="true">' +
    [20, 60, 100, 140, 180, 220, 260, 300, 340, 380].map(function (x, i) { var h = [30, 46, 38, 60, 52, 70, 58, 80, 66, 90][i]; return '<line x1="' + x + '" x2="' + x + '" y1="' + (110 - h - 12) + '" y2="' + (112 - h + 30) + '" stroke="#2a323c"/><rect x="' + (x - 7) + '" y="' + (110 - h) + '" width="14" height="' + (h / 2.2) + '" rx="2" fill="#1d232b"/>'; }).join("") +
    '</svg><h3>' + esc(title) + "</h3><p>" + esc(text) + "</p>" + (cta || "") + "</div>";
}
function drawChart() {
  var p = prod(S.sel);
  $("[data-wm]").textContent = p ? p.product : "MarketScope";
  if (!p) {
    if (C.chart) clearSeries();
    chartEmpty("No symbols yet", "Every product you research with a live report becomes a symbol. Its candles come from your snapshots, and its volume bars from real monthly Google searches.", '<a class="btn btn-sm btn-amber" href="app.html">Run a research report</a>');
    legend(null); return;
  }
  var useLC = ensureChart();
  var isLine = S.metric === "searches";
  $$("[data-interval] button,[data-ind]").forEach(function (b) { b.disabled = isLine; });
  if (isLine) {
    LEG.line = monthlyPoints(p.latest.monthly_searches).map(function (m) { return { time: m.label + "-01", value: m.y }; });
    if (!LEG.line.length) { if (useLC) clearSeries(); chartEmpty("No search history in this report", "Google returned no monthly volumes for this keyword and market. Try another series."); legend(null); return; }
  } else {
    LEG.candles = buildCandles(p.series, S.metric, S.interval, S.range);
    if (!LEG.candles.length) { if (useLC) clearSeries(); chartEmpty("No data in this range", S.range ? "None of your snapshots fall in this range. Choose ALL, or run a new report." : "Your reports for this product don't include " + METRIC[S.metric].toLowerCase() + "."); legend(null); return; }
  }
  chartEmpty(null);
  if (!useLC) {
    /* Fallback when the chart library can't load: our own SVG candles. */
    var host = $("[data-chart]");
    if (isLine) { host.innerHTML = '<div style="padding:30px 16px 0"></div>'; candleChart(host.firstChild, LEG.line.map(function (x) { return { label: x.time.slice(0, 7), o: x.value, h: x.value, l: x.value, c: x.value, n: 1 }; }), { h: 300 }); }
    else { host.innerHTML = '<div style="padding:30px 16px 0"></div>'; candleChart(host.firstChild, LEG.candles.map(function (c) { return { label: c.time, o: c.open, h: c.high, l: c.low, c: c.close, n: c.n }; }), { h: 300 }); }
    legend(null); return;
  }
  clearSeries();
  var L = LC();
  if (isLine) {
    C.main = C.chart.addAreaSeries({ lineColor: "#4da3ff", topColor: "rgba(77,163,255,.28)", bottomColor: "rgba(77,163,255,0)", lineWidth: 2, priceFormat: { type: "volume" } });
    C.main.setData(LEG.line);
  } else {
    var price = S.metric === "price_median";
    C.main = C.chart.addCandlestickSeries({ upColor: "#19d27c", downColor: "#ff4d5e", borderVisible: false, wickUpColor: "#19d27c", wickDownColor: "#ff4d5e",
      priceFormat: { type: "price", precision: price ? 2 : 0, minMove: price ? 0.01 : 1 } });
    C.main.setData(LEG.candles.map(function (c) { return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }; }));
    C.main.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: S.ind.vol ? 0.28 : 0.08 } });
    if (S.ind.vol) {
      C.vol = C.chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
      C.chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
      C.vol.setData(LEG.candles.filter(function (c) { return c.vol != null; }).map(function (c) { return { time: c.time, value: c.vol, color: c.close >= c.open ? "rgba(25,210,124,.4)" : "rgba(255,77,94,.4)" }; }));
    }
    if (S.ind.ma3 && LEG.candles.length >= 3) { C.ma3 = C.chart.addLineSeries({ color: "#ffb000", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); C.ma3.setData(sma(LEG.candles, 3)); }
    if (S.ind.ma7 && LEG.candles.length >= 7) { C.ma7 = C.chart.addLineSeries({ color: "#a78bfa", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); C.ma7.setData(sma(LEG.candles, 7)); }
    if (S.ind.spread) {
      C.spread = C.chart.addLineSeries({ color: "#4da3ff", lineWidth: 1, lineStyle: 2, priceScaleId: "spread", priceLineVisible: false, lastValueVisible: true, title: "D−C" });
      C.chart.priceScale("spread").applyOptions({ scaleMargins: { top: 0.1, bottom: 0.3 }, visible: false });
      C.spread.setData(LEG.candles.filter(function (c) { return c.demand != null && c.comp != null; }).map(function (c) { return { time: c.time, value: c.demand - c.comp }; }));
    }
    if (S.metric === "opportunity") {
      S.orders.filter(function (o) { return o.status === "open" && o.symbol === p.symbol; }).forEach(function (o) {
        C.lines.push(C.main.createPriceLine({ price: num(o.limit_price), color: o.side === "buy" ? "#19d27c" : "#ff4d5e", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: (o.side === "buy" ? "BUY " : "SELL ") + fmt(o.qty) }));
      });
      var pos = S.pos.find(function (x) { return x.symbol === p.symbol && num(x.qty) > 0; });
      if (pos) C.lines.push(C.main.createPriceLine({ price: num(pos.avg_cost), color: "#ffb000", lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: "AVG" }));
    }
  }
  C.chart.timeScale().fitContent();
  legend(null);
}

/* ---------------- panels ---------------- */
function spark(series, w, h) {
  var v = series.map(function (s) { return num(s.opportunity); }).filter(function (x) { return x != null; });
  if (v.length < 2) return "";
  var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v); if (lo === hi) { lo -= 1; hi += 1; }
  var pts = v.map(function (x, i) { return (i / (v.length - 1) * w).toFixed(1) + "," + (h - (x - lo) / (hi - lo) * h).toFixed(1); }).join(" ");
  var col = v[v.length - 1] >= v[0] ? "#19d27c" : "#ff4d5e";
  return '<svg class="xt-spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="1.5"/></svg>';
}
function paintWatch() {
  var list = tradable().slice().reverse().filter(function (p) {
    if (S.wl === "star" && !starred(p)) return false;
    return !S.filter || (p.product + " " + p.market).toLowerCase().indexOf(S.filter) >= 0;
  });
  var host = $("[data-symbols]");
  if (!tradable().length) { host.innerHTML = '<div class="xt-none"><b>No symbols yet</b>Run a live research report. Each product becomes a symbol here.<p style="margin-top:10px"><a class="btn btn-sm btn-amber" href="app.html">Run a report</a></p></div>'; return; }
  if (!list.length) { host.innerHTML = '<div class="xt-none">' + (S.wl === "star" ? "No starred symbols. Tap ☆ to star one." : "No symbols match.") + "</div>"; return; }
  host.innerHTML = list.map(function (p) {
    var d = p.prev && num(p.prev.opportunity) != null ? p.latest.opportunity - p.prev.opportunity : null;
    return '<div class="xt-sym' + (p.symbol === S.sel ? " on" : "") + '" data-sym="' + esc(p.symbol) + '" role="button" tabindex="0"><button type="button" class="xt-star' + (starred(p) ? " on" : "") + '" data-star="' + esc(p.symbol) + '" aria-label="Star">' + (starred(p) ? "★" : "☆") + "</button>" +
      '<div style="min-width:0"><div class="nm">' + esc(p.product) + '</div><div class="mk">' + esc(p.market) + " · " + p.series.length + " snap</div>" + spark(p.series, 120, 18) + "</div>" +
      '<div><div class="px">' + p.latest.opportunity + '</div><div class="ch ' + (d > 0 ? "up" : d < 0 ? "down" : "") + '">' + (d == null ? "—" : (d > 0 ? "+" : "") + d) + "</div></div></div>";
  }).join("");
}
function paintCats() {
  var cats = {};
  tradable().forEach(function (x) { if (x.category) (cats[x.category] = cats[x.category] || []).push(num(x.latest.opportunity)); });
  var ks = Object.keys(cats).sort();
  $("[data-cat-idx]").innerHTML = ks.length ? '<table class="xt-t"><tbody>' + ks.map(function (c) { var v = cats[c].reduce(function (a, b) { return a + b; }, 0) / cats[c].length; return "<tr><td>" + esc(c) + ' <span class="ws-mini">(' + cats[c].length + ')</span></td><td class="num"><b>' + fmt(v, 1) + "</b></td></tr>"; }).join("") + "</tbody></table>"
    : '<p class="ws-mini" style="margin:0">Assign categories in the Live Terminal to build category indices.</p>';
}
function paintHead() {
  var p = prod(S.sel);
  if (!p) { $("[data-sym-name]").textContent = "No symbol selected"; $("[data-sym-sub]").textContent = "MSX · simulation"; $("[data-last]").textContent = "—"; $("[data-chg]").innerHTML = ""; $("[data-verdict]").innerHTML = ""; $("[data-hstats]").innerHTML = ""; return; }
  var s = p.latest, d = p.prev && num(p.prev.opportunity) != null ? s.opportunity - p.prev.opportunity : null;
  $("[data-sym-name]").textContent = p.product;
  $("[data-sym-sub]").textContent = "MSX:" + p.key.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) + " · " + p.market + " · updated " + rel(s.captured_at);
  $("[data-last]").textContent = s.opportunity;
  $("[data-chg]").innerHTML = d == null ? '<span class="ws-mini">first snapshot</span>' : '<span class="' + (d > 0 ? "up" : d < 0 ? "down" : "") + '">' + (d > 0 ? "+" : "") + d + " (" + pct(p.prev.opportunity ? d / p.prev.opportunity * 100 : null) + ")</span>";
  $("[data-verdict]").innerHTML = verdictPill(s.verdict);
  var hiV = Math.max.apply(null, p.series.map(function (x) { return num(x.opportunity) || 0; })), loV = Math.min.apply(null, p.series.map(function (x) { return num(x.opportunity) == null ? 100 : x.opportunity; }));
  $("[data-hstats]").innerHTML = [["HIGH", hiV], ["LOW", loV], ["MEDIAN PRICE", money(s.price_median, s.currency)], ["SEARCHES/MO", fmt(s.search_volume, 0)], ["SNAPSHOTS", p.series.length]]
    .map(function (k) { return '<div class="xt-stat"><div class="k">' + k[0] + '</div><div class="v">' + k[1] + "</div></div>"; }).join("");
}
function ring(v) {
  var r = 36, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, num(v) || 0)) / 100;
  var col = v >= 65 ? "#19d27c" : v >= 50 ? "#ffb000" : v >= 35 ? "#ff8a3d" : "#ff4d5e";
  return '<svg class="xt-ring" viewBox="0 0 86 86" aria-label="Opportunity ' + esc(v) + ' of 100"><circle cx="43" cy="43" r="' + r + '" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="7"/>' +
    '<circle cx="43" cy="43" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (c * f).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 43 43)"/>' +
    '<text x="43" y="47" text-anchor="middle">' + (v == null ? "—" : v) + '</text><text class="lb" x="43" y="60" text-anchor="middle">/ 100</text></svg>';
}
function bar(label, v, invert) {
  v = num(v);
  var col = v == null ? "#5d6672" : (invert ? (v <= 40 ? "#19d27c" : v <= 65 ? "#ffb000" : "#ff4d5e") : (v >= 65 ? "#19d27c" : v >= 40 ? "#ffb000" : "#ff4d5e"));
  return '<div class="xt-bar"><div class="k"><span>' + label + "</span><span>" + (v == null ? "—" : v) + '</span></div><div class="t"><i style="width:' + (v || 0) + "%;background:" + col + '"></i></div></div>';
}
function srcChips(src) {
  if (!src || typeof src !== "object") return '<span>sources not recorded</span>';
  var names = { shopping: "Google Shopping", search_volume: "Search volume", related_keywords: "Related keywords", serp: "Search results page" };
  return Object.keys(names).filter(function (k) { return src[k] != null; }).map(function (k) {
    var st = String(src[k]); return '<span class="' + (st === "ok" ? "ok" : st === "skipped" ? "" : "bad") + '">' + names[k] + " · " + esc(st) + "</span>";
  }).join("") || "<span>sources not recorded</span>";
}
function miniSearch(ms) {
  var pts = monthlyPoints(ms); if (pts.length < 2) return '<p class="ws-mini" style="margin:0">No monthly history in this report.</p>';
  var v = pts.map(function (p) { return p.y; }), mx = Math.max.apply(null, v) || 1, w = 300, h = 54, bw = w / v.length;
  return '<svg viewBox="0 0 ' + w + " " + (h + 12) + '" style="width:100%;height:66px" aria-label="12-month search history">' + v.map(function (x, i) { var bh = Math.max(2, x / mx * h); return '<rect x="' + (i * bw + 1) + '" y="' + (h - bh) + '" width="' + (bw - 2) + '" height="' + bh + '" rx="2" fill="rgba(77,163,255,.55)"><title>' + esc(pts[i].label + ": " + fmt(x, 0)) + "</title></rect>"; }).join("") +
    '<text x="0" y="' + (h + 11) + '" fill="#5d6672" font-size="9" font-family="monospace">' + esc(pts[0].label) + '</text><text x="' + w + '" y="' + (h + 11) + '" fill="#5d6672" font-size="9" font-family="monospace" text-anchor="end">' + esc(pts[pts.length - 1].label) + "</text></svg>";
}
function paintResearch() {
  var host = $('[data-rpanel="research"]'), p = prod(S.sel);
  if (!p) { host.innerHTML = '<div class="xt-none" style="padding:30px 16px"><b>No research yet</b>Run a live report on a product to see its full research card here: score, rating, demand, competition, prices and search history.<p style="margin-top:12px"><a class="btn btn-sm btn-amber" href="app.html">Run a research report</a></p></div>'; return; }
  var s = p.latest;
  var pos = num(s.price_median) != null && num(s.price_min) != null && num(s.price_max) != null && s.price_max > s.price_min ? (s.price_median - s.price_min) / (s.price_max - s.price_min) * 100 : null;
  var ask = "Using my MarketScope research on \"" + p.product + "\" (" + p.market + "), should I sell it, at what price, and what are the main risks?";
  host.innerHTML =
    '<div class="xt-sec"><div class="xt-sec-h"><span>OPPORTUNITY</span><span>' + verdictPill(s.verdict) + '</span></div><div class="xt-score">' + ring(s.opportunity) +
      '<div class="xt-bars">' + bar("Demand", s.demand) + bar("Competition", s.competition, true) + bar("Saturation", s.saturation, true) + "</div></div>" +
      '<p class="ws-mini" style="margin:8px 0 0">Confidence: <b style="color:' + (s.confidence === "Live" ? "var(--green)" : "var(--amber)") + '">' + esc(s.confidence || "Live") + '</b> · <a class="amber" href="methodology.html#exact-formulas">formulas</a></p></div>' +
    '<div class="xt-sec"><div class="xt-sec-h"><span>PRICE · GOOGLE SHOPPING</span><span>' + esc(s.currency || "") + "</span></div>" +
      '<div class="xt-kv"><span>Median</span><b>' + money(s.price_median, s.currency) + "</b><span>Range</span><b>" + money(s.price_min, s.currency) + " – " + money(s.price_max, s.currency) + "</b><span>Sellers / listings</span><b>" + fmt(s.seller_count, 0) + " / " + fmt(s.listing_count, 0) + "</b></div>" +
      (pos != null ? '<div class="xt-range" title="Median within the price range"><i style="left:calc(' + pos.toFixed(1) + '% - 1px)"></i></div><div class="ws-mini" style="display:flex;justify-content:space-between"><span>min</span><span>median</span><span>max</span></div>' : "") + "</div>" +
    '<div class="xt-sec"><div class="xt-sec-h"><span>DEMAND · GOOGLE SEARCH</span></div><div class="xt-kv"><span>Monthly searches</span><b>' + fmt(s.search_volume, 0) + "</b><span>3-month trend</span><b class=\"" + (num(s.trend_slope) > 0 ? "up" : num(s.trend_slope) < 0 ? "down" : "") + '">' + pct(num(s.trend_slope) == null ? null : s.trend_slope * 100) + "</b><span>Avg CPC</span><b>" + money(s.cpc, "USD") + "</b></div>" +
      '<div style="margin-top:8px">' + miniSearch(s.monthly_searches) + "</div></div>" +
    '<div class="xt-sec"><div class="xt-sec-h"><span>DATA &amp; FRESHNESS</span></div><div class="xt-kv" style="margin-bottom:8px"><span>Last report</span><b>' + fdate(s.captured_at, true) + "</b><span>Age</span><b>" + rel(s.captured_at) + "</b><span>Snapshots</span><b>" + p.series.length + "</b><span>First seen</span><b>" + fdate(p.series[0].captured_at) + "</b></div>" +
      '<div class="xt-chips">' + srcChips(s.sources) + "</div></div>" +
    '<div class="xt-sec" style="border-bottom:0"><div class="xt-actions"><a class="btn btn-sm btn-amber full" href="josy-chat.html?ask=' + encodeURIComponent(ask) + '">Ask Josy AI about this product</a>' +
      '<a class="btn btn-sm btn-ghost" href="app.html">Re-run research</a><button type="button" class="btn btn-sm btn-ghost" data-star="' + esc(p.symbol) + '">' + (starred(p) ? "★ Starred" : "☆ Star") + "</button>" +
      '<a class="btn btn-sm btn-ghost" href="product-portfolio.html?product=' + encodeURIComponent(p.product) + "&market=" + encodeURIComponent(p.market) + '">+ Portfolio</a><a class="btn btn-sm btn-ghost" href="my-terminal.html">Live Terminal</a></div></div>';
}
function bookHtml(sym) {
  var open = S.orders.filter(function (o) { return o.status === "open" && o.symbol === sym; });
  function lv(side) {
    var m = {};
    open.filter(function (o) { return o.side === side; }).forEach(function (o) { var k = num(o.limit_price); m[k] = (m[k] || 0) + num(o.qty); });
    var ks = Object.keys(m).map(Number).sort(function (a, b) { return b - a; });
    var mx = Math.max.apply(null, ks.map(function (k) { return m[k]; }).concat([1]));
    return ks.map(function (k) { return '<div class="xt-lvl ' + (side === "buy" ? "bid" : "ask") + '"><i style="width:' + (m[k] / mx * 100) + '%"></i><span>' + fmt(k, 2) + "</span><span>" + fmt(m[k], 2) + "</span></div>"; }).join("");
  }
  var asks = lv("sell"), bids = lv("buy"), l = last(sym);
  if (!asks && !bids) return '<div class="xt-none"><b>No open orders</b>Place a limit order to see it in the book. Only your own simulated orders appear here; there is no shared market.</div>';
  return '<div class="xt-book"><div class="xt-lvl" style="color:var(--dim);font-size:.6rem"><span>PRICE</span><span>UNITS</span></div>' + asks + '<div class="xt-mid">' + (l == null ? "—" : l) + ' <span class="ws-mini">last</span></div>' + bids + "</div>";
}
function paintTicket() {
  var f = $("[data-ticket]"), p = prod(S.sel), l = last(S.sel);
  $("[data-tk-sym]").textContent = p ? p.product.slice(0, 22) : "";
  $$("[data-side]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-side") === S.side); });
  var btn = $("[data-place]");
  btn.className = "xt-place" + (S.side === "sell" ? " sell" : "");
  btn.textContent = p ? "Place simulated " + S.side + " · " + p.product.slice(0, 16) : "Run a report to trade";
  btn.disabled = !p;
  f.limit.disabled = f.type.value !== "limit";
  var px = f.type.value === "limit" ? num(f.limit.value) : l, q = num(f.qty.value);
  var a = account(), held = (S.pos.find(function (x) { return x.symbol === S.sel; }) || {}).qty;
  var notional = px != null && q != null ? px * q : null;
  $("[data-est]").innerHTML = "<span>Price</span><b>" + (px == null ? "—" : fmt(px, 2)) + "</b><span>Est. " + (S.side === "buy" ? "cost" : "proceeds") + " (incl. 0.1% fee)</span><b>" + vc(notional == null ? null : (S.side === "buy" ? notional * 1.001 : notional * 0.999)) + "</b>" +
    (S.side === "buy" ? "<span>Available</span><b>" + vc(a.cash) + "</b>" : "<span>Units held</span><b>" + fmt(held || 0, 2) + "</b>");
  $("[data-book-mini]").innerHTML = p ? bookHtml(p.symbol) : '<div class="xt-none">No symbol selected.</div>';
}
function none(t, x) { return '<div class="xt-none"><b>' + esc(t) + "</b>" + esc(x) + "</div>"; }
function paintBottom() {
  var rs = reservedSell();
  var held = S.pos.filter(function (x) { return num(x.qty) > 0 || rs[x.symbol]; });
  var open = S.orders.filter(function (o) { return o.status === "open"; });
  $('[data-n="positions"]').textContent = held.length; $('[data-n="open"]').textContent = open.length;
  $$("[data-tab]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === S.tab); });
  var host = $("[data-tabbody]"), h = "";
  function name(sym) { var p = prod(sym); return p ? esc(p.product) + ' <span class="ws-mini">' + esc(p.market) + "</span>" : esc(sym); }
  if (S.tab === "positions") {
    h = held.length ? '<table class="xt-t"><thead><tr><th>SYMBOL</th><th class="num">UNITS</th><th class="num">IN SELL ORDERS</th><th class="num">AVG COST</th><th class="num">LAST</th><th class="num">VALUE</th><th class="num">UNREALISED P&amp;L</th><th class="num">%</th></tr></thead><tbody>' +
      held.map(function (x) { var l = last(x.symbol), q = num(x.qty) + (rs[x.symbol] || 0), pl = l == null ? null : (l - num(x.avg_cost)) * q, pp = num(x.avg_cost) ? (l - x.avg_cost) / x.avg_cost * 100 : null;
        return '<tr data-sym="' + esc(x.symbol) + '" style="cursor:pointer"><td>' + name(x.symbol) + '</td><td class="num">' + fmt(x.qty) + '</td><td class="num">' + fmt(rs[x.symbol] || 0) + '</td><td class="num">' + fmt(x.avg_cost) + '</td><td class="num">' + fmt(l) + '</td><td class="num">' + vc(l == null ? null : l * q) + '</td><td class="num ' + (pl > 0 ? "up" : pl < 0 ? "down" : "") + '">' + vc(pl) + '</td><td class="num ' + (pp > 0 ? "up" : pp < 0 ? "down" : "") + '">' + pct(pp) + "</td></tr>"; }).join("") + "</tbody></table>"
      : none("No positions", "Place a simulated buy order from the Trade tab to open a virtual position.");
  } else if (S.tab === "open") {
    h = open.length ? '<table class="xt-t"><thead><tr><th>TIME</th><th>SYMBOL</th><th>SIDE</th><th class="num">UNITS</th><th class="num">LIMIT</th><th class="num">LAST</th><th class="num">RESERVED</th><th></th></tr></thead><tbody>' +
      open.map(function (o) { return "<tr><td>" + fdate(o.created_at, true) + "</td><td>" + name(o.symbol) + '</td><td class="' + (o.side === "buy" ? "up" : "down") + '">' + o.side.toUpperCase() + ' LMT</td><td class="num">' + fmt(o.qty) + '</td><td class="num">' + fmt(o.limit_price) + '</td><td class="num">' + fmt(last(o.symbol)) + '</td><td class="num">' + (o.side === "buy" ? vc(o.reserved) : fmt(o.reserved) + " units") + '</td><td class="num"><button type="button" class="link-btn" data-cancel="' + esc(o.id) + '">Cancel</button></td></tr>'; }).join("") + "</tbody></table>"
      : none("No open orders", "Limit orders wait here until a new live snapshot crosses your price.");
  } else if (S.tab === "history") {
    var hist = S.orders.filter(function (o) { return o.status !== "open"; });
    h = hist.length ? '<table class="xt-t"><thead><tr><th>TIME</th><th>SYMBOL</th><th>SIDE</th><th>TYPE</th><th class="num">UNITS</th><th class="num">FILL</th><th class="num">FEE</th><th>STATUS</th></tr></thead><tbody>' +
      hist.map(function (o) { return "<tr><td>" + fdate(o.filled_at || o.created_at, true) + "</td><td>" + name(o.symbol) + '</td><td class="' + (o.side === "buy" ? "up" : "down") + '">' + o.side.toUpperCase() + "</td><td>" + o.order_type + '</td><td class="num">' + fmt(o.qty) + '</td><td class="num">' + fmt(o.fill_price) + '</td><td class="num">' + vc(o.fee) + "</td><td>" + o.status + "</td></tr>"; }).join("") + "</tbody></table>"
      : none("No order history", "Filled and cancelled simulated orders appear here.");
  } else if (S.tab === "book") {
    h = S.sel ? '<div style="max-width:420px;padding:6px">' + bookHtml(S.sel) + "</div>" : none("No symbol selected", "");
  } else {
    var a = account(), tot = a.equity - START;
    h = '<div class="ws-kpis" style="padding:8px 4px">' + [["VIRTUAL CASH", vc(a.cash), "available"], ["IN BUY ORDERS", vc(a.reservedBuy), "reserved"], ["POSITIONS VALUE", vc(a.mv), "units × last value"], ["UNREALISED P&L", vc(a.unreal), "open positions"], ["TOTAL (VIRTUAL)", vc(a.equity), (tot >= 0 ? "+" : "") + fmt(tot) + " VC vs 100,000 start"], ["FEES PAID", vc(a.fees), "simulated 0.1%"]]
      .map(function (k) { return '<div class="ws-kpi"><div class="k">' + k[0] + '</div><div class="v" style="font-size:1.05rem">' + k[1] + '</div><div class="d">' + k[2] + "</div></div>"; }).join("") + "</div>" +
      '<div class="ws-row" style="justify-content:space-between;padding:4px"><span class="ws-mini">Virtual credits only. They can\'t be bought, withdrawn or exchanged for anything.</span><button type="button" class="btn btn-sm btn-ghost" data-reset style="margin:0">Reset simulation</button></div>';
  }
  host.innerHTML = h;
}
function paintAll() { paintWatch(); paintCats(); paintHead(); drawChart(); paintResearch(); paintTicket(); paintBottom(); }
function select(sym) { if (!prod(sym)) return; S.sel = sym; var f = $("[data-ticket]"); if (f.type.value === "limit") f.limit.value = last(sym); paintAll(); }
async function refresh() { await load(); paintAll(); }

async function toggleStar(sym) {
  var p = prod(sym); if (!p) return;
  var w = S.watch.find(function (x) { return x.product_key === p.key && x.market === p.market; });
  var r = w ? await S.sb.from("research_watchlist").delete().eq("id", w.id) : await S.sb.from("research_watchlist").insert({ product: p.product, product_key: p.key, market: p.market });
  if (r.error) return toast(errMsg(r.error));
  var q = await S.sb.from("research_watchlist").select("id, product_key, market"); S.watch = q.data || [];
  paintWatch(); paintResearch();
}

function bind() {
  document.addEventListener("click", async function (e) {
    var t = e.target;
    var st = t.closest("[data-star]"); if (st) { e.stopPropagation(); return toggleStar(st.getAttribute("data-star")); }
    var c = t.closest("[data-cancel]"); if (c) { var x = await S.sb.rpc("exchange_cancel_order", { p_id: c.getAttribute("data-cancel") }); if (x.error) toast(errMsg(x.error)); else toast("Order cancelled"); return refresh(); }
    if (t.closest("[data-reset]")) { if (!confirm("Reset the simulation? This clears your simulated orders and positions and sets virtual cash back to 100,000 VC.")) return; var y = await S.sb.rpc("exchange_reset"); if (y.error) toast(errMsg(y.error)); else toast("Simulation reset"); return refresh(); }
    var m = t.closest("[data-m]"); if (m) { S.metric = m.getAttribute("data-m"); $$("[data-m]").forEach(function (b) { b.classList.toggle("on", b === m); }); return drawChart(); }
    var iv = t.closest("[data-i]"); if (iv && !iv.disabled) { S.interval = iv.getAttribute("data-i"); $$("[data-i]").forEach(function (b) { b.classList.toggle("on", b === iv); }); return drawChart(); }
    var rg = t.closest("[data-r]"); if (rg) { S.range = +rg.getAttribute("data-r"); $$("[data-r]").forEach(function (b) { b.classList.toggle("on", b === rg); }); return drawChart(); }
    var ind = t.closest("[data-ind]"); if (ind && !ind.disabled) { var k = ind.getAttribute("data-ind"); S.ind[k] = !S.ind[k]; ind.classList.toggle("on", S.ind[k]); return drawChart(); }
    var tb = t.closest("[data-tab]"); if (tb) { S.tab = tb.getAttribute("data-tab"); return paintBottom(); }
    var rt = t.closest("[data-rt]"); if (rt) { S.rt = rt.getAttribute("data-rt"); $$("[data-rt]").forEach(function (b) { b.classList.toggle("on", b === rt); }); $$("[data-rpanel]").forEach(function (p) { p.hidden = p.getAttribute("data-rpanel") !== S.rt; }); return; }
    var wl = t.closest("[data-wl]"); if (wl) { S.wl = wl.getAttribute("data-wl"); $$("[data-wl]").forEach(function (b) { b.classList.toggle("on", b === wl); }); return paintWatch(); }
    var sd = t.closest("[data-side]"); if (sd) { S.side = sd.getAttribute("data-side"); return paintTicket(); }
    if (t.closest("a,button,input,select")) return;
    var sy = t.closest("[data-sym]"); if (sy) select(sy.getAttribute("data-sym"));
  });
  document.addEventListener("keydown", function (e) {
    var sy = e.target.closest && e.target.closest(".xt-sym[data-sym]");
    if (sy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(sy.getAttribute("data-sym")); }
  });
  $("[data-filter]").addEventListener("input", function (e) { S.filter = e.target.value.trim().toLowerCase(); paintWatch(); });
  var f = $("[data-ticket]");
  f.addEventListener("input", paintTicket);
  f.type.addEventListener("change", function () { if (f.type.value === "limit" && !f.limit.value && last(S.sel) != null) f.limit.value = last(S.sel); paintTicket(); });
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!S.sel) return toast("Run a live report first to create a symbol.");
    var btn = $("[data-place]"); btn.disabled = true;
    var res = await S.sb.rpc("exchange_place_order", { p_symbol: S.sel, p_side: S.side, p_type: f.type.value, p_qty: num(f.qty.value), p_limit: f.type.value === "limit" ? num(f.limit.value) : null });
    btn.disabled = false;
    if (res.error) return toast(errMsg(res.error));
    toast(res.data && res.data.status === "filled" ? "Simulated " + S.side + " filled at " + res.data.fill_price : "Simulated limit order placed");
    S.tab = res.data && res.data.status === "filled" ? "positions" : "open";
    refresh();
  });
}

function waitLib(ms) {
  return new Promise(function (res) {
    var t0 = Date.now();
    (function poll() { if (window.LightweightCharts || Date.now() - t0 > ms) return res(); setTimeout(poll, 60); })();
  });
}

(async function () {
  var r = await boot("exchange.html", "MarketScope Exchange (simulation)");
  if (!r.session) return;
  S.sb = r.sb;
  $$("[data-shell]").forEach(function (el) { el.hidden = false; });
  var g = $("[data-gate]"); if (g) g.hidden = true;
  bind();
  await waitLib(4000);
  try { await refresh(); } catch (e) { toast(errMsg(e)); chartEmpty("Could not load the simulation", errMsg(e)); }
})();
