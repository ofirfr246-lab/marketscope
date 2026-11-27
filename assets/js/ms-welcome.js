/* Post-checkout welcome screen (dashboard.html?checkout=success).
   Reads the real plan and credits from the profile and waits briefly for Stripe's webhook.
   Never claims an upgrade the database hasn't recorded yet. */
import { getClient } from "./josy-core.js";

var JOSY_MSGS = { free: 10, starter: 50, plus: 150, pro: 400 };
var CAMPAIGNS = { free: 5, starter: 50, plus: 250, pro: 1000 };
var MEDIA = { free: "200 MB", starter: "2 GB", plus: "10 GB", pro: "50 GB" };
var POLL_MS = 2000, POLL_MAX = 15;

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function planCfg(id) { var c = window.MS_CONFIG && window.MS_CONFIG.plans; return (c || []).find(function (p) { return p.id === id; }) || null; }
function planName(id) { var c = planCfg(id); return c ? c.name : (id ? id.charAt(0).toUpperCase() + id.slice(1) : "Free"); }
function readCtx() {
  try { var c = JSON.parse(localStorage.getItem("ms_checkout_ctx") || "null"); if (c && Date.now() - c.at < 2 * 3600 * 1000) return c; } catch (e) { /* ignore */ }
  return null;
}
function clearUrl() { try { var u = new URL(location.href); u.searchParams.delete("checkout"); history.replaceState(null, "", u.pathname + (u.search || "") + u.hash); } catch (e) { /* ignore */ } }

function confirmed(p, ctx) {
  var ev = p.subscription_event_at ? Date.parse(p.subscription_event_at) : 0;
  if (ctx) {
    var topup = String(ctx.lookup || "").indexOf("topup_") === 0;
    if (topup) return ctx.credits != null ? (typeof p.credits === "number" && p.credits > ctx.credits) : ev >= ctx.at - 120000;
    if (ctx.plan && p.plan && p.plan !== ctx.plan) return true;
    return ev >= ctx.at - 120000;
  }
  return ev && Date.now() - ev < 30 * 60 * 1000;
}

function shell() {
  var bg = document.createElement("div");
  bg.className = "wm-bg";
  bg.innerHTML = '<div class="wm" role="dialog" aria-modal="true" aria-labelledby="wm-t"><div class="wm-confetti" aria-hidden="true"></div><button type="button" class="wm-x" aria-label="Close">✕</button><div class="wm-body" data-wm-body></div></div>';
  document.body.appendChild(bg);
  var close = function () { bg.classList.add("out"); setTimeout(function () { bg.remove(); }, 250); clearUrl(); document.removeEventListener("keydown", onKey); };
  var onKey = function (e) { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  bg.querySelector(".wm-x").onclick = close;
  bg.addEventListener("click", function (e) { if (e.target === bg) close(); });
  requestAnimationFrame(function () { bg.classList.add("in"); });
  return { bg: bg, body: bg.querySelector("[data-wm-body]"), close: close };
}

function confetti(el) {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var cols = ["#ffb000", "#e9ecef", "#a8b0bb", "#8f99a6", "#c8b896"], h = "";
  for (var i = 0; i < 36; i++) h += '<i style="left:' + (Math.random() * 100).toFixed(1) + "%;background:" + cols[i % cols.length] + ";animation-delay:" + (Math.random() * .6).toFixed(2) + "s;--r:" + Math.round(Math.random() * 720 - 360) + "deg;--x:" + Math.round(Math.random() * 80 - 40) + 'px"></i>';
  el.innerHTML = h;
}

function waiting(m) {
  m.body.innerHTML = '<div class="wm-mark"><img src="favicon.svg" alt=""><span class="wm-spin"></span></div><div class="kicker mono">PAYMENT RECEIVED</div><h2 id="wm-t">Confirming your purchase…</h2><p class="wm-sub">Stripe is letting us know about your payment. This usually takes a few seconds.</p>';
}

function success(m, p, ctx) {
  var topup = ctx && String(ctx.lookup || "").indexOf("topup_") === 0;
  var cfg = planCfg(p.plan);
  var credits = typeof p.credits === "number" ? p.credits : "—";
  var added = topup && ctx.credits != null && typeof p.credits === "number" ? p.credits - ctx.credits : null;
  var unlocked = [];
  if (!topup && cfg) {
    unlocked = (cfg.features || []).filter(function (f) { return !/^Everything in/i.test(f); }).slice(0, 5);
    unlocked.push("Josy: " + JOSY_MSGS[p.plan] + " messages a day");
    unlocked.push("Campaign manager: up to " + CAMPAIGNS[p.plan] + " campaigns · " + MEDIA[p.plan] + " media storage");
  }
  m.body.innerHTML = '<div class="wm-mark ok"><img src="favicon.svg" alt=""><span class="wm-ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span></div>' +
    '<div class="kicker mono">' + (topup ? "CREDITS ADDED" : "YOU'RE ALL SET") + "</div>" +
    '<h2 id="wm-t">' + (topup ? "Your credits are ready" : "Welcome to " + esc(planName(p.plan))) + "</h2>" +
    '<p class="wm-sub">' + (topup ? (added > 0 ? esc(added) + " credits were added to your account." : "Your credit pack was added to your account.") : esc(cfg && cfg.question ? cfg.question : "Your plan is active.")) + "</p>" +
    '<div class="wm-stats"><div><span>PLAN</span><b>' + esc(planName(p.plan)) + '</b></div><div><span>CREDIT BALANCE</span><b>' + esc(credits) + "</b></div>" + (cfg && !topup ? "<div><span>EACH MONTH</span><b>" + esc(cfg.credits) + " credits</b></div>" : "") + "</div>" +
    (unlocked.length ? '<div class="wm-unlock"><div class="kicker mono">UNLOCKED</div><ul>' + unlocked.map(function (f) { return "<li>" + f + "</li>"; }).join("") + "</ul></div>" : "") +
    '<div class="wm-acts"><button type="button" class="btn btn-amber" data-wm-go>Start a report</button><a class="btn btn-ghost" href="josy.html">Meet Josy</a></div>';
  confetti(m.bg.querySelector(".wm-confetti"));
  m.body.querySelector("[data-wm-go]").onclick = function () { m.close(); var f = document.querySelector("[data-auth-form] input"); if (f) f.focus(); };
  try { localStorage.removeItem("ms_checkout_ctx"); } catch (e) { /* ignore */ }
  document.querySelectorAll("[data-credit-balance]").forEach(function (el) { el.textContent = String(credits); });
  document.querySelectorAll("[data-plan-name]").forEach(function (el) { el.textContent = planName(p.plan); });
}

function pending(m, p, retry) {
  m.body.innerHTML = '<div class="wm-mark"><img src="favicon.svg" alt=""></div><div class="kicker mono">PAYMENT RECEIVED</div><h2 id="wm-t">Thanks — we\'re finishing up</h2>' +
    '<p class="wm-sub">Stripe hasn\'t confirmed the update to your account yet. Your plan and credits will change automatically as soon as it does — usually within a minute. You won\'t be charged twice.</p>' +
    (p ? '<div class="wm-stats"><div><span>CURRENT PLAN</span><b>' + esc(planName(p.plan)) + '</b></div><div><span>CREDIT BALANCE</span><b>' + esc(typeof p.credits === "number" ? p.credits : "—") + "</b></div></div>" : "") +
    '<div class="wm-acts"><button type="button" class="btn btn-amber" data-wm-retry>Check again</button><a class="btn btn-ghost" href="contact.html">Contact support</a></div>';
  m.body.querySelector("[data-wm-retry]").onclick = retry;
}

async function run() {
  if (new URLSearchParams(location.search).get("checkout") !== "success") return;
  var sb = await getClient();
  if (!sb) return;
  var s = await sb.auth.getSession();
  var session = s.data && s.data.session;
  if (!session) return;
  var legacy = document.querySelector("[data-checkout-toast]"); if (legacy) legacy.hidden = true;
  var ctx = readCtx();
  var m = shell();
  async function poll() {
    waiting(m);
    var last = null;
    for (var i = 0; i < POLL_MAX; i++) {
      var r = await sb.from("profiles").select("plan,credits,subscription_status,subscription_event_at").eq("id", session.user.id).maybeSingle();
      if (r.data) { last = r.data; if (confirmed(r.data, ctx)) return success(m, r.data, ctx); }
      if (!document.body.contains(m.bg)) return;
      await new Promise(function (res) { setTimeout(res, POLL_MS); });
    }
    pending(m, last, poll);
  }
  poll();
}
window.MSWelcome = { run: run };
run();
