import { $, $$, esc, num, fmt, money, empty, toast, errMsg, boot } from "./ms-workspace.js";

var S = { sb: null, sup: [] };
function formData(f) { var o = {}; Array.prototype.forEach.call(f.elements, function (el) { if (el.name) o[el.name] = el.value.trim() === "" ? null : el.value.trim(); }); return o; }
function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : null; }

export function metrics(s) {
  var landed = num(s.unit_cost) == null ? null : num(s.unit_cost) + (num(s.shipping_cost) || 0);
  var price = num(s.target_sell_price);
  var margin = landed != null && price ? (price - landed) / price * 100 : null;
  var days = num(s.shipping_days_max) != null ? num(s.shipping_days_max) : num(s.shipping_days_min);
  var moqCash = landed != null && num(s.moq) != null ? landed * num(s.moq) : null;
  return { landed: landed, margin: margin, profit: landed != null && price ? price - landed : null, days: days, moqCash: moqCash };
}
function norm(v, min, max, lowerIsBetter) {
  if (v == null || min == null) return null;
  if (max === min) return 1;
  var t = (v - min) / (max - min);
  return lowerIsBetter ? 1 - t : t;
}
function fitScores(rows, w) {
  function range(f) { var vs = rows.map(f).filter(function (v) { return v != null; }); return vs.length ? [Math.min.apply(null, vs), Math.max.apply(null, vs)] : [null, null]; }
  var rc = range(function (r) { return r.m.landed; }), rq = range(function (r) { return num(r.s.quality); }), rd = range(function (r) { return r.m.days; }),
    rr = range(function (r) { return num(r.s.reliability); }), rm = range(function (r) { return num(r.s.moq); });
  rows.forEach(function (r) {
    var parts = [[norm(r.m.landed, rc[0], rc[1], true), w.cost], [norm(num(r.s.quality), rq[0], rq[1]), w.quality], [norm(r.m.days, rd[0], rd[1], true), w.speed],
      [norm(num(r.s.reliability), rr[0], rr[1]), w.reliability], [norm(num(r.s.moq), rm[0], rm[1], true), w.moq]].filter(function (p) { return p[0] != null && p[1] > 0; });
    var tw = parts.reduce(function (a, p) { return a + p[1]; }, 0);
    r.fit = tw ? Math.round(parts.reduce(function (a, p) { return a + p[0] * p[1]; }, 0) / tw * 100) : null;
    r.factors = parts.length;
  });
}
function paint() {
  var wf = $("[data-weights]"), w = { cost: +wf.cost.value, quality: +wf.quality.value, speed: +wf.speed.value, reliability: +wf.reliability.value, moq: +wf.moq.value };
  var prods = Array.from(new Set(S.sup.map(function (s) { return s.product; }).filter(Boolean))).sort();
  var cur = wf.product.value;
  wf.product.innerHTML = '<option value="">All products</option>' + prods.map(function (p) { return '<option' + (p === cur ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("");
  var rows = S.sup.filter(function (s) { return !cur || s.product === cur; }).map(function (s) { return { s: s, m: metrics(s) }; });
  var host = $("[data-compare]");
  if (!rows.length) { host.innerHTML = empty("No suppliers yet", "Add your first supplier quote to start comparing landed cost, margin, shipping time and MOQ."); return; }
  fitScores(rows, w);
  rows.sort(function (a, b) { return (b.fit == null ? -1 : b.fit) - (a.fit == null ? -1 : a.fit); });
  function best(f, low) { var vs = rows.map(f).filter(function (v) { return v != null; }); if (vs.length < 2) return null; return low ? Math.min.apply(null, vs) : Math.max.apply(null, vs); }
  var bL = best(function (r) { return r.m.landed; }, true), bM = best(function (r) { return r.m.margin; }), bD = best(function (r) { return r.m.days; }, true),
    bQ = best(function (r) { return num(r.s.quality); }), bR = best(function (r) { return num(r.s.reliability); }), bO = best(function (r) { return num(r.s.moq); }, true);
  function hi(v, b, txt) { return '<span class="' + (b != null && v === b ? "ws-best" : "") + '">' + txt + "</span>"; }
  host.innerHTML = '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>SUPPLIER</th><th>PRODUCT</th><th class="num">UNIT</th><th class="num">SHIP</th><th class="num">LANDED</th><th class="num">TARGET PRICE</th><th class="num">PROFIT/UNIT</th><th class="num">MARGIN</th><th class="num">DAYS</th><th class="num">MOQ</th><th class="num">MOQ CASH</th><th class="num">QUALITY</th><th class="num">RELIAB.</th><th class="num">FIT</th><th></th></tr></thead><tbody>' +
    rows.map(function (r) {
      var s = r.s, m = r.m, u = safeUrl(s.url);
      return "<tr><td><b>" + esc(s.name) + "</b>" + (u ? ' <a class="amber ws-mini" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">↗</a>' : "") + (s.platform ? '<br><span class="ws-mini">' + esc(s.platform) + "</span>" : "") + "</td><td>" + esc(s.product || "—") +
        '</td><td class="num">' + money(s.unit_cost, s.currency) + '</td><td class="num">' + money(s.shipping_cost, s.currency) + '</td><td class="num">' + hi(m.landed, bL, money(m.landed, s.currency)) +
        '</td><td class="num">' + money(s.target_sell_price, s.currency) + '</td><td class="num">' + money(m.profit, s.currency) + '</td><td class="num">' + hi(m.margin, bM, m.margin == null ? "—" : fmt(m.margin, 1) + "%") +
        '</td><td class="num">' + hi(m.days, bD, s.shipping_days_min != null || s.shipping_days_max != null ? (s.shipping_days_min != null ? s.shipping_days_min : "?") + "–" + (s.shipping_days_max != null ? s.shipping_days_max : "?") : "—") +
        '</td><td class="num">' + hi(num(s.moq), bO, fmt(s.moq, 0)) + '</td><td class="num">' + money(m.moqCash, s.currency) + '</td><td class="num">' + hi(num(s.quality), bQ, s.quality ? s.quality + "/5" : "—") +
        '</td><td class="num">' + hi(num(s.reliability), bR, s.reliability ? s.reliability + "/5" : "—") + '</td><td class="num"><b>' + (r.fit == null ? "—" : r.fit) + '</b><br><span class="ws-mini">' + r.factors + ' factor(s)</span></td><td class="num"><button type="button" class="link-btn" data-del="' + esc(s.id) + '">✕</button></td></tr>';
    }).join("") + "</tbody></table></div>" +
    '<p class="ws-mini" style="margin-top:8px">Landed = unit cost + shipping per unit. Margin = (target price − landed) ÷ target price, before fees and ads. MOQ cash = landed × MOQ. Green = best in this list. Mixed currencies are not converted.</p>';
}
async function refresh() { var r = await S.sb.from("suppliers").select("*").order("created_at", { ascending: false }); S.sup = r.data || []; paint(); }

(async function () {
  var r = await boot("suppliers.html", "Supplier Intelligence");
  if (!r.session) return;
  S.sb = r.sb;
  await refresh();
  $("[data-weights]").addEventListener("input", paint);
  $("[data-weights]").addEventListener("change", paint);
  $("[data-sup-form]").addEventListener("submit", async function (e) {
    e.preventDefault();
    var d = formData(e.target);
    if (d.url && !safeUrl(d.url)) return toast("URL must start with http(s)://");
    ["unit_cost", "shipping_cost", "target_sell_price", "shipping_days_min", "shipping_days_max", "moq", "quality", "reliability"].forEach(function (k) { d[k] = num(d[k]); });
    if (d.shipping_days_min != null && d.shipping_days_max != null && d.shipping_days_min > d.shipping_days_max) return toast("Min shipping days is above max.");
    d.currency = d.currency || "USD";
    var ins = await S.sb.from("suppliers").insert(d);
    if (ins.error) return toast(errMsg(ins.error));
    e.target.reset(); toast("Supplier saved"); refresh();
  });
  document.addEventListener("click", async function (e) {
    var del = e.target.closest("[data-del]");
    if (del) { if (!confirm("Delete this supplier?")) return; var x = await S.sb.from("suppliers").delete().eq("id", del.getAttribute("data-del")); if (x.error) toast(errMsg(x.error)); refresh(); }
  });
})();
