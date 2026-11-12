/* MarketScope checkout — opens Stripe Payment Links (no secret key required). */
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

function linkFor(lookup) {
  var cfg = window.MS_STRIPE || {};
  return (cfg.links && lookup && cfg.links[lookup]) || "";
}

function portalLoginUrl() {
  var cfg = window.MS_STRIPE || {};
  return cfg.portalLoginUrl || "";
}

function withParams(base, params) {
  var u = new URL(base, window.location.href);
  Object.keys(params).forEach(function (k) {
    if (params[k]) u.searchParams.set(k, params[k]);
  });
  return u.toString();
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
  window.location.href = "signup.html?plan=" + encodeURIComponent(plan || "free");
}

function setBusy(el, on) {
  if (!el) return;
  el.disabled = !!on;
  if (on) el.setAttribute("data-busy", "1");
  else el.removeAttribute("data-busy");
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

function sessionIdentity(session) {
  var user = (session && session.user) || {};
  var email = user.email || (user.user_metadata && user.user_metadata.email) || "";
  return { id: user.id || "", email: email };
}

async function startCheckout(lookup, btn) {
  if (!lookup) return;
  var href = linkFor(lookup);
  if (!href) {
    toast("This plan is not available yet.", false);
    return;
  }
  var session = await currentSession();
  if (!session) {
    var plan = lookup.indexOf("topup_") === 0 ? "free" : lookup.split("_")[0];
    goSignup(lookup, plan);
    return;
  }
  var ident = sessionIdentity(session);
  setBusy(btn, true);
  toast("Opening secure Stripe checkout…", true);
  clearPending();
  window.location.href = withParams(href, {
    client_reference_id: ident.id,
    prefilled_email: ident.email
  });
}

async function startPortal(btn) {
  var href = portalLoginUrl();
  if (!href) {
    toast("Billing portal is not available yet.", false);
    return;
  }
  var session = await currentSession();
  if (!session) {
    window.location.href = "login.html?next=dashboard.html";
    return;
  }
  var ident = sessionIdentity(session);
  setBusy(btn, true);
  window.location.href = withParams(href, { prefilled_email: ident.email });
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
