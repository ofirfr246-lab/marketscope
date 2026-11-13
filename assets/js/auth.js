/* MarketScope auth — supabase-js v2 from a CDN, ES module, client-side only.
   If supabase-config.js placeholders are unset, this file must not throw and
   must not load the CDN client. Auth pages show “Accounts launching soon”. */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";

var SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
var REPORT_COST = 1;
var clientPromise = null;

/* ---------- urls (works on github.io subpaths) ---------- */
function siteBase() {
  var path = window.location.pathname || "/";
  var dir = path.replace(/\/[^/]*\.[A-Za-z0-9]+$/, "/");
  if (dir.charAt(dir.length - 1) !== "/") dir += "/";
  return window.location.origin + dir;
}

function pageUrl(file) {
  return siteBase() + file;
}

function currentFile() {
  var path = window.location.pathname || "";
  var m = path.match(/([^/]+\.html)$/i);
  return m ? m[1] : "index.html";
}

function pageKind() {
  return (document.body && document.body.getAttribute("data-page")) || "";
}

/* ---------- client ---------- */
function configured() {
  return isSupabaseConfigured();
}

async function getClient() {
  if (!configured()) return null;
  if (!clientPromise) {
    clientPromise = import(SUPABASE_CDN).then(function (mod) {
      return mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce"
        }
      });
    });
  }
  return clientPromise;
}

function friendlyError(err) {
  var msg = (err && (err.message || err.error_description)) || "Something went wrong. Please try again.";
  if (/invalid login|invalid credentials/i.test(msg)) return "Email or password is incorrect.";
  if (/already registered|user already/i.test(msg)) return "An account with this email already exists. Try logging in.";
  if (/email not confirmed/i.test(msg)) return "Please confirm your email before logging in. Check your inbox for the link.";
  if (/insufficient credits/i.test(msg)) return "You don’t have enough credits for a new report.";
  if (/not authenticated/i.test(msg)) return "Please log in again.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  if (/failed to fetch|network/i.test(msg)) return "Network error. Check your connection and try again.";
  return msg;
}

function $(sel, root) {
  return (root || document).querySelector(sel);
}

function $$(sel, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(sel));
}

function setMsg(el, text, ok) {
  if (!el) return;
  el.className = ok ? "form-msg ok" : "form-msg";
  el.textContent = text || "";
}

function showLaunchingNotice() {
  $$("[data-auth-notice]").forEach(function (n) {
    n.hidden = false;
  });
  $$("form[data-auth-form] button[type=submit], [data-oauth]").forEach(function (b) {
    b.disabled = true;
    b.setAttribute("title", "Accounts launching soon");
  });
}

function hideLaunchingNotice() {
  $$("[data-auth-notice]").forEach(function (n) {
    n.hidden = true;
  });
  $$("[data-auth-ready]").forEach(function (n) {
    n.hidden = false;
  });
}

function initials(profile, user) {
  var name = (profile && profile.display_name) || (user && (user.user_metadata && (user.user_metadata.display_name || user.user_metadata.full_name))) || (user && user.email) || "?";
  name = String(name).trim();
  var parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function displayName(profile, user) {
  return (profile && profile.display_name) || (user && user.user_metadata && (user.user_metadata.display_name || user.user_metadata.full_name)) || (user && user.email) || "there";
}

function planLabel(plan) {
  var id = (plan || "free").toLowerCase();
  var C = window.MS_CONFIG;
  if (C && C.plans) {
    for (var i = 0; i < C.plans.length; i++) {
      if (C.plans[i].id === id) return C.plans[i].name;
    }
  }
  return id.charAt(0).toUpperCase() + id.slice(1);
}

async function loadProfile(supabase, user) {
  var { data, error } = await supabase.from("profiles").select("id,email,display_name,plan,credits,stripe_customer_id,stripe_subscription_id,deletion_requested_at,created_at").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}

/* ---------- session-aware nav ---------- */
function bindAccountMenu(root) {
  if (!root) return;
  var btn = $(".account-btn", root);
  if (!btn) return;
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = root.classList.contains("open");
    $$(".account-menu.open").forEach(function (m) { m.classList.remove("open"); });
    root.classList.toggle("open", !open);
    btn.setAttribute("aria-expanded", String(!open));
  });
}

var navDocClickBound = false;
function bindNavDocClick() {
  if (navDocClickBound) return;
  navDocClickBound = true;
  document.addEventListener("click", function () {
    $$(".account-menu.open").forEach(function (m) {
      m.classList.remove("open");
      var b = $(".account-btn", m);
      if (b) b.setAttribute("aria-expanded", "false");
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    $$(".account-menu.open").forEach(function (m) {
      m.classList.remove("open");
      var b = $(".account-btn", m);
      if (b) b.setAttribute("aria-expanded", "false");
    });
  });
}

function renderSignedOutNav() {
  /* Default markup in the HTML is already Log in / Start free. Nothing to do
     unless we previously swapped it in this same load (we don't). */
}

function renderSignedInNav(user, profile) {
  var ini = initials(profile, user);
  var name = displayName(profile, user);
  var right = $(".nav-right");
  if (right) {
    right.innerHTML =
      '<div class="account-menu">' +
        '<button type="button" class="account-btn" aria-expanded="false" aria-haspopup="true" title="' + escapeHtml(name) + '">' +
          '<span class="avatar" aria-hidden="true">' + escapeHtml(ini) + "</span>" +
          '<span class="account-name">' + escapeHtml(name) + "</span>" +
          '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>' +
        "</button>" +
        '<div class="account-drop" role="menu">' +
          '<a href="dashboard.html" role="menuitem">Dashboard</a>' +
          '<a href="settings.html" role="menuitem">Settings</a>' +
          '<button type="button" class="link-btn" data-sign-out role="menuitem">Log out</button>' +
        "</div>" +
      "</div>";
    bindAccountMenu($(".account-menu", right));
  }

  var mob = $("#mobile-menu");
  if (mob) {
    var loginLink = mob.querySelector('a[href="login.html"]');
    var signupLink = mob.querySelector('a[href="signup.html"]');
    if (loginLink) {
      loginLink.setAttribute("href", "dashboard.html");
      loginLink.textContent = "Dashboard";
    }
    if (signupLink) {
      var wrap = document.createElement("div");
      wrap.className = "mob-auth";
      wrap.innerHTML =
        '<a href="settings.html">Settings</a>' +
        '<button type="button" class="btn btn-ghost btn-block" data-sign-out>Log out</button>';
      signupLink.replaceWith(wrap);
    }
  }

  $$("[data-sign-out]").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.preventDefault();
      signOut();
    });
  });
  bindNavDocClick();
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function signOut() {
  try {
    var supabase = await getClient();
    if (supabase) await supabase.auth.signOut();
  } catch (e) { /* still leave */ }
  window.location.href = pageUrl("index.html");
}

async function refreshNav() {
  if (!configured()) {
    renderSignedOutNav();
    return null;
  }
  try {
    var supabase = await getClient();
    if (!supabase) return null;
    var sessionRes = await supabase.auth.getSession();
    var session = sessionRes && sessionRes.data && sessionRes.data.session;
    if (!session) {
      renderSignedOutNav();
      return null;
    }
    var profile = null;
    try { profile = await loadProfile(supabase, session.user); } catch (e) { profile = null; }
    renderSignedInNav(session.user, profile);
    return { supabase: supabase, session: session, profile: profile };
  } catch (e) {
    renderSignedOutNav();
    return null;
  }
}

/* ---------- password strength ---------- */
function passwordStrength(pw) {
  var score = 0;
  if (!pw) return { label: "Too short", level: 0, hint: "Use at least 8 characters." };
  if (pw.length >= 8) score += 1; else return { label: "Too short", level: 0, hint: "Use at least 8 characters." };
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (score <= 2) return { label: "Weak", level: 1, hint: "Add a number, a symbol, or mix upper and lower case." };
  if (score <= 3) return { label: "Fair", level: 2, hint: "Good start. A longer password or a symbol will make it stronger." };
  return { label: "Strong", level: 3, hint: "Strong password." };
}

function bindStrength(input, meter) {
  if (!input || !meter) return;
  var bar = meter.querySelector("[data-pw-bar]");
  var label = meter.querySelector("[data-pw-label]");
  function paint() {
    var s = passwordStrength(input.value);
    meter.setAttribute("data-level", String(s.level));
    if (bar) bar.style.width = (s.level / 3 * 100) + "%";
    if (label) label.textContent = input.value ? (s.label + " — " + s.hint) : "Use at least 8 characters, mixing letters and numbers.";
  }
  input.addEventListener("input", paint);
  paint();
}

/* ---------- OAuth ---------- */
async function signInWithGoogle(redirectFile) {
  if (!configured()) return { error: { message: "Accounts launching soon." } };
  var supabase = await getClient();
  var { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: pageUrl(redirectFile || "dashboard.html") }
  });
  return { error: error };
}

/* ---------- auth pages ---------- */
function bindOAuthButtons() {
  $$("[data-oauth='google']").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      if (!configured()) {
        showLaunchingNotice();
        return;
      }
      btn.disabled = true;
      var msg = btn.closest(".auth-form, form, .auth") ? $(" .form-msg", btn.closest(".auth-form") || document) : $(".form-msg");
      try {
        var res = await signInWithGoogle("dashboard.html");
        if (res.error) {
          setMsg(msg, friendlyError(res.error), false);
          btn.disabled = false;
        }
      } catch (e) {
        setMsg(msg, friendlyError(e), false);
        btn.disabled = false;
      }
    });
  });
}

async function initLogin() {
  bindOAuthButtons();
  var form = $("form[data-auth-form='login']");
  var forgotForm = $("form[data-auth-form='forgot']");
  var forgotToggle = $("[data-forgot-toggle]");
  var forgotPanel = $("[data-forgot-panel]");

  if (!configured()) {
    showLaunchingNotice();
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); showLaunchingNotice(); });
    if (forgotForm) forgotForm.addEventListener("submit", function (e) { e.preventDefault(); showLaunchingNotice(); });
    return;
  }
  hideLaunchingNotice();

  var supabase = await getClient();
  var sessionRes = await supabase.auth.getSession();
  if (sessionRes.data && sessionRes.data.session) {
    var next = (new URLSearchParams(location.search).get("next") || "dashboard.html").replace(/[^A-Za-z0-9._-]/g, "");
    if (!/\.html$/.test(next)) next = "dashboard.html";
    window.location.replace(pageUrl(next));
    return;
  }

  if (forgotToggle && forgotPanel) {
    forgotToggle.addEventListener("click", function (e) {
      e.preventDefault();
      var open = forgotPanel.hidden;
      forgotPanel.hidden = !open;
      if (open) {
        var input = $("#f-email", forgotPanel) || $("input[type=email]", forgotPanel);
        if (input) input.focus();
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = ($("#l-email") || form.email).value.trim();
      var password = ($("#l-pass") || form.password).value;
      var msg = $(".form-msg", form);
      var btn = $("button[type=submit]", form);
      if (!email || !password) { setMsg(msg, "Enter your email and password."); return; }
      btn.disabled = true;
      setMsg(msg, "Signing in…", true);
      try {
        var { error } = await supabase.auth.signInWithPassword({ email: email, password: password });
        if (error) { setMsg(msg, friendlyError(error), false); btn.disabled = false; return; }
        var next = (new URLSearchParams(location.search).get("next") || "dashboard.html").replace(/[^A-Za-z0-9._-]/g, "");
        if (!/\.html$/.test(next)) next = "dashboard.html";
        window.location.href = pageUrl(next);
      } catch (err) {
        setMsg(msg, friendlyError(err), false);
        btn.disabled = false;
      }
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = ($("#f-email") || forgotForm.email).value.trim();
      var msg = $(".form-msg", forgotForm);
      var btn = $("button[type=submit]", forgotForm);
      if (!email) { setMsg(msg, "Enter the email on your account."); return; }
      btn.disabled = true;
      try {
        var { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: pageUrl("reset-password.html")
        });
        if (error) { setMsg(msg, friendlyError(error), false); btn.disabled = false; return; }
        setMsg(msg, "If an account exists for " + email + ", we’ve sent a reset link. Check your inbox and spam folder.", true);
        btn.disabled = false;
      } catch (err) {
        setMsg(msg, friendlyError(err), false);
        btn.disabled = false;
      }
    });
  }
}

async function initSignup() {
  showImportPending();
  bindOAuthButtons();
  var form = $("form[data-auth-form='signup']");
  bindStrength($("#s-pass"), $("[data-pw-meter]"));

  if (!configured()) {
    showLaunchingNotice();
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); showLaunchingNotice(); });
    return;
  }
  hideLaunchingNotice();

  var supabase = await getClient();
  var sessionRes = await supabase.auth.getSession();
  if (sessionRes.data && sessionRes.data.session) {
    window.location.replace(pageUrl("dashboard.html") + importQuery());
    return;
  }

  if (!form) return;
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var name = ($("#s-name") || form.name).value.trim();
    var email = ($("#s-email") || form.email).value.trim();
    var password = ($("#s-pass") || form.password).value;
    var confirm = ($("#s-pass2") || {}).value || "";
    var terms = form.querySelector("input[type=checkbox]");
    var planEl = form.querySelector("input[name=plan]:checked");
    var plan = planEl ? planEl.value : "free";
    var msg = $(".form-msg", form);
    var btn = $("button[type=submit]", form);

    if (!name) { setMsg(msg, "Please enter your name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setMsg(msg, "Please enter a valid email address."); return; }
    if (password.length < 8) { setMsg(msg, "Password must be at least 8 characters."); return; }
    if (password !== confirm) { setMsg(msg, "Passwords don’t match."); if ($("#s-pass2")) $("#s-pass2").focus(); return; }
    if (terms && !terms.checked) { setMsg(msg, "Please agree to the Terms and Privacy Policy."); return; }

    btn.disabled = true;
    setMsg(msg, "Creating your account…", true);
    try {
      var { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          emailRedirectTo: pageUrl("dashboard.html"),
          data: { display_name: name, intended_plan: plan }
        }
      });
      if (error) { setMsg(msg, friendlyError(error), false); btn.disabled = false; return; }
      if (data && data.session) {
        window.location.href = pageUrl("dashboard.html") + importQuery();
        return;
      }
      form.hidden = true;
      var done = $("[data-signup-done]");
      if (done) {
        done.hidden = false;
        var slot = $("[data-signup-email]", done);
        if (slot) slot.textContent = email;
      } else {
        setMsg(msg, "Check your inbox at " + email + " to confirm your account, then log in.", true);
      }
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
      btn.disabled = false;
    }
  });
}

async function initReset() {
  var form = $("form[data-auth-form='reset']");
  bindStrength($("#r-pass"), $("[data-pw-meter]"));

  if (!configured()) {
    showLaunchingNotice();
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); showLaunchingNotice(); });
    return;
  }
  hideLaunchingNotice();

  var supabase = await getClient();
  var ready = false;
  var waiting = $("[data-reset-waiting]");
  var msg0 = form ? $(".form-msg", form) : null;

  supabase.auth.onAuthStateChange(function (event) {
    if (event === "PASSWORD_RECOVERY") {
      ready = true;
      if (waiting) waiting.hidden = true;
      if (form) form.hidden = false;
    }
  });

  /* Recovery links land with tokens in the URL. getSession() also hydrates them. */
  try {
    var sessionRes = await supabase.auth.getSession();
    if (sessionRes.data && sessionRes.data.session) {
      ready = true;
      if (waiting) waiting.hidden = true;
      if (form) form.hidden = false;
    }
  } catch (e) { /* keep waiting state */ }

  if (!ready) {
    if (waiting) waiting.hidden = false;
    if (form) form.hidden = true;
    window.setTimeout(function () {
      if (ready) return;
      if (waiting) {
        waiting.innerHTML = "<b>This reset link is missing or has expired.</b> Go back to <a class='amber' href='login.html'>log in</a> and request a new one.";
      }
    }, 2500);
  }

  if (!form) return;
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var password = ($("#r-pass") || form.password).value;
    var confirm = ($("#r-pass2") || {}).value || "";
    var msg = $(".form-msg", form);
    var btn = $("button[type=submit]", form);
    if (password.length < 8) { setMsg(msg, "Password must be at least 8 characters."); return; }
    if (password !== confirm) { setMsg(msg, "Passwords don’t match."); return; }
    if (!ready) { setMsg(msg, "This reset link is missing or has expired. Request a new one from the login page."); return; }
    btn.disabled = true;
    try {
      var { error } = await supabase.auth.updateUser({ password: password });
      if (error) { setMsg(msg, friendlyError(error), false); btn.disabled = false; return; }
      setMsg(msg, "Password updated. Taking you to your dashboard…", true);
      window.setTimeout(function () { window.location.href = pageUrl("dashboard.html"); }, 700);
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
      btn.disabled = false;
    }
  });
}

/* ---------- sample report (data providers are not connected yet) ---------- */
function showImportPending() {
  var Imp = window.MSImport;
  if (!Imp) return null;
  var url = Imp.consume();
  if (!url) return null;
  var box = $("[data-import-pending]");
  if (box) {
    box.hidden = false;
    var slot = $("[data-import-url]", box);
    if (slot) slot.textContent = url;
  }
  return url;
}

function importQuery() {
  var Imp = window.MSImport;
  var url = Imp ? Imp.consume() : "";
  return url ? ("?url=" + encodeURIComponent(url) + "&tab=link") : "";
}

function buildSampleReport(product, market, meta) {
  meta = meta || {};
  return {
    sample: true,
    banner: "SAMPLE OUTPUT — data providers are not connected yet. Figures are illustrative examples, not real market measurements.",
    product: product,
    market: market,
    generated_at: new Date().toISOString(),
    sources_note: "When data sources are connected, a live report will use the sources included in your plan.",
    scores: { demand: 81, competition: 64, saturation: 52, opportunity: 74 },
    verdict: "BUY",
    confidence: "Example only",
    source: meta.source || null,
    sourceName: meta.sourceName || null,
    source_url: meta.source_url || null,
    advisor: "This is labelled example output for “" + product + "” in " + market + ". MarketScope is not measuring live demand, prices or ads for this query yet. The scores, verdict and commentary below reuse the site’s public sample pattern so you can see how a report will look. Do not use these figures to make buying, selling or advertising decisions.",
    opportunities: [
      "Example: look for a less crowded price band once live data is connected.",
      "Example: seasonality and review themes will appear here from source data.",
      "Example: gaps called out by the AI Advisor will be based on the actual listing set."
    ],
    risks: [
      "Example: concentration among top sellers will be measured from live listings.",
      "Example: ad-cost pressure will come from connected ad libraries on paid plans.",
      "Live measurements may differ substantially from this sample."
    ]
  };
}

function verdictClass(v) {
  var x = String(v || "").toUpperCase().replace(/\s+/g, "");
  if (x === "STRONGBUY") return "v-sbuy";
  if (x === "BUY") return "v-buy";
  if (x === "HOLD") return "v-hold";
  if (x === "UNDERPERFORM") return "v-under";
  if (x === "AVOID") return "v-avoid";
  return "v-hold";
}

function formatWhen(iso) {
  try {
    var d = new Date(iso);
    return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (e) { return iso || ""; }
}

/* ---------- dashboard ---------- */
async function initDashboard() {
  var gate = $("[data-dash-gate]");
  if (!configured()) {
    if (gate) gate.hidden = true;
    var shell = $("[data-dash-shell]");
    if (shell) shell.hidden = false;
    var errBox = $("[data-dash-error]");
    if (errBox) { errBox.hidden = false; errBox.className = "note"; errBox.innerHTML = "<b>Accounts launching soon.</b> This is a preview of your desk. Sign-in and credits will activate after the owner adds the Supabase keys."; }
    /* Still wire client-side Paste & Analyze detection so the UI works in preview. */
    $$("[data-report-tab]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-report-tab");
        $$("[data-report-tab]").forEach(function (x) { x.classList.toggle("active", x === b); });
        $$("[data-tab-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-tab-panel") !== id; });
      });
    });
    var Imp = window.MSImport;
    var importForm = $("form[data-auth-form='import-report']");
    if (importForm && Imp) {
      Imp.bindInput($("#ir-url", importForm), $("[data-source-chip]", importForm), $(".form-msg", importForm));
      importForm.addEventListener("submit", function (e) { e.preventDefault(); setMsg($(".form-msg", importForm), "Accounts launching soon. Reports will save here once keys are set."); });
    }
    var form = $("form[data-auth-form='new-report']");
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); setMsg($(".form-msg", form), "Accounts launching soon. Reports will save here once keys are set."); });
    return;
  }
  var supabase;
  try { supabase = await getClient(); } catch (e) {
    window.location.replace(pageUrl("login.html") + "?next=dashboard.html");
    return;
  }
  var sessionRes = await supabase.auth.getSession();
  var session = sessionRes.data && sessionRes.data.session;
  if (!session) {
    window.location.replace(pageUrl("login.html") + "?next=dashboard.html");
    return;
  }
  if (gate) gate.hidden = true;
  var shell = $("[data-dash-shell]");
  if (shell) shell.hidden = false;

  var profile = null;
  try { profile = await loadProfile(supabase, session.user); } catch (e) { profile = null; }

  var welcome = $("[data-welcome]");
  if (welcome) welcome.textContent = "Welcome back, " + displayName(profile, session.user);

  function paintProfile(p) {
    profile = p || profile;
    var credits = profile && typeof profile.credits === "number" ? profile.credits : "—";
    var plan = planLabel(profile && profile.plan);
    $$("[data-credit-balance]").forEach(function (el) { el.textContent = String(credits); });
    $$("[data-plan-name]").forEach(function (el) { el.textContent = plan; });
    var sub = $("[data-plan-note]");
    if (sub) {
      if (profile && profile.plan && profile.plan !== "free") sub.textContent = "Billed plan. Monthly credits refresh when Stripe confirms each renewal.";
      else sub.textContent = "Free plan includes 5 one-time credits. Upgrade or buy a credit pack from Pricing — paid credits are applied after Stripe confirms payment.";
    }
    var bill = document.querySelector("[data-manage-billing]");
    if (bill) bill.hidden = !(window.MS_STRIPE && window.MS_STRIPE.portalLoginUrl);
  }
  paintProfile(profile);

  try {
    if (new URLSearchParams(location.search).get("checkout") === "success") {
      var tries = 0;
      var poll = window.setInterval(async function () {
        tries += 1;
        try {
          var fresh = await loadProfile(supabase, session.user);
          paintProfile(fresh);
        } catch (e) { /* ignore */ }
        if (tries >= 6) window.clearInterval(poll);
      }, 2000);
    }
  } catch (e) { /* ignore */ }

  async function loadReports() {
    var { data, error } = await supabase.from("reports").select("id,product,market,cost,source,source_url,verdict,scores,content,result,is_example,status,created_at").order("created_at", { ascending: false }).limit(25);
    if (error) throw error;
    return data || [];
  }

  function renderList(rows) {
    var list = $("[data-report-list]");
    var empty = $("[data-report-empty]");
    var count = $("[data-report-count]");
    if (count) count.textContent = String(rows.length);
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = rows.map(function (r) {
      var scores = r.scores || (r.content && r.content.scores) || {};
      var opp = scores.opportunity != null ? scores.opportunity : "—";
      return '<button type="button" class="report-row" data-report-id="' + escapeHtml(r.id) + '">' +
        '<span class="report-row-main"><b>' + escapeHtml(r.product) + '</b><span class="muted"> · ' + escapeHtml(r.market) + "</span></span>" +
        '<span class="pill ' + verdictClass(r.verdict) + '">' + escapeHtml(r.verdict || "SAMPLE") + "</span>" +
        '<span class="mono muted">Opp ' + escapeHtml(String(opp)) + "</span>" +
        '<span class="mono muted">' + escapeHtml(formatWhen(r.created_at)) + "</span>" +
        "</button>";
    }).join("");
    $$("[data-report-id]", list).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = rows.filter(function (r) { return r.id === btn.getAttribute("data-report-id"); })[0];
        if (row) showReport(row);
      });
    });
  }

  function isLiveReport(row) {
    var c = (row && (row.content || row.result)) || {};
    if (row && row.is_example === false && c.sample !== true) return true;
    if (row && row.is_example === true) return false;
    if (c.is_example === false && c.sample !== true) return true;
    return false;
  }

  function formatMoney(n, currency) {
    if (n == null || n === "" || isNaN(Number(n))) return "—";
    var cur = currency || "USD";
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: Number(n) >= 100 ? 0 : 2 }).format(Number(n));
    } catch (e) {
      return cur + " " + Number(n);
    }
  }

  function priceBandHtml(c) {
    var p = c.prices || {};
    if (p.min == null && p.median == null && p.max == null) return "";
    var currency = p.currency || "USD";
    var min = p.min, med = p.median, max = p.max;
    var band = p.recommended_band || {};
    var span = (max != null && min != null && max > min) ? (max - min) : 0;
    function pct(v) {
      if (v == null || !span) return 0;
      return Math.max(0, Math.min(100, ((v - min) / span) * 100));
    }
    var fillLeft = band.low != null ? pct(band.low) : 25;
    var fillRight = band.high != null ? pct(band.high) : 55;
    var midTick = med != null ? pct(med) : 50;
    return '<div class="price-band">' +
      "<h3>Price range</h3>" +
      '<div class="price-track">' +
        '<span class="fill" style="left:' + fillLeft + "%;width:" + Math.max(4, fillRight - fillLeft) + '%"></span>' +
        '<span class="tick" style="left:' + midTick + '%"></span>' +
      "</div>" +
      '<div class="price-ticks"><span>Min ' + escapeHtml(formatMoney(min, currency)) + "</span><span>Median " + escapeHtml(formatMoney(med, currency)) + "</span><span>Max " + escapeHtml(formatMoney(max, currency)) + "</span></div>" +
      (band.low != null
        ? "<p>Recommended selling band: <b class=\"amber\">" + escapeHtml(formatMoney(band.low, currency)) + "–" + escapeHtml(formatMoney(band.high, currency)) + "</b>" +
          (p.recommended_rule ? " · " + escapeHtml(p.recommended_rule) : "") + "</p>"
        : "") +
    "</div>";
  }

  function competitorsHtml(c) {
    var rows = c.competitors || [];
    if (!rows.length) return "";
    var currency = (c.prices && c.prices.currency) || "USD";
    var body = rows.map(function (r) {
      return "<tr><td>" + escapeHtml(r.seller || r.domain || "—") + "</td>" +
        "<td>" + escapeHtml(String(r.listings != null ? r.listings : "—")) + "</td>" +
        "<td>" + escapeHtml(r.share != null ? Math.round(r.share * 100) + "%" : "—") + "</td>" +
        "<td>" + escapeHtml(formatMoney(r.median_price != null ? r.median_price : r.min_price, currency)) + "</td>" +
        "<td>" + escapeHtml(r.reviews != null ? String(r.reviews) : "—") + "</td></tr>";
    }).join("");
    return "<h3 class=\"mono\" style=\"margin:20px 0 8px;color:var(--dim);font-size:.78rem;letter-spacing:.06em\">Top competitors / stores</h3>" +
      '<div class="comp-wrap"><table class="comp-table"><thead><tr><th>Seller</th><th>Listings</th><th>Share</th><th>Typical price</th><th>Reviews</th></tr></thead><tbody>' + body + "</tbody></table></div>";
  }

  function relatedHtml(c) {
    var rows = c.related_keywords || [];
    if (!rows.length) return "";
    return "<h3 class=\"mono\" style=\"margin:16px 0 0;color:var(--dim);font-size:.78rem;letter-spacing:.06em\">Related search terms</h3>" +
      '<ul class="kw-list">' + rows.slice(0, 10).map(function (k) {
        var label = (k.keyword || "") + (k.search_volume != null ? " · " + Number(k.search_volume).toLocaleString("en-US") : "");
        return "<li>" + escapeHtml(label) + "</li>";
      }).join("") + "</ul>";
  }

  function showReport(row) {
    var panel = $("[data-report-view]");
    if (!panel) return;
    var c = row.content || row.result || {};
    var scores = row.scores || c.scores || {};
    var live = isLiveReport(row);
    var bannerClass = live ? "banner-live" : "banner-ex";
    var bannerText = c.banner || (live
      ? "Live data via Google Shopping & Search"
      : "SAMPLE OUTPUT — data providers are not connected yet. Figures are illustrative examples, not real market measurements.");
    var creditLabel = row.cost ? (String(row.cost) + " credit") : "preview";
    var kindLabel = live ? "live data via Google Shopping & Search" : "labelled sample";
    panel.hidden = false;
    panel.innerHTML =
      '<div class="' + bannerClass + '">' + escapeHtml(bannerText) + "</div>" +
      '<div class="report-view-head">' +
        "<div><h2>" + escapeHtml(row.product || c.product || "") + ' <span class="muted">·</span> <span class="amber">' + escapeHtml(row.market || c.market || "") + "</span></h2>" +
        '<p class="mono muted" style="margin:0">Generated ' + escapeHtml(formatWhen(row.created_at || c.generated_at)) + " · " + escapeHtml(creditLabel) + " · " + escapeHtml(kindLabel) + (row.source || row.source_url ? " · " + escapeHtml((row.source || "link")) + (row.source_url ? " · " + escapeHtml(row.source_url) : "") : "") + "</p></div>" +
        '<div class="big-verdict panel"><div class="label mono">VERDICT</div><div class="verdict mono" data-verdict="' + escapeHtml(row.verdict || c.verdict || "HOLD") + '">' + escapeHtml(row.verdict || c.verdict || "HOLD") + "</div>" +
        '<div class="opp"><span class="mono big g">' + escapeHtml(String(scores.opportunity != null ? scores.opportunity : "—")) + '</span><span class="mono small">/100<br>OPPORTUNITY</span></div></div>' +
      "</div>" +
      '<div class="score-grid compact">' +
        scoreCard("Demand", scores.demand, live) +
        scoreCard("Competition", scores.competition, live) +
        scoreCard("Saturation", scores.saturation, live) +
        scoreCard("Opportunity", scores.opportunity, live) +
      "</div>" +
      (live ? priceBandHtml(c) : "") +
      (live ? '<div class="tv-wrap" data-live-demand-chart></div><div data-live-price-hist></div>' : "") +
      (live ? competitorsHtml(c) : "") +
      (live ? relatedHtml(c) : "") +
      '<div class="advisor-box"><h3>AI Advisor' + (live ? "" : " · SAMPLE") + "</h3><p>" + escapeHtml(c.advisor || "") + "</p></div>" +
      '<button type="button" class="btn btn-ghost btn-sm" data-close-report>Close</button>';
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    var close = $("[data-close-report]", panel);
    if (close) close.addEventListener("click", function () { panel.hidden = true; });
    if (live && window.MSTrading) {
      var months = (c.demand_detail && c.demand_detail.monthly_searches) || [];
      var samples = (c.prices && (c.prices.samples || c.prices.price_samples)) || [];
      if (!samples.length && c.listings) {
        samples = c.listings.map(function (L) { return L.price; }).filter(function (n) { return n != null; });
      }
      window.MSTrading.mountDemandChart(panel.querySelector("[data-live-demand-chart]"), { monthly_searches: months, timeframe: "12M", height: 340 });
      window.MSTrading.mountPriceHistogram(panel.querySelector("[data-live-price-hist]"), {
        samples: samples,
        currency: (c.prices && c.prices.currency) || "USD",
        band: c.prices && c.prices.recommended_band
      });
    }
  }

  function scoreCard(label, value, live) {
    var v = value != null ? value : "—";
    return '<div class="score-card"><div class="ring-plain mono">' + escapeHtml(String(v)) + '</div><div><h3>' + escapeHtml(label) + "</h3><p class='muted'>" + (live ? "Live score" : "Sample score") + "</p></div></div>";
  }

  try {
    renderList(await loadReports());
  } catch (e) {
    var errBox = $("[data-dash-error]");
    if (errBox) { errBox.hidden = false; errBox.textContent = "Could not load reports: " + friendlyError(e); }
  }

  async function parseFnError(inv) {
    var payload = inv && inv.data;
    var status = null;
    var err = inv && inv.error;
    if (err && err.context) {
      status = err.context.status || status;
      if (!payload && typeof err.context.json === "function") {
        try { payload = await err.context.json(); } catch (e) { /* ignore */ }
      } else if (!payload && typeof err.context.clone === "function") {
        try { payload = await err.context.clone().json(); } catch (e2) { /* ignore */ }
      }
    }
    if (!payload && err && err.message) {
      try { payload = JSON.parse(err.message); } catch (e3) { /* ignore */ }
    }
    return { payload: payload || {}, status: status, message: (payload && payload.error) || (err && err.message) || "The report could not be run." };
  }

  async function runReport(opts) {
    var product = opts.product, market = opts.market, form = opts.form, source = opts.source || null, sourceUrl = opts.source_url || null;
    var msg = $(".form-msg", form);
    var btn = $("button[type=submit]", form);
    if (!market) { setMsg(msg, "Choose a market."); return; }
    if (!product && !sourceUrl) { setMsg(msg, "Enter a product or paste a product link."); return; }
    var have = profile && typeof profile.credits === "number" ? profile.credits : 0;
    if (have < REPORT_COST) { setMsg(msg, "You need at least " + REPORT_COST + " credit to run a report. Upgrade or add a credit pack from Pricing."); return; }
    btn.disabled = true;
    if (form && form.classList) form.classList.add("report-loading");
    setMsg(msg, "Gathering live Google Shopping and Search data… this can take up to a minute.", true);
    try {
      var inv = await supabase.functions.invoke("analyze", {
        body: { product: product || "", market: market, source: source, source_url: sourceUrl || null }
      });
      var parsed = inv.error ? await parseFnError(inv) : { payload: inv.data || {}, status: 200 };
      var payload = parsed.payload || {};
      var code = payload.code;
      var status = parsed.status;
      if (payload.report && (!inv.error || status === 207 || code === "persist_failed")) {
        if (typeof payload.credits === "number") paintProfile(Object.assign({}, profile, { credits: payload.credits }));
        if (form && form.reset) form.reset();
        setMsg(msg, payload.error || "Report saved. Live data via Google Shopping & Search.", !payload.error);
        try { renderList(await loadReports()); } catch (e2) { /* list refresh best-effort */ }
        showReport(payload.report);
        return;
      }
      if (status === 503 || code === "provider_not_configured") {
        var sample = buildSampleReport(product || "this product", market, { source: source, source_url: sourceUrl });
        setMsg(msg, "Live data is being connected. Showing a labelled example so you can preview the report. You were not charged.", true);
        showReport({
          product: sample.product,
          market: sample.market,
          cost: 0,
          source: source,
          source_url: sourceUrl,
          verdict: sample.verdict,
          scores: sample.scores,
          content: sample,
          is_example: true,
          status: "complete",
          created_at: sample.generated_at
        });
        return;
      }
      if (status === 401 || code === "unauthorized") {
        setMsg(msg, "Please sign in again to run a live report.");
        return;
      }
      if (status === 402 || code === "insufficient_credits") {
        setMsg(msg, payload.error || "You need at least " + REPORT_COST + " credit to run a report.");
        return;
      }
      if (status === 429 || code === "rate_limited") {
        setMsg(msg, payload.error || "You can run at most 20 reports per hour. Try again later.");
        return;
      }
      setMsg(msg, payload.error || parsed.message || "The report could not be run.");
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
    } finally {
      btn.disabled = false;
      if (form && form.classList) form.classList.remove("report-loading");
      try {
        var fresh = await loadProfile(supabase, session.user);
        paintProfile(fresh);
      } catch (e3) { /* ignore */ }
    }
  }

  function setTab(id) {
    $$("[data-report-tab]").forEach(function (b) {
      var on = b.getAttribute("data-report-tab") === id;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    $$("[data-tab-panel]").forEach(function (p) {
      p.hidden = p.getAttribute("data-tab-panel") !== id;
    });
  }
  $$("[data-report-tab]").forEach(function (b) {
    b.addEventListener("click", function () { setTab(b.getAttribute("data-report-tab")); });
  });

  var Imp = window.MSImport;
  var pendingUrl = Imp ? Imp.consume() : "";
  try {
    var tabQ = new URLSearchParams(location.search).get("tab");
    if (tabQ === "describe") setTab("describe");
    else if (pendingUrl || tabQ === "link") setTab("link");
    else if (readPrefs().defaultTab === "describe") setTab("describe");
  } catch (e) { /* keep default */ }
  applyDefaultMarket();

  var importForm = $("form[data-auth-form='import-report']");
  if (importForm && Imp) {
    var urlInput = $("#ir-url", importForm);
    var chip = $("[data-source-chip]", importForm);
    var card = $("[data-detect-card]", importForm);
    function paintDetect() {
      var info = urlInput && urlInput.value ? Imp.detect(urlInput.value) : null;
      if (!info || !info.ok) {
        if (card) card.hidden = true;
        return info;
      }
      if (card) {
        card.hidden = false;
        var s = $("[data-detect-source]", card); if (s) s.textContent = info.sourceName + (info.sourceGuessed ? " (pattern guess)" : "");
        var pr = $("[data-detect-product]", card); if (pr) pr.textContent = info.product || "Not detected from the URL";
        var mk = $("[data-detect-market]", card); if (mk) mk.textContent = info.market || "Not detected from the URL";
      }
      var pIn = $("#ir-product");
      var mIn = $("#ir-market");
      if (pIn && info.product && !pIn.value) pIn.value = info.product;
      if (mIn && info.market) {
        var found = false;
        Array.prototype.forEach.call(mIn.options, function (o) { if (o.value === info.market) found = true; });
        if (found) mIn.value = info.market;
      }
      return info;
    }
    Imp.bindInput(urlInput, chip, $(".form-msg", importForm));
    if (urlInput) urlInput.addEventListener("input", paintDetect);
    if (pendingUrl && urlInput) { urlInput.value = pendingUrl; paintDetect(); }
    importForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var info = Imp.detect(urlInput && urlInput.value);
      if (!info || !info.ok) { setMsg($(".form-msg", importForm), (info && info.error) || "Paste a valid product link."); return; }
      var product = (($("#ir-product") || {}).value || info.product || "").trim();
      var market = (($("#ir-market") || {}).value || info.market || "").trim();
      if (!market) { setMsg($(".form-msg", importForm), "Choose a market."); return; }
      await runReport({ product: product, market: market, form: importForm, source: info.source, source_url: info.url, sourceName: info.sourceName });
    });
  }

  var form = $("form[data-auth-form='new-report']");
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      await runReport({
        product: (($("#nr-product") || form.product).value || "").trim(),
        market: (($("#nr-market") || form.market).value || "").trim(),
        form: form
      });
    });
  }
}

/* ---------- account ---------- */
async function initAccount() {
  if (!configured()) {
    window.location.replace(pageUrl("login.html") + "?next=account.html");
    return;
  }
  var supabase;
  try { supabase = await getClient(); } catch (e) {
    window.location.replace(pageUrl("login.html") + "?next=account.html");
    return;
  }
  var sessionRes = await supabase.auth.getSession();
  var session = sessionRes.data && sessionRes.data.session;
  if (!session) {
    window.location.replace(pageUrl("login.html") + "?next=account.html");
    return;
  }
  var gate = $("[data-account-gate]");
  if (gate) gate.hidden = true;
  var shell = $("[data-account-shell]");
  if (shell) shell.hidden = false;

  var profile = null;
  try { profile = await loadProfile(supabase, session.user); } catch (e) { profile = null; }

  var nameInput = $("#a-name");
  var emailInput = $("#a-email");
  if (nameInput) nameInput.value = (profile && profile.display_name) || (session.user.user_metadata && session.user.user_metadata.display_name) || "";
  if (emailInput) emailInput.value = session.user.email || (profile && profile.email) || "";
  $$("[data-plan-name]").forEach(function (el) { el.textContent = planLabel(profile && profile.plan); });
  $$("[data-credit-balance]").forEach(function (el) { el.textContent = profile && profile.credits != null ? String(profile.credits) : "—"; });

  if (profile && profile.deletion_requested_at) {
    var delNote = $("[data-delete-requested]");
    if (delNote) {
      delNote.hidden = false;
      delNote.textContent = "A deletion request was recorded on " + formatWhen(profile.deletion_requested_at) + ". We’ll process it and follow up at your account email.";
    }
  }

  var nameForm = $("form[data-auth-form='name']");
  if (nameForm) nameForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var name = (nameInput && nameInput.value.trim()) || "";
    var msg = $(".form-msg", nameForm);
    var btn = $("button[type=submit]", nameForm);
    if (!name) { setMsg(msg, "Enter a display name."); return; }
    btn.disabled = true;
    try {
      var up1 = await supabase.auth.updateUser({ data: { display_name: name } });
      if (up1.error) throw up1.error;
      var up2 = await supabase.from("profiles").update({ display_name: name }).eq("id", session.user.id);
      if (up2.error) throw up2.error;
      setMsg(msg, "Display name updated.", true);
      await refreshNav();
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
    }
    btn.disabled = false;
  });

  var emailForm = $("form[data-auth-form='email']");
  if (emailForm) emailForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var email = (emailInput && emailInput.value.trim()) || "";
    var msg = $(".form-msg", emailForm);
    var btn = $("button[type=submit]", emailForm);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setMsg(msg, "Enter a valid email address."); return; }
    btn.disabled = true;
    try {
      var { error } = await supabase.auth.updateUser({ email: email });
      if (error) throw error;
      setMsg(msg, "Check your inbox to confirm the new email address. The change is applied after you follow the link.", true);
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
    }
    btn.disabled = false;
  });

  var passForm = $("form[data-auth-form='password']");
  bindStrength($("#a-pass"), $("[data-pw-meter]"));
  if (passForm) passForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var pw = ($("#a-pass") || {}).value || "";
    var pw2 = ($("#a-pass2") || {}).value || "";
    var msg = $(".form-msg", passForm);
    var btn = $("button[type=submit]", passForm);
    if (pw.length < 8) { setMsg(msg, "Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setMsg(msg, "Passwords don’t match."); return; }
    btn.disabled = true;
    try {
      var { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      passForm.reset();
      setMsg(msg, "Password updated.", true);
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
    }
    btn.disabled = false;
  });

  var delForm = $("form[data-auth-form='delete']");
  if (delForm) delForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var confirmInput = $("#a-delete-confirm");
    var msg = $(".form-msg", delForm);
    var btn = $("button[type=submit]", delForm);
    if (!confirmInput || confirmInput.value.trim().toUpperCase() !== "DELETE") {
      setMsg(msg, "Type DELETE to confirm the request.");
      return;
    }
    btn.disabled = true;
    try {
      var { error } = await supabase.from("profiles").update({ deletion_requested_at: new Date().toISOString() }).eq("id", session.user.id);
      if (error) throw error;
      var note = $("[data-delete-requested]");
      if (note) { note.hidden = false; note.textContent = "Your deletion request has been recorded. We’ll process it and follow up at your account email. You can keep using the account until it is closed."; }
      setMsg(msg, "Deletion request recorded. This does not immediately erase the account.", true);
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
    }
    btn.disabled = false;
  });

  $$("[data-sign-out]").forEach(function (b) {
    if (b.closest(".nav, .mobile-menu")) return;
    b.addEventListener("click", function (e) { e.preventDefault(); signOut(); });
  });
}

/* ---------- device preferences (set on settings.html) ---------- */
function readPrefs() {
  try { return JSON.parse(localStorage.getItem("ms_prefs") || "{}") || {}; } catch (e) { return {}; }
}
function applyDefaultMarket() {
  var m = readPrefs().defaultMarket;
  if (!m) return;
  $$("#ir-market, #nr-market").forEach(function (sel) {
    if (sel.value) return;
    Array.prototype.forEach.call(sel.options, function (o) { if (o.value === m) sel.value = m; });
  });
}
function applyAppearance() {
  var a;
  try { a = JSON.parse(localStorage.getItem("ms_appearance") || "{}") || {}; } catch (e) { a = {}; }
  var root = document.documentElement;
  root.setAttribute("data-ms-theme", a.theme || "dark");
  root.setAttribute("data-ms-text", a.text || "standard");
  root.setAttribute("data-ms-density", a.density || "comfortable");
  root.setAttribute("data-ms-motion", a.motion || "full");
  if (document.getElementById("ms-appearance-css")) return;
  var css =
    'html[data-ms-theme="midnight"]{--bg:#000;--bg2:#030304;--panel:#07080a;--panel2:#0b0d10;--line:#16191f}' +
    'html[data-ms-theme="dim"]{--bg:#111419;--bg2:#151920;--panel:#1a1f27;--panel2:#1f252e;--line:#2a313b;--line2:#38414d}' +
    'html[data-ms-text="large"] body{font-size:18px}html[data-ms-text="large"]{font-size:112.5%}' +
    'html[data-ms-density="compact"] .section{padding:clamp(40px,6vw,72px) 0}' +
    'html[data-ms-density="compact"] .dash-card,html[data-ms-density="compact"] .set-card{padding:16px}' +
    'html[data-ms-motion="reduced"] *,html[data-ms-motion="reduced"] *::before,html[data-ms-motion="reduced"] *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}';
  var st = document.createElement("style");
  st.id = "ms-appearance-css";
  st.textContent = css;
  document.head.appendChild(st);
}
window.MSApplyAppearance = applyAppearance;

var SHORTCUTS = { d: "dashboard.html", s: "settings.html", p: "pricing.html", t: "terminal.html", h: "index.html", w: "watchlist.html" };
function bindShortcuts() {
  var armed = 0;
  document.addEventListener("keydown", function (e) {
    if (readPrefs().shortcuts === false) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var k = (e.key || "").toLowerCase();
    if (k === "?") { window.location.href = pageUrl("settings.html") + "#shortcuts"; return; }
    if (k === "g") { armed = Date.now(); return; }
    if (armed && Date.now() - armed < 1200 && SHORTCUTS[k]) {
      armed = 0;
      window.location.href = pageUrl(SHORTCUTS[k]);
    }
  });
}

/* ---------- boot ---------- */
async function boot() {
  try { applyAppearance(); bindShortcuts(); } catch (e) { /* never block the page */ }
  try {
    await refreshNav();
  } catch (e) {
    /* Nav must never break the marketing pages. */
  }

  var page = pageKind();
  try {
    if (page === "login") await initLogin();
    else if (page === "signup") await initSignup();
    else if (page === "reset") await initReset();
    else if (page === "dashboard") await initDashboard();
    else if (page === "account") await initAccount();
    else bindOAuthButtons();
  } catch (e) {
    if (page === "login" || page === "signup" || page === "reset") {
      showLaunchingNotice();
      var msg = $(".form-msg");
      setMsg(msg, "Accounts launching soon. You can still browse the site.", false);
    }
  }

  /* If a recovery link landed on another page, send it to the reset form. */
  try {
    if (configured() && page !== "reset") {
      var hash = window.location.hash || "";
      if (/type=recovery/i.test(hash)) {
        window.location.replace(pageUrl("reset-password.html") + hash);
      }
    }
  } catch (e) { /* ignore */ }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () { boot(); });
} else {
  boot();
}
