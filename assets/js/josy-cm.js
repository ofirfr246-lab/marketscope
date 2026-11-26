/* Josy Campaign Manager — shared constants and helpers (ES module).
   Everything here describes the user's own drafts. No platform data, no fake metrics. */
import { esc, icon as coreIcon, PLAN_NAMES } from "./josy-core.js";

/* Must match public.josy_cm_limit() in the database. */
export var CM_LIMITS = {
  campaigns: { free: 5, starter: 50, plus: 250, pro: 1000 },
  posts: { free: 60, starter: 600, plus: 3000, pro: 10000 },
  ad_groups: 20,
  ads: 50
};
export { PLAN_NAMES };

var XP = {
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19l8-8"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  cart: '<path d="M3 4h2l2.5 11h11L21 7H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  comment: '<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="M8.3 10.8l6.4-3.6M8.3 13.2l6.4 3.6"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  next: '<path d="M9 6l6 6-6 6"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'
};
export function icon(n, cls) {
  if (XP[n]) return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + XP[n] + "</svg>";
  return coreIcon(n, cls);
}

export var OBJECTIVES = [
  { id: "awareness", label: "Awareness", icon: "eye", desc: "Show your brand to as many relevant people as possible." },
  { id: "traffic", label: "Traffic", icon: "cursor", desc: "Send people to your website, landing page or app." },
  { id: "engagement", label: "Engagement", icon: "heart", desc: "Get more likes, comments, shares, video views or messages." },
  { id: "leads", label: "Leads", icon: "users", desc: "Collect sign-ups, enquiries or form submissions." },
  { id: "app_installs", label: "App installs", icon: "phone", desc: "Get people to install and open your app." },
  { id: "sales", label: "Sales", icon: "cart", desc: "Drive purchases and other valuable conversions." }
];
export function objLabel(id) { var o = OBJECTIVES.find(function (x) { return x.id === id; }); return o ? o.label : id || "—"; }

/* Field rules: hard = the platform rejects longer text; otherwise it's a recommendation. */
export var PLATFORMS = {
  meta: {
    label: "Meta", sub: "Facebook & Instagram ads", short: "M", group: "Ad set", groups: "Ad sets",
    placements: ["Automatic placements", "Facebook feed", "Instagram feed", "Stories", "Reels", "In-stream video", "Search results", "Messenger", "Partner apps & sites"],
    bidding: [
      { id: "highest_volume", label: "Highest volume", desc: "Spend the budget for the most results." },
      { id: "cost_per_result", label: "Cost per result goal", desc: "Aim for an average cost per result.", amount: "Target cost per result" },
      { id: "bid_cap", label: "Bid cap", desc: "Set the most you'll bid in each auction.", amount: "Bid cap" },
      { id: "roas_goal", label: "ROAS goal", desc: "Aim for a return on ad spend (sales objective).", amount: "Target ROAS (e.g. 3 = 300%)", ratio: true }
    ],
    optimization: ["Link clicks", "Landing page views", "Impressions", "Reach", "Post engagement", "Video views", "Leads", "Conversions", "Conversion value", "App installs"],
    formats: ["Single image", "Single video", "Carousel", "Collection"],
    ctas: ["Learn more", "Shop now", "Sign up", "Book now", "Contact us", "Download", "Get offer", "Get quote", "Subscribe", "Apply now", "Order now", "Send message"],
    fields: {
      primary_text: { label: "Primary text", max: 125, help: "About 125 characters shows before “more”." },
      headline: { label: "Headline", max: 40, help: "Around 40 characters avoids truncation." },
      description: { label: "Description", max: 30, help: "Optional. Shown in some placements only." }
    }
  },
  tiktok: {
    label: "TikTok", sub: "TikTok ads", short: "T", group: "Ad group", groups: "Ad groups",
    placements: ["Automatic placement", "TikTok feed", "Search results", "Partner apps"],
    bidding: [
      { id: "max_delivery", label: "Maximum delivery", desc: "Get the most results for your budget." },
      { id: "cost_cap", label: "Cost cap", desc: "Keep the average cost per result near a target.", amount: "Cost cap" },
      { id: "bid_cap", label: "Bid cap", desc: "Set the most you'll bid per result.", amount: "Bid cap" },
      { id: "highest_value", label: "Highest value", desc: "Prioritise high-value purchases (sales objective)." }
    ],
    optimization: ["Reach", "Clicks", "Landing page views", "Video views", "Engagement", "Leads", "Conversions", "Value", "App installs"],
    formats: ["Single video", "Spark ad (existing post)", "Image carousel"],
    ctas: ["Learn more", "Shop now", "Sign up", "Download", "Contact us", "Book now", "Apply now", "Order now", "Watch now", "Get quote", "Subscribe"],
    fields: {
      primary_text: { label: "Ad text", max: 100, hard: true, help: "Up to 100 characters." },
      headline: { label: "Display name", max: 40, help: "Brand or app name shown on the ad." },
      description: null
    }
  },
  google: {
    label: "Google", sub: "Google Ads", short: "G", group: "Ad group", groups: "Ad groups",
    placements: ["Search network", "Search partners", "Display network", "YouTube", "Discover & Gmail", "Maps"],
    bidding: [
      { id: "max_clicks", label: "Maximize clicks", desc: "Get as many clicks as possible within budget." },
      { id: "max_conversions", label: "Maximize conversions", desc: "Get the most conversions within budget." },
      { id: "max_value", label: "Maximize conversion value", desc: "Get the most conversion value within budget." },
      { id: "target_cpa", label: "Target CPA", desc: "Aim for an average cost per conversion.", amount: "Target CPA" },
      { id: "target_roas", label: "Target ROAS", desc: "Aim for a return on ad spend.", amount: "Target ROAS (e.g. 4 = 400%)", ratio: true },
      { id: "manual_cpc", label: "Manual CPC", desc: "Set your own maximum cost per click.", amount: "Max CPC" },
      { id: "impression_share", label: "Target impression share", desc: "Show at the top of results a share of the time." }
    ],
    optimization: ["Clicks", "Conversions", "Conversion value", "Impressions", "Video views"],
    formats: ["Responsive search ad", "Responsive display ad", "Video ad", "Performance Max asset group"],
    ctas: ["Automated", "Learn more", "Shop now", "Sign up", "Get quote", "Book now", "Contact us", "Download", "Apply now", "Subscribe"],
    fields: {
      headline: { label: "Headline", max: 30, hard: true, help: "Up to 30 characters (search ads)." },
      description: { label: "Description", max: 90, hard: true, help: "Up to 90 characters." },
      primary_text: { label: "Long headline", max: 90, hard: true, help: "Display and Performance Max only. Up to 90 characters." }
    }
  }
};
export function pf(id) { return PLATFORMS[id] || PLATFORMS.meta; }
export function pfBadge(id, sm) { var p = pf(id); return '<span class="pf-badge ' + esc(id) + (sm ? " sm" : "") + '" aria-hidden="true">' + p.short + "</span>"; }
export function bidLabel(platform, id) { var b = pf(platform).bidding.find(function (x) { return x.id === id; }); return b ? b.label : (id || "—"); }

export var CURRENCIES = { USD: "$", EUR: "€", GBP: "£", ILS: "₪", CAD: "CA$", AUD: "A$" };
export function money(n, cur) {
  if (n == null || n === "" || isNaN(n)) return "—";
  var v = Number(n);
  return (CURRENCIES[cur] || "") + v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

export var ORG = {
  instagram: { label: "Instagram", max: 2200, tags: 30, tagsHard: true, color: "#ff8fa3" },
  facebook: { label: "Facebook", max: 63206, tags: 0, color: "#4da3ff" },
  tiktok: { label: "TikTok", max: 2200, tags: 0, color: "#a78bfa" },
  linkedin: { label: "LinkedIn", max: 3000, tags: 5, color: "#19d27c" },
  x: { label: "X", max: 280, tags: 2, color: "#e8ecf1" }
};
export var ORG_KEYS = ["instagram", "facebook", "tiktok", "linkedin", "x"];

export function statusChip(s) {
  var L = { draft: "Draft", ready: "Ready", paused: "Paused", archived: "Archived", launched: "Live · marked by you", scheduled: "Scheduled", published: "Published" };
  return '<span class="st ' + esc(s) + '">' + (L[s] || esc(s)) + "</span>";
}

export function daysBetween(a, b) {
  if (!a || !b) return null;
  var d = Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) + 1;
  return d > 0 ? d : null;
}
/* Estimated spend uses ONLY the user's own inputs: budget and dates. */
export function estimate(c) {
  var amt = Number(c.budget_amount);
  var days = daysBetween(c.start_date, c.end_date);
  if (!amt || amt <= 0) return { total: null, perDay: null, days: days, text: "Add a budget to see the estimate." };
  if (c.budget_type === "lifetime") {
    return { total: amt, perDay: days ? amt / days : null, days: days,
      text: days ? "Lifetime budget spread over " + days + " day" + (days > 1 ? "s" : "") + "." : "Lifetime budgets need an end date." };
  }
  if (!days) return { total: null, perDay: amt, days: null, text: "Daily budget with no end date — runs until you stop it. Add an end date to see a total." };
  return { total: amt * days, perDay: amt, days: days, text: money(amt, c.currency) + " × " + days + " day" + (days > 1 ? "s" : "") + "." };
}
export var ESTIMATE_NOTE = "Maximum planned spend, calculated only from your budget and dates. Platforms may spend slightly more or less on a given day. This is not a forecast of results.";

export function isUrl(s) { try { var u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; } catch (e) { return false; } }

/* Validation. step = wizard step index to fix it. */
export function validateCampaign(c) {
  var E = [], W = [];
  var P = pf(c.platform);
  var today = new Date(); today.setHours(0, 0, 0, 0);
  if (!c.platform) E.push({ step: 0, msg: "Choose a platform." });
  if (!c.name || !c.name.trim()) E.push({ step: 0, msg: "Give the campaign a name." });
  if (!c.objective) E.push({ step: 1, msg: "Choose an objective." });
  var amt = Number(c.budget_amount);
  if (!amt || amt <= 0) E.push({ step: 2, msg: "Set a budget greater than 0." });
  if (!c.start_date) E.push({ step: 2, msg: "Set a start date." });
  if (c.budget_type === "lifetime" && !c.end_date) E.push({ step: 2, msg: "Lifetime budgets need an end date." });
  if (c.start_date && c.end_date && c.end_date < c.start_date) E.push({ step: 2, msg: "End date is before the start date." });
  if (c.start_date && new Date(c.start_date + "T00:00:00") < today) W.push({ step: 2, msg: "Start date is in the past." });
  if (!c.end_date && c.budget_type === "daily") W.push({ step: 2, msg: "No end date — the campaign would run until stopped." });
  var a = c.audience || {};
  if (!(a.locations || []).length) W.push({ step: 3, msg: "No locations — add at least one country or city." });
  if (a.age_min && a.age_max && Number(a.age_min) > Number(a.age_max)) E.push({ step: 3, msg: "Minimum age is higher than maximum age." });
  if (a.age_min && Number(a.age_min) < 18) W.push({ step: 3, msg: "Ads to people under 18 face extra platform restrictions." });
  if (!(c.placements || []).length) W.push({ step: 4, msg: "No placements chosen — platforms usually default to automatic." });
  if (!c.bidding) W.push({ step: 4, msg: "No bidding strategy chosen." });
  var b = P.bidding.find(function (x) { return x.id === c.bidding; });
  if (b && b.amount && !(Number(c.bid_amount) > 0)) E.push({ step: 4, msg: b.label + " needs an amount." });
  var groups = c.ad_groups || [];
  if (!groups.length) E.push({ step: 5, msg: "Add at least one " + P.group.toLowerCase() + "." });
  if (groups.length > CM_LIMITS.ad_groups) E.push({ step: 5, msg: "Up to " + CM_LIMITS.ad_groups + " " + P.groups.toLowerCase() + " per campaign." });
  var needsUrl = ["traffic", "leads", "sales"].indexOf(c.objective) >= 0;
  groups.forEach(function (g, gi) {
    var gn = (g.name || P.group + " " + (gi + 1));
    if (!(g.ads || []).length) E.push({ step: 6, msg: gn + ": add at least one ad." });
    if ((g.ads || []).length > CM_LIMITS.ads) E.push({ step: 6, msg: gn + ": up to " + CM_LIMITS.ads + " ads." });
    (g.ads || []).forEach(function (ad, ai) {
      var an = gn + " › " + (ad.name || "Ad " + (ai + 1));
      if (!(ad.primary_text || "").trim() && !(ad.headline || "").trim()) E.push({ step: 6, msg: an + ": add ad text or a headline." });
      ["primary_text", "headline", "description"].forEach(function (k) {
        var f = P.fields[k]; var v = ad[k] || "";
        if (!f || !v) return;
        if (v.length > f.max) (f.hard ? E : W).push({ step: 6, msg: an + ": " + f.label + " is " + v.length + "/" + f.max + " characters" + (f.hard ? "." : " (may be cut off).") });
      });
      if (ad.destination_url && !isUrl(ad.destination_url)) E.push({ step: 6, msg: an + ": destination URL must start with https://" });
      else if (!ad.destination_url && needsUrl) E.push({ step: 6, msg: an + ": add a destination URL for a " + objLabel(c.objective).toLowerCase() + " campaign." });
      if (ad.media_url && !isUrl(ad.media_url)) E.push({ step: 6, msg: an + ": media URL must be a valid link." });
      if (!ad.media_url && !ad.media_id && c.platform !== "google") W.push({ step: 6, msg: an + ": no media yet — upload a file or add a link." });
      if (!ad.cta && c.platform !== "google") W.push({ step: 6, msg: an + ": no call to action chosen." });
    });
  });
  return { errors: E, warnings: W };
}

export function friendlyError(err) {
  var m = (err && (err.message || err.details)) || String(err || "");
  if (/JOSY_LIMIT/.test(m)) {
    if (/josy_campaigns/.test(m)) return "You've reached your plan's campaign limit. Archive-and-delete old drafts or upgrade your plan.";
    if (/josy_organic_posts/.test(m)) return "You've reached your plan's post limit. Delete old posts or upgrade your plan.";
    if (/josy_ad_groups/.test(m)) return "Up to " + CM_LIMITS.ad_groups + " ad sets / ad groups per campaign.";
    if (/josy_ads/.test(m)) return "Up to " + CM_LIMITS.ads + " ads per ad set / ad group.";
    return "Plan limit reached.";
  }
  if (/end_date|check constraint/.test(m)) return "Some values aren't valid. Check dates, amounts and text lengths.";
  return "Couldn't save. Please try again.";
}

export async function getPlan(sb, uid) {
  var r = await sb.from("profiles").select("plan").eq("id", uid).maybeSingle();
  return (r.data && r.data.plan) || "free";
}

/* Planned connections: no draft builder yet, shown honestly as "planned · not connected". Original initials, no third-party logos. */
export var PLANNED_PLATFORMS = {
  gshopping: { label: "Google Shopping", sub: "Product listing ads from your catalog", short: "GS" },
  youtube: { label: "YouTube", sub: "Video campaigns", short: "YT" },
  shopify: { label: "Shopify", sub: "Store connection for products and orders", short: "SH" }
};
export function plannedBadge(id, sm) { var p = PLANNED_PLATFORMS[id]; return '<span class="pf-badge planned-pf ' + esc(id) + (sm ? " sm" : "") + '" aria-hidden="true">' + (p ? p.short : "?") + "</span>"; }

export function connectCards() {
  return ["meta", "tiktok", "google"].map(function (id) {
    var p = pf(id);
    return '<div class="connect"><div class="top">' + pfBadge(id) + '<div><h4>' + p.label + (id === "google" ? " Ads" : "") + ' ad account</h4><span class="chip planned">Drafts ready · not connected</span></div></div>' +
      '<p>Publishing to ' + p.sub + ' requires an approved integration with ' + p.label + '. Until then, campaigns stay as drafts you can copy over manually.</p>' +
      '<button type="button" class="btn btn-sm btn-ghost" disabled aria-disabled="true">' + icon("link") + ' Connect — requires approval</button></div>';
  }).join("") + Object.keys(PLANNED_PLATFORMS).map(function (id) {
    var p = PLANNED_PLATFORMS[id];
    return '<div class="connect planned-card"><div class="top">' + plannedBadge(id) + '<div><h4>' + p.label + '</h4><span class="chip planned">Planned · not connected</span></div></div>' +
      '<p>' + p.sub + '. This connection is on the roadmap; nothing is sent to ' + p.label + ' today.</p>' +
      '<button type="button" class="btn btn-sm btn-ghost" disabled aria-disabled="true">' + icon("link") + ' Planned</button></div>';
  }).join("");
}

export function emptyState(ic, title, text, cta) {
  return '<div class="empty"><span class="mod-ico" style="margin:0 auto;color:var(--amber)">' + icon(ic) + '</span><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + (cta || "") + "</div>";
}

/* Tag input: returns a controller. */
export function tagInput(el, values, opts) {
  opts = opts || {};
  var vals = (values || []).slice();
  function render() {
    el.innerHTML = vals.map(function (v, i) { return '<span class="tag">' + esc(v) + '<button type="button" data-rm="' + i + '" aria-label="Remove ' + esc(v) + '">×</button></span>'; }).join("") +
      '<input type="text" placeholder="' + esc(vals.length ? "" : (opts.placeholder || "Type and press Enter")) + '" aria-label="' + esc(opts.label || "Add") + '">';
    var inp = el.querySelector("input");
    inp.addEventListener("keydown", function (e) {
      if ((e.key === "Enter" || e.key === ",") && inp.value.trim()) { e.preventDefault(); add(inp.value); }
      else if (e.key === "Backspace" && !inp.value && vals.length) { vals.pop(); changed(); }
    });
    inp.addEventListener("blur", function () { setTimeout(function () { if (inp.isConnected && el.isConnected && inp.value.trim()) { push(inp.value); changed(false); } }, 0); });
    inp.addEventListener("paste", function (e) {
      var t = (e.clipboardData || window.clipboardData).getData("text");
      if (/[,\n]/.test(t)) { e.preventDefault(); t.split(/[,\n]/).forEach(function (x) { if (x.trim()) push(x); }); changed(); }
    });
  }
  function push(v) {
    v = v.trim().replace(/,$/, "");
    if (opts.transform) v = opts.transform(v);
    if (!v || vals.indexOf(v) >= 0) return;
    if (opts.max && vals.length >= opts.max) return;
    vals.push(v.slice(0, opts.maxLen || 80));
  }
  function add(v) { push(v); changed(); el.querySelector("input").focus(); }
  function changed(focus) { render(); if (opts.onChange) opts.onChange(vals.slice()); var i = el.querySelector("input"); if (i && focus !== false) i.focus(); }
  el.addEventListener("click", function (e) {
    var b = e.target.closest("[data-rm]");
    if (b) { vals.splice(Number(b.getAttribute("data-rm")), 1); changed(); return; }
    var i = el.querySelector("input"); if (i && e.target === el) i.focus();
  });
  render();
  return { get: function () { return vals.slice(); } };
}
