/* Josy Campaign Manager — campaign detail */
import { requireSession, $, $$, esc, toast, confirmDialog, copyText, download, slug, fmtDate, relTime } from "./josy-core.js";
import { icon, pf, pfBadge, objLabel, bidLabel, money, statusChip, estimate, ESTIMATE_NOTE, validateCampaign, friendlyError, connectCards, emptyState } from "./josy-cm.js";
import { getMedia, mediaTag } from "./josy-media.js";
import { publishedToast, autoBell } from "./josy-notify.js";

var S = { sb: null, c: null, tab: "overview" };

async function boot() {
  var id = new URLSearchParams(location.search).get("id");
  var r = await requireSession("josy-campaign.html" + location.search);
  if (!r.session) return;
  S.sb = r.sb;
  autoBell(S.sb);
  if (!id) { location.replace("josy-paid.html"); return; }
  var res = await S.sb.from("josy_campaigns").select("*, josy_ad_groups(*, josy_ads(*))").eq("id", id).maybeSingle();
  if (res.error || !res.data) { $("[data-gate]").innerHTML = emptyState("search", "Campaign not found", "It may have been deleted.", '<a class="btn btn-ghost" href="josy-paid.html">Back to campaigns</a>'); return; }
  S.c = res.data;
  S.c.groups = (S.c.josy_ad_groups || []).sort(function (a, b) { return a.position - b.position; });
  S.c.groups.forEach(function (g) { g.ads = (g.josy_ads || []).sort(function (a, b) { return a.position - b.position; }); });
  $("[data-gate]").hidden = true; $("[data-shell]").hidden = false;
  var h = location.hash.replace("#", ""); if (["overview", "ads", "performance", "publishing"].indexOf(h) >= 0) S.tab = h;
  $$("[data-tab]").forEach(function (b) { b.onclick = function () { S.tab = b.getAttribute("data-tab"); history.replaceState(null, "", "#" + S.tab); renderTab(); }; });
  renderHead(); renderTab();
}

function vShape() {
  var c = S.c;
  return Object.assign({}, c, { audience: c.audience || {}, placements: c.placements || [], budget_amount: c.budget_amount == null ? "" : c.budget_amount,
    ad_groups: c.groups.map(function (g) { return { name: g.name, ads: g.ads }; }) });
}

function renderHead() {
  var c = S.c, P = pf(c.platform);
  document.title = c.name + " — Josy campaign manager · MarketScope";
  $("[data-h1]").innerHTML = esc(c.name);
  $("[data-crumb]").textContent = c.name;
  $("[data-sub]").innerHTML = pfBadge(c.platform, true) + " " + P.label + " · " + objLabel(c.objective) + " · " + statusChip(c.status) + ' <span class="mono" style="font-size:.72rem;color:var(--dim)">edited ' + relTime(c.updated_at) + "</span>";
  $("[data-sub]").style.display = "flex"; $("[data-sub]").style.gap = "8px"; $("[data-sub]").style.alignItems = "center"; $("[data-sub]").style.flexWrap = "wrap";
  var pausable = c.status === "draft" || c.status === "ready" || c.status === "launched";
  $("[data-hero-actions]").innerHTML =
    (c.status === "ready" ? '<button type="button" class="btn btn-amber" data-launch>' + icon("check") + " Mark as live</button>" : "") +
    '<a class="btn ' + (c.status === "ready" ? "btn-ghost" : "btn-amber") + '" href="josy-campaign-new.html?id=' + c.id + '">' + icon("edit") + " Edit</a>" +
    '<button type="button" class="btn btn-ghost" data-dup>' + icon("copy") + " Duplicate</button>" +
    (c.status === "archived" ? '<button type="button" class="btn btn-ghost" data-unarch>' + icon("archive") + " Unarchive</button>"
      : (pausable ? '<button type="button" class="btn btn-ghost" data-pause>' + icon("pause") + " Pause</button>" : '<button type="button" class="btn btn-ghost" data-resume>' + icon("play") + " Resume</button>") +
        '<button type="button" class="btn btn-ghost" data-arch>' + icon("archive") + " Archive</button>") +
    '<button type="button" class="btn btn-ghost" data-del style="color:var(--red)">' + icon("trash") + " Delete</button>";
  var A = $("[data-hero-actions]");
  $("[data-dup]", A).onclick = async function () { var r = await S.sb.rpc("josy_duplicate_campaign", { p_id: c.id }); if (r.error) return toast(friendlyError(r.error)); toast("Duplicated"); location.href = "josy-campaign.html?id=" + r.data; };
  var b;
  if ((b = $("[data-launch]", A))) b.onclick = async function () {
    if (!(await confirmDialog("Mark as live?", "Use this after you've created and launched this campaign yourself in " + P.label + "'s ads manager. MarketScope doesn't publish it for you.", "Mark as live"))) return;
    var was = c.status;
    var r = await S.sb.from("josy_campaigns").update({ status: "launched", launched_at: new Date().toISOString() }).eq("id", c.id).select("updated_at, launched_at").maybeSingle();
    if (r.error) return toast(friendlyError(r.error));
    c.status = "launched"; if (r.data) { c.updated_at = r.data.updated_at; c.launched_at = r.data.launched_at; }
    renderHead(); renderTab();
    if (was !== "launched") publishedToast([c.platform], c.name, { entity: "campaign" });
  };
  if ((b = $("[data-pause]", A))) b.onclick = function () { setStatus("paused", "Paused — this draft is on hold"); };
  if ((b = $("[data-resume]", A))) b.onclick = function () { var ok = !validateCampaign(vShape()).errors.length; setStatus(ok ? "ready" : "draft", ok ? "Resumed as ready" : "Resumed as draft — some checks still need fixing"); };
  if ((b = $("[data-arch]", A))) b.onclick = function () { setStatus("archived", "Archived"); };
  if ((b = $("[data-unarch]", A))) b.onclick = function () { setStatus("draft", "Moved back to drafts"); };
  $("[data-del]", A).onclick = async function () {
    if (!(await confirmDialog("Delete campaign?", "“" + c.name + "” and all its " + P.groups.toLowerCase() + " and ads will be permanently deleted.", "Delete"))) return;
    var r = await S.sb.from("josy_campaigns").delete().eq("id", c.id);
    if (r.error) return toast(friendlyError(r.error));
    location.href = "josy-paid.html";
  };
}
async function setStatus(st, msg) {
  var r = await S.sb.from("josy_campaigns").update({ status: st }).eq("id", S.c.id).select("updated_at").maybeSingle();
  if (r.error) return toast(friendlyError(r.error));
  S.c.status = st; if (r.data) S.c.updated_at = r.data.updated_at; toast(msg); renderHead(); renderTab();
}

function renderTab() {
  $$("[data-tab]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === S.tab); b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === S.tab)); });
  var el = $("[data-panel]");
  el.innerHTML = { overview: overview, ads: adsTab, performance: perfTab, publishing: pubTab }[S.tab]();
  bindPanel(el);
}

function kv(rows) { return '<div class="kv">' + rows.map(function (r) { return "<span>" + esc(r[0]) + "</span><b>" + (r[1] || '<span style="color:var(--dim)">—</span>') + "</b>"; }).join("") + "</div>"; }

function overview() {
  var c = S.c, P = pf(c.platform), a = c.audience || {}, e = estimate(c), v = validateCampaign(vShape());
  var ads = c.groups.reduce(function (n, g) { return n + g.ads.length; }, 0);
  var kp = '<div class="kpis" style="margin:0 0 16px">' + [
    ["BUDGET", c.budget_amount ? money(c.budget_amount, c.currency) : "—", c.budget_type === "daily" ? "per day" : "lifetime"],
    ["SCHEDULE", e.days ? e.days + "d" : c.start_date ? "Ongoing" : "—", c.start_date ? fmtDate(c.start_date) + (c.end_date ? " → " + fmtDate(c.end_date) : "") : "no dates"],
    ["EST. MAX SPEND", e.total != null ? money(e.total, c.currency) : "—", e.total != null ? "budget × days" : "needs end date"],
    ["STRUCTURE", c.groups.length + " / " + ads, P.groups.toLowerCase() + " / ads"]
  ].map(function (k) { return '<div class="kpi"><div class="k">' + k[0] + '</div><div class="v" style="font-size:1.25rem">' + k[1] + '</div><div class="d">' + esc(k[2]) + "</div></div>"; }).join("") + "</div>";
  var checks = '<ul class="issues">' + (v.errors.length || v.warnings.length ?
    v.errors.map(function (x) { return '<li class="e">✕ <span>' + esc(x.msg) + '</span><a class="mono" style="margin-inline-start:auto;color:var(--amber);font-size:.78rem" href="josy-campaign-new.html?id=' + c.id + "&step=" + x.step + '">Fix</a></li>'; }).join("") +
    v.warnings.map(function (x) { return '<li class="w">! <span>' + esc(x.msg) + "</span></li>"; }).join("")
    : '<li class="ok">✓ <span>All checks pass.</span></li>') + "</ul>";
  return kp + '<div class="d-grid"><div>' +
    '<div class="review-sec"><h5>Campaign</h5>' + kv([["Platform", P.label + " · " + P.sub], ["Objective", objLabel(c.objective)], ["Status", statusChip(c.status)], ["Created", fmtDate(c.created_at)], ["Notes", esc(c.notes || "")]]) + "</div>" +
    '<div class="review-sec"><h5>Audience</h5>' + kv([["Locations", esc((a.locations || []).join(", "))], ["Age", a.age_min ? a.age_min + "–" + a.age_max + (Number(a.age_max) >= 65 ? "+" : "") : ""], ["Gender", { all: "All", female: "Women", male: "Men" }[a.gender] || "All"], ["Languages", esc((a.languages || []).join(", "))], [c.platform === "google" ? "Keywords & signals" : "Interests", esc((a.interests || []).join(", "))], ["Notes", esc(a.notes || "")]]) + "</div>" +
    '<div class="review-sec"><h5>Delivery</h5>' + kv([["Placements", esc((c.placements || []).join(", "))], ["Bidding", c.bidding ? esc(bidLabel(c.platform, c.bidding)) + (c.bid_amount != null ? " · " + esc(String(c.bid_amount)) : "") : ""]]) + "</div>" +
    '</div><div><div class="summary" style="position:static"><h4>CHECKS</h4>' + checks +
    '<div class="spend"><div class="k">ESTIMATED MAX SPEND</div><div class="v">' + (e.total != null ? money(e.total, c.currency) : e.perDay != null ? money(e.perDay, c.currency) + "/day" : "—") + "</div><p>" + esc(e.text) + '</p><p style="margin-top:6px">' + esc(ESTIMATE_NOTE) + "</p></div></div></div></div>";
}

function adPreview(ad, c) {
  var P = pf(c.platform), media = ad.media_id ? '<span data-media-id="' + esc(ad.media_id) + '">Loading media…</span>' : ad.media_url && /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(ad.media_url) ? '<img src="' + esc(ad.media_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : esc(ad.media_url ? "Media: " + ad.media_url : "No media link yet");
  if (c.platform === "google" && /search/i.test(ad.format || "")) {
    return '<div class="ad-prev" style="padding:14px"><div class="mono" style="font-size:.7rem;color:var(--dim)">Sponsored · ' + esc(hostOf(ad.destination_url) || "your-site.com") + '</div><div style="color:#8ab4ff;font-size:1.02rem;margin:4px 0">' + esc(ad.headline || "Headline") + '</div><div style="font-size:.84rem;color:#c3cad3">' + esc(ad.description || "Description") + "</div></div>";
  }
  return '<div class="ad-prev"><div class="ph-top"><span class="av"></span><div><b>' + esc(c.platform === "tiktok" ? (ad.headline || "Your brand") : "Your page") + "</b><small>Sponsored</small></div></div>" +
    '<div class="txt" dir="auto">' + esc(ad.primary_text || "") + '</div><div class="media">' + media + "</div>" +
    '<div class="bar2"><div style="min-width:0"><small>' + esc(hostOf(ad.destination_url) || "") + "</small><b>" + esc(c.platform === "tiktok" ? "" : (ad.headline || "")) + "</b><small>" + esc(ad.description || "") + "</small></div>" + (ad.cta ? '<span class="cta">' + esc(ad.cta) + "</span>" : "") + "</div></div>" +
    '<p class="fine" style="margin-top:6px">Simplified layout preview — not how ' + esc(P.label) + " will render it exactly.</p>";
}
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }

function adsTab() {
  var c = S.c, P = pf(c.platform);
  if (!c.groups.length) return emptyState("layers", "No " + P.groups.toLowerCase() + " yet", "Add " + P.groups.toLowerCase() + " and ads in the editor.", '<a class="btn btn-amber" href="josy-campaign-new.html?id=' + c.id + '&step=5">Open editor</a>');
  return c.groups.map(function (g, gi) {
    return '<div class="grp"><div class="grp-h"><span class="mono" style="color:var(--dim);font-size:.72rem">' + esc(P.group.toUpperCase()) + " " + (gi + 1) + "</span><b>" + esc(g.name) + '</b><span class="sp"></span>' + (g.optimization ? '<span class="lim">Optimise: ' + esc(g.optimization) + "</span>" : "") + "</div>" +
      '<div class="grp-b">' + (g.audience_notes ? '<p class="fine" style="margin:0 0 12px">' + esc(g.audience_notes) + "</p>" : "") +
      (g.ads.length ? g.ads.map(function (ad) {
        var F = P.fields;
        return '<div class="ad"><div class="ad-h"><b>' + esc(ad.name) + "</b>" + (ad.format ? '<span class="lim">' + esc(ad.format) + "</span>" : "") + '<span class="sp"></span><button type="button" class="btn btn-sm btn-ghost" data-copy-ad="' + ad.id + '" style="margin:0">' + icon("copy") + " Copy text</button></div>" +
          '<div class="d-grid" style="grid-template-columns:minmax(0,1fr) 300px">' +
          "<div>" + kv([[F.primary_text ? F.primary_text.label : "Text", esc(ad.primary_text || "")], [F.headline ? F.headline.label : "Headline", esc(ad.headline || "")]].concat(F.description ? [[F.description.label, esc(ad.description || "")]] : []).concat([["CTA", esc(ad.cta || "")], ["Destination", ad.destination_url ? '<a href="' + esc(ad.destination_url) + '" target="_blank" rel="noopener noreferrer" style="color:var(--amber)">' + esc(ad.destination_url) + "</a>" : ""], ["Media", ad.media_id ? "Uploaded file" + (ad.media_url ? " · " + esc(ad.media_url) : "") : esc(ad.media_url || "")]])) + "</div>" +
          "<div>" + adPreview(ad, c) + "</div></div></div>";
      }).join("") : '<p class="fine">No ads in this ' + esc(P.group.toLowerCase()) + ".</p>") + "</div></div>";
  }).join("");
}

function perfTab() {
  return '<div class="metric-empty">' + ["IMPRESSIONS", "CLICKS", "SPEND", "RESULTS"].map(function (k) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v">—</div><div class="d">no data</div></div>'; }).join("") + "</div>" +
    emptyState("chart", "No performance data", "This campaign hasn't been published from MarketScope, so there are no impressions, clicks or spend to show. Performance will appear here once ad accounts can be connected and the campaign runs.", '<button type="button" class="btn btn-ghost" data-goto-pub>' + icon("link") + " About publishing</button>");
}

function pubTab() {
  var c = S.c, P = pf(c.platform), v = validateCampaign(vShape());
  return '<div class="publish-box" style="margin-top:0"><span class="mod-ico" style="color:var(--dim);flex:none">' + icon("lock") + '</span><div style="flex:1"><b>Publish to ' + esc(P.label) + '</b><p>Direct publishing isn\'t available yet. To create ads on ' + esc(P.label) + " for you, MarketScope needs an approved integration with " + esc(P.label) + " and your permission to access your ad account. Until then, this campaign stays a draft in MarketScope only — nothing has been sent anywhere.</p>" +
    (v.errors.length ? '<p style="color:#ffc7cd">This draft also has ' + v.errors.length + " check" + (v.errors.length > 1 ? "s" : "") + " to fix.</p>" : "") +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button type="button" class="btn btn-amber" disabled aria-disabled="true" title="Coming soon — requires platform approval">' + icon("send") + " Publish — coming soon</button>" +
    '<button type="button" class="btn btn-ghost" data-export-md style="margin:0">' + icon("dl") + ' Export brief (.md)</button><button type="button" class="btn btn-ghost" data-export-json style="margin:0">' + icon("dl") + " Export JSON</button></div></div></div>" +
    '<div class="sec-t"><h3>' + icon("link") + ' Ad accounts</h3><span class="chip planned">Coming soon · requires approval</span></div><div class="connect-grid">' + connectCards() + "</div>" +
    '<div class="note" style="margin-top:16px"><b>Publish it yourself today:</b> open ' + esc(P.sub) + "'s own ads manager, create a campaign with the same objective, budget and schedule, then copy each " + esc(P.group.toLowerCase()) + " and ad from the “Ad sets & ads” tab.</div>";
}

function brief() {
  var c = S.c, P = pf(c.platform), a = c.audience || {}, e = estimate(c), L = [];
  L.push("# " + c.name, "", "- Platform: " + P.label, "- Objective: " + objLabel(c.objective), "- Status: " + c.status,
    "- Budget: " + (c.budget_amount ? money(c.budget_amount, c.currency) + (c.budget_type === "daily" ? " per day" : " lifetime") : "—"),
    "- Schedule: " + (c.start_date || "?") + " → " + (c.end_date || "no end date"), "- Estimated max spend (budget × days): " + (e.total != null ? money(e.total, c.currency) : "—"),
    "- Bidding: " + (c.bidding ? bidLabel(c.platform, c.bidding) + (c.bid_amount != null ? " (" + c.bid_amount + ")" : "") : "—"), "- Placements: " + ((c.placements || []).join(", ") || "—"), "",
    "## Audience", "- Locations: " + ((a.locations || []).join(", ") || "—"), "- Age: " + (a.age_min || "?") + "–" + (a.age_max || "?"), "- Gender: " + (a.gender || "all"),
    "- Languages: " + ((a.languages || []).join(", ") || "—"), "- Interests / signals: " + ((a.interests || []).join(", ") || "—"));
  if (a.notes) L.push("- Notes: " + a.notes);
  c.groups.forEach(function (g, i) {
    L.push("", "## " + P.group + " " + (i + 1) + ": " + g.name); if (g.optimization) L.push("- Optimise for: " + g.optimization); if (g.audience_notes) L.push("- Targeting: " + g.audience_notes);
    g.ads.forEach(function (ad) { L.push("", "### " + ad.name, "- Format: " + (ad.format || "—"), "- " + (P.fields.primary_text ? P.fields.primary_text.label : "Text") + ": " + (ad.primary_text || ""), "- " + (P.fields.headline ? P.fields.headline.label : "Headline") + ": " + (ad.headline || "")); if (P.fields.description) L.push("- " + P.fields.description.label + ": " + (ad.description || "")); L.push("- CTA: " + (ad.cta || "—"), "- URL: " + (ad.destination_url || "—"), "- Media: " + (ad.media_url || "—")); });
  });
  if (c.notes) L.push("", "## Notes", c.notes);
  return L.join("\n") + "\n";
}

function bindPanel(el) {
  var b;
  $$("[data-media-id]", el).forEach(function (sp) {
    getMedia(S.sb, sp.getAttribute("data-media-id")).then(function (m) { return m ? mediaTag(S.sb, m, "") : '<span>Media file was deleted</span>'; }).then(function (h) { sp.outerHTML = h; });
  });
  if ((b = $("[data-goto-pub]", el))) b.onclick = function () { S.tab = "publishing"; history.replaceState(null, "", "#publishing"); renderTab(); };
  if ((b = $("[data-export-md]", el))) b.onclick = function () { download(slug(S.c.name) + "-brief.md", brief(), "text/markdown"); };
  if ((b = $("[data-export-json]", el))) b.onclick = function () {
    var c = S.c, out = { platform: c.platform, name: c.name, objective: c.objective, status: c.status, budget_type: c.budget_type, budget_amount: c.budget_amount, currency: c.currency, start_date: c.start_date, end_date: c.end_date, bidding: c.bidding, bid_amount: c.bid_amount, audience: c.audience, placements: c.placements, notes: c.notes,
      ad_groups: c.groups.map(function (g) { return { name: g.name, optimization: g.optimization, audience_notes: g.audience_notes, ads: g.ads.map(function (a) { return { name: a.name, format: a.format, primary_text: a.primary_text, headline: a.headline, description: a.description, cta: a.cta, destination_url: a.destination_url, media_url: a.media_url }; }) }; }) };
    download(slug(c.name) + ".json", JSON.stringify(out, null, 2), "application/json");
  };
  $$("[data-copy-ad]", el).forEach(function (btn) {
    btn.onclick = function () {
      var id = btn.getAttribute("data-copy-ad"), ad = null;
      S.c.groups.forEach(function (g) { g.ads.forEach(function (a) { if (a.id === id) ad = a; }); });
      if (!ad) return;
      copyText([ad.primary_text, ad.headline, ad.description, ad.cta, ad.destination_url].filter(Boolean).join("\n\n")); toast("Ad text copied");
    };
  });
}

boot();
