import { $, esc, num, fmt, money, fdate, empty, toast, errMsg, boot, lineChart } from "./ms-workspace.js";

var S = { sb: null, comps: [], obs: [], events: [], sel: null };
var KIND = { price: "Price", new_product: "New product", promotion: "Promotion", ad: "Ad seen", note: "Note" };

function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : null; }
function formData(f) {
  var o = {};
  Array.prototype.forEach.call(f.elements, function (el) { if (el.name) o[el.name] = el.value.trim() === "" ? null : el.value.trim(); });
  return o;
}
async function load() {
  var r = await Promise.all([
    S.sb.from("competitors").select("*").order("created_at", { ascending: false }),
    S.sb.from("competitor_observations").select("*").order("observed_on", { ascending: false }).limit(2000),
    S.sb.from("alert_events").select("*").eq("kind", "competitor").order("created_at", { ascending: false }).limit(50)
  ]);
  S.comps = r[0].data || []; S.obs = r[1].data || []; S.events = r[2].data || [];
}
function obsOf(id) { return S.obs.filter(function (o) { return o.competitor_id === id; }); }

function paint() {
  var since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  $("[data-kpis]").innerHTML = [
    ["COMPETITORS", S.comps.length, "stores you track"],
    ["OBSERVATIONS", S.obs.length, "logged by you"],
    ["LAST 30 DAYS", S.obs.filter(function (o) { return o.observed_on >= since; }).length, "new entries"],
    ["PRICE ALERTS", S.events.length, "fired from your entries"]
  ].map(function (k) { return '<div class="ws-kpi"><div class="k">' + k[0] + '</div><div class="v">' + k[1] + '</div><div class="d">' + k[2] + "</div></div>"; }).join("");

  var list = $("[data-comp-list]");
  if (!S.comps.length) list.innerHTML = empty("No competitors yet", "Add the first store you compete with. You'll log prices, launches, promotions and ads as you see them.");
  else list.innerHTML = '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>STORE</th><th>PLATFORM</th><th class="num">ENTRIES</th><th>LAST SEEN</th><th class="num">ALERT BELOW</th><th></th></tr></thead><tbody>' +
    S.comps.map(function (c) {
      var o = obsOf(c.id), u = safeUrl(c.url);
      return '<tr data-row="' + esc(c.id) + '"' + (c.id === S.sel ? ' class="sel"' : "") + "><td><b>" + esc(c.name) + "</b>" + (u ? ' <a class="amber ws-mini" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">open ↗</a>' : "") +
        (c.category ? '<br><span class="ws-mini">' + esc(c.category) + "</span>" : "") + "</td><td>" + esc(c.platform || "—") + '</td><td class="num">' + o.length + "</td><td>" + (o[0] ? fdate(o[0].observed_on) : "—") +
        '</td><td class="num">' + (c.price_alert_below != null ? fmt(c.price_alert_below) : "—") + '</td><td class="num"><button type="button" class="link-btn" data-del="' + esc(c.id) + '" aria-label="Delete">✕</button></td></tr>';
    }).join("") + "</tbody></table></div>";

  var det = $("[data-detail]"), c = S.comps.find(function (x) { return x.id === S.sel; });
  det.hidden = !c;
  if (c) {
    $("[data-detail-title]").textContent = c.name + " — observations";
    var o = obsOf(c.id);
    var host = $("[data-obs-list]");
    host.innerHTML = o.length ? '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>DATE</th><th>TYPE</th><th>PRODUCT</th><th class="num">PRICE</th><th>NOTE</th><th></th></tr></thead><tbody>' +
      o.map(function (x) { var u = safeUrl(x.source_url); return "<tr><td>" + fdate(x.observed_on) + "</td><td>" + esc(KIND[x.kind]) + "</td><td>" + esc(x.product || "—") + '</td><td class="num">' + (x.price != null ? money(x.price, x.currency) : "—") + "</td><td>" + esc(x.note || "") + (u ? ' <a class="amber" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">source ↗</a>' : "") + '</td><td class="num"><button type="button" class="link-btn" data-obs-del="' + esc(x.id) + '">✕</button></td></tr>'; }).join("") + "</tbody></table></div>"
      : empty("No observations yet", "Log the first price, launch, promotion or ad you see on this store.");
    var prices = o.filter(function (x) { return x.kind === "price" && x.price != null; });
    var products = {};
    prices.forEach(function (x) { var k = (x.product || "—"); (products[k] = products[k] || []).push(x); });
    var top = Object.keys(products).sort(function (a, b) { return products[b].length - products[a].length; })[0];
    var ch = $("[data-obs-chart]");
    if (!top) ch.innerHTML = empty("No price history yet", "Log prices for a product on different dates to chart it.");
    else {
      var pts = products[top].slice().sort(function (a, b) { return a.observed_on < b.observed_on ? -1 : 1; }).map(function (x) { return { x: new Date(x.observed_on), y: x.price, label: fdate(x.observed_on) }; });
      ch.innerHTML = '<div class="ws-mini" style="margin-bottom:4px">Logged price history · ' + esc(top) + "</div><div data-ch></div>";
      lineChart(ch.querySelector("[data-ch]"), pts, { h: 200 });
    }
  }
  var ev = $("[data-events]");
  ev.innerHTML = S.events.length ? '<table class="ws-table"><tbody>' + S.events.map(function (e) { return "<tr><td>" + esc(e.message) + '</td><td class="num ws-mini">' + fdate(e.created_at, true) + "</td></tr>"; }).join("") + "</tbody></table>"
    : empty("No competitor alerts", "Set “alert if a logged price is below” on a competitor. When you log a lower price, an alert appears here and in your Live Terminal inbox.");
}

async function refresh() { await load(); paint(); }

(async function () {
  var r = await boot("competitors.html", "Competitor Intelligence");
  if (!r.session) return;
  S.sb = r.sb;
  $("[data-obs-form]").observed_on.value = new Date().toISOString().slice(0, 10);
  await refresh();
  $("[data-comp-form]").addEventListener("submit", async function (e) {
    e.preventDefault();
    var d = formData(e.target);
    if (d.url && !safeUrl(d.url)) return toast("URL must start with http(s)://");
    d.price_alert_below = num(d.price_alert_below);
    var ins = await S.sb.from("competitors").insert(d).select("id").single();
    if (ins.error) return toast(errMsg(ins.error));
    e.target.reset(); S.sel = ins.data.id; toast("Competitor saved"); refresh();
  });
  $("[data-obs-form]").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!S.sel) return;
    var d = formData(e.target);
    d.price = num(d.price); d.competitor_id = S.sel;
    if (d.kind === "price" && d.price == null) return toast("Enter the price you saw.");
    if (d.source_url && !safeUrl(d.source_url)) return toast("Source URL must start with http(s)://");
    if (!d.observed_on) delete d.observed_on;
    var ins = await S.sb.from("competitor_observations").insert(d);
    if (ins.error) return toast(errMsg(ins.error));
    var keep = { kind: d.kind, currency: d.currency };
    e.target.reset(); e.target.kind.value = keep.kind; e.target.currency.value = keep.currency || "USD"; e.target.observed_on.value = new Date().toISOString().slice(0, 10);
    toast("Observation logged"); refresh();
  });
  document.addEventListener("click", async function (e) {
    var del = e.target.closest("[data-del]");
    if (del) { e.stopPropagation(); if (!confirm("Delete this competitor and all its observations?")) return; var x = await S.sb.from("competitors").delete().eq("id", del.getAttribute("data-del")); if (x.error) toast(errMsg(x.error)); if (S.sel === del.getAttribute("data-del")) S.sel = null; return refresh(); }
    var od = e.target.closest("[data-obs-del]");
    if (od) { var y = await S.sb.from("competitor_observations").delete().eq("id", od.getAttribute("data-obs-del")); if (y.error) toast(errMsg(y.error)); return refresh(); }
    if (e.target.closest("a,button,input,select")) return;
    var row = e.target.closest("[data-row]");
    if (row) { S.sel = row.getAttribute("data-row"); paint(); $("[data-detail]").scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
})();
