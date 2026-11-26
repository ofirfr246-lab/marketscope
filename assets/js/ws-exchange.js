import { $, esc, num, fmt, fdate, verdictPill, empty, toast, errMsg, boot, loadSnapshots, groupProducts, candleChart, dailyCandles } from "./ms-workspace.js";

/* MarketScope Exchange — SIMULATION ONLY. Virtual credits (VC), no real money.
   Index value of a symbol = Opportunity score (0–100) of the user's newest live snapshot. */
var S = { sb: null, products: [], acct: null, pos: [], orders: [], sel: null };
function vc(n) { n = num(n); return n == null ? "—" : fmt(n, 2) + " VC"; }
function tradable() { return S.products.filter(function (p) { return num(p.latest.opportunity) != null; }); }
function prod(sym) { return S.products.find(function (p) { return p.symbol === sym; }); }
function last(sym) { var p = prod(sym); return p ? num(p.latest.opportunity) : null; }

async function load() {
  await S.sb.rpc("exchange_open_account");
  var r = await Promise.all([
    loadSnapshots(S.sb),
    S.sb.from("exchange_accounts").select("*").maybeSingle(),
    S.sb.from("exchange_positions").select("*"),
    S.sb.from("exchange_orders").select("*").order("created_at", { ascending: false }).limit(200)
  ]);
  S.products = groupProducts(r[0]); S.acct = r[1].data; S.pos = r[2].data || []; S.orders = r[3].data || [];
  var t = tradable();
  if ((!S.sel || !prod(S.sel)) && t.length) S.sel = t[t.length - 1].symbol;
}

function paint() {
  var t = tradable();
  var held = S.pos.filter(function (p) { return num(p.qty) > 0; });
  var reservedSell = {};
  S.orders.filter(function (o) { return o.status === "open" && o.side === "sell"; }).forEach(function (o) { reservedSell[o.symbol] = (reservedSell[o.symbol] || 0) + num(o.reserved); });
  var mv = 0, cost = 0;
  held.forEach(function (p) { var l = last(p.symbol); if (l != null) mv += (num(p.qty) + (reservedSell[p.symbol] || 0)) * l; cost += (num(p.qty) + (reservedSell[p.symbol] || 0)) * num(p.avg_cost); });
  var reservedBuy = S.orders.filter(function (o) { return o.status === "open" && o.side === "buy"; }).reduce(function (a, o) { return a + num(o.reserved); }, 0);
  var equity = (S.acct ? num(S.acct.balance) : 0) + reservedBuy + mv;
  $("[data-kpis]").innerHTML = [
    ["VIRTUAL CASH", vc(S.acct && S.acct.balance), "available"],
    ["IN OPEN BUY ORDERS", vc(reservedBuy), "reserved"],
    ["POSITIONS VALUE", vc(mv), "units × last index value"],
    ["TOTAL (VIRTUAL)", vc(equity), (equity - 100000 >= 0 ? "+" : "") + fmt(equity - 100000, 2) + " VC vs start"],
    ["SYMBOLS", t.length, "from your live reports"]
  ].map(function (k) { return '<div class="ws-kpi"><div class="k">' + k[0] + '</div><div class="v" style="font-size:1.15rem">' + k[1] + '</div><div class="d">' + k[2] + "</div></div>"; }).join("");

  var sh = $("[data-symbols]");
  sh.innerHTML = t.length ? '<table class="ws-table"><tbody>' + t.slice().reverse().map(function (p) {
    var d = p.prev && num(p.prev.opportunity) != null ? p.latest.opportunity - p.prev.opportunity : null;
    return '<tr data-row="' + esc(p.symbol) + '"' + (p.symbol === S.sel ? ' class="sel"' : "") + "><td><b>" + esc(p.product) + '</b><br><span class="ws-mini">' + esc(p.market) + '</span></td><td class="num"><b>' + p.latest.opportunity + "</b>" + (d != null ? '<br><span class="' + (d > 0 ? "up" : d < 0 ? "down" : "") + ' ws-mini">' + (d > 0 ? "+" : "") + d + "</span>" : "") + "</td></tr>";
  }).join("") + "</tbody></table>" : empty("No symbols yet", "Each product you research with a live report becomes a symbol here.", '<a class="btn btn-sm btn-amber" href="app.html">Run a live report</a>');

  var p = prod(S.sel);
  $("[data-sym-title]").textContent = p ? p.product + " · " + p.market : "Chart";
  $("[data-sym-last]").innerHTML = p ? "Last " + p.latest.opportunity + " · " + verdictPill(p.latest.verdict) + " · " + fdate(p.latest.captured_at) : "";
  candleChart($("[data-candles]"), p ? dailyCandles(p.series, "opportunity") : [], { emptyText: "Run a live report to create your first symbol." });

  var open = S.orders.filter(function (o) { return o.status === "open" && (!p || o.symbol === p.symbol); });
  var lv = function (side) {
    var m = {};
    open.filter(function (o) { return o.side === side; }).forEach(function (o) { var k = num(o.limit_price); m[k] = (m[k] || 0) + num(o.qty); });
    var ks = Object.keys(m).map(Number).sort(function (a, b) { return side === "buy" ? b - a : a - b; });
    var mx = Math.max.apply(null, ks.map(function (k) { return m[k]; }).concat([1]));
    return ks.length ? ks.map(function (k) { return '<div class="lvl ' + (side === "buy" ? "bid" : "ask") + '"><i style="width:' + (m[k] / mx * 100) + '%"></i><span>' + fmt(k, 2) + "</span><span>" + fmt(m[k], 2) + "</span></div>"; }).join("") : '<p class="ws-mini">None</p>';
  };
  $("[data-book]").innerHTML = p ? '<div class="ws-book"><div class="side"><h4 class="up">BIDS (BUY)</h4>' + lv("buy") + '</div><div class="side"><h4 class="down">ASKS (SELL)</h4>' + lv("sell") + "</div></div>" +
    '<p class="ws-mini" style="margin-top:8px">Shows only your own simulated limit orders for this symbol. There is no shared market and no other participants.</p>' : empty("No symbol selected", "");

  $("[data-positions]").innerHTML = held.length || Object.keys(reservedSell).length ? '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>SYMBOL</th><th class="num">UNITS</th><th class="num">IN SELL ORDERS</th><th class="num">AVG COST</th><th class="num">LAST</th><th class="num">VALUE</th><th class="num">P&amp;L</th></tr></thead><tbody>' +
    S.pos.filter(function (x) { return num(x.qty) > 0 || reservedSell[x.symbol]; }).map(function (x) {
      var pp = prod(x.symbol), l = last(x.symbol), q = num(x.qty) + (reservedSell[x.symbol] || 0), pl = l == null ? null : (l - num(x.avg_cost)) * q;
      return '<tr data-row="' + esc(x.symbol) + '"><td>' + esc(pp ? pp.product + " · " + pp.market : x.symbol) + '</td><td class="num">' + fmt(x.qty, 2) + '</td><td class="num">' + fmt(reservedSell[x.symbol] || 0, 2) + '</td><td class="num">' + fmt(x.avg_cost, 2) + '</td><td class="num">' + fmt(l, 2) + '</td><td class="num">' + vc(l == null ? null : l * q) + '</td><td class="num ' + (pl > 0 ? "up" : pl < 0 ? "down" : "") + '">' + vc(pl) + "</td></tr>";
    }).join("") + "</tbody></table></div>" : empty("No positions", "Place a simulated buy order to open a virtual position.");

  var cats = {};
  t.forEach(function (x) { var c = x.category; if (!c) return; (cats[c] = cats[c] || []).push(num(x.latest.opportunity)); });
  var ck = Object.keys(cats).sort();
  $("[data-cat-idx]").innerHTML = ck.length ? '<table class="ws-table"><thead><tr><th>CATEGORY INDEX</th><th class="num">MEMBERS</th><th class="num">VALUE</th></tr></thead><tbody>' + ck.map(function (c) {
    var v = cats[c].reduce(function (a, b) { return a + b; }, 0) / cats[c].length;
    return "<tr><td>" + esc(c) + '</td><td class="num">' + cats[c].length + '</td><td class="num"><b>' + fmt(v, 1) + "</b></td></tr>";
  }).join("") + "</tbody></table>" : empty("No category indices yet", "Assign categories to your researched products in the Live Terminal. Each category index is the average latest Opportunity of its products.", '<a class="btn btn-sm btn-ghost" href="my-terminal.html">Open Live Terminal</a>');

  $("[data-orders]").innerHTML = S.orders.length ? '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>TIME</th><th>SYMBOL</th><th>SIDE</th><th>TYPE</th><th class="num">UNITS</th><th class="num">LIMIT</th><th>STATUS</th><th class="num">FILL</th><th></th></tr></thead><tbody>' +
    S.orders.map(function (o) {
      return "<tr><td class=\"ws-mini\">" + fdate(o.created_at, true) + "</td><td>" + esc(o.product || o.symbol) + '</td><td class="' + (o.side === "buy" ? "up" : "down") + '">' + o.side.toUpperCase() + "</td><td>" + o.order_type + '</td><td class="num">' + fmt(o.qty, 2) + '</td><td class="num">' + fmt(o.limit_price, 2) + "</td><td>" + o.status + '</td><td class="num">' + fmt(o.fill_price, 2) + '</td><td class="num">' + (o.status === "open" ? '<button type="button" class="link-btn" data-cancel="' + esc(o.id) + '">Cancel</button>' : "") + "</td></tr>";
    }).join("") + "</tbody></table></div>" : empty("No orders yet", "Your simulated orders will be listed here.");
}

async function refresh() { await load(); paint(); }

(async function () {
  var r = await boot("exchange.html", "MarketScope Exchange (simulation)");
  if (!r.session) return;
  S.sb = r.sb;
  try { await refresh(); } catch (e) { $("[data-kpis]").innerHTML = empty("Could not load the simulation", errMsg(e)); return; }
  var tk = $("[data-ticket]");
  tk.type.addEventListener("change", function () { tk.limit.disabled = tk.type.value !== "limit"; if (!tk.limit.disabled && !tk.limit.value && last(S.sel) != null) tk.limit.value = last(S.sel); });
  tk.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!S.sel) return toast("Run a live report first to create a symbol.");
    var res = await S.sb.rpc("exchange_place_order", { p_symbol: S.sel, p_side: tk.side.value, p_type: tk.type.value, p_qty: num(tk.qty.value), p_limit: tk.type.value === "limit" ? num(tk.limit.value) : null });
    if (res.error) return toast(errMsg(res.error));
    toast(res.data && res.data.status === "filled" ? "Simulated order filled at " + res.data.fill_price : "Simulated limit order placed");
    refresh();
  });
  document.addEventListener("click", async function (e) {
    var c = e.target.closest("[data-cancel]");
    if (c) { var x = await S.sb.rpc("exchange_cancel_order", { p_id: c.getAttribute("data-cancel") }); if (x.error) toast(errMsg(x.error)); else toast("Order cancelled"); return refresh(); }
    if (e.target.closest("[data-reset]")) {
      if (!confirm("Reset the simulation? This clears your simulated orders and positions and sets virtual cash back to 100,000 VC.")) return;
      var y = await S.sb.rpc("exchange_reset"); if (y.error) toast(errMsg(y.error)); else toast("Simulation reset"); return refresh();
    }
    if (e.target.closest("a,button,input,select")) return;
    var row = e.target.closest("[data-row]"); if (row && prod(row.getAttribute("data-row"))) { S.sel = row.getAttribute("data-row"); paint(); }
  });
})();
