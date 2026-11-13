/* MarketScope Settings page. Reads and writes only the signed-in user's own
   rows (Row Level Security). Uses the public anon key only. */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";

var CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
var MARKETS = ["United States", "United Kingdom", "Germany", "France", "Italy", "Spain", "Canada", "Australia", "Netherlands", "Israel"];
var MARKET_CODES = { "United States": "US", "United Kingdom": "UK", "Germany": "DE", "France": "FR", "Italy": "IT", "Spain": "ES", "Canada": "CA", "Australia": "AU", "Netherlands": "NL", "Israel": "IL" };
var WATCH_SLOTS = { free: 1, starter: 5, plus: 20, pro: Infinity };
var PLAN_ORDER = ["free", "starter", "plus", "pro"];
var TABS = ["profile", "billing", "usage", "saved", "preferences", "notifications", "appearance", "security", "shortcuts", "referrals", "api", "privacy"];

var sb, session, user, profile = null, prefsColumn = false, reports = [], watch = [], stores = [];

function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function msg(el, text, ok) { if (!el) return; el.textContent = text || ""; el.className = "form-msg" + (ok ? " ok" : ""); }
function fmtDate(iso, withTime) {
  if (!iso) return "—";
  var d = new Date(iso);
  if (isNaN(d)) return "—";
  var o = { year: "numeric", month: "short", day: "numeric" };
  if (withTime) { o.hour = "2-digit"; o.minute = "2-digit"; }
  return d.toLocaleString("en-US", o);
}
function planId() { return ((profile && profile.plan) || "free").toLowerCase(); }
function planCfg(id) { var C = window.MS_CONFIG || {}; return (C.plans || []).filter(function (p) { return p.id === id; })[0] || null; }
function planName(id) { var p = planCfg(id); return p ? p.name : id.charAt(0).toUpperCase() + id.slice(1); }
function readLocal(k) { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch (e) { return {}; } }
function writeLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
function friendly(err) {
  var m = (err && (err.message || err.error_description)) || "Something went wrong. Please try again.";
  if (/jwt|not authenticated|session/i.test(m)) return "Your session expired. Please log in again.";
  if (/duplicate key|unique/i.test(m)) return "That one is already saved.";
  if (/should be different/i.test(m)) return "Choose a password you haven’t used here before.";
  return m;
}
function download(name, text, type) {
  var blob = new Blob([text], { type: type });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- tabs ---------- */
function setTab(id, push) {
  if (TABS.indexOf(id) === -1) id = "profile";
  $$("[data-set-tab]").forEach(function (b) {
    var on = b.getAttribute("data-set-tab") === id;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && b.scrollIntoView && window.innerWidth < 900) b.scrollIntoView({ block: "nearest", inline: "center" });
  });
  $$("[data-set-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-set-panel") !== id; });
  if (push !== false && location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
}
function bindTabs() {
  var tabs = $$("[data-set-tab]");
  tabs.forEach(function (b, i) {
    b.addEventListener("click", function () { setTab(b.getAttribute("data-set-tab")); });
    b.addEventListener("keydown", function (e) {
      var k = e.key, j = -1;
      if (k === "ArrowDown" || k === "ArrowRight") j = (i + 1) % tabs.length;
      if (k === "ArrowUp" || k === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
      if (j > -1) { e.preventDefault(); tabs[j].focus(); setTab(tabs[j].getAttribute("data-set-tab")); }
    });
  });
  window.addEventListener("hashchange", function () { setTab(location.hash.slice(1), false); });
  setTab((location.hash || "#profile").slice(1), false);
}

/* ---------- data ---------- */
async function loadProfile() {
  var base = "id,email,display_name,plan,credits,stripe_customer_id,stripe_subscription_id,deletion_requested_at,created_at";
  var r = await sb.from("profiles").select(base + ",preferences").eq("id", user.id).maybeSingle();
  if (r.error && /preferences/i.test(r.error.message || "")) {
    prefsColumn = false;
    r = await sb.from("profiles").select(base).eq("id", user.id).maybeSingle();
  } else if (!r.error) {
    prefsColumn = true;
  }
  if (r.error) throw r.error;
  profile = r.data || null;
}
async function loadReports() {
  var r = await sb.from("reports").select("id,product,market,cost,source,verdict,status,is_example,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500);
  reports = r.error ? [] : (r.data || []);
  return !r.error;
}
async function loadWatch() {
  var r = await sb.from("watchlist").select("id,ticker,product,market,created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  watch = r.error ? [] : (r.data || []);
}
async function loadStores() {
  var r = await sb.from("tracked_stores").select("id,slug,name,url,platform,created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  stores = r.error ? [] : (r.data || []);
}

/* ---------- profile ---------- */
function avatarUrl() { var m = user.user_metadata || {}; return m.avatar_url || m.picture || ""; }
function nameOf() { var m = user.user_metadata || {}; return (profile && profile.display_name) || m.display_name || m.full_name || m.name || (user.email || "").split("@")[0]; }
function paintProfile() {
  var name = nameOf();
  var ini = String(name || "?").trim().split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase() || "?";
  var url = avatarUrl();
  $$("[data-avatar]").forEach(function (el) {
    el.innerHTML = url ? '<img src="' + esc(url) + '" alt="" referrerpolicy="no-referrer">' : esc(ini);
    var img = $("img", el);
    if (img) img.addEventListener("error", function () { el.textContent = ini; });
  });
  $$("[data-side-name],[data-profile-name]").forEach(function (el) { el.textContent = name; });
  $$("[data-side-plan]").forEach(function (el) { el.textContent = planName(planId()) + " plan"; });
  $$("[data-profile-email]").forEach(function (el) { el.textContent = user.email || ""; });
  $("[data-member-since]").textContent = fmtDate((profile && profile.created_at) || user.created_at);
  $("[data-user-id]").textContent = user.id;
  $("#s-name").value = name || "";
  $("#s-email").value = user.email || "";
}
function bindProfile() {
  var f = $("form[data-set-form='name']");
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    var m = $(".form-msg", f), b = $("button[type=submit]", f), v = $("#s-name").value.trim();
    if (!v) return msg(m, "Enter a display name.");
    b.disabled = true;
    try {
      var r = await sb.from("profiles").update({ display_name: v }).eq("id", user.id);
      if (r.error) throw r.error;
      await sb.auth.updateUser({ data: { display_name: v } });
      if (profile) profile.display_name = v;
      paintProfile();
      $$(".account-name").forEach(function (el) { el.textContent = v; });
      msg(m, "Saved.", true);
    } catch (err) { msg(m, friendly(err)); }
    b.disabled = false;
  });
  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", async function () {
      var t = ($(b.getAttribute("data-copy")) || {}).textContent || "";
      try { await navigator.clipboard.writeText(t); b.textContent = "Copied"; } catch (e) { b.textContent = "Select and copy"; }
      setTimeout(function () { b.textContent = "Copy"; }, 1600);
    });
  });
}

/* ---------- billing ---------- */
function paintBilling() {
  var id = planId(), cfg = planCfg(id), credits = profile && profile.credits != null ? profile.credits : null;
  $$("[data-plan-name]").forEach(function (el) { el.textContent = planName(id); });
  $("[data-plan-blurb]").textContent = cfg ? cfg.creditsLabel : "";
  $$("[data-credit-balance]").forEach(function (el) { el.textContent = credits == null ? "—" : String(credits); });
  var cap = cfg && cfg.credits ? cfg.credits : 0;
  var pct = credits != null && cap ? Math.max(0, Math.min(100, Math.round(credits / cap * 100))) : 0;
  $("[data-credit-bar]").style.width = pct + "%";
  $("[data-credit-note]").textContent = !cap || credits == null ? "1 credit per new report" : credits > cap ? "Includes extra credits you bought · 1 credit per report" : credits + " of " + cap + " plan credits · 1 credit per report";
  var st = $("[data-sub-status]");
  if (id === "free") st.textContent = "You’re on the free plan. Upgrade any time below. No card needed to stay free.";
  else if (profile && profile.stripe_subscription_id) st.textContent = "Your subscription is active and billed through Stripe. Your renewal date and invoices are in the billing portal.";
  else st.textContent = "Your plan is active. Renewal date and invoices are in the billing portal.";

  var cur = PLAN_ORDER.indexOf(id);
  var C = window.MS_CONFIG || {}, sym = C.currency || "$", months = 12 - (C.annualMonthsFree || 0);
  var yearly = $("[data-cycle-switch]").getAttribute("aria-checked") === "true";
  $("[data-plans]").innerHTML = (C.plans || []).filter(function (p) { return p.id !== "free"; }).map(function (p) {
    var idx = PLAN_ORDER.indexOf(p.id), price = yearly ? p.price * months : p.price;
    var btn = idx === cur ? '<span class="set-pill on">Your plan</span>'
      : idx > cur ? '<button type="button" class="btn btn-sm btn-amber" data-checkout-plan="' + p.id + '">Upgrade</button>'
      : '<button type="button" class="btn btn-sm btn-ghost" data-manage-billing>Switch in portal</button>';
    return '<div class="set-plan-opt' + (idx === cur ? " current" : "") + '">' +
      '<div><b>' + esc(p.name) + '</b><span class="muted">' + esc(p.creditsLabel) + '</span></div>' +
      '<div class="set-price">' + sym + price.toLocaleString("en-US") + '<small>/' + (yearly ? "year" : "month") + '</small></div>' + btn + '</div>';
  }).join("");
  $("[data-topups]").innerHTML = (C.topups || []).map(function (t) {
    return '<button type="button" class="set-topup" data-checkout-topup="' + t.credits + '"><b>' + t.credits + ' credits</b><span>' + sym + t.price + '</span>' + (t.tag ? '<em>' + esc(t.tag) + '</em>' : '') + '</button>';
  }).join("");
}
function bindBilling() {
  var sw = $("[data-cycle-switch]");
  /* main.js already flips every .switch on click; we only repaint after it. */
  sw.addEventListener("click", function () { setTimeout(paintBilling, 0); });
}

/* ---------- usage ---------- */
function paintUsage() {
  var real = reports.filter(function (r) { return !r.is_example; });
  var now = new Date(), month = real.filter(function (r) { var d = new Date(r.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  $("[data-stat-total]").textContent = real.length;
  $("[data-stat-month]").textContent = month.length;
  $("[data-stat-credits]").textContent = real.filter(function (r) { return r.status !== "failed"; }).reduce(function (a, r) { return a + (r.cost || 0); }, 0);
  var q = ($("[data-usage-search]").value || "").toLowerCase();
  var rows = reports.filter(function (r) { return !q || (r.product || "").toLowerCase().indexOf(q) > -1 || (r.market || "").toLowerCase().indexOf(q) > -1; });
  var box = $("[data-usage-list]");
  if (!reports.length) {
    box.innerHTML = '<div class="set-empty"><b>No reports yet.</b><span class="muted">Run your first report from the dashboard. Each one costs 1 credit and shows up here.</span><a class="btn btn-sm btn-amber" href="dashboard.html">Run a report</a></div>';
    return;
  }
  if (!rows.length) { box.innerHTML = '<p class="muted">No reports match “' + esc(q) + '”.</p>'; return; }
  box.innerHTML = '<div class="set-table" role="table"><div class="set-tr th" role="row"><span>Date</span><span>Product</span><span>Market</span><span>Result</span><span>Credits</span></div>' +
    rows.map(function (r) {
      var status = r.status === "failed" ? '<span class="set-tag bad">Failed</span>' : r.status === "pending" ? '<span class="set-tag">Running</span>' : r.verdict ? '<span class="set-tag ok">' + esc(r.verdict) + '</span>' : '<span class="set-tag">Done</span>';
      return '<div class="set-tr" role="row"><span>' + fmtDate(r.created_at) + '</span><span class="p">' + esc(r.product || "—") + (r.is_example ? ' <span class="chip soon">Example</span>' : "") + '</span><span>' + esc(r.market || "—") + '</span><span>' + status + '</span><span>' + (r.cost || 0) + '</span></div>';
    }).join("") + "</div>";
}
function csvCell(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function exportCsv() {
  var lines = [["Date", "Product", "Market", "Result", "Status", "Credits", "Source", "Example"].join(",")];
  reports.forEach(function (r) { lines.push([r.created_at, r.product, r.market, r.verdict, r.status, r.cost, r.source, r.is_example ? "yes" : "no"].map(csvCell).join(",")); });
  download("marketscope-reports-" + new Date().toISOString().slice(0, 10) + ".csv", lines.join("\n"), "text/csv");
}

/* ---------- saved products ---------- */
function fillMarkets() {
  $$("[data-market-select]").forEach(function (sel) {
    var none = sel.hasAttribute("data-allow-none");
    sel.innerHTML = (none ? '<option value="">No default</option>' : "") + MARKETS.map(function (m) { return '<option>' + m + "</option>"; }).join("");
  });
}
function slots() { return WATCH_SLOTS[planId()] || 1; }
function paintWatch() {
  var max = slots();
  $("[data-watch-slots]").textContent = watch.length + " of " + (max === Infinity ? "unlimited" : max) + " slots used";
  var box = $("[data-watch-list]");
  if (!watch.length) {
    box.innerHTML = '<div class="set-empty"><b>Nothing saved yet.</b><span class="muted">Add a product above to keep it on your list.</span></div>';
  } else {
    box.innerHTML = '<div class="set-list">' + watch.map(function (w) {
      return '<div class="set-line"><div><b>' + esc(w.product || w.ticker) + '</b><span class="muted">' + esc(w.market || "") + " · saved " + fmtDate(w.created_at) + '</span></div><div class="set-actions tight"><a class="btn btn-sm btn-ghost" href="dashboard.html?tab=describe">Run report</a><button type="button" class="btn btn-sm btn-ghost" data-unwatch="' + esc(w.id) + '">Remove</button></div></div>';
    }).join("") + "</div>";
  }
  $$("[data-unwatch]", box).forEach(function (b) {
    b.addEventListener("click", async function () {
      b.disabled = true;
      var r = await sb.from("watchlist").delete().eq("id", b.getAttribute("data-unwatch")).eq("user_id", user.id);
      if (r.error) { b.disabled = false; return msg($("form[data-set-form='watch'] .form-msg"), friendly(r.error)); }
      watch = watch.filter(function (w) { return w.id !== b.getAttribute("data-unwatch"); });
      paintWatch();
    });
  });
  var sbox = $("[data-store-list]");
  if (!stores.length) {
    sbox.innerHTML = '<div class="set-empty"><b>No tracked stores yet.</b><span class="muted">Follow a competitor store from Store Intelligence and it will show up here.</span></div>';
  } else {
    sbox.innerHTML = '<div class="set-list">' + stores.map(function (s) {
      return '<div class="set-line"><div><b>' + esc(s.name || s.slug) + '</b><span class="muted">' + esc([s.platform, s.url].filter(Boolean).join(" · ")) + '</span></div><button type="button" class="btn btn-sm btn-ghost" data-unstore="' + esc(s.id) + '">Stop tracking</button></div>';
    }).join("") + "</div>";
    $$("[data-unstore]", sbox).forEach(function (b) {
      b.addEventListener("click", async function () {
        b.disabled = true;
        var r = await sb.from("tracked_stores").delete().eq("id", b.getAttribute("data-unstore")).eq("user_id", user.id);
        if (r.error) { b.disabled = false; return; }
        stores = stores.filter(function (s) { return s.id !== b.getAttribute("data-unstore"); });
        paintWatch();
      });
    });
  }
}
function bindWatch() {
  var f = $("form[data-set-form='watch']");
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    var m = $(".form-msg", f), b = $("button[type=submit]", f);
    var product = f.product.value.trim(), market = f.market.value;
    if (!product) return msg(m, "Enter a product name.");
    if (watch.length >= slots()) return msg(m, "You’ve used all " + slots() + " slots on your plan. Remove one or upgrade for more.");
    var ticker = (product.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "ITEM") + "-" + (MARKET_CODES[market] || "XX");
    b.disabled = true;
    var r = await sb.from("watchlist").insert({ user_id: user.id, ticker: ticker, product: product, market: market }).select("id,ticker,product,market,created_at").single();
    b.disabled = false;
    if (r.error) return msg(m, friendly(r.error));
    watch.unshift(r.data);
    f.product.value = "";
    msg(m, "Saved.", true);
    paintWatch();
  });
}

/* ---------- report defaults + notifications (account if possible, else device) ---------- */
function accountPrefs() { return (profile && profile.preferences && typeof profile.preferences === "object") ? profile.preferences : {}; }
async function savePrefsPatch(patch) {
  var next = Object.assign({}, accountPrefs(), patch);
  var r = await sb.from("profiles").update({ preferences: next }).eq("id", user.id);
  if (r.error) throw r.error;
  profile.preferences = next;
}
function paintPrefs() {
  var local = readLocal("ms_prefs"), acct = accountPrefs();
  var f = $("form[data-set-form='prefs']");
  f.defaultMarket.value = acct.defaultMarket || local.defaultMarket || "";
  f.defaultTab.value = acct.defaultTab || local.defaultTab || "link";
  var n = acct.notifications || {};
  var nf = $("form[data-set-form='notify']");
  $("[data-notify-unavailable]").hidden = prefsColumn;
  $("[data-notify-later]").hidden = !prefsColumn;
  $$("input[type=checkbox]", nf).forEach(function (c) { c.checked = prefsColumn ? !!n[c.name] : false; c.disabled = !prefsColumn; });
  $("button[type=submit]", nf).disabled = !prefsColumn;
  $("[data-shortcuts-toggle]").checked = local.shortcuts !== false;
}
function bindPrefs() {
  var f = $("form[data-set-form='prefs']");
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    var m = $(".form-msg", f), patch = { defaultMarket: f.defaultMarket.value, defaultTab: f.defaultTab.value };
    writeLocal("ms_prefs", Object.assign(readLocal("ms_prefs"), patch));
    if (!prefsColumn) return msg(m, "Saved on this device.", true);
    try { await savePrefsPatch(patch); msg(m, "Saved to your account.", true); }
    catch (err) { msg(m, "Saved on this device. Couldn’t save to your account: " + friendly(err)); }
  });
  var nf = $("form[data-set-form='notify']");
  nf.addEventListener("submit", async function (e) {
    e.preventDefault();
    var m = $(".form-msg", nf);
    if (!prefsColumn) return;
    var n = {};
    $$("input[type=checkbox]", nf).forEach(function (c) { n[c.name] = c.checked; });
    n.updated_at = new Date().toISOString();
    try { await savePrefsPatch({ notifications: n }); msg(m, "Email choices saved.", true); }
    catch (err) { msg(m, friendly(err)); }
  });
  $("[data-shortcuts-toggle]").addEventListener("change", function (e) {
    writeLocal("ms_prefs", Object.assign(readLocal("ms_prefs"), { shortcuts: e.target.checked }));
  });
}

/* ---------- appearance (device only) ---------- */
function bindAppearance() {
  var f = $("form[data-set-form='appearance']"), a = readLocal("ms_appearance");
  var defs = { theme: "dark", text: "standard", density: "comfortable", motion: "full" };
  Object.keys(defs).forEach(function (k) {
    var v = a[k] || defs[k];
    $$('input[name="' + k + '"]', f).forEach(function (r) { r.checked = r.value === v; });
  });
  f.addEventListener("change", function () {
    var next = {};
    Object.keys(defs).forEach(function (k) { var c = $('input[name="' + k + '"]:checked', f); next[k] = c ? c.value : defs[k]; });
    writeLocal("ms_appearance", next);
    if (window.MSApplyAppearance) window.MSApplyAppearance();
    msg($(".form-msg", f), "Saved on this device.", true);
  });
}

/* ---------- security ---------- */
function browserInfo() {
  var ua = navigator.userAgent || "", b = "Browser", o = "Unknown system";
  if (/Edg\//.test(ua)) b = "Edge"; else if (/OPR\//.test(ua)) b = "Opera"; else if (/Chrome\//.test(ua)) b = "Chrome"; else if (/Firefox\//.test(ua)) b = "Firefox"; else if (/Safari\//.test(ua)) b = "Safari";
  if (/iPhone|iPad/.test(ua)) o = "iPhone or iPad"; else if (/Android/.test(ua)) o = "Android"; else if (/Windows/.test(ua)) o = "Windows"; else if (/Mac OS X/.test(ua)) o = "Mac"; else if (/Linux/.test(ua)) o = "Linux";
  return b + " on " + o;
}
var PROVIDER_NAMES = { google: "Google", email: "Email and password", github: "GitHub", apple: "Apple" };
function paintSecurity() {
  var ids = user.identities || [];
  if (!ids.length && user.app_metadata && user.app_metadata.providers) ids = user.app_metadata.providers.map(function (p) { return { provider: p }; });
  var hasEmail = ids.some(function (i) { return i.provider === "email"; });
  $("[data-providers]").innerHTML = ids.map(function (i) {
    var d = i.identity_data || {};
    return '<div class="set-line"><div><b>' + esc(PROVIDER_NAMES[i.provider] || i.provider) + '</b><span class="muted">' + esc(d.email || user.email || "") + (i.created_at ? " · connected " + fmtDate(i.created_at) : "") + '</span></div><span class="set-tag ok">Connected</span></div>';
  }).join("") || '<p class="muted">No sign-in methods found.</p>';
  var exp = session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null;
  $("[data-session-info]").innerHTML =
    '<div class="set-line"><div><b>' + esc(browserInfo()) + '</b><span class="muted">The device you’re using now</span></div><span class="set-tag ok">This device</span></div>' +
    '<div class="set-line"><div><b>Last sign-in</b><span class="muted">' + fmtDate(user.last_sign_in_at, true) + '</span></div></div>' +
    '<div class="set-line"><div><b>Session refreshes</b><span class="muted">' + (exp ? fmtDate(exp, true) + " (renews on its own while you use the site)" : "—") + '</span></div></div>';
  $("[data-pass-title]").textContent = hasEmail ? "Change password" : "Add a password";
  $("[data-pass-hint]").textContent = hasEmail ? "Use at least 8 characters, mixing letters and numbers." : "You sign in with Google. Add a password if you also want to log in with your email.";
}
function bindSecurity() {
  $("[data-sign-out-local]").addEventListener("click", async function () {
    try { await sb.auth.signOut({ scope: "local" }); } catch (e) { /* leave anyway */ }
    location.href = "index.html";
  });
  $("[data-sign-out-global]").addEventListener("click", async function (e) {
    var b = e.currentTarget, m = $("[data-signout-msg]");
    if (!confirm("Log out of MarketScope on every device, including this one?")) return;
    b.disabled = true;
    var r = await sb.auth.signOut({ scope: "global" });
    if (r && r.error) { b.disabled = false; return msg(m, friendly(r.error)); }
    location.href = "login.html?next=settings.html";
  });
  var f = $("form[data-set-form='password']");
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    var m = $(".form-msg", f), b = $("button[type=submit]", f), p1 = $("#s-pass").value, p2 = $("#s-pass2").value;
    if (p1.length < 8) return msg(m, "Use at least 8 characters.");
    if (p1 !== p2) return msg(m, "The two passwords don’t match.");
    b.disabled = true;
    var r = await sb.auth.updateUser({ password: p1 });
    b.disabled = false;
    if (r.error) return msg(m, friendly(r.error));
    f.reset();
    msg(m, "Password saved.", true);
  });
}

/* ---------- privacy ---------- */
async function exportJson() {
  var m = $("[data-export-msg]");
  msg(m, "Preparing your file…", true);
  try {
    var full = await sb.from("reports").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    var pf = await sb.from("portfolio").select("*").eq("user_id", user.id);
    var data = {
      exported_at: new Date().toISOString(),
      account: { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at, sign_in_methods: (user.identities || []).map(function (i) { return i.provider; }) },
      profile: profile,
      reports: full.error ? reports : full.data,
      saved_products: watch,
      tracked_stores: stores,
      portfolio: pf.error ? [] : pf.data,
      device_settings: { report_defaults: readLocal("ms_prefs"), appearance: readLocal("ms_appearance") }
    };
    download("marketscope-my-data-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(data, null, 2), "application/json");
    msg(m, "Your data was downloaded.", true);
  } catch (err) { msg(m, friendly(err)); }
}
function paintDelete() {
  var note = $("[data-delete-note]"), cancel = $("[data-delete-cancel]");
  var at = profile && profile.deletion_requested_at;
  note.hidden = !at;
  cancel.hidden = !at;
  if (at) note.innerHTML = "<b>Deletion requested</b> on " + fmtDate(at) + ". We’ll confirm by email before anything is removed. You can keep using your account until then.";
}
function bindPrivacy() {
  $$("[data-export-csv]").forEach(function (b) { b.addEventListener("click", exportCsv); });
  $("[data-export-json]").addEventListener("click", exportJson);
  $("[data-usage-search]").addEventListener("input", paintUsage);
  var f = $("form[data-set-form='delete']");
  f.addEventListener("submit", async function (e) {
    e.preventDefault();
    var m = $(".form-msg", f);
    if ($("#s-del").value.trim() !== "DELETE") return msg(m, "Type DELETE in capital letters to confirm.");
    var at = new Date().toISOString();
    var r = await sb.from("profiles").update({ deletion_requested_at: at }).eq("id", user.id);
    if (r.error) return msg(m, friendly(r.error));
    profile.deletion_requested_at = at;
    $("#s-del").value = "";
    msg(m, "Request sent.", true);
    paintDelete();
  });
  $("[data-delete-cancel]").addEventListener("click", async function () {
    var m = $(".form-msg", f);
    var r = await sb.from("profiles").update({ deletion_requested_at: null }).eq("id", user.id);
    if (r.error) return msg(m, friendly(r.error));
    profile.deletion_requested_at = null;
    msg(m, "Your deletion request was cancelled.", true);
    paintDelete();
  });
}

/* ---------- boot ---------- */
async function boot() {
  var next = "login.html?next=settings.html";
  if (!isSupabaseConfigured()) { location.replace(next); return; }
  try {
    var mod = await import(CDN);
    sb = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    var s = await sb.auth.getSession();
    session = s.data && s.data.session;
  } catch (e) { session = null; }
  if (!session) { location.replace(next); return; }
  var u = await sb.auth.getUser();
  user = (u.data && u.data.user) || session.user;

  fillMarkets();
  bindTabs();
  try { await loadProfile(); } catch (e) { profile = null; }
  await Promise.all([loadReports(), loadWatch(), loadStores()]);

  $("[data-settings-gate]").hidden = true;
  $("[data-settings-shell]").hidden = false;

  paintProfile(); paintBilling(); paintUsage(); paintWatch(); paintPrefs(); paintSecurity(); paintDelete();
  bindProfile(); bindBilling(); bindWatch(); bindPrefs(); bindAppearance(); bindSecurity(); bindPrivacy();
  setTab((location.hash || "#profile").slice(1), false);
}
boot();
