/* MarketScope — Meta ad-account connection card (integrations.html). BETA, read-only (ads_read).
   Browser side only: publishable key + the signed-in user's own session. No secrets here.
   Backend (Supabase Edge Functions): meta-oauth-start, meta-insights (both verify_jwt).
   Status is read from meta_connections / meta_ad_accounts (owner-only RLS). */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";
import { getPlanInfo, includes, MIN_PLAN, planName } from "./integrations-plan.js";
var FN = SUPABASE_URL + "/functions/v1/";
var sb = null, session = null, state = { conn: null, accounts: [], busy: false };

var root = document.querySelector("[data-meta-card]");
var body = root && root.querySelector("[data-meta-body]");
var msgBox = root && root.querySelector("[data-meta-msg]");

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function say(text, kind) {
  if (!msgBox) return;
  if (!text) { msgBox.hidden = true; msgBox.textContent = ""; return; }
  msgBox.hidden = false;
  msgBox.className = "meta-msg" + (kind ? " " + kind : "");
  msgBox.textContent = text;
}
function fmtDate(iso) {
  if (!iso) return "—";
  var d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function fmtNum(v) {
  var n = Number(v);
  return isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—";
}
function fmtMoney(v, cur) {
  var n = Number(v);
  if (!isFinite(n)) return "—";
  try { if (cur) return n.toLocaleString("en-US", { style: "currency", currency: cur }); } catch (e) { /* fall through */ }
  return fmtNum(n) + (cur ? " " + cur : "");
}
var ACCOUNT_STATUS = { 1: "Active", 2: "Disabled", 3: "Unsettled", 7: "Pending risk review", 8: "Pending settlement", 9: "In grace period", 100: "Pending closure", 101: "Closed" };

/* ---------- messages (site language: English) ---------- */
var CODE_MSG = {
  unauthorized: "Please log in again.",
  meta_not_configured: "The Meta connection isn't set up on our side yet. Please try again later.",
  not_enabled: "Not available yet. The Meta connection is in private testing and only approved test accounts can use it for now. Everything else on MarketScope works as usual.",
  state_failed: "We couldn't start the connection. Please try again.",
  not_connected: "Connect your Meta account first.",
  meta_token_expired: "Your Meta connection expired. Please reconnect.",
  meta_rate_limited: "Meta is limiting requests right now. Try again in a few minutes.",
  meta_error: "Meta returned an error. Please try again in a moment.",
  token_unreadable: "We couldn't read your stored connection. Please reconnect.",
  bad_account: "That ad account isn't valid.",
  account_not_linked: "That ad account isn't connected to your MarketScope account.",
  bad_level: "That option isn't supported.",
  bad_date_preset: "That date range isn't supported.",
  internal: "Something went wrong. Please try again."
};
var REASON_MSG = {
  not_configured: "The Meta connection isn't set up on our side yet. Please try again later.",
  bad_state: "The connection link expired or was already used. Please start again.",
  expired: "The connection took too long (over 10 minutes). Please start again.",
  no_token: "Meta didn't return an access grant. Please try again.",
  ads_read_not_granted: "The read-only ads permission (ads_read) wasn't granted, so nothing was connected. Please try again and allow it.",
  no_profile: "We couldn't read your Meta profile. Please try again.",
  already_linked: "That Meta account is already connected to a different MarketScope account.",
  store_failed: "We couldn't save the connection. Please try again.",
  meta_error: "Meta returned an error. Please try again in a moment."
};

/* ---------- function calls ---------- */
async function token() {
  var s = await sb.auth.getSession();
  session = s.data && s.data.session;
  return session && session.access_token;
}
async function call(name, payload) {
  var t = await token();
  if (!t) { var e0 = new Error("Please log in again."); e0.code = "unauthorized"; throw e0; }
  var res, data = null;
  try {
    res = await fetch(FN + name, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(payload || {})
    });
  } catch (e) { var en = new Error("Network problem. Check your connection and try again."); en.code = "network"; throw en; }
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    var code = data && data.code;
    var er = new Error((code && CODE_MSG[code]) || (data && data.error) || "Something went wrong. Please try again.");
    er.code = code || "http_" + res.status;
    throw er;
  }
  return data || {};
}

/* ---------- data ---------- */
async function loadStatus() {
  var uid = session.user.id;
  var c = await sb.from("meta_connections").select("fb_user_name,scopes,status,token_expires_at,connected_at").eq("user_id", uid).maybeSingle();
  if (c.error) throw new Error("We couldn't load your connection status. Please try again.");
  state.conn = c.data || null;
  state.accounts = [];
  if (state.conn) {
    var a = await sb.from("meta_ad_accounts").select("ad_account_id,name,currency,account_status,timezone_name,synced_at").eq("user_id", uid).order("name");
    if (!a.error) state.accounts = a.data || [];
  }
}

/* ---------- render ---------- */
function connectButton(label) {
  return '<button type="button" class="btn btn-amber" data-meta-connect>' + esc(label) + "</button>";
}
function render() {
  if (!body) return;
  var c = state.conn;
  if (!session) {
    body.innerHTML = '<div class="meta-row"><a class="btn btn-amber" href="login.html?next=integrations.html">Log in to connect</a></div>' +
      '<p class="meta-fine" style="margin-top:10px">You need a MarketScope account first.</p>';
    return;
  }
  if (!c) {
    body.innerHTML = '<div class="meta-row">' + connectButton("Connect Meta (beta)") + "</div>" +
      '<p class="meta-fine" style="margin-top:10px">You\u2019ll go to Meta to choose which ad accounts to share. You can disconnect at any time. Not connected yet.</p>';
    return;
  }
  var active = c.status === "active";
  var chip = active ? '<span class="chip live">CONNECTED</span>' : '<span class="chip planned">' + esc(String(c.status || "inactive").toUpperCase()) + "</span>";
  var h = '<div class="meta-row" style="justify-content:space-between"><div class="meta-row">' + chip +
    '<span class="meta-fine">Read-only (ads_read)</span></div></div>';
  if (!active) h += '<div class="meta-msg warn">Your Meta connection is ' + esc(c.status || "inactive") + ". Reconnect to keep seeing your data.</div>";
  h += '<dl class="meta-kv"><div><dt>Meta profile</dt><dd>' + esc(c.fb_user_name || "—") + "</dd></div>" +
    "<div><dt>Connected</dt><dd>" + esc(fmtDate(c.connected_at)) + "</dd></div>" +
    "<div><dt>Access expires</dt><dd>" + esc(fmtDate(c.token_expires_at)) + "</dd></div></dl>";

  h += '<div class="meta-h">Ad accounts</div>';
  if (!state.accounts.length) {
    h += '<div class="meta-empty">No ad accounts are shared with MarketScope yet. Tap \u201cRefresh accounts\u201d, or reconnect and choose an ad account on Meta.</div>';
  } else {
    h += '<ul class="meta-accts">' + state.accounts.map(function (a) {
      var st = a.account_status == null ? "" : (ACCOUNT_STATUS[a.account_status] || "Status " + a.account_status);
      return '<li><div><div class="nm">' + esc(a.name || a.ad_account_id) + '</div><div class="sub">' + esc(a.ad_account_id) +
        (a.currency ? " \u00b7 " + esc(a.currency) : "") + (a.timezone_name ? " \u00b7 " + esc(a.timezone_name) : "") + '</div></div><span class="meta-fine">' + esc(st) + "</span></li>";
    }).join("") + "</ul>";
  }

  if (active && state.accounts.length) {
    h += '<div class="meta-h">Performance insights</div><form class="meta-form" data-meta-form>' +
      '<div><label for="meta-acct">Ad account</label><select id="meta-acct" name="acct">' +
      state.accounts.map(function (a) { return '<option value="' + esc(a.ad_account_id) + '">' + esc((a.name || a.ad_account_id) + (a.name ? " (" + a.ad_account_id + ")" : "")) + "</option>"; }).join("") + "</select></div>" +
      '<div><label for="meta-range">Date range</label><select id="meta-range" name="range"><option value="last_7d">Last 7 days</option><option value="last_14d">Last 14 days</option><option value="last_30d">Last 30 days</option><option value="this_month">This month</option><option value="last_month">Last month</option><option value="yesterday">Yesterday</option></select></div>' +
      '<button type="submit" class="btn btn-amber" data-meta-fetch>Get insights</button></form><div data-meta-insights aria-live="polite"></div>';
  }

  h += '<div class="meta-row" style="margin-top:22px">' +
    (active && state.accounts.length ? '<a class="btn btn-amber btn-sm" href="meta-ads.html">View ad history</a>' : "") +
    (active ? '<button type="button" class="btn btn-ghost btn-sm" data-meta-refresh>Refresh accounts</button>' : connectButton("Reconnect Meta")) +
    '<button type="button" class="btn btn-ghost btn-sm btn-danger-ghost" data-meta-disconnect>Disconnect &amp; delete my Meta data</button></div>';
  body.innerHTML = h;
}

function renderInsights(res, acct) {
  var box = body.querySelector("[data-meta-insights]");
  if (!box) return;
  var rows = (res && res.data) || [];
  if (!rows.length) {
    box.innerHTML = '<div class="meta-empty" style="margin-top:12px">Meta returned no data for this ad account and date range. That usually means no ads ran or no spend was recorded in that period.</div>';
    return;
  }
  var cur = acct && acct.currency;
  var cols = [["impressions", "Impressions", fmtNum], ["reach", "Reach", fmtNum], ["clicks", "Clicks", fmtNum],
    ["spend", "Spend", function (v) { return fmtMoney(v, cur); }], ["ctr", "CTR", function (v) { return fmtNum(v) + "%"; }],
    ["cpc", "CPC", function (v) { return fmtMoney(v, cur); }], ["cpm", "CPM", function (v) { return fmtMoney(v, cur); }]];
  box.innerHTML = rows.map(function (r) {
    return '<div class="meta-cap">' + esc((r.date_start || "") + (r.date_stop ? " \u2192 " + r.date_stop : "")) + (r.campaign_name ? " \u00b7 " + esc(r.campaign_name) : "") + '</div><div class="meta-stats">' +
      cols.map(function (c) { return '<div class="meta-stat"><div class="k">' + c[1] + '</div><div class="v">' + (r[c[0]] == null ? "—" : esc(c[2](r[c[0]]))) + "</div></div>"; }).join("") + "</div>";
  }).join("") + '<p class="meta-fine" style="margin-top:12px">Figures come straight from Meta for the selected range. Nothing is estimated or added by MarketScope.</p>';
}

/* ---------- actions ---------- */
function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || "Working\u2026"; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}
async function startConnect(btn) {
  say("");
  busy(btn, true, "Opening Meta\u2026");
  try {
    var r = await call("meta-oauth-start", { return_to: "integrations" });
    if (!r.url || r.url.indexOf("https://www.facebook.com/") !== 0) throw new Error("We couldn't start the connection. Please try again.");
    window.location.href = r.url;
  } catch (e) {
    busy(btn, false);
    say(e.message, e.code === "not_enabled" ? "warn" : "err");
  }
}
async function refreshAccounts(btn) {
  say(""); busy(btn, true, "Refreshing\u2026");
  try {
    await call("meta-insights", { action: "refresh_accounts" });
    await loadStatus(); render();
    say("Ad accounts refreshed.", "ok");
  } catch (e) { busy(btn, false); say(e.message, "err"); if (e.code === "meta_token_expired") { await loadStatus().catch(function () {}); render(); say(e.message, "warn"); } }
}
async function fetchInsights(form) {
  var btn = form.querySelector("[data-meta-fetch]");
  var acctId = form.elements.acct.value;
  var acct = state.accounts.filter(function (a) { return a.ad_account_id === acctId; })[0];
  say(""); busy(btn, true, "Loading\u2026");
  try {
    var r = await call("meta-insights", { action: "insights", ad_account_id: acctId, level: "account", date_preset: form.elements.range.value });
    busy(btn, false);
    renderInsights(r, acct);
  } catch (e) {
    busy(btn, false);
    if (e.code === "meta_token_expired") { await loadStatus().catch(function () {}); render(); }
    say(e.message, e.code === "meta_token_expired" ? "warn" : "err");
  }
}
async function disconnect(btn) {
  if (!window.confirm("Disconnect Meta? This revokes MarketScope\u2019s access at Meta and deletes your stored connection and cached ad-account list right away.")) return;
  say(""); busy(btn, true, "Disconnecting\u2026");
  try {
    await call("meta-insights", { action: "disconnect" });
    await loadStatus(); render();
    say("Disconnected. Your Meta connection and cached ad-account data were deleted.", "ok");
  } catch (e) { busy(btn, false); say(e.message, "err"); }
}

function bind() {
  root.addEventListener("click", function (ev) {
    var t = ev.target.closest("button");
    if (!t) return;
    if (t.hasAttribute("data-meta-connect")) startConnect(t);
    else if (t.hasAttribute("data-meta-refresh")) refreshAccounts(t);
    else if (t.hasAttribute("data-meta-disconnect")) disconnect(t);
  });
  root.addEventListener("submit", function (ev) {
    if (ev.target.matches("[data-meta-form]")) { ev.preventDefault(); fetchInsights(ev.target); }
  });
}

function handleReturn() {
  var q = new URLSearchParams(location.search);
  var r = q.get("meta");
  if (!r) return;
  var reason = q.get("reason");
  if (r === "connected") say("Meta connected. Your ad accounts are listed below.", "ok");
  else if (r === "denied") say("You cancelled the connection at Meta, so nothing was connected.", "warn");
  else if (r === "error") say(REASON_MSG[reason] || "The connection didn\u2019t complete. Please try again.", reason === "already_linked" ? "warn" : "err");
  try { history.replaceState(null, "", location.pathname + "#meta-ads"); } catch (e) { /* ignore */ }
}

async function boot() {
  if (!root || !body) return;
  bind();
  if (!isSupabaseConfigured()) { body.innerHTML = '<p class="meta-fine">Accounts are launching soon.</p>'; return; }
  var pi = await getPlanInfo();
  sb = pi.sb; session = pi.session;
  handleReturn();
  if (!session) { render(); return; }
  /* Plan gate: display only. The server still decides who may connect (allow-list in meta-oauth-start). */
  if (!includes(pi.plan, "meta-ads") && pi.betaKeys.indexOf("meta-ads") === -1) {
    var min = planName(MIN_PLAN["meta-ads"]);
    root.classList.add("is-locked");
    body.innerHTML = '<div class="plan-lock plan-lock-lg"><span class="plan-lock-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>' +
      '<span>Locked on your <b>' + esc(planName(pi.plan)) + '</b> plan. The Meta ad-account connection is included from <b>' + esc(min) + '</b>.</span>' +
      '<a class="btn btn-amber" href="pricing.html">Upgrade to ' + esc(min) + '</a></div>';
    return;
  }
  try { await loadStatus(); } catch (e) { body.innerHTML = '<div class="meta-empty">' + esc(e.message) + "</div>"; return; }
  render();
}
boot();
