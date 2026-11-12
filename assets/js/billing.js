/* MarketScope checkout — calls the create-checkout / create-portal edge functions. */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";

var CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
var PENDING_KEY = "ms_pending_checkout";
var sbPromise = null;

function $(s, r) { return (r || document).querySelector(s); }

function lookupFor(plan, yearly) {
  if (!plan || plan === "free") return null;
  return plan + (yearly ? "_yearly" : "_monthly");
}

function isYearly() {
  var sw = $(".switch[aria-checked], .switch");
  if (sw && sw.getAttribute("aria-checked") === "true") return true;
  return false;
}

async function getSb() {
  if (!isSupabaseConfigured()) return null;
  if (!sbPromise) {
    sbPromise = import(CDN).then(function (m) {
      return m.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
    });
  }
  return sbPromise;
}

async function currentSession() {
  try {
    var sb = await getSb();
    if (!sb) return null;
    var res = await sb.auth.getSession();
    return (res.data && res.data.session) || null;
  } catch (e) {
    return null;
  }
}

function setPending(lookup) {
  try { sessionStorage.setItem(PENDING_KEY, lookup); } catch (e) { /* ignore */ }
}
function getPending() {
  try { return sessionStorage.getItem(PENDING_KEY) || ""; } catch (e) { return ""; }
}
function clearPending() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* ignore */ }
}

function goSignup(lookup, plan) {
  setPending(lookup);
  var q = "signup.html?plan=" + encodeURIComponent(plan || "free");
  window.location.href = q;
}

function setBusy(el, on) {
  if (!el) return;
  el.disabled = !!on;
  if (on) el.setAttribute("data-busy", "1");
  else el.removeAttribute("data-busy");
}

async function invoke(name, body) {
  var session = await currentSession();
  if (!session) return { status: 401, payload: { error: "Unauthorized", code: "unauthorized" } };
  var sb = await getSb();
  var inv = await sb.functions.invoke(name, { body: body || {} });
  var payload = inv.data || {};
  var status = 200;
  if (inv.error) {
    status = (inv.error.context && inv.error.context.status) || 500;
    if (!payload.error && typeof inv.error.context?.json === "function") {
      try { payload = await inv.error.context.json(); } catch (e) { /* ignore */ }
    }
    if (!payload.error) payload = { error: inv.error.message || "Request failed", code: "invoke_failed" };
  }
  return { status: payload.code === "payments_not_configured" ? 503 : status, payload: payload };
}

function toast(msg, ok) {
  var box = $("[data-checkout-toast]") || $("[data-dash-error]");
  if (!box) {
    if (!ok) window.alert(msg);
    return;
  }
  box.hidden = false;
  box.className = ok ? "form-msg ok" : "form-msg";
  box.setAttribute("data-checkout-toast", "");
  box.textContent = msg;
}

async function startCheckout(lookup, btn) {
  if (!lookup) return;
  var session = await currentSession();
  if (!session) {
    var plan = lookup.indexOf("topup_") === 0 ? "free" : lookup.split("_")[0];
    goSignup(lookup, plan);
    return;
  }
  setBusy(btn, true);
  toast("Opening secure Stripe checkout…", true);
  try {
    var res = await invoke("create-checkout", { lookup_key: lookup });
    if (res.status === 401) {
      var plan2 = lookup.split("_")[0];
      goSignup(lookup, plan2);
      return;
    }
    if (res.status === 503 || res.payload.code === "payments_not_configured") {
      toast("Payments are not configured yet. The site owner still needs to add the Stripe keys in Supabase.", false);
      return;
    }
    if (res.status === 409 || res.payload.code === "already_subscribed") {
      toast(res.payload.error || "You already have a subscription. Use Manage billing to change plans.", false);
      return;
    }
    if (res.payload && res.payload.url) {
      clearPending();
      window.location.href = res.payload.url;
      return;
    }
    toast(res.payload.error || "Checkout could not be started.", false);
  } catch (e) {
    toast("Checkout could not be started. Please try again.", false);
  } finally {
    setBusy(btn, false);
  }
}

async function startPortal(btn) {
  var session = await currentSession();
  if (!session) {
    window.location.href = "login.html?next=dashboard.html";
    return;
  }
  setBusy(btn, true);
  try {
    var res = await invoke("create-portal", {});
    if (res.status === 503 || res.payload.code === "payments_not_configured") {
      toast("Payments are not configured yet.", false);
      return;
    }
    if (res.payload && res.payload.url) {
      window.location.href = res.payload.url;
      return;
    }
    toast(res.payload.error || "Billing portal could not be opened.", false);
  } catch (e) {
    toast("Billing portal could not be opened.", false);
  } finally {
    setBusy(btn, false);
  }
}

function bind() {
  document.addEventListener("click", function (e) {
    var planBtn = e.target.closest && e.target.closest("[data-checkout-plan]");
    if (planBtn) {
      e.preventDefault();
      var plan = planBtn.getAttribute("data-checkout-plan");
      if (plan === "free") {
        window.location.href = "signup.html?plan=free";
        return;
      }
      startCheckout(lookupFor(plan, isYearly()), planBtn);
      return;
    }
    var topBtn = e.target.closest && e.target.closest("[data-checkout-topup]");
    if (topBtn) {
      e.preventDefault();
      var credits = topBtn.getAttribute("data-checkout-topup");
      startCheckout("topup_" + credits, topBtn);
      return;
    }
    var portalBtn = e.target.closest && e.target.closest("[data-manage-billing]");
    if (portalBtn) {
      e.preventDefault();
      startPortal(portalBtn);
    }
  });
}

async function resumePending() {
  var pending = getPending();
  if (!pending) return;
  var session = await currentSession();
  if (!session) return;
  // Only auto-resume on dashboard or pricing after a successful sign-in.
  var page = (document.body && document.body.getAttribute("data-page")) || "";
  var path = location.pathname || "";
  if (page !== "dashboard" && page !== "pricing" && !/dashboard\.html|pricing\.html/.test(path)) return;
  clearPending();
  await startCheckout(pending, null);
}

async function showSuccess() {
  try {
    var q = new URLSearchParams(location.search);
    if (q.get("checkout") !== "success") return;
    toast("Payment received. Your plan and credits will update in a few seconds — you can refresh if they have not yet.", true);
  } catch (e) { /* ignore */ }
}

bind();
showSuccess();
resumePending();

window.MSBilling = { startCheckout: startCheckout, startPortal: startPortal };
