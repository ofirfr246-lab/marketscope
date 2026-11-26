import { $, $$, esc, num, fmt, money, pct, cls, fdate, verdictPill, empty, toast, errMsg, boot, loadSnapshots, groupProducts, lineChart, monthlyPoints } from "./ms-workspace.js";

var S = { sb: null, products: [], watch: [], rules: [], events: [], sel: null };
var METRIC_LABEL = { opportunity: "Opportunity", demand: "Demand", competition: "Competition", saturation: "Saturation", price_median: "Median price", search_volume: "Search volume" };
var NO_DATA = '<a class="btn btn-sm btn-amber" href="app.html">Run a live report</a>';

async function load() {
  var res = await Promise.all([
    loadSnapshots(S.sb),
    S.sb.from("research_watchlist").select("*").order("created_at", { ascending: false }),
    S.sb.from("market_alerts").select("*").order("created_at", { ascending: false }),
    S.sb.from("alert_events").select("*").order("created_at", { ascending: false }).limit(100)
  ]);
  S.products = groupProducts(res[0]);
  S.watch = res[1].data || []; S.rules = res[2].data || []; S.events = res[3].data || [];
  if (!S.sel && S.products.length) S.sel = S.products[S.products.length - 1].symbol;
  S.snapCount = res[0].length;
}
function prod(sym) { return S.products.find(function (p) { return p.symbol === sym; }); }
function watched(p) { return S.watch.some(function (w) { return w.product_key === p.key && w.market === p.market; }); }

function paintKpis() {
  var unread = S.events.filter(function (e) { return !e.read_at; }).length;
  $("[data-kpis]").innerHTML = [
    ["PRODUCTS RESEARCHED", S.products.length, "distinct product × market"],
    ["SNAPSHOTS STORED", S.snapCount, "one per live report"],
    ["WATCHLIST", S.watch.length, "products you follow"],
    ["UNREAD ALERTS", unread, S.rules.filter(function (r) { return r.active; }).length + " active rules"]
  ].map(function (k) { return '<div class="ws-kpi"><div class="k">' + k[0] + '</div><div class="v">' + k[1] + '</div><div class="d">' + k[2] + "</div></div>"; }).join("");
}

function options(sel) {
  return S.products.map(function (p) { return '<option value="' + esc(p.symbol) + '"' + (p.symbol === sel ? " selected" : "") + ">" + esc(p.product + " · " + p.market) + "</option>"; }).join("");
}

function paintChart() {
  var host = $("[data-chart]"), note = $("[data-chart-note]");
  $("[data-prod]").innerHTML = options(S.sel);
  var p = prod(S.sel);
  if (!p) { host.innerHTML = empty("No live reports yet", "Run a live report and its scores, prices and 12-month search history will appear here.", NO_DATA); note.textContent = ""; return; }
  var m = $("[data-metric]").value;
  if (m === "monthly") {
    lineChart(host, monthlyPoints(p.latest.monthly_searches), { color: "var(--blue)", emptyTitle: "No monthly search history in this report", emptyText: "Google did not return monthly volumes for this keyword and market." });
    note.textContent = "Monthly Google search volume (Google Ads keyword data) returned with your latest report on " + fdate(p.latest.captured_at) + ".";
    return;
  }
  var pts = p.series.map(function (s) { return { x: new Date(s.captured_at), y: s[m], label: fdate(s.captured_at) }; });
  var score = ["opportunity", "demand", "competition", "saturation"].indexOf(m) >= 0;
  lineChart(host, pts, { min: score ? 0 : null, max: score ? 100 : null, emptyTitle: "No values for this metric", emptyText: "Your reports for this product did not include it." });
  note.textContent = p.series.length + " snapshot(s) of " + p.product + " (" + p.market + "). " + (p.series.length < 2 ? "Run another report later to start a trend line." : "");
}

function paintFocus() {
  var p = prod(S.sel), host = $("[data-focus]");
  if (!p) { host.innerHTML = empty("Nothing selected", "Pick a product once you have reports."); return; }
  var s = p.latest;
  host.innerHTML = '<div style="font-weight:700;font-size:1.05rem">' + esc(p.product) + '</div><div class="ws-mini">' + esc(p.market) + " · " + fdate(s.captured_at, true) + "</div>" +
    '<div style="margin:10px 0">' + verdictPill(s.verdict) + ' <span class="chip ' + (s.confidence === "Live" ? "live" : "soon") + '">' + esc(s.confidence || "Live") + "</span></div>" +
    '<table class="ws-table"><tbody>' + [["Opportunity", fmt(s.opportunity, 0) + "/100"], ["Demand", fmt(s.demand, 0)], ["Competition", fmt(s.competition, 0)], ["Saturation", fmt(s.saturation, 0)],
      ["Median price", money(s.price_median, s.currency)], ["Price range", money(s.price_min, s.currency) + " – " + money(s.price_max, s.currency)],
      ["Monthly searches", fmt(s.search_volume, 0)], ["3-mo trend", pct(num(s.trend_slope) == null ? null : s.trend_slope * 100)], ["CPC", money(s.cpc, "USD")],
      ["Sellers / listings", fmt(s.seller_count, 0) + " / " + fmt(s.listing_count, 0)]].map(function (r) { return "<tr><td>" + r[0] + '</td><td class="num">' + r[1] + "</td></tr>"; }).join("") + "</tbody></table>" +
    '<div class="ws-row" style="margin-top:10px"><button type="button" class="btn btn-sm ' + (watched(p) ? "btn-ghost" : "btn-amber") + '" data-star="' + esc(p.symbol) + '" style="margin:0">' + (watched(p) ? "★ On watchlist" : "☆ Add to watchlist") + "</button>" +
    '<a class="btn btn-sm btn-ghost" style="margin:0" href="product-portfolio.html?product=' + encodeURIComponent(p.product) + "&market=" + encodeURIComponent(p.market) + '">+ Portfolio</a>' +
    (s.report_id ? '<a class="btn btn-sm btn-ghost" style="margin:0" href="reports.html">Report</a>' : "") + "</div>";
}

function paintMovers() {
  var rows = S.products.filter(function (p) { return p.prev && num(p.latest.opportunity) != null && num(p.prev.opportunity) != null; })
    .map(function (p) { return { p: p, d: p.latest.opportunity - p.prev.opportunity }; }).sort(function (a, b) { return b.d - a.d; });
  var host = $("[data-movers]");
  if (!rows.length) { host.innerHTML = empty("No movers yet", "Movers need at least two live reports of the same product and market. Re-run a product later to see how it moved."); return; }
  host.innerHTML = '<table class="ws-table"><thead><tr><th>PRODUCT</th><th class="num">PREV</th><th class="num">LATEST</th><th class="num">CHANGE</th></tr></thead><tbody>' +
    rows.map(function (r) { return '<tr data-row="' + esc(r.p.symbol) + '"><td>' + esc(r.p.product) + ' <span class="ws-mini">' + esc(r.p.market) + '</span></td><td class="num">' + r.p.prev.opportunity + '</td><td class="num">' + r.p.latest.opportunity + '</td><td class="num ' + cls(r.d) + '">' + (r.d > 0 ? "+" : "") + r.d + "</td></tr>"; }).join("") + "</tbody></table>";
}

function paintWatch() {
  var host = $("[data-watch]");
  if (!S.watch.length) { host.innerHTML = empty("Your watchlist is empty", "Star a researched product (or ask Josy AI to add one) to follow it here."); return; }
  host.innerHTML = '<table class="ws-table"><thead><tr><th>PRODUCT</th><th>VERDICT</th><th class="num">OPP.</th><th class="num">LAST</th><th></th></tr></thead><tbody>' +
    S.watch.map(function (w) {
      var p = prod(w.product_key + "|" + w.market), s = p && p.latest;
      return '<tr' + (p ? ' data-row="' + esc(p.symbol) + '"' : "") + "><td>" + esc(w.product) + ' <span class="ws-mini">' + esc(w.market) + (w.added_by === "josy" ? " · added by Josy" : "") + "</span></td><td>" + (s ? verdictPill(s.verdict) : '<span class="ws-mini">no report yet</span>') +
        '</td><td class="num">' + (s ? fmt(s.opportunity, 0) : "—") + '</td><td class="num">' + (s ? fdate(s.captured_at) : "—") + '</td><td class="num"><button type="button" class="link-btn" data-unwatch="' + esc(w.id) + '" aria-label="Remove">✕</button></td></tr>';
    }).join("") + "</tbody></table>";
}

function heatColor(v) {
  if (v == null) return "rgba(139,149,163,.12)";
  var t = Math.max(0, Math.min(1, v / 100));
  return t >= 0.5 ? "rgba(25,210,124," + (0.12 + (t - 0.5) * 0.9).toFixed(2) + ")" : "rgba(255,77,94," + (0.12 + (0.5 - t) * 0.9).toFixed(2) + ")";
}
function paintHeat() {
  var host = $("[data-heat]");
  if (!S.products.length) { host.innerHTML = empty("No categories yet", "After your first report, assign a category to each product (in the table below) to build this heatmap."); return; }
  var by = {};
  S.products.forEach(function (p) { var c = p.category || "Uncategorised"; (by[c] = by[c] || []).push(p); });
  host.innerHTML = '<div class="ws-heat">' + Object.keys(by).sort().map(function (c) {
    var vals = by[c].map(function (p) { return num(p.latest.opportunity); }).filter(function (v) { return v != null; });
    var avg = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : null;
    return '<div class="ws-tile" style="background:' + heatColor(avg) + '"><b>' + esc(c) + '</b><div class="v">' + (avg == null ? "—" : avg) + '</div><div class="d">' + by[c].length + " product(s) · avg Opportunity</div></div>";
  }).join("") + "</div>";
}

function paintCountries() {
  var by = {};
  S.products.forEach(function (p) { (by[p.key] = by[p.key] || []).push(p); });
  var multi = Object.keys(by).filter(function (k) { return by[k].length > 1; });
  var host = $("[data-countries]");
  if (!multi.length) { host.innerHTML = empty("No country comparison yet", "Research the same product in two or more markets (for example US and UK) to compare them side by side."); return; }
  host.innerHTML = multi.map(function (k) {
    return '<div style="margin-bottom:12px"><b>' + esc(by[k][0].product) + '</b><div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>MARKET</th><th>VERDICT</th><th class="num">OPP.</th><th class="num">DEMAND</th><th class="num">COMP.</th><th class="num">MEDIAN PRICE</th><th class="num">SEARCHES/MO</th></tr></thead><tbody>' +
      by[k].map(function (p) { var s = p.latest; return "<tr><td>" + esc(p.market) + "</td><td>" + verdictPill(s.verdict) + '</td><td class="num">' + fmt(s.opportunity, 0) + '</td><td class="num">' + fmt(s.demand, 0) + '</td><td class="num">' + fmt(s.competition, 0) + '</td><td class="num">' + money(s.price_median, s.currency) + '</td><td class="num">' + fmt(s.search_volume, 0) + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
  }).join("");
}

function paintAll() {
  var host = $("[data-all]");
  if (!S.products.length) { host.innerHTML = empty("No live reports yet", "Each live report you run is saved here automatically as a snapshot.", NO_DATA); return; }
  host.innerHTML = '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>PRODUCT</th><th>MARKET</th><th>VERDICT</th><th class="num">OPP.</th><th class="num">MEDIAN PRICE</th><th class="num">SEARCHES/MO</th><th class="num">SNAPSHOTS</th><th>CATEGORY</th><th></th></tr></thead><tbody>' +
    S.products.slice().reverse().map(function (p) {
      var s = p.latest;
      return '<tr data-row="' + esc(p.symbol) + '"' + (p.symbol === S.sel ? ' class="sel"' : "") + "><td>" + esc(p.product) + "</td><td>" + esc(p.market) + "</td><td>" + verdictPill(s.verdict) + '</td><td class="num">' + fmt(s.opportunity, 0) +
        '</td><td class="num">' + money(s.price_median, s.currency) + '</td><td class="num">' + fmt(s.search_volume, 0) + '</td><td class="num">' + p.series.length +
        '</td><td><input data-cat="' + esc(p.symbol) + '" value="' + esc(p.category || "") + '" maxlength="60" placeholder="Add category" style="background:transparent;border:1px solid var(--line2);border-radius:6px;color:var(--text);padding:4px 6px;width:130px" dir="auto"></td>' +
        '<td class="num"><button type="button" class="link-btn" data-star="' + esc(p.symbol) + '">' + (watched(p) ? "★" : "☆") + "</button></td></tr>";
    }).join("") + "</tbody></table></div>";
}

function paintRules() {
  var f = $("[data-alert-form]");
  f.symbol.innerHTML = S.products.length ? options(S.sel) : '<option value="">Run a report first</option>';
  var host = $("[data-rules]");
  if (!S.rules.length) { host.innerHTML = '<p class="ws-mini">No alert rules yet.</p>'; return; }
  host.innerHTML = '<table class="ws-table"><tbody>' + S.rules.map(function (r) {
    return "<tr><td>" + esc(r.product || r.product_key) + ' <span class="ws-mini">' + esc(r.market) + "</span><br><span class=\"ws-mini\">" + esc(METRIC_LABEL[r.metric]) + " " + (r.op === "above" ? "&gt;" : "&lt;") + " " + fmt(r.threshold) + (r.last_triggered_at ? " · last fired " + fdate(r.last_triggered_at) : "") +
      '</span></td><td class="num"><label class="ws-mini"><input type="checkbox" data-rule-toggle="' + esc(r.id) + '"' + (r.active ? " checked" : "") + "> on</label> <button type=\"button\" class=\"link-btn\" data-rule-del=\"" + esc(r.id) + '">✕</button></td></tr>';
  }).join("") + "</tbody></table>";
}

function paintEvents() {
  var host = $("[data-events]");
  if (!S.events.length) { host.innerHTML = empty("No alerts yet", "When a new live report matches one of your rules, the alert lands here."); return; }
  host.innerHTML = '<table class="ws-table"><tbody>' + S.events.map(function (e) {
    return "<tr" + (e.read_at ? "" : ' class="sel"') + '><td><span class="chip ' + (e.kind === "exchange" ? "early" : "live") + '">' + esc(e.kind.toUpperCase()) + "</span> " + esc(e.message) + '</td><td class="num ws-mini">' + fdate(e.created_at, true) + "</td></tr>";
  }).join("") + "</tbody></table>";
}

function paint() { paintKpis(); paintChart(); paintFocus(); paintMovers(); paintWatch(); paintHeat(); paintCountries(); paintAll(); paintRules(); paintEvents(); }

async function toggleStar(sym) {
  var p = prod(sym); if (!p) return;
  var w = S.watch.find(function (x) { return x.product_key === p.key && x.market === p.market; });
  var r = w ? await S.sb.from("research_watchlist").delete().eq("id", w.id)
    : await S.sb.from("research_watchlist").insert({ product: p.product, product_key: p.key, market: p.market });
  if (r.error) return toast(errMsg(r.error));
  toast(w ? "Removed from watchlist" : "Added to watchlist");
  await refresh();
}
async function refresh() { await load(); paint(); }

function bind() {
  $("[data-prod]").addEventListener("change", function (e) { S.sel = e.target.value; paint(); });
  $("[data-metric]").addEventListener("change", paintChart);
  document.addEventListener("click", async function (e) {
    var t = e.target;
    var star = t.closest("[data-star]"); if (star) { e.stopPropagation(); return toggleStar(star.getAttribute("data-star")); }
    var un = t.closest("[data-unwatch]"); if (un) { e.stopPropagation(); var r = await S.sb.from("research_watchlist").delete().eq("id", un.getAttribute("data-unwatch")); if (r.error) toast(errMsg(r.error)); return refresh(); }
    var del = t.closest("[data-rule-del]"); if (del) { var r2 = await S.sb.from("market_alerts").delete().eq("id", del.getAttribute("data-rule-del")); if (r2.error) toast(errMsg(r2.error)); return refresh(); }
    if (t.closest("input,select,button,a,label")) return;
    var row = t.closest("[data-row]"); if (row) { S.sel = row.getAttribute("data-row"); paint(); window.scrollTo({ top: $("[data-chart]").getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" }); }
  });
  document.addEventListener("change", async function (e) {
    var tg = e.target.closest("[data-rule-toggle]");
    if (tg) { var r = await S.sb.from("market_alerts").update({ active: tg.checked }).eq("id", tg.getAttribute("data-rule-toggle")); if (r.error) toast(errMsg(r.error)); return; }
    var cat = e.target.closest("[data-cat]");
    if (cat) {
      var p = prod(cat.getAttribute("data-cat")); if (!p) return;
      var v = cat.value.trim().slice(0, 60) || null;
      var r3 = await S.sb.from("product_snapshots").update({ category: v }).eq("product_key", p.key).eq("market", p.market);
      if (r3.error) return toast(errMsg(r3.error));
      toast("Category saved"); refresh();
    }
  });
  $("[data-alert-form]").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target, p = prod(f.symbol.value);
    if (!p) return toast("Run a live report first.");
    var th = num(f.threshold.value); if (th == null) return toast("Enter a threshold.");
    var r = await S.sb.from("market_alerts").insert({ product_key: p.key, product: p.product, market: p.market, metric: f.metric.value, op: f.op.value, threshold: th });
    if (r.error) return toast(errMsg(r.error));
    f.threshold.value = ""; toast("Alert rule added"); refresh();
  });
  $("[data-read-all]").addEventListener("click", async function () {
    var ids = S.events.filter(function (x) { return !x.read_at; }).map(function (x) { return x.id; });
    if (!ids.length) return;
    var r = await S.sb.from("alert_events").update({ read_at: new Date().toISOString() }).in("id", ids);
    if (r.error) return toast(errMsg(r.error)); refresh();
  });
}

(async function () {
  var r = await boot("my-terminal.html", "The Live Terminal");
  if (!r.session) return;
  S.sb = r.sb;
  var qs = new URLSearchParams(location.search);
  try { await load(); } catch (e) { $("[data-kpis]").innerHTML = empty("Could not load your data", errMsg(e)); return; }
  if (qs.get("p")) S.sel = qs.get("p");
  bind(); paint();
})();
