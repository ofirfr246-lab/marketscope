/* Supplier finder + market signals. Calls the supplier-apify edge function (provider adapters over Apify).
   Nothing is pre-filled: every row comes from a live provider run or from this account's own cached runs. */
import { $, $$, esc, num, fmt, money, toast, errMsg, fdate } from "./ms-workspace.js";

var SUPPLIERS = [
  { id: "aliexpress", label: "AliExpress", note: "Retail marketplace, shipping quoted" },
  { id: "alibaba", label: "Alibaba", note: "Factories, MOQ, shipping by supplier" },
  { id: "1688", label: "1688", note: "China domestic wholesale (CNY converted)" },
  { id: "cj", label: "CJ Dropshipping", note: "Dropshipping, shipping quoted" },
  { id: "temu", label: "Temu", note: "Retail marketplace" },
  { id: "dhgate", label: "DHgate", note: "Wholesale marketplace" }
];
var SIGNALS = ["shopify", "meta", "tiktok"];
var LABEL = { aliexpress: "AliExpress", alibaba: "Alibaba", "1688": "1688", cj: "CJ Dropshipping", temu: "Temu", dhgate: "DHgate", shopify: "Shopify stores", meta: "Meta Ad Library", tiktok: "TikTok" };
var PLATFORM = { alibaba: "Wholesale marketplace", "1688": "Wholesale marketplace", dhgate: "Wholesale marketplace", cj: "Dropshipping app", aliexpress: "Other", temu: "Other" };
var MARKETS = [["US", "United States"], ["UK", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"], ["NL", "Netherlands"], ["IL", "Israel"]];
var CUR = { US: "USD", UK: "GBP", CA: "CAD", AU: "AUD", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", IL: "USD" };

var F = { sb: null, onSaved: null, res: {}, keyword: "", market: "US", currency: "USD", busy: false, ref: "target", amazon: null, hideNoShip: false };

function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : null; }
function ago(iso) {
  var t = Date.parse(iso); if (!isFinite(t)) return "";
  var m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 2 ? "just now" : m < 90 ? m + " min ago" : m < 2880 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago";
}

/* ---------- calling the edge function ---------- */
async function call(provider, force) {
  var r = await F.sb.functions.invoke("supplier-apify", { body: { keyword: F.keyword, market: F.market, providers: [provider], force: !!force } });
  var data = r.data, err = r.error;
  if (err && err.context && typeof err.context.json === "function") { try { data = await err.context.json(); } catch (e) { /* keep */ } }
  if (!data || data.ok === false) {
    var msg = (data && data.error) || (err && err.message) || "The supplier service did not answer.";
    return { provider: provider, label: LABEL[provider], status: "error", reason: msg, items: [], summary: {}, item_count: 0, cost_usd: 0 };
  }
  var out = data.results && data.results[provider];
  if (out) out.limits = data.limits;
  return out || { provider: provider, label: LABEL[provider], status: "error", reason: "No result returned.", items: [], summary: {}, item_count: 0, cost_usd: 0 };
}
async function runMany(ids, force) {
  var queue = ids.slice(), n = 0;
  async function worker() {
    while (queue.length) {
      var id = queue.shift();
      F.res[id] = { provider: id, label: LABEL[id], status: "running", items: [], summary: {} };
      paint();
      F.res[id] = await call(id, force);
      paint();
    }
  }
  await Promise.all([worker(), worker(), worker()]);
}

/* ---------- landed cost / margin ---------- */
function landed(it) {
  var unit = num(it.price_min); if (unit == null) return null;
  return unit + (num(it.shipping_cost) || 0);
}
function refPrice() {
  var cur = F.currency;
  if (F.ref === "target") { var t = num($("[data-sf-target]").value); return t ? { v: t, label: "your target price" } : null; }
  if (F.ref === "shopify") { var s = F.res.shopify && F.res.shopify.summary; return s && s.price_band && s.price_band.median != null && s.currency === cur ? { v: s.price_band.median, label: "Shopify storefront median" } : null; }
  if (F.ref === "amazon") return F.amazon && F.amazon.currency === cur ? { v: F.amazon.median, label: "Amazon market price (report)" } : null;
  return null;
}
function rows() {
  var out = [];
  SUPPLIERS.forEach(function (p) {
    var r = F.res[p.id];
    if (!r || !r.items) return;
    r.items.forEach(function (it) { out.push({ p: p.id, it: it, landed: landed(it) }); });
  });
  var cur = F.currency;
  return out.filter(function (x) { return x.landed != null && (!x.it.currency || x.it.currency === cur) && (!F.hideNoShip || x.it.shipping_cost != null); })
    .sort(function (a, b) { return a.landed - b.landed; });
}

/* ---------- painting ---------- */
function chip(id) {
  var r = F.res[id]; if (!r) return "";
  var s = r.status, cls = "sf-chip", txt;
  if (s === "running") { cls += " run"; txt = "searching…"; }
  else if (s === "ok") { cls += " ok"; txt = r.item_count + " result" + (r.item_count === 1 ? "" : "s") + (r.source === "cache" ? " · cached " + ago(r.fetched_at) : ""); }
  else if (s === "empty") { txt = "no results" + (r.source === "cache" ? " · cached" : ""); }
  else if (s === "balance") { cls += " bad"; txt = "provider credit exhausted"; }
  else if (s === "rate_limited") { cls += " bad"; txt = "rate limit reached"; }
  else if (s === "timeout") { cls += " bad"; txt = "timed out"; }
  else if (s === "unavailable") { cls += " bad"; txt = "unavailable"; }
  else { cls += " bad"; txt = "error"; }
  return '<span class="' + cls + '" title="' + esc(r.reason || "") + '"><b>' + esc(LABEL[id]) + "</b> " + esc(txt) + "</span>";
}
function statusNotes() {
  var lines = [];
  Object.keys(F.res).forEach(function (id) {
    var r = F.res[id];
    if (r && (r.status === "error" || r.status === "balance" || r.status === "unavailable" || r.status === "timeout" || r.status === "rate_limited" || r.status === "empty") && r.reason) lines.push("<li><b>" + esc(LABEL[id]) + ":</b> " + esc(r.reason) + "</li>");
  });
  return lines.length ? '<ul class="sf-notes">' + lines.join("") + "</ul>" : "";
}
function refBlock() {
  var cur = F.currency, parts = [];
  var t = num($("[data-sf-target]").value);
  parts.push("<span><b>Your target price</b> " + (t ? money(t, cur) : "not set") + "</span>");
  var sh = F.res.shopify && F.res.shopify.status === "ok" ? F.res.shopify.summary : null;
  parts.push("<span><b>Shopify storefront median</b> " + (sh && sh.price_band && sh.price_band.median != null ? money(sh.price_band.median, sh.currency) + " (" + sh.stores + " stores)" : "run “Market signals” to see") + "</span>");
  parts.push("<span><b>Market price (Amazon)</b> " + (F.amazon ? money(F.amazon.median, F.amazon.currency) + " (from your report, " + fdate(F.amazon.at) + ")" : "no Amazon price in your reports yet") + "</span>");
  return '<div class="sf-ref">' + parts.join("") + "</div>";
}
function paintTable() {
  var host = $("[data-sf-table]");
  var rs = rows();
  var any = SUPPLIERS.some(function (p) { return F.res[p.id] && F.res[p.id].status && F.res[p.id].status !== "running"; });
  if (!any) { host.innerHTML = ""; return; }
  var ref = refPrice();
  if (!rs.length) {
    host.innerHTML = '<div class="ws-empty"><b>No comparable listings</b>' + (F.hideNoShip ? "No listing has a shipping quote. Untick the filter to see all listings." : "None of the selected providers returned priced listings in " + esc(F.currency) + " for this keyword and market.") + "</div>";
    return;
  }
  var shown = rs.slice(0, 60);
  host.innerHTML = '<div class="ws-table-wrap"><table class="ws-table sf-table"><thead><tr><th>PROVIDER</th><th>LISTING</th><th>STORE</th><th class="num">UNIT</th><th class="num">SHIP</th><th class="num">LANDED</th><th class="num">MARGIN' + (ref ? " vs " + esc(ref.label.toUpperCase()) : "") + '</th><th class="num">SOLD</th><th class="num">RATING</th><th class="num">MOQ</th><th class="num">DAYS</th><th></th></tr></thead><tbody>' +
    shown.map(function (x, i) {
      var it = x.it, u = safeUrl(it.url), img = safeUrl(it.image);
      var unit = it.price_max != null && it.price_max !== it.price_min ? money(it.price_min, it.currency) + "–" + money(it.price_max, it.currency) : money(it.price_min, it.currency);
      var ship = it.shipping_cost == null ? '<span class="ws-mini" title="No shipping quote from this source: landed = unit price only">—</span>' : it.shipping_cost === 0 ? "free" : money(it.shipping_cost, it.currency);
      var margin = ref ? (ref.v - x.landed) / ref.v * 100 : null;
      var days = it.shipping_days_min != null || it.shipping_days_max != null ? (it.shipping_days_min != null && it.shipping_days_min !== it.shipping_days_max ? it.shipping_days_min + "–" : "") + (it.shipping_days_max != null ? it.shipping_days_max : "?") : "—";
      var conv = it.currency_native ? '<span class="ws-mini" title="Converted from ' + esc(it.currency_native) + ' at today\'s rate"> ≈</span>' : "";
      return "<tr><td>" + esc(LABEL[x.p]) + '</td><td><div class="sf-title">' + (img ? '<img src="' + esc(img) + '" alt="" width="34" height="34" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility=\'hidden\'">' : '<span class="sf-noimg"></span>') +
        "<span>" + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(it.title) + "</a>" : esc(it.title)) + "</span></div></td><td>" + esc(it.store || "—") +
        '</td><td class="num">' + unit + conv + '</td><td class="num">' + ship + '</td><td class="num"><b>' + money(x.landed, it.currency) + (it.shipping_cost == null ? ' <span class="ws-mini">+ship?</span>' : "") + "</b></td>" +
        '<td class="num ' + (margin == null ? "" : margin >= 0 ? "up" : "down") + '">' + (margin == null ? "—" : fmt(margin, 0) + "%") + '</td><td class="num">' + (it.sold != null ? fmt(it.sold, 0) : "—") + '</td><td class="num">' + (it.rating != null ? fmt(it.rating, 1) + (it.reviews ? ' <span class="ws-mini">(' + fmt(it.reviews, 0) + ")</span>" : "") : "—") +
        '</td><td class="num">' + (it.moq != null ? fmt(it.moq, 0) : "—") + '</td><td class="num">' + days + '</td><td><button class="btn btn-sm btn-ghost" data-sf-save="' + i + '">Save</button></td></tr>';
    }).join("") + "</tbody></table></div>" +
    '<p class="ws-mini sf-foot">' + (rs.length > shown.length ? "Showing the cheapest " + shown.length + " of " + rs.length + " listings. " : "") +
    "Sorted by landed cost = unit price (lowest tier shown) + cheapest shipping option where the source quotes one. “+ship?” means no shipping quote, so the real landed cost is higher. Margin = (reference price − landed) ÷ reference price, before fees, ads, duties and returns. Alibaba, 1688 and DHgate prices usually depend on order quantity (see MOQ).</p>";
  F._shown = shown;
}
function signalCard(id) {
  var r = F.res[id];
  if (!r) return "";
  var head = '<h3>' + esc(LABEL[id]) + "</h3>";
  if (r.status === "running") return '<div class="sf-card">' + head + '<p class="ws-mini">Searching…</p></div>';
  if (r.status !== "ok") return '<div class="sf-card">' + head + '<p class="ws-mini">' + esc(r.reason || (r.status === "empty" ? "No data for this keyword." : "Unavailable.")) + "</p></div>";
  var s = r.summary || {}, cur = s.currency, body = "";
  if (id === "shopify") {
    var b = s.price_band || {};
    body = '<div class="sf-kv"><span><b>' + fmt(s.stores, 0) + "</b> competing stores</span><span><b>" + (b.median != null ? money(b.median, cur) : "—") + "</b> median price</span><span><b>" + (b.p25 != null ? money(b.p25, cur) + "–" + money(b.p75, cur) : "—") + "</b> typical band</span><span><b>" + (s.on_sale_share != null ? Math.round(s.on_sale_share * 100) + "%" : "—") + "</b> on sale</span><span><b>" + (s.variants_median != null ? fmt(s.variants_median, 0) : "—") + "</b> median variants</span></div>" +
      '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>STORE</th><th>PRODUCT</th><th class="num">PRICE</th><th class="num">COMPARE-AT</th><th class="num">VARIANTS</th><th>PUBLISHED</th></tr></thead><tbody>' +
      (r.items || []).slice(0, 10).map(function (it) {
        var u = safeUrl(it.url);
        return "<tr><td>" + esc(it.store_domain || it.store || "—") + "</td><td>" + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(it.title) + "</a>" : esc(it.title)) + '</td><td class="num">' + money(it.price, it.currency) + '</td><td class="num">' + (it.compare_at_price ? money(it.compare_at_price, it.currency) : "—") + '</td><td class="num">' + (it.variants != null ? it.variants : "—") + "</td><td>" + (it.published_at || it.created_at ? fdate(it.published_at || it.created_at) : "—") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  } else if (id === "meta") {
    var d = s.days_running || {};
    body = '<div class="sf-kv"><span><b>' + fmt(s.active_ads, 0) + "</b> active ads" + (s.capped ? "+" : "") + "</span><span><b>" + fmt(s.advertisers, 0) + "</b> advertisers</span><span><b>" + (d.median != null ? fmt(d.median, 0) + " d" : "—") + "</b> median days running</span><span><b>" + (d.share_30_plus != null ? Math.round(d.share_30_plus * 100) + "%" : "—") + "</b> running 30+ days</span></div>" +
      '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>ADVERTISER</th><th>AD TEXT</th><th>STARTED</th><th class="num">DAYS</th><th>PLATFORMS</th><th></th></tr></thead><tbody>' +
      (r.items || []).slice(0, 8).map(function (a) {
        var u = safeUrl(a.library_url);
        return "<tr><td><b>" + esc(a.advertiser) + "</b></td><td>" + esc((a.text || "").slice(0, 110)) + '</td><td>' + (a.start_date ? fdate(a.start_date) : "—") + '</td><td class="num">' + (a.days_running != null ? a.days_running : "—") + "</td><td>" + esc((a.platforms || []).join(", ").toLowerCase()) + "</td><td>" + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">view ↗</a>' : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  } else if (id === "tiktok") {
    var h = s.hashtag, v = s.views || {}, t = s.trend || {};
    body = '<div class="sf-kv">' + (h && h.views != null ? "<span><b>" + fmt(h.views / 1e6, 0) + "M</b> views on #" + esc(h.tag) + "</span>" : "") + "<span><b>" + fmt(s.videos, 0) + "</b> videos sampled</span><span><b>" + (v.median != null ? fmt(v.median, 0) : "—") + "</b> median views</span><span><b>" + (v.max != null ? fmt(v.max / 1e6, 1) + "M" : "—") + "</b> top video</span><span><b>" + (t.velocity_ratio != null ? "×" + fmt(t.velocity_ratio, 1) : "—") + "</b> posts last 90d vs prior 90d</span><span><b>" + fmt(s.ads_in_sample, 0) + "</b> ads in sample</span></div>" +
      '<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>CREATOR</th><th>VIDEO</th><th>POSTED</th><th class="num">VIEWS</th><th class="num">LIKES</th><th class="num">SHARES</th><th class="num">COMMENTS</th></tr></thead><tbody>' +
      (r.items || []).slice(0, 8).map(function (x) {
        var u = safeUrl(x.url);
        return "<tr><td>@" + esc(x.creator || "?") + "</td><td>" + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc((x.text || "video").slice(0, 80)) + "</a>" : esc((x.text || "").slice(0, 80))) + "</td><td>" + (x.posted_at ? fdate(x.posted_at) : "—") + '</td><td class="num">' + fmt(x.views, 0) + '</td><td class="num">' + fmt(x.likes, 0) + '</td><td class="num">' + fmt(x.shares, 0) + '</td><td class="num">' + fmt(x.comments, 0) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  return '<div class="sf-card">' + head + body + '<p class="ws-mini">' + esc(s.scope_note || "") + " " + esc(r.attribution || "") + (r.source === "cache" ? " · cached " + ago(r.fetched_at) : " · fetched just now") + (r.cost_usd ? " · est. cost $" + r.cost_usd.toFixed(3) : "") + "</p></div>";
}
function paint() {
  var hasS = SUPPLIERS.some(function (p) { return F.res[p.id]; });
  $("[data-sf-chips]").innerHTML = SUPPLIERS.concat(SIGNALS.map(function (id) { return { id: id }; })).map(function (p) { return chip(p.id); }).join("");
  $("[data-sf-refbox]").innerHTML = hasS || F.res.shopify ? refBlock() : "";
  $("[data-sf-notes]").innerHTML = statusNotes();
  paintTable();
  var sig = SIGNALS.map(signalCard).join("");
  $("[data-sf-signals]").innerHTML = sig ? '<div class="sf-cards">' + sig + "</div>" : "";
  var used = {}; SUPPLIERS.concat(SIGNALS.map(function (id) { return { id: id }; })).forEach(function (p) { var r = F.res[p.id]; if (r && r.status === "ok") used[p.id] = r; });
  var tot = Object.keys(used).reduce(function (a, k) { return a + (used[k].cost_usd || 0); }, 0);
  $("[data-sf-attr]").innerHTML = Object.keys(used).length ? "<span>" + Object.keys(used).map(function (k) { return esc(used[k].attribution); }).join("</span> · <span>") + "</span>" + (tot ? " · estimated provider cost for this view: $" + tot.toFixed(3) + " (cached results cost $0)" : "") : "";
  var rl = Object.keys(F.res).map(function (k) { return F.res[k] && F.res[k].limits; }).filter(Boolean)[0];
  $("[data-sf-limit]").textContent = rl ? "Searches left this hour: " + rl.remaining_hour + " of " + rl.per_hour + " (cached results are free and do not count)." : "";
}

/* ---------- actions ---------- */
function readForm() {
  var kw = $("[data-sf-kw]").value.trim().replace(/\s+/g, " ");
  if (kw.length < 2) { toast("Enter a product keyword."); return false; }
  F.keyword = kw; F.market = $("[data-sf-market]").value; F.currency = CUR[F.market] || "USD";
  return true;
}
async function search(ids, force) {
  if (F.busy || !readForm()) return;
  F.busy = true;
  var btns = $$("[data-sf-go],[data-sf-signals-go],[data-sf-refresh]"); btns.forEach(function (b) { b.disabled = true; });
  try { await runMany(ids, force); } finally { F.busy = false; btns.forEach(function (b) { b.disabled = false; }); }
}
function chosenSuppliers() { return $$("[data-sf-prov]:checked").map(function (c) { return c.value; }); }
async function loadAmazon(kw) {
  F.amazon = null;
  if (!kw) return;
  try {
    var r = await F.sb.from("reports").select("product,market,created_at,content,result").ilike("product", kw).order("created_at", { ascending: false }).limit(5);
    (r.data || []).some(function (row) {
      var c = row.content || row.result || {}, a = (c && c.amazon) || (row.result && row.result.amazon) || null, m = a && a.prices && num(a.prices.median);
      if (m != null && a.prices.currency) { F.amazon = { median: m, currency: a.prices.currency, at: row.created_at }; return true; }
      return false;
    });
  } catch (e) { /* reports table not readable: no Amazon reference */ }
}
async function saveRow(i) {
  var x = F._shown && F._shown[i]; if (!x) return;
  var it = x.it, t = num($("[data-sf-target]").value);
  var d = {
    name: (it.store || LABEL[x.p]).slice(0, 120), url: safeUrl(it.url), platform: PLATFORM[x.p] || "Other", product: F.keyword,
    unit_cost: num(it.price_min), shipping_cost: num(it.shipping_cost), currency: it.currency || F.currency,
    shipping_days_min: it.shipping_days_min != null ? Math.round(it.shipping_days_min) : null, shipping_days_max: it.shipping_days_max != null ? Math.round(it.shipping_days_max) : null,
    moq: it.moq != null ? Math.round(it.moq) : null, target_sell_price: t || null,
    notes: "Saved from " + LABEL[x.p] + " search (via Apify) on " + fdate(new Date().toISOString()) + ": " + (it.title || "").slice(0, 120)
  };
  var ins = await F.sb.from("suppliers").insert(d);
  if (ins.error) return toast(errMsg(ins.error));
  toast("Saved to your supplier quotes"); if (F.onSaved) F.onSaved();
}

async function restoreLast() {
  try {
    var r = await F.sb.from("source_results").select("provider,kind,keyword,market,status,reason,items,summary,item_count,cost_usd,fetched_at,expires_at,actor").order("fetched_at", { ascending: false }).limit(20);
    var rows = r.data || []; if (!rows.length) return;
    var first = rows[0];
    var same = rows.filter(function (x) { return x.keyword === first.keyword && x.market === first.market; });
    F.keyword = first.keyword; F.market = first.market; F.currency = CUR[F.market] || "USD";
    $("[data-sf-kw]").value = F.keyword; $("[data-sf-market]").value = F.market;
    same.forEach(function (x) {
      if (!LABEL[x.provider]) return;
      F.res[x.provider] = { provider: x.provider, label: LABEL[x.provider], status: x.status, reason: x.reason, items: x.items || [], summary: x.summary || {}, item_count: x.item_count, cost_usd: 0, source: "cache", fetched_at: x.fetched_at, attribution: "Source: " + LABEL[x.provider] + " (via Apify)" };
    });
    await loadAmazon(F.keyword);
    paint();
  } catch (e) { /* table unreadable: start empty */ }
}

export async function initFinder(opts) {
  F.sb = opts.sb; F.onSaved = opts.onSaved;
  var host = $("[data-finder]"); if (!host) return;
  host.innerHTML =
    '<form class="ws-form" data-sf-form autocomplete="off"><label class="full-2">PRODUCT KEYWORD<input data-sf-kw list="sf-kw-list" maxlength="80" placeholder="e.g. posture corrector" required><datalist id="sf-kw-list"></datalist></label>' +
    '<label>MARKET (ship-to)<select data-sf-market>' + MARKETS.map(function (m) { return '<option value="' + m[0] + '">' + esc(m[1]) + "</option>"; }).join("") + "</select></label>" +
    '<label>TARGET SELL PRICE <span data-sf-cur class="ws-mini">USD</span><input data-sf-target type="number" step="0.01" min="0" placeholder="optional"></label>' +
    '<label>MARGIN REFERENCE<select data-sf-ref><option value="target">Your target price</option><option value="shopify">Shopify storefront median</option><option value="amazon">Amazon market price (report)</option></select></label>' +
    '<div class="full sf-provs">' + SUPPLIERS.map(function (p) { return '<label class="sf-prov" title="' + esc(p.note) + '"><input type="checkbox" data-sf-prov value="' + p.id + '" checked> ' + esc(p.label) + "</label>"; }).join("") + "</div>" +
    '<div class="full sf-actions"><button class="btn btn-sm btn-amber" type="submit" data-sf-go>Find suppliers</button><button class="btn btn-sm btn-ghost" type="button" data-sf-signals-go title="Shopify stores, Meta ads and TikTok for this keyword">Market signals</button><button class="btn btn-sm btn-ghost" type="button" data-sf-refresh title="Re-run the selected providers now, ignoring the 24-hour cache (uses provider credit)">Refresh live</button><label class="sf-hide"><input type="checkbox" data-sf-hide> Only listings with a shipping quote</label></div></form>' +
    '<p class="ws-mini" data-sf-limit></p><div class="sf-chips" data-sf-chips></div><div data-sf-refbox></div><div data-sf-notes></div><div data-sf-table></div><h3 class="sf-h3" data-sf-sig-h hidden>Market signals</h3><div data-sf-signals></div><p class="ws-mini sf-attr" data-sf-attr></p>' +
    '<p class="ws-mini">Results come live from public marketplaces through Apify, are cached for 24 hours per keyword and market, and each search costs provider credit, so searches are rate-limited. Figures describe the sample returned, not the whole marketplace.</p>';

  $("[data-sf-form]").addEventListener("submit", function (e) { e.preventDefault(); if (!readForm()) return; loadAmazon(F.keyword).then(function () { return search(chosenSuppliers(), false); }); });
  $("[data-sf-signals-go]").addEventListener("click", function () { $("[data-sf-sig-h]").hidden = false; search(SIGNALS, false); });
  $("[data-sf-refresh]").addEventListener("click", function () { if (!chosenSuppliers().length) return toast("Pick at least one provider."); if (confirm("Re-run the selected providers now? This uses provider credit.")) search(chosenSuppliers(), true); });
  $("[data-sf-market]").addEventListener("change", function () { $("[data-sf-cur]").textContent = CUR[this.value] || "USD"; F.market = this.value; F.currency = CUR[this.value] || "USD"; paint(); });
  $("[data-sf-target]").addEventListener("input", paint);
  $("[data-sf-ref]").addEventListener("change", function () { F.ref = this.value; paint(); });
  $("[data-sf-hide]").addEventListener("change", function () { F.hideNoShip = this.checked; paint(); });
  host.addEventListener("click", function (e) { var b = e.target.closest("[data-sf-save]"); if (b) saveRow(+b.getAttribute("data-sf-save")); });

  // keyword suggestions: the user's own products and watchlist
  try {
    var sup = await F.sb.from("suppliers").select("product").limit(100), wl = await F.sb.from("research_watchlist").select("product").limit(100);
    var seen = {}; var opts2 = [];
    (sup.data || []).concat(wl.data || []).forEach(function (r) { if (r.product && !seen[r.product.toLowerCase()]) { seen[r.product.toLowerCase()] = 1; opts2.push(r.product); } });
    $("#sf-kw-list").innerHTML = opts2.slice(0, 40).map(function (p) { return '<option value="' + esc(p) + '">'; }).join("");
  } catch (e) { /* no suggestions */ }
  await restoreLast();
  $("[data-sf-cur]").textContent = F.currency;
  if (SIGNALS.some(function (id) { return F.res[id]; })) $("[data-sf-sig-h]").hidden = false;
}
