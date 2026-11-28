/* MarketScope Credit Wallet (wallet.html).
   Reads only the signed-in user's own rows (Row Level Security) with the public
   anon key. Nothing here is sample data: every number comes from the profile,
   the user's reports, their Josy messages or Josy usage. Checkout and the billing
   portal are handled by billing.js (Stripe Payment Links), unchanged. */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";

var CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
var PLAN_ORDER = ["free", "starter", "plus", "pro"];
/* Fallbacks that mirror public.josy_daily_limit() and the campaign-manager limits. */
var JOSY_MSGS = { free: 10, starter: 50, plus: 150, pro: 400 };
var CAMPAIGNS = { free: 5, starter: 50, plus: 250, pro: 1000 };
var MEDIA = { free: "200 MB", starter: "2 GB", plus: "10 GB", pro: "50 GB" };
/* Constants taken from the edge functions (analyze: REPORT_COST, RATE_LIMIT_PER_HOUR;
   josy-chat: DEMAND_COST, MAX_DEMAND_CALLS_PER_TURN). */
var REPORT_COST = 1, REPORTS_PER_HOUR = 20, DEMAND_COST = 1, DEMAND_PER_MESSAGE = 2, SIGNUP_BONUS = 5;
var PAGE = 10;

var sb, session, user, profile = null, josyLimit = null, josyToday = null;
var reports = [], josyCharges = [], loadErrors = { reports: false, josy: false };
var filter = "all", shown = PAGE, lastLoad = 0;

function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function planId() { var p = ((profile && profile.plan) || "free").toLowerCase(); return PLAN_ORDER.indexOf(p) > -1 ? p : "free"; }
function planCfg(id) { var C = window.MS_CONFIG || {}; return (C.plans || []).filter(function (p) { return p.id === id; })[0] || null; }
function planName(id) { var p = planCfg(id); return p ? p.name : id.charAt(0).toUpperCase() + id.slice(1); }
function fmtDate(iso, withTime) {
  var d = new Date(iso);
  if (!iso || isNaN(d)) return "—";
  var o = { year: "numeric", month: "short", day: "numeric" };
  if (withTime) { o.hour = "2-digit"; o.minute = "2-digit"; }
  return d.toLocaleString("en-US", o);
}
function fmtTime(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
function rel(iso) {
  var d = new Date(iso), s = Math.round((Date.now() - d.getTime()) / 1000);
  if (isNaN(s)) return "";
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  if (s < 86400 * 7) return Math.floor(s / 86400) + " d ago";
  return fmtDate(iso);
}
function dayKey(iso) { var d = new Date(iso); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
function dayLabel(iso) {
  var d = new Date(iso), n = new Date(), y = new Date(Date.now() - 86400000);
  if (dayKey(iso) === dayKey(n.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(y.toISOString())) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() === n.getFullYear() ? undefined : "numeric" });
}
function reduceMotion() {
  var r = document.documentElement.getAttribute("data-ms-motion") === "reduced";
  return r || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}
function nf(n) { return Number(n).toLocaleString("en-US"); }

/* ---------- data ---------- */
async function loadProfile() {
  var cols = "id,email,display_name,plan,credits,stripe_customer_id,stripe_subscription_id,created_at";
  var billing = ",subscription_status,current_period_end,cancel_at_period_end";
  var r = await sb.from("profiles").select(cols + billing).eq("id", user.id).maybeSingle();
  if (r.error && /subscription_status|current_period_end|cancel_at_period_end/i.test(r.error.message || "")) {
    r = await sb.from("profiles").select(cols).eq("id", user.id).maybeSingle();
  }
  if (r.error) throw r.error;
  profile = r.data || null;
}
async function loadReports() {
  var r = await sb.from("reports").select("id,product,market,cost,status,is_example,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000);
  loadErrors.reports = !!r.error;
  reports = r.error ? [] : (r.data || []);
}
async function loadJosy() {
  var r = await sb.from("josy_messages").select("id,created_at,meta").eq("user_id", user.id).eq("role", "assistant").order("created_at", { ascending: false }).limit(1000);
  loadErrors.josy = !!r.error;
  josyCharges = (r.error ? [] : (r.data || [])).map(function (m) {
    var n = m.meta && Number(m.meta.credits_charged);
    return n > 0 ? { id: m.id, created_at: m.created_at, n: n } : null;
  }).filter(Boolean);
}
async function loadJosyUsage() {
  josyLimit = null; josyToday = null;
  try {
    var day = new Date().toISOString().slice(0, 10); /* Josy days reset at 00:00 UTC */
    var u = await sb.from("josy_usage").select("messages").eq("user_id", user.id).eq("day", day).maybeSingle();
    if (!u.error) josyToday = u.data ? Number(u.data.messages) || 0 : 0;
    var l = await sb.rpc("josy_daily_limit", { p_plan: planId() });
    josyLimit = !l.error && typeof l.data === "number" ? l.data : JOSY_MSGS[planId()];
  } catch (e) { /* leave as unknown */ }
}

/* ---------- balance card ---------- */
var shownBalance = null;
function countTo(el, to) {
  if (typeof to !== "number") { el.textContent = "—"; shownBalance = null; return; }
  var from = shownBalance == null ? 0 : shownBalance;
  shownBalance = to;
  if (reduceMotion() || from === to) { el.textContent = nf(to); return; }
  var t0 = performance.now(), dur = 900;
  function step(t) {
    var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = nf(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step); else el.textContent = nf(to);
  }
  requestAnimationFrame(step);
}
function paintCard() {
  var id = planId(), cfg = planCfg(id), credits = profile && typeof profile.credits === "number" ? profile.credits : null;
  $("[data-wl-plan-name]").textContent = planName(id);
  countTo($("[data-wl-balance]"), credits);

  var st = $("[data-wl-status]"), renew = $("[data-wl-renew]"), alertEl = $("[data-wl-alert]");
  var status = profile && profile.subscription_status, end = profile && profile.current_period_end, cancels = !!(profile && profile.cancel_at_period_end);
  st.hidden = true; st.className = "wl-status"; alertEl.hidden = true;
  function pill(cls, txt) { st.hidden = false; st.className = "wl-status " + cls; st.innerHTML = '<i></i>' + esc(txt); }
  if (id === "free") {
    renew.textContent = "Free plan · " + SIGNUP_BONUS + " one-time credits. Upgrade any time, no card needed to stay free.";
  } else if (status === "past_due") {
    pill("bad", "Payment failed");
    renew.textContent = "Your last payment didn’t go through. Update your card in the billing portal to keep your plan.";
    alertEl.hidden = false;
    alertEl.innerHTML = '<b>Payment failed.</b> Stripe couldn’t charge your card. <button type="button" class="link-btn amber" data-manage-billing>Update payment method</button>';
  } else if (cancels && end) {
    pill("warn", "Cancels " + fmtDate(end));
    renew.textContent = "Cancelled. You keep your plan and credits until " + fmtDate(end) + ".";
  } else if (cancels) {
    pill("warn", "Cancelling");
    renew.textContent = "Cancelled. You keep your plan until the end of the current billing period.";
  } else if (status === "trialing") {
    pill("ok", "Trial");
    renew.textContent = end ? "Trial ends and first payment is on " + fmtDate(end) + "." : "Your trial is active.";
  } else if (end) {
    pill("ok", "Active");
    renew.textContent = "Renews on " + fmtDate(end) + ".";
  } else {
    pill("ok", "Active");
    renew.textContent = "Your plan is active. The renewal date is in the billing portal.";
  }

  var meter = $("[data-wl-meter]"), cap = cfg && cfg.credits ? cfg.credits : 0;
  if (credits == null || !cap) { meter.hidden = true; }
  else {
    meter.hidden = false;
    var pct = Math.max(0, Math.min(100, Math.round(credits / cap * 100)));
    $("[data-wl-meter-label]").textContent = id === "free" ? "Free credits" : "Plan credits this cycle";
    $("[data-wl-meter-note]").textContent = credits > cap ? nf(cap) + " plan + " + nf(credits - cap) + " extra" : nf(credits) + " of " + nf(cap) + " left";
    var bar = $("[data-wl-bar]");
    bar.style.width = reduceMotion() ? pct + "%" : "0%";
    if (!reduceMotion()) requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = pct + "%"; }); });
  }

  var spentR = reports.filter(function (r) { return !r.is_example && r.status !== "failed"; });
  var rCredits = spentR.reduce(function (a, r) { return a + (Number(r.cost) || 0); }, 0);
  var jCredits = josyCharges.reduce(function (a, m) { return a + m.n; }, 0);
  var capped = reports.length >= 1000 ? "≥ " : "";
  $("[data-wl-st-reports]").innerHTML = loadErrors.reports ? "—" : capped + nf(rCredits) + ' <i>CR</i>';
  $("[data-wl-st-josy]").innerHTML = loadErrors.josy ? "—" : nf(jCredits) + ' <i>CR</i>';
  $("[data-wl-st-count]").textContent = loadErrors.reports ? "—" : capped + nf(spentR.length);
  $("[data-wl-st-josyday]").innerHTML = josyToday == null || josyLimit == null ? "—" : nf(josyToday) + ' <i>/ ' + nf(josyLimit) + "</i>";
}

/* ---------- activity feed ---------- */
var ICONS = {
  report: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  josy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>',
  bonus: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="8" width="17" height="12" rx="2"/><path d="M12 8v12M3.5 12.5h17"/><path d="M12 8C10.5 5 7 5 7 7s3.5 1 5 1zm0 0c1.5-3 5-3 5-1s-3.5 1-5 1z"/></svg>',
  failed: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  pending: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
};
function events() {
  var ev = [];
  reports.forEach(function (r) {
    if (r.is_example) return;
    var sub = [r.product, r.market].filter(Boolean).join(" · ");
    if (r.status === "failed") ev.push({ t: "failed", amt: 0, title: "Report failed", sub: sub, note: "No charge", ts: r.created_at, href: "reports.html" });
    else if (r.status === "pending") ev.push({ t: "pending", amt: 0, title: "Report running", sub: sub, note: "Charged on completion", ts: r.created_at, href: "reports.html" });
    else ev.push({ t: "report", amt: -(Number(r.cost) || 0), title: "Research report", sub: sub, ts: r.created_at, href: "reports.html" });
  });
  josyCharges.forEach(function (m) { ev.push({ t: "josy", amt: -m.n, title: "Josy live demand check", sub: "Live Google search data in Josy chat", ts: m.created_at, href: "josy-chat.html" }); });
  if (profile && profile.created_at) ev.push({ t: "bonus", amt: SIGNUP_BONUS, title: "Welcome credits", sub: "Free sign-up bonus", ts: profile.created_at });
  ev.sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
  return ev;
}
function paintFeed() {
  var box = $("[data-wl-feed]"), more = $("[data-wl-more]");
  var all = events(), list = all.filter(function (e) { return filter === "all" || (filter === "out" ? e.amt < 0 : e.amt > 0); });
  if (loadErrors.reports && loadErrors.josy && !list.length) {
    box.innerHTML = '<div class="wl-empty"><b>Couldn’t load your activity.</b><span class="muted">Check your connection and refresh the page.</span></div>';
    more.hidden = true; return;
  }
  if (!list.length) {
    var msg = filter === "in" ? "Nothing received yet." : filter === "out" ? "No credits spent yet." : "No activity yet.";
    box.innerHTML = '<div class="wl-empty"><span class="wl-empty-ico">' + ICONS.pending + '</span><b>' + msg + '</b><span class="muted">Run a report and every credit you spend shows up here.</span><a class="btn btn-sm btn-amber" href="dashboard.html">Run a report</a></div>';
    more.hidden = true; return;
  }
  var page = list.slice(0, shown), html = "", last = "";
  page.forEach(function (e, i) {
    var k = dayKey(e.ts);
    if (k !== last) { html += '<div class="wl-day">' + esc(dayLabel(e.ts)) + "</div>"; last = k; }
    var cls = e.amt > 0 ? "in" : e.amt < 0 ? "out" : "zero";
    var amt = e.amt > 0 ? "+" + nf(e.amt) : e.amt < 0 ? "−" + nf(-e.amt) : "0";
    var inner = '<span class="wl-tx-ico ' + e.t + '">' + ICONS[e.t] + "</span>" +
      '<span class="wl-tx-main"><b>' + esc(e.title) + "</b><small>" + esc(e.sub || "") + "</small></span>" +
      '<span class="wl-tx-amt ' + cls + '"><b>' + amt + " <i>CR</i></b><small title=\"" + esc(fmtDate(e.ts, true)) + "\">" + (e.note ? esc(e.note) : esc(rel(e.ts))) + "</small></span>";
    html += e.href ? '<a class="wl-tx" style="--i:' + (i % PAGE) + '" href="' + esc(e.href) + '">' + inner + "</a>" : '<div class="wl-tx" style="--i:' + (i % PAGE) + '">' + inner + "</div>";
  });
  if (!all.some(function (e) { return e.amt < 0 || e.t === "failed"; }) && filter !== "in") {
    html += '<div class="wl-empty slim"><span class="muted">No spending yet. Each report costs ' + REPORT_COST + ' CR.</span> <a class="amber" href="dashboard.html">Run a report →</a></div>';
  }
  box.innerHTML = html;
  more.hidden = list.length <= shown;
  more.textContent = "Show more (" + (list.length - shown) + ")";
}

/* ---------- what credits buy / included ---------- */
function paintBuy() {
  var id = planId(), lim = josyLimit != null ? josyLimit : JOSY_MSGS[id];
  var rows = [
    ["report", "Research report", "Live Google Shopping and Google Search data, scores and verdict. Charged only when a report completes, up to " + REPORTS_PER_HOUR + " an hour.", REPORT_COST + " CR", "cost"],
    ["josy", "Josy live demand check", "Real monthly search volume, trend and CPC inside Josy chat. Up to " + DEMAND_PER_MESSAGE + " checks per message, charged only on success.", DEMAND_COST + " CR", "cost"],
    ["josy", "Josy chat, plans and calendars", "Writing posts, marketing plans and content calendars uses no credits. Daily message allowance on your plan: " + nf(lim) + ".", "Free", "free"],
    ["camp", "Campaign manager", "Organic planner and paid campaign drafts don’t use credits. Limits keep storage fair across plans.", "Free", "free"],
    ["sup", "Supplier Intelligence", "AliExpress, Alibaba, 1688, CJ, Temu, DHgate, Shopify stores, Meta ads and TikTok for any signed-in account. Results are cached for 24 hours and searches are rate-limited.", "Free", "free"]
  ];
  var ic = {
    report: ICONS.report, josy: ICONS.josy,
    camp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-4l11-5v14z"/><path d="M15 9.5a3 3 0 0 1 0 5M7 14l1.5 5H11l-1.2-5"/></svg>',
    sup: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8L12 4l8.5 4v8L12 20l-8.5-4z"/><path d="M3.5 8L12 12l8.5-4M12 12v8"/></svg>'
  };
  $("[data-wl-buy]").innerHTML = rows.map(function (r) {
    return '<li><span class="wl-buy-ico">' + ic[r[0]] + '</span><span class="wl-buy-t"><b>' + esc(r[1]) + "</b><small>" + esc(r[2]) + '</small></span><span class="wl-cost ' + r[4] + '">' + esc(r[3]) + "</span></li>";
  }).join("");

  var cfg = planCfg(id), C = window.MS_CONFIG || {}, sym = C.currency || "$";
  var inc = [
    ["Credits", id === "free" ? SIGNUP_BONUS + " one-time credits" : (cfg ? cfg.creditsLabel : "—")],
    ["Josy messages", nf(lim) + " a day"],
    ["Campaign manager", "Up to " + nf(CAMPAIGNS[id]) + " campaigns · " + MEDIA[id] + " media"],
    ["Report rate limit", REPORTS_PER_HOUR + " an hour"]
  ];
  if (cfg && cfg.price) inc.unshift(["Price", sym + nf(cfg.price) + " / month"]);
  $("[data-wl-incl]").innerHTML = inc.map(function (r) { return "<li><span>" + esc(r[0]) + "</span><b>" + esc(r[1]) + "</b></li>"; }).join("");
}

/* ---------- get credits ---------- */
function paintGet() {
  var C = window.MS_CONFIG || {}, sym = C.currency || "$", months = 12 - (C.annualMonthsFree || 0);
  $("[data-wl-topups]").innerHTML = (C.topups || []).map(function (t) {
    var per = t.price / t.credits;
    return '<button type="button" class="wl-topup" data-checkout-topup="' + t.credits + '">' +
      (t.tag ? '<em>' + esc(t.tag) + "</em>" : "") +
      '<span class="wl-tu-n">+' + nf(t.credits) + " <i>CR</i></span>" +
      '<span class="wl-tu-p">' + sym + nf(t.price) + "</span>" +
      '<small>' + sym + (Math.round(per * 100) / 100).toFixed(2) + " per credit</small></button>";
  }).join("");

  var cur = PLAN_ORDER.indexOf(planId());
  var yearly = $("[data-cycle-switch]").getAttribute("aria-checked") === "true";
  $("[data-wl-plans]").innerHTML = (C.plans || []).filter(function (p) { return p.id !== "free"; }).map(function (p) {
    var idx = PLAN_ORDER.indexOf(p.id), price = yearly ? p.price * months : p.price;
    var btn = idx === cur ? '<span class="wl-pill-on">Your plan</span>'
      : idx > cur ? '<button type="button" class="btn btn-sm btn-amber" data-checkout-plan="' + esc(p.id) + '">Upgrade</button>'
      : '<button type="button" class="btn btn-sm btn-ghost" data-manage-billing>Switch in portal</button>';
    return '<div class="wl-plan-opt' + (idx === cur ? " cur" : "") + (p.popular ? " pop" : "") + '">' +
      '<div class="wl-po-main"><b>' + esc(p.name) + (p.popular ? ' <span class="wl-pop">Popular</span>' : "") + "</b><span>" + esc(p.creditsLabel) + "</span></div>" +
      '<div class="wl-po-price">' + sym + nf(price) + "<small>/" + (yearly ? "year" : "month") + "</small></div>" + btn + "</div>";
  }).join("");
}
function setTab(name, focus) {
  $$("[data-wl-tab]").forEach(function (b) {
    var on = b.getAttribute("data-wl-tab") === name;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  });
  $$("[data-wl-pane]").forEach(function (p) { p.hidden = p.getAttribute("data-wl-pane") !== name; });
}
function goTo(sel, tab) {
  if (tab) setTab(tab);
  var el = $(sel);
  if (!el) return;
  el.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  el.classList.remove("wl-flash"); void el.offsetWidth; el.classList.add("wl-flash");
  try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
}

/* ---------- account id chip ---------- */
function hue(str, salt) { var h = salt; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; }
function paintId() {
  var id = user.id || "";
  $("[data-wl-id-short]").textContent = id.length > 14 ? id.slice(0, 6) + "…" + id.slice(-4) : id || "—";
  var a = hue(id, 17), b = hue(id, 143);
  $("[data-wl-identicon]").style.background = "conic-gradient(from 30deg, hsl(" + a + " 80% 58%), hsl(" + b + " 75% 52%), hsl(" + a + " 80% 58%))";
}
function bindCopy() {
  var btn = $("[data-wl-copy]"), lab = $("[data-wl-copy-label]");
  btn.addEventListener("click", async function () {
    var ok = true;
    try { await navigator.clipboard.writeText(user.id); }
    catch (e) {
      ok = false;
      try { var r = document.createRange(); r.selectNodeContents($("[data-wl-id-short]")); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e2) { /* ignore */ }
    }
    lab.textContent = ok ? "Copied" : "Select & copy";
    btn.classList.toggle("done", ok);
    setTimeout(function () { lab.textContent = "Copy"; btn.classList.remove("done"); }, 1600);
  });
}

/* ---------- binding ---------- */
function bind() {
  bindCopy();
  $$("[data-wl-go]").forEach(function (b) {
    b.addEventListener("click", function () {
      var g = b.getAttribute("data-wl-go");
      if (g === "history") goTo("#wl-history"); else goTo("#wl-get", g);
    });
  });
  var tabs = $$("[data-wl-tab]");
  tabs.forEach(function (b, i) {
    b.addEventListener("click", function () { setTab(b.getAttribute("data-wl-tab")); });
    b.addEventListener("keydown", function (e) {
      var j = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : -1;
      if (j > -1) { e.preventDefault(); setTab(tabs[j].getAttribute("data-wl-tab"), true); }
    });
  });
  /* main.js flips every .switch on click; we only repaint after it. */
  $("[data-cycle-switch]").addEventListener("click", function () { setTimeout(paintGet, 0); });
  $$("[data-wl-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.getAttribute("data-wl-filter"); shown = PAGE;
      $$("[data-wl-filter]").forEach(function (x) { var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
      paintFeed();
    });
  });
  $("[data-wl-more]").addEventListener("click", function () { shown += PAGE; paintFeed(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - lastLoad > 30000) refresh();
  });
}

async function refresh() {
  lastLoad = Date.now();
  try { await loadProfile(); } catch (e) { /* keep the last known profile */ }
  await Promise.all([loadReports(), loadJosy()]);
  await loadJosyUsage();
  paintAll();
}
function paintAll() { paintCard(); paintFeed(); paintBuy(); paintGet(); }

async function boot() {
  var next = "login.html?next=wallet.html";
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

  try { await loadProfile(); } catch (e) { profile = null; }
  await Promise.all([loadReports(), loadJosy()]);
  await loadJosyUsage();
  lastLoad = Date.now();

  $("[data-wl-gate]").hidden = true;
  $("[data-wl-shell]").hidden = false;
  paintId(); bind(); paintAll();

  /* After Stripe checkout the webhook can take a few seconds: re-read the profile. */
  try {
    if (new URLSearchParams(location.search).get("checkout") === "success") {
      var tries = 0, t = setInterval(async function () {
        tries++;
        try { await loadProfile(); paintCard(); paintGet(); paintBuy(); } catch (e) { /* ignore */ }
        if (tries >= 6) clearInterval(t);
      }, 2000);
    }
  } catch (e) { /* ignore */ }
}
boot();
