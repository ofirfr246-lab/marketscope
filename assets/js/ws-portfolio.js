import { $, esc, num, fmt, money, fdate, verdictPill, empty, toast, errMsg, boot, loadSnapshots, groupProducts, productKey } from "./ms-workspace.js";

var S = { sb: null, rows: [], products: [], suppliers: [] };
var MARKETS = ["United States", "United Kingdom", "Germany", "France", "Italy", "Spain", "Netherlands", "Canada", "Australia", "Israel"];
var STATUS = { idea: "Idea", testing: "Testing", active: "Active", paused: "Paused", dropped: "Dropped" };

export function econ(r) {
  var price = num(r.sell_price), cost = num(r.unit_cost);
  if (price == null || cost == null) return { profit: null, margin: null, monthly: null, revenue: null };
  var fees = price * (num(r.fees_pct) || 0) / 100;
  var profit = price - cost - (num(r.shipping_cost) || 0) - fees - (num(r.ad_cost_per_unit) || 0);
  var units = num(r.monthly_units);
  return { profit: profit, margin: price ? profit / price * 100 : null, monthly: units != null ? profit * units : null, revenue: units != null ? price * units : null };
}
function link(r) { return S.products.find(function (p) { return p.key === r.product_key && p.market === r.market; }); }

function paint() {
  var active = S.rows.filter(function (r) { return r.status !== "dropped"; });
  var ec = active.map(econ);
  var sumP = ec.reduce(function (a, e) { return a + (e.monthly || 0); }, 0), sumR = ec.reduce(function (a, e) { return a + (e.revenue || 0); }, 0);
  var margins = ec.map(function (e) { return e.margin; }).filter(function (v) { return v != null; });
  var linked = active.map(link).filter(Boolean);
  var curs = Array.from(new Set(active.map(function (r) { return r.currency; })));
  var cur = curs.length === 1 ? curs[0] : null;
  $("[data-kpis]").innerHTML = [
    ["PRODUCTS", active.length, S.rows.length - active.length + " dropped"],
    ["EST. MONTHLY REVENUE", cur ? money(sumR, cur) : (active.length ? "mixed currencies" : "—"), "your price × your unit estimate"],
    ["EST. MONTHLY PROFIT", cur ? money(sumP, cur) : (active.length ? "mixed currencies" : "—"), "after cost, shipping, fees, ads"],
    ["AVG MARGIN", margins.length ? fmt(margins.reduce(function (a, b) { return a + b; }, 0) / margins.length, 1) + "%" : "—", "per unit"],
    ["WITH LIVE RESEARCH", linked.length + "/" + active.length, "linked to a snapshot"]
  ].map(function (k) { return '<div class="ws-kpi"><div class="k">' + k[0] + '</div><div class="v">' + k[1] + '</div><div class="d">' + k[2] + "</div></div>"; }).join("");

  var host = $("[data-holdings]");
  if (!S.rows.length) host.innerHTML = empty("Your portfolio is empty", "Add a product you sell or are testing. Products you've researched link to their latest live score automatically.");
  else host.innerHTML = '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>PRODUCT</th><th>STATUS</th><th class="num">PRICE</th><th class="num">PROFIT/UNIT</th><th class="num">MARGIN</th><th class="num">EST. PROFIT/MO</th><th>LIVE RESEARCH</th><th class="num">VS MARKET MEDIAN</th><th></th></tr></thead><tbody>' +
    S.rows.map(function (r) {
      var e = econ(r), p = link(r), s = p && p.latest;
      var vs = s && num(s.price_median) && num(r.sell_price) && s.currency === r.currency ? (r.sell_price - s.price_median) / s.price_median * 100 : null;
      var sup = S.suppliers.find(function (x) { return x.id === r.supplier_id; });
      return '<tr data-edit="' + esc(r.id) + '" style="cursor:pointer"><td><b>' + esc(r.product) + '</b><br><span class="ws-mini">' + esc(r.market) + (sup ? " · " + esc(sup.name) : "") + "</span></td><td>" + esc(STATUS[r.status]) +
        '</td><td class="num">' + money(r.sell_price, r.currency) + '</td><td class="num ' + (e.profit == null ? "" : e.profit >= 0 ? "up" : "down") + '">' + money(e.profit, r.currency) + '</td><td class="num">' + (e.margin == null ? "—" : fmt(e.margin, 1) + "%") +
        '</td><td class="num">' + money(e.monthly, r.currency) + "</td><td>" + (s ? verdictPill(s.verdict) + ' <span class="ws-mini">' + fmt(s.opportunity, 0) + "/100 · " + fdate(s.captured_at) + "</span>" : '<a class="amber ws-mini" href="app.html">no report — research it</a>') +
        '</td><td class="num">' + (vs == null ? "—" : (vs > 0 ? "+" : "") + fmt(vs, 1) + "%") + '</td><td class="num"><button type="button" class="link-btn" data-del="' + esc(r.id) + '">✕</button></td></tr>';
    }).join("") + '</tbody></table></div><p class="ws-mini" style="margin-top:8px">Profit/unit = price − unit cost − shipping − price × fees% − ad cost/unit. “Vs market median” compares your price to the median Google Shopping price in your latest report (same currency only). Click a row to edit.</p>';

  var by = {};
  active.forEach(function (r) { var e = econ(r); if (e.monthly != null && e.monthly > 0) by[r.status] = (by[r.status] || 0) + e.monthly; });
  var tot = Object.keys(by).reduce(function (a, k) { return a + by[k]; }, 0);
  $("[data-alloc]").innerHTML = !tot || !cur ? empty("Nothing to allocate yet", cur || !active.length ? "Add prices, costs and a monthly unit estimate to see where your estimated profit comes from." : "Allocation needs all products in one currency.")
    : '<div style="display:flex;height:22px;border-radius:8px;overflow:hidden;border:1px solid var(--line2)">' + Object.keys(by).map(function (k, i) { return '<div title="' + esc(STATUS[k]) + '" style="width:' + (by[k] / tot * 100) + '%;background:' + ["var(--amber)", "var(--green)", "var(--blue)", "var(--violet)"][i % 4] + '"></div>'; }).join("") + "</div>" +
      '<div class="ws-row" style="margin-top:8px">' + Object.keys(by).map(function (k) { return '<span class="ws-mini">' + esc(STATUS[k]) + " " + fmt(by[k] / tot * 100, 1) + "% · " + money(by[k], cur) + "</span>"; }).join(" ") + "</div>";
}

function fill(r) {
  var f = $("[data-pf-form]");
  ["id", "product", "market", "status", "currency", "unit_cost", "shipping_cost", "sell_price", "fees_pct", "ad_cost_per_unit", "monthly_units", "supplier_id", "notes"].forEach(function (k) { if (f[k]) f[k].value = r[k] == null ? "" : r[k]; });
  $("[data-form-title]").textContent = r.id ? "Edit product" : "Add a product";
}
async function refresh() {
  var res = await Promise.all([S.sb.from("product_portfolio").select("*").order("created_at", { ascending: false }), loadSnapshots(S.sb), S.sb.from("suppliers").select("id,name,product").order("name")]);
  S.rows = res[0].data || []; S.products = groupProducts(res[1]); S.suppliers = res[2].data || [];
  $("#pf-products").innerHTML = S.products.map(function (p) { return '<option value="' + esc(p.product) + '">'; }).join("");
  var f = $("[data-pf-form]"), sv = f.supplier_id.value;
  f.supplier_id.innerHTML = '<option value="">—</option>' + S.suppliers.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name + (s.product ? " · " + s.product : "")) + "</option>"; }).join("");
  f.supplier_id.value = sv;
  paint();
}

(async function () {
  var r = await boot("product-portfolio.html", "Product Portfolio");
  if (!r.session) return;
  S.sb = r.sb;
  var f = $("[data-pf-form]");
  f.market.innerHTML = MARKETS.map(function (m) { return "<option>" + m + "</option>"; }).join("");
  await refresh();
  var qs = new URLSearchParams(location.search);
  if (qs.get("product")) { f.product.value = qs.get("product"); if (qs.get("market")) f.market.value = qs.get("market"); }
  f.addEventListener("reset", function () { setTimeout(function () { f.id.value = ""; $("[data-form-title]").textContent = "Add a product"; }, 0); });
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    var d = {};
    Array.prototype.forEach.call(f.elements, function (el) { if (el.name) d[el.name] = el.value.trim() === "" ? null : el.value.trim(); });
    ["unit_cost", "shipping_cost", "sell_price", "fees_pct", "ad_cost_per_unit", "monthly_units"].forEach(function (k) { d[k] = num(d[k]); });
    d.product_key = productKey(d.product);
    var id = d.id; delete d.id;
    var res = id ? await S.sb.from("product_portfolio").update(d).eq("id", id) : await S.sb.from("product_portfolio").insert(d);
    if (res.error) return toast(errMsg(res.error));
    f.reset(); toast(id ? "Product updated" : "Product added"); refresh();
  });
  document.addEventListener("click", async function (e) {
    var del = e.target.closest("[data-del]");
    if (del) { e.stopPropagation(); if (!confirm("Remove this product from your portfolio?")) return; var x = await S.sb.from("product_portfolio").delete().eq("id", del.getAttribute("data-del")); if (x.error) toast(errMsg(x.error)); return refresh(); }
    var ed = e.target.closest("[data-edit]");
    if (ed && !e.target.closest("a,button")) { var row = S.rows.find(function (x) { return x.id === ed.getAttribute("data-edit"); }); if (row) { fill(row); f.scrollIntoView({ behavior: "smooth", block: "start" }); } }
  });
})();
