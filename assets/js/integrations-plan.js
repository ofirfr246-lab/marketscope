/* MarketScope — plan-aware Integrations page (DISPLAY ONLY).
   Reads the signed-in user's own plan from profiles (same as the rest of the site) and marks each
   integration as included or locked. This is a UI hint, not enforcement: nothing here grants or blocks
   access on the server. Publishable key only. */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";

var CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* Lowest plan that includes each integration. Must match the pricing matrix in config.js.
   Free / Starter: Google Shopping, Google Search, Meta Ad Library (public ads).
   Plus: those + TikTok + supplier marketplaces (AliExpress, Alibaba, 1688, CJ, Temu, DHgate).
   Pro: those + Shopify competitor stores + remaining sources (Amazon, via DataForSEO, Soon).
   Meta ad-account connection (beta, ads_read): Plus and Pro.
   CSV / PDF export: Starter and up. REST API: Pro (early access). */
export var MIN_PLAN = {
  "google-shopping": "free",
  "google-search": "free",
  "meta-library": "free",
  tiktok: "plus",
  aliexpress: "plus",
  alibaba: "plus",
  "1688": "plus",
  cj: "plus",
  temu: "plus",
  dhgate: "plus",
  shopify: "pro",
  amazon: "pro",
  "meta-ads": "plus",
  export: "starter",
  api: "pro"
};
var ORDER = ["free", "starter", "plus", "pro"];
var NAMES = { free: "Free", starter: "Starter", plus: "Plus", pro: "Pro" };

var info = null, clientP = null;
export function planName(id) { return NAMES[id] || id; }
export function includes(plan, key) { return ORDER.indexOf(plan) >= ORDER.indexOf(MIN_PLAN[key] || "free"); }

export function getClient() {
  if (!isSupabaseConfigured()) return Promise.resolve(null);
  if (!clientP) clientP = import(CDN).then(function (m) {
    return m.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  });
  return clientP;
}

/* { signedIn, plan, betaKeys } — betaKeys lets a named tester see a beta card unlocked (display only;
   the server's allow-list is what really limits Meta access). */
export function getPlanInfo() {
  if (info) return info;
  info = (async function () {
    var out = { signedIn: false, plan: "free", betaKeys: [], session: null, sb: null };
    try {
      var sb = await getClient();
      if (!sb) return out;
      var s = await sb.auth.getSession();
      var session = s.data && s.data.session;
      out.sb = sb; out.session = session;
      if (!session) return out;
      out.signedIn = true;
      var r = await sb.from("profiles").select("plan,preferences").eq("id", session.user.id).maybeSingle();
      var row = r.data || {};
      var p = String(row.plan || "free").toLowerCase();
      out.plan = ORDER.indexOf(p) > -1 ? p : "free";
      var b = row.preferences && row.preferences.betaIntegrations;
      out.betaKeys = Array.isArray(b) ? b.map(String) : [];
    } catch (e) { /* stay on the signed-out view */ }
    return out;
  })();
  return info;
}
export async function unlocked(key) {
  var i = await getPlanInfo();
  return i.signedIn && (includes(i.plan, key) || i.betaKeys.indexOf(key) > -1);
}

function lockBadge(min) {
  return '<div class="plan-lock"><span class="plan-lock-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>' +
    '<span>Included from ' + planName(min) + '</span><a class="btn btn-sm btn-amber" href="pricing.html">Upgrade to ' + planName(min) + '</a></div>';
}

async function decorate() {
  var cards = Array.prototype.slice.call(document.querySelectorAll("[data-min-plan]"));
  var strip = document.querySelector("[data-plan-strip]");
  var i = await getPlanInfo();
  if (strip && i.signedIn) {
    strip.hidden = false;
    strip.innerHTML = 'Your plan: <b>' + planName(i.plan) + '</b>. Sources and integrations marked <span class="chip planned">LOCKED</span> need a higher plan. <a href="pricing.html">Compare plans</a>';
  }
  cards.forEach(function (c) {
    var key = c.getAttribute("data-min-plan-key") || "";
    var min = c.getAttribute("data-min-plan");
    var slot = c.querySelector("[data-plan-slot]");
    if (!slot) return;
    if (!i.signedIn) { slot.innerHTML = '<div class="plan-note mono">INCLUDED FROM ' + planName(min).toUpperCase() + '</div>'; return; }
    if (includes(i.plan, key) || i.betaKeys.indexOf(key) > -1) {
      slot.innerHTML = '<div class="plan-note ok mono">INCLUDED IN YOUR PLAN</div>';
    } else {
      c.classList.add("is-locked");
      slot.innerHTML = lockBadge(min);
    }
  });
}
if (document.querySelector("[data-min-plan]") || document.querySelector("[data-plan-strip]")) decorate();
