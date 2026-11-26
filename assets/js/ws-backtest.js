import { $, $$, esc, num, fmt, fdate, empty, toast, errMsg, boot, loadSnapshots, groupProducts, lineChart } from "./ms-workspace.js";

var S = { sb: null, products: [], mode: "demand", last: null, saved: [] };
function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
function series(ms) {
  return (Array.isArray(ms) ? ms : []).filter(function (m) { return m && num(m.search_volume) != null; })
    .slice().sort(function (a, b) { return a.year - b.year || a.month - b.month; });
}

/* Demand-history test on real monthly Google search volumes (last 12 months per report). */
export function demandTest(products, trendMin, hold, cost) {
  var trades = [], base = [], used = 0;
  products.forEach(function (p) {
    var s = series(p.latest.monthly_searches); if (s.length < 6 + hold) return;
    used++;
    for (var t = 5; t + hold < s.length; t++) {
      var v = s.map(function (m) { return m.search_volume; });
      var prior = avg(v.slice(t - 5, t - 2)), recent = avg(v.slice(t - 2, t + 1));
      if (!prior || !v[t]) continue;
      var trend = (recent - prior) / prior * 100, out = (v[t + hold] - v[t]) / v[t] * 100 - cost;
      base.push(out);
      if (trend >= trendMin) trades.push({ product: p.product, market: p.market, when: s[t].year + "-" + String(s[t].month).padStart(2, "0"), signal: trend, outcome: out });
    }
  });
  return { trades: trades, base: base, used: used };
}
/* Snapshot strategy over the user's stored live snapshots. */
export function snapTest(products, o) {
  var trades = [], used = 0;
  products.forEach(function (p) {
    if (p.series.length < 2) return; used++;
    var pos = null;
    p.series.forEach(function (s, i) {
      var opp = num(s.opportunity);
      var enter = o.entry === "verdict" ? /^(STRONG BUY|BUY)$/i.test(s.verdict || "") : opp != null && opp >= o.enter;
      if (!pos && enter) pos = s;
      else if (pos && opp != null && opp < o.exit) { trades.push(close(p, pos, s, false)); pos = null; }
      if (pos && i === p.series.length - 1 && pos !== s) { trades.push(close(p, pos, s, true)); pos = null; }
    });
  });
  function close(p, a, b, open) {
    var x = num(a[o.outcome]), y = num(b[o.outcome]), out = null;
    if (x != null && y != null) out = o.outcome === "opportunity" ? y - x - o.cost : (x ? (y - x) / x * 100 - o.cost : null);
    return { product: p.product, market: p.market, when: fdate(a.captured_at) + " → " + fdate(b.captured_at), signal: num(a.opportunity), outcome: out, open: open };
  }
  return { trades: trades, used: used };
}

function summary(trades, unit) {
  var outs = trades.map(function (t) { return t.outcome; }).filter(function (v) { return v != null; });
  return { n: trades.length, hit: outs.length ? outs.filter(function (v) { return v > 0; }).length / outs.length * 100 : null, avg: avg(outs), unit: unit };
}
function render(res, unit, extra) {
  var host = $("[data-bt-result]");
  var sm = summary(res.trades, unit);
  S.last = { mode: S.mode, summary: sm, trades: res.trades.length };
  var cards = [["TRADES / SIGNALS", sm.n, res.used + " product(s) with enough history"], ["HIT RATE", sm.hit == null ? "—" : fmt(sm.hit, 0) + "%", "outcome above zero"], ["AVG OUTCOME", sm.avg == null ? "—" : (sm.avg > 0 ? "+" : "") + fmt(sm.avg, 1) + unit, "after costs"]];
  if (extra) cards.push(extra);
  var curve = [], cum = 0;
  res.trades.forEach(function (t, i) { if (t.outcome != null) { cum += t.outcome; curve.push({ x: i, y: cum, label: "#" + (i + 1) }); } });
  host.innerHTML = '<div class="ws-kpis">' + cards.map(function (k) { return '<div class="ws-kpi"><div class="k">' + k[0] + '</div><div class="v">' + k[1] + '</div><div class="d">' + k[2] + "</div></div>"; }).join("") + "</div>" +
    (res.trades.length ? '<div class="ws-mini" style="margin:12px 0 4px">Cumulative outcome (' + esc(unit.trim() || "points") + ")</div><div data-curve></div>" +
      '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>PRODUCT</th><th>WHEN</th><th class="num">SIGNAL</th><th class="num">OUTCOME</th></tr></thead><tbody>' +
      res.trades.map(function (t) { return "<tr><td>" + esc(t.product) + ' <span class="ws-mini">' + esc(t.market) + "</span></td><td>" + esc(t.when) + (t.open ? ' <span class="ws-mini">(still open, marked at last snapshot)</span>' : "") + '</td><td class="num">' + fmt(t.signal, 1) + '</td><td class="num ' + (t.outcome > 0 ? "up" : t.outcome < 0 ? "down" : "") + '">' + (t.outcome == null ? "—" : (t.outcome > 0 ? "+" : "") + fmt(t.outcome, 1) + unit) + "</td></tr>"; }).join("") +
      '</tbody></table></div><p style="margin-top:10px"><button type="button" class="btn btn-sm btn-ghost" data-save style="margin:0">Save this run</button></p>'
      : empty("No signals with these settings", "Try a lower entry threshold, or add more history by re-running reports over time."));
  if (curve.length) lineChart(host.querySelector("[data-curve]"), curve, { h: 160, color: "var(--green)" });
}

function run() {
  var help = $("[data-bt-help]");
  if (S.mode === "demand") {
    var f = $("[data-bt-demand]");
    var list = S.products.filter(function (p) { return !f.symbol.value || p.symbol === f.symbol.value; });
    var hold = Math.max(1, Math.min(6, num(f.hold.value) || 2));
    var res = demandTest(list, num(f.trend.value) || 0, hold, num(f.cost.value) || 0);
    help.textContent = "Uses the monthly Google search volumes (Google Ads keyword data) stored with your latest report per product. Signal = 3-month trend vs the prior 3 months; outcome = search-volume change over the hold period, minus your cost.";
    if (!res.used) { $("[data-bt-result]").innerHTML = empty("Not enough history yet", "This test needs at least " + (6 + hold) + " months of search history in a live report. Run a live report first — each one stores up to 12 months."); S.last = null; return; }
    var b = avg(res.base);
    render(res, "%", ["BASELINE", b == null ? "—" : (b > 0 ? "+" : "") + fmt(b, 1) + "%", "avg outcome of every month, no rule"]);
  } else {
    var g = $("[data-bt-snap]");
    var o = { entry: g.entry.value, enter: num(g.enter.value) || 0, exit: num(g.exit.value) || 0, outcome: g.outcome.value, cost: num(g.cost.value) || 0 };
    var r2 = snapTest(S.products, o);
    help.textContent = "Walks through your stored snapshots in time order per product: enters when the entry rule is met, exits when Opportunity falls below the exit level. Outcome is measured between the entry and exit snapshots, minus cost.";
    if (!r2.used) { $("[data-bt-result]").innerHTML = empty("Not enough snapshots yet", "Snapshot tests need at least two live reports of the same product and market, taken at different times."); S.last = null; return; }
    render(r2, o.outcome === "opportunity" ? " pts" : "%");
  }
}
async function loadSaved() {
  var r = await S.sb.from("backtest_runs").select("*").order("created_at", { ascending: false }).limit(30);
  S.saved = r.data || [];
  $("[data-bt-saved]").innerHTML = S.saved.length ? '<table class="ws-table"><tbody>' + S.saved.map(function (x) {
    var s = x.result && x.result.summary || {};
    return "<tr><td><b>" + esc(x.name) + '</b><br><span class="ws-mini">' + fdate(x.created_at, true) + " · " + (s.n || 0) + " trades · avg " + (s.avg == null ? "—" : fmt(s.avg, 1) + (s.unit || "")) + '</span></td><td class="num"><button type="button" class="link-btn" data-del="' + esc(x.id) + '">✕</button></td></tr>';
  }).join("") + "</tbody></table>" : '<p class="ws-mini">No saved runs yet.</p>';
}

(async function () {
  var r = await boot("backtesting.html", "Backtesting");
  if (!r.session) return;
  S.sb = r.sb;
  try { S.products = groupProducts(await loadSnapshots(S.sb)); } catch (e) { toast(errMsg(e)); }
  $("[data-bt-demand]").symbol.innerHTML = '<option value="">All researched products</option>' + S.products.map(function (p) { return '<option value="' + esc(p.symbol) + '">' + esc(p.product + " · " + p.market) + "</option>"; }).join("");
  $$("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      S.mode = b.getAttribute("data-mode");
      $$("[data-mode]").forEach(function (x) { x.classList.toggle("on", x === b); });
      $("[data-bt-demand]").hidden = S.mode !== "demand"; $("[data-bt-snap]").hidden = S.mode !== "snap";
      run();
    });
  });
  $("[data-bt-demand]").addEventListener("submit", function (e) { e.preventDefault(); run(); });
  $("[data-bt-snap]").addEventListener("submit", function (e) { e.preventDefault(); run(); });
  document.addEventListener("click", async function (e) {
    if (e.target.closest("[data-save]") && S.last) {
      var f = S.mode === "demand" ? $("[data-bt-demand]") : $("[data-bt-snap]"), params = { mode: S.mode };
      Array.prototype.forEach.call(f.elements, function (el) { if (el.name) params[el.name] = el.value; });
      var name = (S.mode === "demand" ? "Demand test" : "Snapshot test") + " · " + new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
      var ins = await S.sb.from("backtest_runs").insert({ name: name, params: params, result: S.last });
      if (ins.error) return toast(errMsg(ins.error));
      toast("Run saved"); loadSaved();
    }
    var d = e.target.closest("[data-del]");
    if (d) { var x = await S.sb.from("backtest_runs").delete().eq("id", d.getAttribute("data-del")); if (x.error) toast(errMsg(x.error)); loadSaved(); }
  });
  run(); loadSaved();
})();
