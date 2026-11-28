/* MarketScope — Meta ad history (meta-ads.html) and single-ad detail (meta-ad.html). BETA, READ-ONLY (ads_read).
   Browser side only: publishable key + the signed-in user's own session. No secrets here.
   Data: Supabase Edge Function meta-ads-history (verify_jwt; same plan gate as meta-insights).
   Nothing is invented: every number shown comes from Meta's response; missing values show "—". */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";
import { getPlanInfo, includes, MIN_PLAN, planName } from "./integrations-plan.js";

var FN = SUPABASE_URL + "/functions/v1/";
var PAGE = (document.body && document.body.getAttribute("data-page")) || "";
var sb = null, session = null;
var S = { accounts: [], acct: null, range: "last_30d", status: "all", campaign: "", q: "", view: "ads",
  ads: [], campaigns: [], totals: null, cursor: null, cCursor: null, sort: { key: "created", dir: -1 }, loading: false };

function $(s, el) { return (el || document).querySelector(s); }
function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

/* ---------- formatting ---------- */
var RANGE_LABEL = { last_7d: "last 7 days", last_14d: "last 14 days", last_30d: "last 30 days", last_90d: "last 90 days", maximum: "lifetime", this_month: "this month", last_month: "last month" };
function isNum(v) { return v !== null && v !== undefined && v !== "" && isFinite(Number(v)); }
function fmtNum(v, d) { return isNum(v) ? Number(v).toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d }) : "—"; }
function fmtPct(v) { return isNum(v) ? Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "%" : "—"; }
function fmtMoney(v, cur) {
  if (!isNum(v)) return "—";
  var n = Number(v);
  try { if (cur) return n.toLocaleString("en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 }); } catch (e) { /* unknown code */ }
  return fmtNum(n, 2) + (cur ? " " + cur : "");
}
/* Meta returns budgets in the currency's smallest unit (cents for USD). */
function budgetMoney(v, cur) {
  if (!isNum(v)) return null;
  var digits = 2;
  try { digits = new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }).resolvedOptions().maximumFractionDigits; } catch (e) { /* default 2 */ }
  return fmtMoney(Number(v) / Math.pow(10, digits), cur);
}
function fmtDate(iso, withTime) {
  if (!iso) return "—";
  var d = new Date(iso);
  if (isNaN(d)) return "—";
  var o = { year: "numeric", month: "short", day: "numeric" };
  if (withTime) { o.hour = "numeric"; o.minute = "2-digit"; }
  return d.toLocaleString("en-US", o);
}
function shortDate(iso) {
  var d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return isNaN(d) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function titleCase(s) { return String(s || "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
var OBJECTIVE = { OUTCOME_SALES: "Sales", OUTCOME_LEADS: "Leads", OUTCOME_TRAFFIC: "Traffic", OUTCOME_ENGAGEMENT: "Engagement", OUTCOME_AWARENESS: "Awareness", OUTCOME_APP_PROMOTION: "App promotion",
  CONVERSIONS: "Conversions", LINK_CLICKS: "Traffic", POST_ENGAGEMENT: "Engagement", REACH: "Reach", BRAND_AWARENESS: "Awareness", VIDEO_VIEWS: "Video views", LEAD_GENERATION: "Leads", MESSAGES: "Messages", APP_INSTALLS: "App installs", PRODUCT_CATALOG_SALES: "Catalog sales" };
function objLabel(o) { return o ? (OBJECTIVE[o] || titleCase(o)) : "—"; }

/* ---------- status ---------- */
var STATUS_GROUPS = {
  active: ["ACTIVE"], paused: ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"], review: ["PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED"],
  issues: ["DISAPPROVED", "WITH_ISSUES", "PENDING_BILLING_INFO"], archived: ["ARCHIVED", "DELETED"]
};
STATUS_GROUPS.all = [].concat(STATUS_GROUPS.active, STATUS_GROUPS.paused, STATUS_GROUPS.review, STATUS_GROUPS.issues, STATUS_GROUPS.archived);
function ended(ad) {
  var now = Date.now();
  var stop = (ad.adset && ad.adset.end_time) || (ad.campaign && ad.campaign.stop_time);
  return stop && new Date(stop).getTime() < now;
}
function statusInfo(st, ad) {
  st = String(st || "");
  if (st === "ACTIVE" && ad && ended(ad)) return { cls: "done", label: "Completed" };
  var m = {
    ACTIVE: ["on", "Active"], PAUSED: ["paused", "Paused"], CAMPAIGN_PAUSED: ["paused", "Campaign paused"], ADSET_PAUSED: ["paused", "Ad set paused"],
    PENDING_REVIEW: ["review", "In review"], IN_PROCESS: ["review", "Processing"], PREAPPROVED: ["review", "Pre-approved"],
    DISAPPROVED: ["bad", "Rejected"], WITH_ISSUES: ["bad", "Has issues"], PENDING_BILLING_INFO: ["bad", "Billing needed"],
    ARCHIVED: ["done", "Archived"], DELETED: ["done", "Deleted"]
  }[st];
  return m ? { cls: m[0], label: m[1] } : { cls: "done", label: st ? titleCase(st) : "Unknown" };
}
function statusChip(st, ad) { var i = statusInfo(st, ad); return '<span class="ma-st ma-st-' + i.cls + '"><i></i>' + esc(i.label) + "</span>"; }

/* ---------- results by objective ---------- */
var RESULT_TYPES = [
  { obj: ["OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES"], types: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"], one: "purchase", many: "purchases" },
  { obj: ["OUTCOME_LEADS", "LEAD_GENERATION"], types: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"], one: "lead", many: "leads" },
  { obj: ["OUTCOME_TRAFFIC", "LINK_CLICKS"], types: ["link_click", "landing_page_view"], one: "link click", many: "link clicks" },
  { obj: ["OUTCOME_ENGAGEMENT", "POST_ENGAGEMENT"], types: ["post_engagement", "onsite_conversion.messaging_conversation_started_7d"], one: "engagement", many: "engagements" },
  { obj: ["MESSAGES"], types: ["onsite_conversion.messaging_conversation_started_7d"], one: "conversation", many: "conversations" },
  { obj: ["VIDEO_VIEWS"], types: ["video_view"], one: "video view", many: "video views" },
  { obj: ["OUTCOME_APP_PROMOTION", "APP_INSTALLS"], types: ["mobile_app_install", "app_install", "omni_app_install"], one: "install", many: "installs" }
];
function actionVal(list, types) {
  if (!Array.isArray(list)) return null;
  for (var i = 0; i < types.length; i++) for (var j = 0; j < list.length; j++) if (list[j].action_type === types[i]) return Number(list[j].value);
  return null;
}
var PURCHASE = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"];
function results(ins, objective) {
  if (!ins) return null;
  if (objective === "OUTCOME_AWARENESS" || objective === "REACH" || objective === "BRAND_AWARENESS") return isNum(ins.reach) ? { n: Number(ins.reach), one: "person reached", many: "people reached" } : null;
  for (var i = 0; i < RESULT_TYPES.length; i++) {
    var r = RESULT_TYPES[i];
    if (r.obj.indexOf(objective) > -1) { var v = actionVal(ins.actions, r.types); return v == null ? { n: 0, one: r.one, many: r.many } : { n: v, one: r.one, many: r.many }; }
  }
  return null;
}
function purchases(ins) { return ins ? actionVal(ins.actions, PURCHASE) : null; }
function purchaseValue(ins) { return ins ? actionVal(ins.action_values, PURCHASE) : null; }
function roas(ins) {
  if (!ins) return null;
  var r = actionVal(ins.purchase_roas, PURCHASE);
  if (r != null) return r;
  var v = purchaseValue(ins);
  return v != null && Number(ins.spend) > 0 ? v / Number(ins.spend) : null;
}
function resultsText(r) { return r ? fmtNum(r.n) + " " + (r.n === 1 ? r.one : r.many) : "—"; }

/* ---------- messages / errors ---------- */
var CODE_MSG = {
  unauthorized: "Please log in again.",
  meta_not_configured: "The Meta connection isn't set up on our side yet. Please try again later.",
  not_enabled: "Not available yet. The Meta connection is in private testing and only approved test accounts can use it for now.",
  not_connected: "Connect your Meta account first.",
  meta_token_expired: "Your Meta connection expired. Please reconnect.",
  meta_rate_limited: "Meta is limiting requests right now. Try again in a few minutes.",
  meta_error: "Meta returned an error. Please try again in a moment.",
  token_unreadable: "We couldn't read your stored connection. Please reconnect.",
  account_not_linked: "That ad account isn't connected to your MarketScope account.",
  ad_not_found: "That ad wasn't found, or your Meta connection no longer has access to it.",
  bad_ad: "That ad link isn't valid.",
  plan_required: "The Meta connection is included from Plus.",
  internal: "Something went wrong. Please try again."
};
function say(text, kind) {
  var box = $("[data-ma-msg]");
  if (!box) return;
  if (!text) { box.hidden = true; box.textContent = ""; return; }
  box.hidden = false; box.className = "meta-msg" + (kind ? " " + kind : ""); box.textContent = text;
}
async function call(name, payload) {
  var s = await sb.auth.getSession();
  session = s.data && s.data.session;
  var t = session && session.access_token;
  if (!t) { var e0 = new Error(CODE_MSG.unauthorized); e0.code = "unauthorized"; throw e0; }
  var res, data = null;
  try {
    res = await fetch(FN + name, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t, apikey: SUPABASE_ANON_KEY }, body: JSON.stringify(payload || {}) });
  } catch (e) { var en = new Error("Network problem. Check your connection and try again."); en.code = "network"; throw en; }
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    var code = data && data.code;
    var er = new Error((code && CODE_MSG[code]) || (data && data.error) || CODE_MSG.internal);
    er.code = code || "http_" + res.status; throw er;
  }
  return data || {};
}

/* ---------- states (locked / not connected / empty) ---------- */
var ICON_ADS = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M18 6a8 8 0 0 1 0 12"/></svg>';
var ICON_LOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
var ICON_IMG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/></svg>';
function showApp(on) { var a = $("[data-ma-app]"); if (a) a.hidden = !on; }
function state(html) { var b = $("[data-ma-state]"); if (b) b.innerHTML = html || ""; showApp(!html); }
function lockedState(plan) {
  var min = planName(MIN_PLAN["meta-ads"]);
  state('<div class="card ma-empty"><div class="ma-empty-ico">' + ICON_ADS + '</div><h2>See every ad you’ve run on Meta</h2>' +
    '<p>Ad history, spend, results and a plain-words summary for each ad, straight from your own ad account.</p>' +
    '<div class="plan-lock plan-lock-lg"><span class="plan-lock-ico">' + ICON_LOCK + '</span><span>Locked on your <b>' + esc(planName(plan)) +
    '</b> plan. The Meta ad-account connection is included from <b>' + esc(min) + '</b>.</span><a class="btn btn-amber" href="pricing.html">Upgrade to ' + esc(min) + "</a></div></div>");
}
function notConnectedState(expired) {
  state('<div class="card ma-empty"><div class="ma-empty-ico">' + ICON_ADS + "</div><h2>" + (expired ? "Your Meta connection expired" : "Connect your Meta ad account") + "</h2>" +
    "<p>" + (expired ? "Reconnect to keep seeing your ad history." : "Once connected, every ad you’ve published on Facebook and Instagram shows up here with its status, budget, spend and results.") + "</p>" +
    '<div class="meta-row" style="justify-content:center"><button type="button" class="btn btn-amber" data-ma-connect>' + (expired ? "Reconnect Meta" : "Connect Meta (beta)") + "</button>" +
    '<a class="btn btn-ghost" href="integrations.html#meta-ads">How it works</a></div>' +
    '<p class="ma-fine">Read-only access (ads_read). MarketScope can’t create, change or publish ads. You can disconnect any time.</p></div>');
}
function noAccountsState() {
  state('<div class="card ma-empty"><div class="ma-empty-ico">' + ICON_ADS + "</div><h2>No ad accounts shared yet</h2>" +
    "<p>Your Meta connection is active, but no ad account was shared with MarketScope. Refresh the list on the Integrations page, or reconnect and pick an ad account.</p>" +
    '<div class="meta-row" style="justify-content:center"><a class="btn btn-amber" href="integrations.html#meta-ads">Open Integrations</a></div></div>');
}
async function startConnect(btn) {
  say(""); btn.disabled = true; var lbl = btn.textContent; btn.textContent = "Opening Meta…";
  try {
    var r = await call("meta-oauth-start", { return_to: "integrations" });
    if (!r.url || r.url.indexOf("https://www.facebook.com/") !== 0) throw new Error("We couldn't start the connection. Please try again.");
    window.location.href = r.url;
  } catch (e) { btn.disabled = false; btn.textContent = lbl; say(e.message, e.code === "not_enabled" ? "warn" : "err"); }
}
function handleCallError(e) {
  if (e.code === "plan_required") { lockedState(S.plan); return; }
  if (e.code === "not_connected") { notConnectedState(false); return; }
  if (e.code === "meta_token_expired") { notConnectedState(true); return; }
  say(e.message, e.code === "not_enabled" || e.code === "meta_rate_limited" ? "warn" : "err");
}

/* ---------- boot (shared) ---------- */
async function boot() {
  var gate = $("[data-ma-gate]"), shell = $("[data-ma-shell]");
  if (!gate || !shell) return;
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-ma-connect]");
    if (b) startConnect(b);
  });
  if (!isSupabaseConfigured()) { gate.innerHTML = '<p class="mono">Accounts are launching soon.</p>'; return; }
  var pi = await getPlanInfo();
  sb = pi.sb; session = pi.session; S.plan = pi.plan;
  if (!session) { window.location.replace("login.html?next=" + encodeURIComponent((PAGE === "meta-ad" ? "meta-ad.html" : "meta-ads.html") + location.search)); return; }
  gate.hidden = true; shell.hidden = false;
  if (!includes(pi.plan, "meta-ads") && pi.betaKeys.indexOf("meta-ads") === -1) { lockedState(pi.plan); return; }
  var uid = session.user.id;
  var c = await sb.from("meta_connections").select("status").eq("user_id", uid).maybeSingle();
  if (c.error) { say("We couldn't load your connection status. Please try again.", "err"); return; }
  if (!c.data) { notConnectedState(false); return; }
  if (c.data.status !== "active") { notConnectedState(true); return; }
  var a = await sb.from("meta_ad_accounts").select("ad_account_id,name,currency,account_status,timezone_name").eq("user_id", uid).order("name");
  S.accounts = (a.data || []);
  if (PAGE === "meta-ad") return initDetail();
  if (!S.accounts.length) { noAccountsState(); return; }
  initList();
}

/* =====================================================================
   LIST PAGE
   ===================================================================== */
function readQuery() {
  var q = new URLSearchParams(location.search);
  var acct = q.get("acct");
  S.acct = S.accounts.some(function (a) { return a.ad_account_id === acct; }) ? acct : S.accounts[0].ad_account_id;
  if (RANGE_LABEL[q.get("range")]) S.range = q.get("range");
  if (STATUS_GROUPS[q.get("status")]) S.status = q.get("status");
  S.campaign = q.get("campaign") || ""; S.q = q.get("q") || "";
  if (q.get("view") === "campaigns") S.view = "campaigns";
}
function writeQuery() {
  var q = new URLSearchParams();
  q.set("acct", S.acct); q.set("range", S.range);
  if (S.status !== "all") q.set("status", S.status);
  if (S.campaign) q.set("campaign", S.campaign);
  if (S.q) q.set("q", S.q);
  if (S.view !== "ads") q.set("view", S.view);
  try { history.replaceState(null, "", location.pathname + "?" + q.toString()); } catch (e) { /* ignore */ }
}
function currency() { var a = S.accounts.filter(function (x) { return x.ad_account_id === S.acct; })[0]; return a && a.currency; }

function initList() {
  readQuery();
  showApp(true);
  $("[data-ma-acct]").innerHTML = S.accounts.map(function (a) {
    return '<option value="' + esc(a.ad_account_id) + '">' + esc((a.name || a.ad_account_id) + (a.currency ? " · " + a.currency : "")) + "</option>";
  }).join("");
  $("[data-ma-acct]").value = S.acct; $("[data-ma-range]").value = S.range; $("[data-ma-status]").value = S.status; $("[data-ma-q]").value = S.q;
  $("[data-ma-acct]").addEventListener("change", function (e) { S.acct = e.target.value; S.campaign = ""; load(); });
  $("[data-ma-range]").addEventListener("change", function (e) { S.range = e.target.value; load(); });
  $("[data-ma-status]").addEventListener("change", function (e) { S.status = e.target.value; load(); });
  $("[data-ma-campaign]").addEventListener("change", function (e) { S.campaign = e.target.value; writeQuery(); renderList(); });
  var qT = null;
  $("[data-ma-q]").addEventListener("input", function (e) { clearTimeout(qT); qT = setTimeout(function () { S.q = e.target.value.trim(); writeQuery(); renderList(); }, 150); });
  $$("[data-ma-view]").forEach(function (b) {
    b.addEventListener("click", function () { S.view = b.getAttribute("data-ma-view"); writeQuery(); if (S.view === "campaigns" && !S.campaigns.length) loadCampaigns(); else renderList(); });
  });
  $("[data-ma-reload]").addEventListener("click", function () { load(); });
  $("[data-ma-more]").addEventListener("click", function () { if (S.view === "campaigns") loadCampaigns(true); else loadAds(true); });
  $("[data-ma-export]").addEventListener("click", exportCsv);
  $("[data-ma-list]").addEventListener("click", function (ev) {
    var th = ev.target.closest("[data-sort]");
    if (th) { var k = th.getAttribute("data-sort"); S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : (k === "name" || k === "campaign" ? 1 : -1) }; renderList(); }
  });
  load();
}
function load() {
  writeQuery();
  S.ads = []; S.campaigns = []; S.cursor = null; S.cCursor = null; S.totals = null;
  $("[data-ma-range-label]").textContent = "· " + RANGE_LABEL[S.range];
  if (S.view === "campaigns") loadCampaigns();
  loadAds();
}
function listSkeleton() { $("[data-ma-list]").innerHTML = '<div class="ma-loading mono">Loading from Meta…</div>'; }
async function loadAds(more) {
  if (S.loading) return; S.loading = true; say("");
  if (!more) { if (S.view === "ads") listSkeleton(); $("[data-ma-totals]").innerHTML = '<div class="ma-loading mono">Loading…</div>'; }
  var btn = $("[data-ma-more]"); if (more) { btn.disabled = true; btn.textContent = "Loading…"; }
  try {
    var r = await call("meta-ads-history", { action: "ads", ad_account_id: S.acct, date_preset: S.range, statuses: STATUS_GROUPS[S.status], limit: 50, after: more ? S.cursor : undefined });
    S.ads = S.ads.concat(r.ads || []); S.cursor = r.next_cursor || null;
    if (!more) { S.totals = r.account_totals || null; renderTotals(); }
    fillCampaignFilter(); renderList(); renderTimeline();
  } catch (e) { $("[data-ma-list]").innerHTML = ""; $("[data-ma-totals]").innerHTML = ""; handleCallError(e); }
  finally { S.loading = false; btn.disabled = false; btn.textContent = "Load more"; }
}
async function loadCampaigns(more) {
  var btn = $("[data-ma-more]");
  if (!more) listSkeleton(); else { btn.disabled = true; btn.textContent = "Loading…"; }
  try {
    var r = await call("meta-ads-history", { action: "campaigns", ad_account_id: S.acct, date_preset: S.range, limit: 50, after: more ? S.cCursor : undefined });
    S.campaigns = S.campaigns.concat(r.campaigns || []); S.cCursor = r.next_cursor || null;
    renderList(); renderTimeline();
  } catch (e) { handleCallError(e); }
  finally { btn.disabled = false; btn.textContent = "Load more"; }
}

function stat(k, v, sub) { return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + "</div>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</div>"; }
function renderTotals() {
  var t = S.totals, cur = currency(), box = $("[data-ma-totals]");
  if (!t) { box.innerHTML = '<div class="meta-empty">Meta recorded no delivery in this account for the ' + esc(RANGE_LABEL[S.range]) + ". Try a longer range or Lifetime.</div>"; return; }
  var p = purchases(t), r = roas(t);
  box.innerHTML = stat("SPEND", fmtMoney(t.spend, cur), t.date_start ? shortDate(t.date_start) + " – " + shortDate(t.date_stop) : "") +
    stat("IMPRESSIONS", fmtNum(t.impressions), "Times your ads were shown") +
    stat("REACH", fmtNum(t.reach), "Different people who saw them") +
    stat("LINK CLICKS", fmtNum(isNum(t.link_clicks) ? t.link_clicks : t.clicks), "CTR " + fmtPct(t.ctr) + " · CPC " + fmtMoney(t.cpc, cur)) +
    stat("PURCHASES", p == null ? "—" : fmtNum(p), purchaseValue(t) != null ? fmtMoney(purchaseValue(t), cur) + " in sales" : "As reported by Meta") +
    stat("PURCHASE ROAS", r == null ? "—" : fmtNum(r, 2) + "×", r == null ? "No purchase value reported" : "Sales value ÷ spend");
}
function fillCampaignFilter() {
  var seen = {}, opts = [];
  S.ads.forEach(function (a) { var c = a.campaign; if (c && c.id && !seen[c.id]) { seen[c.id] = 1; opts.push(c); } });
  opts.sort(function (x, y) { return String(x.name).localeCompare(String(y.name)); });
  var sel = $("[data-ma-campaign]");
  sel.innerHTML = '<option value="">All campaigns</option>' + opts.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name || c.id) + "</option>"; }).join("");
  if (S.campaign && !seen[S.campaign]) S.campaign = "";
  sel.value = S.campaign;
}
function filteredAds() {
  var q = S.q.toLowerCase();
  return S.ads.filter(function (a) {
    if (S.campaign && !(a.campaign && a.campaign.id === S.campaign)) return false;
    if (!q) return true;
    var hay = [a.name, a.campaign && a.campaign.name, a.adset && a.adset.name, a.creative && a.creative.title, a.creative && a.creative.body].join(" ").toLowerCase();
    return hay.indexOf(q) > -1;
  });
}
function sortVal(a, k) {
  var i = a.insights || {};
  switch (k) {
    case "name": return String(a.name || "").toLowerCase();
    case "campaign": return String((a.campaign && a.campaign.name) || "").toLowerCase();
    case "status": return statusInfo(a.effective_status, a).label;
    case "created": return a.created_time ? new Date(a.created_time).getTime() : 0;
    case "results": var r = results(a.insights, a.campaign && a.campaign.objective); return r ? r.n : -1;
    case "roas": var x = roas(a.insights); return x == null ? -1 : x;
    default: return isNum(i[k]) ? Number(i[k]) : -1;
  }
}
function thumb(cr, cls) {
  var u = cr && (cr.thumbnail_url || cr.image_url);
  return u ? '<img class="' + cls + '" src="' + esc(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="' + cls + ' ma-noimg">' + ICON_IMG + "</span>";
}
function th(k, label, num) {
  var on = S.sort.key === k;
  return '<th scope="col"' + (num ? ' class="n"' : "") + ' aria-sort="' + (on ? (S.sort.dir > 0 ? "ascending" : "descending") : "none") + '"><button type="button" data-sort="' + k + '">' + label + (on ? (S.sort.dir > 0 ? " ▲" : " ▼") : "") + "</button></th>";
}
function renderList() {
  var box = $("[data-ma-list]"), more = $("[data-ma-more]"), cur = currency();
  $$("[data-ma-view]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-ma-view") === S.view)); });
  $("[data-ma-campaign]").disabled = S.view === "campaigns"; $("[data-ma-q]").disabled = false;
  if (S.view === "campaigns") return renderCampaigns(box, more, cur);
  $("[data-ma-list-title]").textContent = "Your ads";
  var rows = filteredAds();
  rows.sort(function (x, y) { var a = sortVal(x, S.sort.key), b = sortVal(y, S.sort.key); return (a > b ? 1 : a < b ? -1 : 0) * S.sort.dir; });
  $("[data-ma-loaded]").textContent = S.ads.length ? "Showing " + rows.length + " of " + S.ads.length + " loaded ad" + (S.ads.length === 1 ? "" : "s") + (S.cursor ? " · more available" : "") : "";
  more.hidden = !S.cursor;
  if (!S.ads.length) {
    box.innerHTML = '<div class="meta-empty">No ads match this status in this ad account. Try “All ads”, another ad account, or a longer date range.</div>'; return;
  }
  if (!rows.length) { box.innerHTML = '<div class="meta-empty">No loaded ads match your campaign or search filter.</div>'; return; }
  var link = function (a) { return "meta-ad.html?id=" + encodeURIComponent(a.id) + "&range=" + encodeURIComponent(S.range) + "&acct=" + encodeURIComponent(S.acct); };
  box.innerHTML = '<div class="ma-table-wrap"><table class="ma-table"><thead><tr>' + th("name", "Ad") + th("status", "Status") + th("created", "Created") +
    th("spend", "Spend", 1) + th("impressions", "Impr.", 1) + th("clicks", "Clicks", 1) + th("ctr", "CTR", 1) + th("cpc", "CPC", 1) + th("results", "Results", 1) + th("roas", "ROAS", 1) +
    "</tr></thead><tbody>" + rows.map(function (a) {
      var i = a.insights || {}, r = results(a.insights, a.campaign && a.campaign.objective), x = roas(a.insights);
      return "<tr>" +
        '<td class="ma-adcell" data-label="Ad"><a href="' + link(a) + '">' + thumb(a.creative, "ma-thumb") + '<span><b>' + esc(a.name || a.id) + '</b><small>' + esc((a.campaign && a.campaign.name) || "—") + " · " + esc(objLabel(a.campaign && a.campaign.objective)) + "</small></span></a></td>" +
        '<td data-label="Status">' + statusChip(a.effective_status, a) + "</td>" +
        '<td data-label="Created">' + esc(fmtDate(a.created_time)) + "</td>" +
        '<td class="n" data-label="Spend">' + esc(fmtMoney(i.spend, cur)) + "</td>" +
        '<td class="n" data-label="Impressions">' + esc(fmtNum(i.impressions)) + "</td>" +
        '<td class="n" data-label="Clicks">' + esc(fmtNum(i.clicks)) + "</td>" +
        '<td class="n" data-label="CTR">' + esc(fmtPct(i.ctr)) + "</td>" +
        '<td class="n" data-label="CPC">' + esc(fmtMoney(i.cpc, cur)) + "</td>" +
        '<td class="n" data-label="Results">' + esc(a.insights ? resultsText(r) : "No delivery") + "</td>" +
        '<td class="n" data-label="ROAS">' + esc(x == null ? "—" : fmtNum(x, 2) + "×") + "</td></tr>";
    }).join("") + "</tbody></table></div>";
}
function renderCampaigns(box, more, cur) {
  $("[data-ma-list-title]").textContent = "Your campaigns";
  more.hidden = !S.cCursor;
  var q = S.q.toLowerCase();
  var rows = S.campaigns.filter(function (c) { return !q || String(c.name || "").toLowerCase().indexOf(q) > -1; });
  $("[data-ma-loaded]").textContent = S.campaigns.length ? rows.length + " of " + S.campaigns.length + " campaigns loaded" + (S.cCursor ? " · more available" : "") : "";
  if (!S.campaigns.length) { box.innerHTML = '<div class="meta-empty">No campaigns found in this ad account.</div>'; return; }
  box.innerHTML = '<div class="ma-table-wrap"><table class="ma-table"><thead><tr><th scope="col">Campaign</th><th scope="col">Status</th><th scope="col">Budget</th><th scope="col">Schedule</th><th scope="col" class="n">Spend</th><th scope="col" class="n">Impr.</th><th scope="col" class="n">Clicks</th><th scope="col" class="n">Results</th><th scope="col" class="n">ROAS</th></tr></thead><tbody>' +
    rows.map(function (c) {
      var i = c.insights || {}, r = results(c.insights, c.objective), x = roas(c.insights);
      var bud = c.daily_budget ? budgetMoney(c.daily_budget, cur) + "/day" : c.lifetime_budget ? budgetMoney(c.lifetime_budget, cur) + " total" : "Set per ad set";
      return '<tr><td class="ma-adcell" data-label="Campaign"><a href="meta-ads.html?acct=' + encodeURIComponent(S.acct) + "&range=" + S.range + "&campaign=" + encodeURIComponent(c.id) + '" data-ma-pick="' + esc(c.id) + '"><span><b>' + esc(c.name || c.id) + "</b><small>" + esc(objLabel(c.objective)) + "</small></span></a></td>" +
        '<td data-label="Status">' + statusChip(c.effective_status) + "</td>" +
        '<td data-label="Budget">' + esc(bud) + "</td>" +
        '<td data-label="Schedule">' + esc(fmtDate(c.start_time || c.created_time)) + " → " + esc(c.stop_time ? fmtDate(c.stop_time) : "ongoing") + "</td>" +
        '<td class="n" data-label="Spend">' + esc(fmtMoney(i.spend, cur)) + "</td>" +
        '<td class="n" data-label="Impressions">' + esc(fmtNum(i.impressions)) + "</td>" +
        '<td class="n" data-label="Clicks">' + esc(fmtNum(i.clicks)) + "</td>" +
        '<td class="n" data-label="Results">' + esc(c.insights ? resultsText(r) : "No delivery") + "</td>" +
        '<td class="n" data-label="ROAS">' + esc(x == null ? "—" : fmtNum(x, 2) + "×") + "</td></tr>";
    }).join("") + "</tbody></table></div>";
  $$("[data-ma-pick]", box).forEach(function (a) {
    a.addEventListener("click", function (ev) { ev.preventDefault(); S.campaign = a.getAttribute("data-ma-pick"); S.view = "ads"; fillCampaignFilter(); $("[data-ma-campaign]").value = S.campaign; writeQuery(); renderList(); });
  });
}
function renderTimeline() {
  var ev = [], now = Date.now(), seenC = {};
  function camp(c) {
    if (!c || !c.id || seenC[c.id]) return; seenC[c.id] = 1;
    if (c.start_time) ev.push({ t: c.start_time, kind: "start", text: "Campaign started", name: c.name });
    if (c.stop_time) ev.push({ t: c.stop_time, kind: new Date(c.stop_time).getTime() < now ? "end" : "plan", text: new Date(c.stop_time).getTime() < now ? "Campaign ended" : "Campaign set to end", name: c.name });
  }
  S.ads.forEach(function (a) {
    if (a.created_time) ev.push({ t: a.created_time, kind: "new", text: "Ad created", name: a.name, id: a.id });
    var st = statusInfo(a.effective_status, a);
    if (a.updated_time && a.updated_time !== a.created_time) ev.push({ t: a.updated_time, kind: st.cls === "on" ? "edit" : st.cls, text: "Last edited · now " + st.label.toLowerCase(), name: a.name, id: a.id });
    camp(a.campaign);
  });
  S.campaigns.forEach(camp);
  ev.sort(function (x, y) { return new Date(y.t) - new Date(x.t); });
  var box = $("[data-ma-timeline]");
  if (!ev.length) { box.innerHTML = '<p class="ma-fine" style="margin:0">Nothing to show yet.</p>'; return; }
  var shown = ev.slice(0, 14);
  box.innerHTML = '<ol class="ma-tl">' + shown.map(function (e) {
    var nm = e.id ? '<a href="meta-ad.html?id=' + encodeURIComponent(e.id) + "&range=" + S.range + "&acct=" + encodeURIComponent(S.acct) + '">' + esc(e.name || e.id) + "</a>" : esc(e.name || "");
    return '<li class="ma-tl-' + e.kind + '"><time datetime="' + esc(e.t) + '">' + esc(fmtDate(e.t)) + "</time><div><b>" + esc(e.text) + "</b><span>" + nm + "</span></div></li>";
  }).join("") + "</ol>" + (ev.length > shown.length ? '<p class="ma-fine">+' + (ev.length - shown.length) + " older events in the loaded ads.</p>" : "");
}
function exportCsv() {
  var cur = currency() || "";
  var rows = [["ad_id", "ad_name", "status", "campaign", "objective", "ad_set", "created", "spend_" + cur, "impressions", "reach", "clicks", "ctr_pct", "cpc", "cpm", "frequency", "results", "purchases", "purchase_value", "roas"]];
  filteredAds().forEach(function (a) {
    var i = a.insights || {}, r = results(a.insights, a.campaign && a.campaign.objective);
    rows.push([a.id, a.name, a.effective_status, a.campaign && a.campaign.name, a.campaign && a.campaign.objective, a.adset && a.adset.name, a.created_time,
      i.spend, i.impressions, i.reach, i.clicks, i.ctr, i.cpc, i.cpm, i.frequency, r ? r.n : "", purchases(a.insights), purchaseValue(a.insights), roas(a.insights)]);
  });
  var csv = rows.map(function (r) { return r.map(function (v) { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\n");
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "meta-ads-" + S.acct + "-" + S.range + ".csv"; document.body.appendChild(a); a.click(); a.remove();
}

/* =====================================================================
   DETAIL PAGE
   ===================================================================== */
var D = { ad: null, series: [], gran: "day", metric: "spend", cur: null };
function initDetail() {
  var q = new URLSearchParams(location.search);
  var id = q.get("id") || "";
  if (RANGE_LABEL[q.get("range")]) S.range = q.get("range");
  if (q.get("acct")) $("[data-ma-back]").href = "meta-ads.html?acct=" + encodeURIComponent(q.get("acct")) + "&range=" + encodeURIComponent(S.range);
  if (!/^\d{1,30}$/.test(id)) { state('<div class="card ma-empty"><h2>Pick an ad first</h2><p>Open an ad from your ad history to see its details.</p><div class="meta-row" style="justify-content:center"><a class="btn btn-amber" href="meta-ads.html">Go to ad history</a></div></div>'); return; }
  $("[data-ma-range]").value = S.range;
  $("[data-ma-range]").addEventListener("change", function (e) {
    S.range = e.target.value; q.set("range", S.range);
    try { history.replaceState(null, "", location.pathname + "?" + q.toString()); } catch (er) { /* ignore */ }
    loadAd(id);
  });
  loadAd(id);
}
async function loadAd(id) {
  say(""); $("[data-ma-kpis]").innerHTML = '<div class="ma-loading mono">Loading from Meta…</div>';
  try {
    var r = await call("meta-ads-history", { action: "ad", ad_id: id, date_preset: S.range });
    D.ad = r.ad; D.series = r.series || []; D.gran = r.series_granularity || "day"; D.cur = r.account && r.account.currency;
    showApp(true); renderDetail();
  } catch (e) { $("[data-ma-kpis]").innerHTML = ""; if (e.code === "ad_not_found" || e.code === "account_not_linked") { state('<div class="card ma-empty"><h2>Ad not available</h2><p>' + esc(e.message) + '</p><div class="meta-row" style="justify-content:center"><a class="btn btn-amber" href="meta-ads.html">Back to ad history</a></div></div>'); } else handleCallError(e); }
}
function kv(k, v) { return "<div><dt>" + esc(k) + "</dt><dd>" + (v == null || v === "" ? "—" : v) + "</dd></div>"; }
function renderDetail() {
  var a = D.ad, c = a.campaign || {}, s = a.adset || {}, cr = a.creative || {}, i = a.insights, cur = D.cur;
  document.title = (a.name || "Ad") + " — Meta ad details — MarketScope";
  $("[data-ma-name]").textContent = a.name || a.id;
  $("[data-ma-crumbs]").innerHTML = " / " + esc(c.name || "Campaign") + " / " + esc(s.name || "Ad set");
  $("[data-ma-badges]").innerHTML = statusChip(a.effective_status, a) + '<span class="chip beta">' + esc(objLabel(c.objective).toUpperCase()) + "</span>" +
    '<span class="ma-fine">Created ' + esc(fmtDate(a.created_time)) + "</span>";
  var r = results(i, c.objective), x = roas(i), p = purchases(i);
  $("[data-ma-kpis]").innerHTML = !i ? '<div class="meta-empty">Meta recorded no delivery for this ad in the ' + esc(RANGE_LABEL[S.range]) + ". Try Lifetime.</div>" :
    stat("SPEND", fmtMoney(i.spend, cur), RANGE_LABEL[S.range]) + stat("RESULTS", r ? fmtNum(r.n) : "—", r ? (r.n === 1 ? r.one : r.many) + (r.n > 0 && Number(i.spend) > 0 ? " · " + fmtMoney(Number(i.spend) / r.n, cur) + " each" : "") : "No result type for this objective") +
    stat("IMPRESSIONS", fmtNum(i.impressions), "Reach " + fmtNum(i.reach) + " · freq. " + fmtNum(i.frequency, 2)) +
    stat("CLICKS", fmtNum(i.clicks), "CTR " + fmtPct(i.ctr) + " · CPC " + fmtMoney(i.cpc, cur)) +
    stat("CPM", fmtMoney(i.cpm, cur), "Cost per 1,000 impressions") +
    stat(p != null ? "PURCHASE ROAS" : "LINK CLICKS", p != null ? (x == null ? "—" : fmtNum(x, 2) + "×") : fmtNum(i.link_clicks), p != null ? fmtNum(p) + " purchases · " + fmtMoney(purchaseValue(i), cur) : "Clicks that went to your link");
  $("[data-ma-takeaways]").innerHTML = takeaways(a, i, D.series, cur).map(function (t) { return "<li>" + t + "</li>"; }).join("");
  renderCreative(cr); renderSettings(a, c, s, cur); renderActions(i, cur); renderMetricButtons(); renderChart();
}
function renderCreative(cr) {
  var u = cr.image_url || cr.thumbnail_url, host = "";
  try { if (cr.link_url) host = new URL(cr.link_url).hostname.replace(/^www\./, ""); } catch (e) { host = ""; }
  $("[data-ma-creative]").innerHTML = '<div class="ma-creative">' +
    (u ? '<img src="' + esc(u) + '" alt="Ad image" loading="lazy" referrerpolicy="no-referrer">' : '<div class="ma-creative-ph">' + ICON_IMG + "<span>No preview image available</span></div>") +
    '<div class="ma-creative-txt">' + (cr.body ? '<p class="ma-body">' + esc(cr.body) + "</p>" : "") +
    (cr.title ? "<b>" + esc(cr.title) + "</b>" : "") +
    (host ? '<a href="' + esc(cr.link_url) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(host) + " ↗</a>" : "") +
    (cr.call_to_action_type ? '<span class="chip beta">' + esc(titleCase(cr.call_to_action_type)) + "</span>" : "") +
    (!cr.body && !cr.title && !host ? '<p class="ma-fine">Meta didn’t return text for this creative (common for dynamic, catalog or video-only ads).</p>' : "") +
    "</div></div>";
}
function renderSettings(a, c, s, cur) {
  var budget = c.daily_budget ? budgetMoney(c.daily_budget, cur) + " per day (campaign)" : c.lifetime_budget ? budgetMoney(c.lifetime_budget, cur) + " total (campaign)" :
    s.daily_budget ? budgetMoney(s.daily_budget, cur) + " per day (ad set)" : s.lifetime_budget ? budgetMoney(s.lifetime_budget, cur) + " total (ad set)" : null;
  var issues = (a.issues || []).filter(function (x) { return x.summary || x.message; }).map(function (x) { return esc(x.summary || x.message); }).join("<br>");
  $("[data-ma-settings]").innerHTML =
    kv("Objective", esc(objLabel(c.objective))) + kv("Budget", budget && esc(budget)) +
    kv("Optimizing for", s.optimization_goal && esc(titleCase(s.optimization_goal))) + kv("Charged per", s.billing_event && esc(titleCase(s.billing_event))) +
    kv("Starts", esc(fmtDate(s.start_time || c.start_time, true))) + kv("Ends", s.end_time || c.stop_time ? esc(fmtDate(s.end_time || c.stop_time, true)) : "No end date") +
    kv("Created", esc(fmtDate(a.created_time, true))) + kv("Last edited", esc(fmtDate(a.updated_time, true))) +
    kv("Campaign", esc(c.name)) + kv("Ad set", esc(s.name)) + (issues ? kv("Flagged by Meta", '<span class="r">' + issues + "</span>") : "") +
    kv("Ad ID", '<span class="mono">' + esc(a.id) + "</span>");
}
var ACTION_LABEL = { link_click: "Link clicks", landing_page_view: "Landing page views", post_engagement: "Post engagements", page_engagement: "Page engagements", post_reaction: "Reactions", comment: "Comments", post: "Shares", "onsite_conversion.post_save": "Saves",
  video_view: "3-second video views", omni_purchase: "Purchases", purchase: "Purchases (pixel)", omni_add_to_cart: "Adds to cart", add_to_cart: "Adds to cart", omni_initiated_checkout: "Checkouts started", initiate_checkout: "Checkouts started", omni_view_content: "Content views", view_content: "Content views", lead: "Leads",
  "onsite_conversion.messaging_conversation_started_7d": "Messaging conversations", like: "Page likes", photo_view: "Photo views", omni_complete_registration: "Registrations" };
function renderActions(i, cur) {
  var box = $("[data-ma-actions]");
  var list = (i && i.actions) || [];
  if (!list.length) { box.innerHTML = '<p class="ma-fine" style="margin:0">Meta reported no actions (clicks, views, purchases…) for this range.</p>'; return; }
  var cost = {}; ((i && i.cost_per_action_type) || []).forEach(function (x) { cost[x.action_type] = x.value; });
  var val = {}; ((i && i.action_values) || []).forEach(function (x) { val[x.action_type] = x.value; });
  var has = {}; list.forEach(function (x) { has[x.action_type] = 1; });
  var rows = list.filter(function (x) { var base = x.action_type.replace(/^offsite_conversion\.fb_pixel_|^onsite_web_/, ""); return !has["omni_" + base]; })
    .sort(function (x, y) { return y.value - x.value; });
  box.innerHTML = '<div class="ma-table-wrap"><table class="ma-table ma-table-sm"><thead><tr><th scope="col">Action</th><th scope="col" class="n">Count</th><th scope="col" class="n">Cost each</th><th scope="col" class="n">Value</th></tr></thead><tbody>' +
    rows.map(function (x) {
      return '<tr><td data-label="Action">' + esc(ACTION_LABEL[x.action_type] || titleCase(x.action_type.replace(/^onsite_conversion\.|^offsite_conversion\.fb_pixel_|^omni_/, ""))) + ' <small class="ma-fine mono">' + esc(x.action_type) + "</small></td>" +
        '<td class="n" data-label="Count">' + esc(fmtNum(x.value)) + '</td><td class="n" data-label="Cost each">' + esc(fmtMoney(cost[x.action_type], cur)) + '</td><td class="n" data-label="Value">' + esc(val[x.action_type] != null ? fmtMoney(val[x.action_type], cur) : "—") + "</td></tr>";
    }).join("") + "</tbody></table></div>";
}
var METRICS = [
  { k: "spend", label: "Spend", money: true }, { k: "impressions", label: "Impressions" }, { k: "clicks", label: "Clicks" },
  { k: "ctr", label: "CTR", pct: true }, { k: "cpc", label: "CPC", money: true }, { k: "results", label: "Results" }
];
function metricVal(row, k) {
  if (k === "results") { var r = results(row, D.ad.campaign && D.ad.campaign.objective); return r ? r.n : null; }
  return isNum(row[k]) ? Number(row[k]) : null;
}
function renderMetricButtons() {
  var box = $("[data-ma-metrics]");
  box.innerHTML = METRICS.map(function (m) { return '<button type="button" data-metric="' + m.k + '" aria-pressed="' + (D.metric === m.k) + '">' + m.label + "</button>"; }).join("");
  $$("[data-metric]", box).forEach(function (b) { b.addEventListener("click", function () { D.metric = b.getAttribute("data-metric"); renderMetricButtons(); renderChart(); }); });
}
function renderChart() {
  var box = $("[data-ma-chart]"), m = METRICS.filter(function (x) { return x.k === D.metric; })[0];
  var pts = D.series.map(function (r) { return { d: r.date_start, v: metricVal(r, m.k) }; });
  if (!pts.length || pts.every(function (p) { return p.v == null; })) { box.innerHTML = '<p class="ma-fine" style="margin:0">No ' + (D.gran === "month" ? "monthly" : "daily") + " data from Meta for this range.</p>"; return; }
  var fmt = function (v) { return v == null ? "—" : m.money ? fmtMoney(v, D.cur) : m.pct ? fmtPct(v) : fmtNum(v, 2); };
  var W = 640, H = 220, pl = 8, pr = 8, pt = 14, pb = 26, max = Math.max.apply(null, pts.map(function (p) { return p.v || 0; })) || 1;
  var bw = (W - pl - pr) / pts.length, gap = Math.min(4, bw * 0.25);
  var lab = function (d) { return D.gran === "month" ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : shortDate(d); };
  var idx = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].filter(function (v, i, a) { return a.indexOf(v) === i; });
  var bars = pts.map(function (p, i) {
    var h = p.v ? (p.v / max) * (H - pt - pb) : 0, x = pl + i * bw + gap / 2, y = H - pb - h;
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, bw - gap).toFixed(1) + '" height="' + Math.max(p.v ? 1 : 0, h).toFixed(1) + '" rx="2"><title>' + esc(lab(p.d) + ": " + fmt(p.v)) + "</title></rect>";
  }).join("");
  var xl = idx.map(function (i) { var x = pl + i * bw + bw / 2; return '<text x="' + x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle") + '">' + esc(lab(pts[i].d)) + "</text>"; }).join("");
  var total = pts.reduce(function (s, p) { return s + (p.v || 0); }, 0);
  box.innerHTML = '<div class="ma-chart-cap"><span>Peak ' + esc(fmt(max)) + "</span><span>" + (m.pct || m.k === "cpc" ? "" : "Total " + esc(fmt(total))) + "</span></div>" +
    '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(m.label + " per " + D.gran) + '"><line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + (H - pb) + '" y2="' + (H - pb) + '" class="ax"/>' + bars + xl + "</svg>";
}
function takeaways(a, i, series, cur) {
  var out = [], rl = RANGE_LABEL[S.range], c = a.campaign || {};
  var st = statusInfo(a.effective_status, a);
  if ((a.issues || []).length && (a.issues[0].summary || a.issues[0].message)) out.push('<b>Meta flagged this ad:</b> ' + esc(a.issues[0].summary || a.issues[0].message));
  if (!i) { out.push("Meta recorded <b>no delivery</b> for this ad in the " + esc(rl) + ". It’s currently <b>" + esc(st.label.toLowerCase()) + "</b>."); return out; }
  var spend = Number(i.spend) || 0;
  var days = series.filter(function (r) { return Number(r.spend) > 0; }).length;
  out.push("You spent <b>" + esc(fmtMoney(spend, cur)) + "</b> in the " + esc(rl) + (D.gran === "day" && days > 1 ? ", spread over " + days + " days with spend (about " + esc(fmtMoney(spend / days, cur)) + " a day)." : ".") + " It’s currently <b>" + esc(st.label.toLowerCase()) + "</b>.");
  if (isNum(i.reach) && isNum(i.impressions)) out.push("It was shown <b>" + esc(fmtNum(i.impressions)) + "</b> times to <b>" + esc(fmtNum(i.reach)) + "</b> different people" + (isNum(i.frequency) ? ", so each person saw it about <b>" + esc(fmtNum(i.frequency, 1)) + "</b> times on average." : "."));
  if (isNum(i.ctr) && isNum(i.clicks)) out.push("<b>" + esc(fmtPct(i.ctr)) + "</b> of views turned into a click (" + esc(fmtNum(i.clicks)) + " clicks)" + (isNum(i.cpc) ? ", and each click cost you <b>" + esc(fmtMoney(i.cpc, cur)) + "</b>." : "."));
  var r = results(i, c.objective);
  if (r) out.push(r.n > 0 ? "This is a <b>" + esc(objLabel(c.objective).toLowerCase()) + "</b> campaign, and it got <b>" + esc(resultsText(r)) + "</b>" + (spend > 0 ? " at <b>" + esc(fmtMoney(spend / r.n, cur)) + "</b> each." : ".") :
    "This is a <b>" + esc(objLabel(c.objective).toLowerCase()) + "</b> campaign, but Meta recorded <b>no " + esc(r.many) + "</b> from this ad in the " + esc(rl) + ".");
  var pv = purchaseValue(i), x = roas(i);
  if (pv != null && x != null) out.push("Meta attributes <b>" + esc(fmtMoney(pv, cur)) + "</b> in sales to this ad, which is <b>" + esc(fmtNum(x, 2)) + "×</b> what you spent" + (x < 1 ? " — so far it brought back less than it cost." : "."));
  if (series.length >= 2) {
    var key = r && r.n > 0 ? "results" : "clicks", best = null;
    series.forEach(function (row) { var v = metricVal(row, key); if (v != null && (!best || v > best.v)) best = { d: row.date_start, v: v }; });
    if (best && best.v > 0) out.push("Best " + (D.gran === "month" ? "month" : "day") + ": <b>" + esc(D.gran === "month" ? new Date(best.d + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" }) : fmtDate(best.d)) + "</b> with " + esc(fmtNum(best.v)) + " " + (key === "results" ? esc(best.v === 1 ? r.one : r.many) : "clicks") + ".");
  }
  var live = series.filter(function (row) { return Number(row.impressions) > 0; });
  if (D.gran === "day" && live.length >= 6) {
    var half = Math.floor(live.length / 2), A = live.slice(0, half), B = live.slice(live.length - half);
    var sum = function (arr, k) { return arr.reduce(function (s, row) { return s + (Number(row[k]) || 0); }, 0); };
    var cA = sum(A, "clicks"), cB = sum(B, "clicks");
    if (cA > 0 && cB > 0) {
      var cpcA = sum(A, "spend") / cA, cpcB = sum(B, "spend") / cB, ch = (cpcB - cpcA) / cpcA * 100;
      if (Math.abs(ch) >= 10) out.push("Cost per click " + (ch > 0 ? "went <b>up</b>" : "went <b>down</b>") + " from <b>" + esc(fmtMoney(cpcA, cur)) + "</b> in the first " + half + " days with delivery to <b>" + esc(fmtMoney(cpcB, cur)) + "</b> in the last " + half + " (" + (ch > 0 ? "+" : "") + Math.round(ch) + "%).");
      else out.push("Cost per click stayed about the same between the first and last " + half + " days with delivery (" + esc(fmtMoney(cpcA, cur)) + " → " + esc(fmtMoney(cpcB, cur)) + ").");
    }
  }
  return out;
}

boot().catch(function () { var g = $("[data-ma-gate]"); if (g) g.innerHTML = '<p class="mono">Something went wrong loading this page. Please refresh.</p>'; });
