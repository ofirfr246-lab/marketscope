/* Josy Campaign Manager — paid campaign wizard (create & edit). Saves drafts only. */
import { requireSession, callJosy, $, $$, esc, toast, renderMarkdown, isRtl } from "./josy-core.js";
import {
  icon, PLATFORMS, pf, pfBadge, OBJECTIVES, objLabel, bidLabel, CURRENCIES, money, estimate, ESTIMATE_NOTE,
  validateCampaign, friendlyError, statusChip, tagInput, CM_LIMITS
} from "./josy-cm.js";

var S = { sb: null, step: 0, dirty: false, saving: false, c: null };

function blankAd(i) { return { name: "Ad " + (i + 1), format: "", primary_text: "", headline: "", description: "", cta: "", destination_url: "", media_url: "" }; }
function blankGroup(i) { return { name: (S.c && S.c.platform ? pf(S.c.platform).group : "Ad set") + " " + (i + 1), optimization: "", audience_notes: "", ads: [blankAd(0)] }; }

function newCampaign() {
  var cur = (navigator.language || "").toLowerCase().indexOf("he") === 0 ? "ILS" : "USD";
  return { id: null, platform: "", name: "", objective: "", status: "draft", budget_type: "daily", budget_amount: "", currency: cur,
    start_date: "", end_date: "", bidding: "", bid_amount: "", placements: [], notes: "",
    audience: { locations: [], age_min: 18, age_max: 65, gender: "all", languages: [], interests: [], notes: "" }, ad_groups: [] };
}

async function boot() {
  var r = await requireSession("josy-campaign-new.html" + location.search);
  if (!r.session) return;
  S.sb = r.sb;
  var qs = new URLSearchParams(location.search), id = qs.get("id");
  S.c = newCampaign();
  if (id) {
    var res = await S.sb.from("josy_campaigns").select("*, josy_ad_groups(*, josy_ads(*))").eq("id", id).maybeSingle();
    if (res.error || !res.data) { $("[data-gate]").innerHTML = '<p>Campaign not found. <a href="josy-paid.html" style="color:var(--amber)">Back to campaigns</a></p>'; return; }
    var d = res.data;
    var groups = (d.josy_ad_groups || []).sort(function (a, b) { return a.position - b.position; }).map(function (g) {
      return { name: g.name, optimization: g.optimization || "", audience_notes: g.audience_notes || "",
        ads: (g.josy_ads || []).sort(function (a, b) { return a.position - b.position; }).map(function (a) {
          return { name: a.name, format: a.format || "", primary_text: a.primary_text || "", headline: a.headline || "", description: a.description || "", cta: a.cta || "", destination_url: a.destination_url || "", media_url: a.media_url || "" };
        }) };
    });
    S.c = Object.assign(newCampaign(), {
      id: d.id, platform: d.platform, name: d.name, objective: d.objective, status: d.status, budget_type: d.budget_type,
      budget_amount: d.budget_amount == null ? "" : String(d.budget_amount), currency: d.currency, start_date: d.start_date || "", end_date: d.end_date || "",
      bidding: d.bidding || "", bid_amount: d.bid_amount == null ? "" : String(d.bid_amount), placements: d.placements || [], notes: d.notes || "",
      audience: Object.assign(newCampaign().audience, d.audience || {}), ad_groups: groups
    });
    $("[data-h1]").textContent = "Edit campaign";
    $("[data-crumb]").textContent = d.name;
    document.title = "Edit · " + d.name + " — Josy · MarketScope";
    S.step = Number(qs.get("step")) || 0;
  } else if (qs.get("platform") && PLATFORMS[qs.get("platform")]) {
    S.c.platform = qs.get("platform"); S.c.ad_groups = [blankGroup(0)]; S.step = 1;
  }
  $("[data-gate]").hidden = true; $("[data-shell]").hidden = false;
  $("[data-save-draft]").onclick = function () { save(false); };
  $("[data-ask-josy]").onclick = askJosy;
  window.addEventListener("beforeunload", function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });
  render();
}

/* ---------- state helpers ---------- */
function getPath(k) {
  var parts = k.split("."), o = S.c;
  for (var i = 0; i < parts.length; i++) { var p = parts[i] === "g" ? "ad_groups" : parts[i]; if (o == null) return ""; o = o[p]; }
  return o;
}
function setPath(k, v) {
  var parts = k.split("."), o = S.c;
  for (var i = 0; i < parts.length - 1; i++) { var p = parts[i] === "g" ? "ad_groups" : parts[i]; o = o[p]; }
  o[parts[parts.length - 1]] = v;
  S.dirty = true;
}
function groupLabel() { return S.c.platform ? pf(S.c.platform).group : "Ad set / ad group"; }
function groupsLabel() { return S.c.platform ? pf(S.c.platform).groups : "Ad sets / ad groups"; }
function steps() { return ["Platform & name", "Objective", "Budget & schedule", "Audience", "Placements & bidding", groupsLabel(), "Ads", "Review"]; }

/* ---------- field builders ---------- */
function fld(label, inner, opts) {
  opts = opts || {};
  return '<div class="fld' + (opts.full ? " full" : "") + '"><label' + (opts.for ? ' for="' + opts.for + '"' : "") + ">" + esc(label) + (opts.cnt || "") + "</label>" + inner + (opts.help ? '<div class="help">' + opts.help + "</div>" : "") + "</div>";
}
function inp(k, attrs) { var v = getPath(k); return '<input class="inp" id="f-' + k.replace(/\./g, "-") + '" data-k="' + k + '" value="' + esc(v == null ? "" : v) + '" ' + (attrs || "") + ">"; }
function ta(k, attrs) { var v = getPath(k); return '<textarea class="ta" id="f-' + k.replace(/\./g, "-") + '" data-k="' + k + '" dir="auto" ' + (attrs || "") + ">" + esc(v || "") + "</textarea>"; }
function sel(k, options, placeholder) {
  var v = getPath(k) || "";
  return '<select class="sel" style="width:100%" id="f-' + k.replace(/\./g, "-") + '" data-k="' + k + '">' + (placeholder ? '<option value="">' + esc(placeholder) + "</option>" : "") +
    options.map(function (o) { var val = typeof o === "string" ? o : o[0], lab = typeof o === "string" ? o : o[1]; return '<option value="' + esc(val) + '"' + (val === v ? " selected" : "") + ">" + esc(lab) + "</option>"; }).join("") + "</select>";
}
function cnt(k, max) { var n = (getPath(k) || "").length; return '<span class="cnt' + (n > max ? " over" : "") + '" data-cnt="' + k + '" data-max="' + max + '">' + n + " / " + max + "</span>"; }

/* ---------- render ---------- */
function render() {
  var st = steps(), v = validateCampaign(S.c);
  var bad = {}; v.errors.forEach(function (e) { bad[e.step] = true; });
  $("[data-steps]").innerHTML = st.map(function (t, i) {
    var cls = "wz-step" + (i === S.step ? " on" : "") + (i < S.step && !bad[i] ? " done" : "") + (i < S.step && bad[i] ? " bad" : "");
    return '<button type="button" class="' + cls + '" data-go="' + i + '"' + (i === S.step ? ' aria-current="step"' : "") + '><span class="n">' + (i < S.step && !bad[i] ? "✓" : i + 1) + "</span>" + esc(t) + "</button>";
  }).join("");
  $$("[data-go]").forEach(function (b) { b.onclick = function () { go(Number(b.getAttribute("data-go"))); }; });
  var body = $("[data-step-body]");
  body.innerHTML = [stepPlatform, stepObjective, stepBudget, stepAudience, stepPlacements, stepGroups, stepAds, stepReview][S.step]() + foot();
  bindBody(body);
  renderSummary();
}
function go(i) {
  if (i > 0 && !S.c.platform) { toast("Choose a platform first"); i = 0; }
  S.step = Math.max(0, Math.min(7, i)); render();
  window.scrollTo({ top: Math.max(0, $("[data-shell]").getBoundingClientRect().top + scrollY - 130), behavior: "smooth" });
}
function foot() {
  var last = S.step === 7;
  return '<div class="wiz-foot"><button type="button" class="btn btn-ghost" data-prev' + (S.step === 0 ? " disabled" : "") + ">← Back</button><div style=\"display:flex;gap:8px;flex-wrap:wrap\">" +
    (last ? '<button type="button" class="btn btn-ghost" data-save>' + icon("dl") + ' Save as draft</button><button type="button" class="btn btn-amber" data-ready>' + icon("check") + " Mark ready</button>"
      : '<button type="button" class="btn btn-amber" data-next>Next: ' + esc(steps()[S.step + 1]) + " →</button>") + "</div></div>";
}

function stepPlatform() {
  return '<h2>Platform & name</h2><p class="lead2">Where will this campaign run? Options in the next steps follow each platform\'s structure.</p>' +
    '<div class="opt-grid" style="margin-bottom:20px">' + ["meta", "tiktok", "google"].map(function (id) {
      var p = PLATFORMS[id];
      return '<button type="button" class="opt' + (S.c.platform === id ? " on" : "") + '" data-platform="' + id + '">' + pfBadge(id) + "<b>" + p.label + "</b><span>" + p.sub + " · campaign → " + p.groups.toLowerCase() + " → ads</span></button>";
    }).join("") + "</div>" +
    '<div class="fgrid">' + fld("CAMPAIGN NAME", inp("name", 'maxlength="120" placeholder="e.g. Spring sale — retargeting" dir="auto"'), { full: true, for: "f-name", cnt: cnt("name", 120) }) +
    fld("INTERNAL NOTES", ta("notes", 'maxlength="4000" rows="3" placeholder="Anything you want to remember about this campaign (optional)"'), { full: true, for: "f-notes" }) + "</div>";
}
function stepObjective() {
  return '<h2>Objective</h2><p class="lead2">What do you want people to do? This shapes optimisation and which fields matter.</p><div class="opt-grid">' +
    OBJECTIVES.map(function (o) { return '<button type="button" class="opt' + (S.c.objective === o.id ? " on" : "") + '" data-objective="' + o.id + '"><span class="oi">' + icon(o.icon) + "</span><b>" + o.label + "</b><span>" + o.desc + "</span></button>"; }).join("") + "</div>";
}
function stepBudget() {
  var e = estimate(S.c);
  return '<h2>Budget & schedule</h2><p class="lead2">Set how much you plan to spend and when the campaign should run.</p>' +
    '<div class="fld" style="margin-bottom:16px"><span class="lbl">BUDGET TYPE</span><div class="cseg" role="group"><button type="button" data-btype="daily" class="' + (S.c.budget_type === "daily" ? "on" : "") + '">Daily budget</button><button type="button" data-btype="lifetime" class="' + (S.c.budget_type === "lifetime" ? "on" : "") + '">Lifetime budget</button></div>' +
    '<div class="help">' + (S.c.budget_type === "daily" ? "Average amount per day." : "Total amount for the whole schedule (needs an end date).") + "</div></div>" +
    '<div class="fgrid">' + fld("AMOUNT", inp("budget_amount", 'type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" data-num'), { for: "f-budget_amount" }) +
    fld("CURRENCY", sel("currency", Object.keys(CURRENCIES).map(function (k) { return [k, k + " · " + CURRENCIES[k]]; })), { for: "f-currency" }) +
    fld("START DATE", inp("start_date", 'type="date"'), { for: "f-start_date" }) +
    fld("END DATE", inp("end_date", 'type="date"'), { for: "f-end_date", help: S.c.budget_type === "lifetime" ? "Required for lifetime budgets." : "Optional for daily budgets." }) + "</div>" +
    '<div class="spend" data-spend-inline style="margin-top:18px">' + spendHtml(e) + "</div>";
}
function spendHtml(e) {
  return '<div class="k">ESTIMATED MAX SPEND</div><div class="v">' + (e.total != null ? money(e.total, S.c.currency) : e.perDay != null ? money(e.perDay, S.c.currency) + "/day" : "—") + "</div><p>" + esc(e.text) + (e.total != null && e.perDay != null && S.c.budget_type === "lifetime" ? " ≈ " + money(Math.round(e.perDay * 100) / 100, S.c.currency) + " per day." : "") + "</p><p style=\"margin-top:6px\">" + esc(ESTIMATE_NOTE) + "</p>";
}
function stepAudience() {
  var a = S.c.audience, g = S.c.platform === "google";
  return '<h2>Audience</h2><p class="lead2">Who should see your ads? Describe it the way you\'d set it up on ' + esc(pf(S.c.platform).label) + ".</p>" +
    '<div class="fgrid">' +
    fld("LOCATIONS", '<div class="tags" data-tags="audience.locations"></div>', { full: true, help: "Countries, regions or cities. Press Enter after each." }) +
    fld("AGE FROM", inp("audience.age_min", 'type="number" min="13" max="65" data-num'), { for: "f-audience-age_min" }) +
    fld("AGE TO", inp("audience.age_max", 'type="number" min="13" max="65" data-num'), { for: "f-audience-age_max", help: "65 means 65 and older." }) +
    '<div class="fld full"><span class="lbl">GENDER</span><div class="cseg" role="group">' + [["all", "All"], ["female", "Women"], ["male", "Men"]].map(function (x) { return '<button type="button" data-gender="' + x[0] + '" class="' + (a.gender === x[0] ? "on" : "") + '">' + x[1] + "</button>"; }).join("") + "</div></div>" +
    fld("LANGUAGES", '<div class="tags" data-tags="audience.languages"></div>', { full: true, help: "Optional, e.g. Hebrew, English." }) +
    fld(g ? "KEYWORDS & AUDIENCE SIGNALS" : "INTERESTS & BEHAVIOURS", '<div class="tags" data-tags="audience.interests"></div>', { full: true, help: g ? "Search keywords or audience segments you plan to use." : "Interests, behaviours or custom audiences you plan to use." }) +
    fld("AUDIENCE NOTES", ta("audience.notes", 'rows="3" maxlength="2000" placeholder="Exclusions, lookalikes, remarketing lists, anything else"'), { full: true, for: "f-audience-notes" }) + "</div>";
}
function stepPlacements() {
  var P = pf(S.c.platform), b = P.bidding.find(function (x) { return x.id === S.c.bidding; });
  return '<h2>Placements & bidding</h2><p class="lead2">Where ads appear and how the platform should bid.</p>' +
    '<div class="fld" style="margin-bottom:22px"><span class="lbl">PLACEMENTS</span><div class="cpills">' + P.placements.map(function (p) { return '<span class="cpill' + (S.c.placements.indexOf(p) >= 0 ? " on" : "") + '" role="checkbox" tabindex="0" aria-checked="' + (S.c.placements.indexOf(p) >= 0) + '" data-place="' + esc(p) + '">' + esc(p) + "</span>"; }).join("") + "</div>" +
    '<div class="help">Automatic placement usually lets the platform pick what performs best for your objective.</div></div>' +
    '<div class="fld"><span class="lbl">BIDDING STRATEGY</span></div><div class="opt-grid">' + P.bidding.map(function (x) { return '<button type="button" class="opt' + (S.c.bidding === x.id ? " on" : "") + '" data-bid="' + x.id + '"><b>' + esc(x.label) + "</b><span>" + esc(x.desc) + "</span></button>"; }).join("") + "</div>" +
    (b && b.amount ? '<div class="fgrid" style="margin-top:16px">' + fld(b.amount.toUpperCase() + (b.ratio ? "" : " (" + S.c.currency + ")"), inp("bid_amount", 'type="number" min="0" step="0.01" data-num'), { for: "f-bid_amount" }) + "</div>" : "");
}
function stepGroups() {
  var P = pf(S.c.platform);
  return "<h2>" + esc(P.groups) + '</h2><p class="lead2">' + esc(P.label) + " campaigns are organised as campaign → " + esc(P.groups.toLowerCase()) + " → ads. Use separate " + esc(P.groups.toLowerCase()) + " to test audiences or themes.</p>" +
    S.c.ad_groups.map(function (g, i) {
      return '<div class="grp"><div class="grp-h"><span class="mono" style="color:var(--dim);font-size:.72rem">' + esc(P.group.toUpperCase()) + " " + (i + 1) + '</span><span class="sp"></span><span class="muted2 mono" style="font-size:.72rem;color:var(--dim)">' + g.ads.length + " ad" + (g.ads.length === 1 ? "" : "s") + "</span>" +
        '<button type="button" class="icon-btn" data-gdup="' + i + '" title="Duplicate" aria-label="Duplicate">' + icon("copy") + '</button><button type="button" class="icon-btn danger" data-gdel="' + i + '" title="Remove" aria-label="Remove">' + icon("trash") + "</button></div>" +
        '<div class="grp-b"><div class="fgrid">' + fld("NAME", inp("g." + i + ".name", 'maxlength="120" dir="auto"'), { for: "f-g-" + i + "-name" }) +
        fld("OPTIMISE FOR", sel("g." + i + ".optimization", P.optimization, "Choose…"), { for: "f-g-" + i + "-optimization" }) +
        fld("AUDIENCE / TARGETING NOTES", ta("g." + i + ".audience_notes", 'rows="2" maxlength="2000" placeholder="How this ' + esc(P.group.toLowerCase()) + ' differs (audience, keywords, theme)"'), { full: true, for: "f-g-" + i + "-audience_notes" }) + "</div></div></div>";
    }).join("") +
    (S.c.ad_groups.length < CM_LIMITS.ad_groups ? '<button type="button" class="btn btn-ghost" data-gadd style="margin:0">' + icon("plus") + " Add " + esc(P.group.toLowerCase()) + "</button>" : '<p class="fine">Maximum of ' + CM_LIMITS.ad_groups + " reached.</p>");
}
function stepAds() {
  var P = pf(S.c.platform);
  if (!S.c.ad_groups.length) return '<h2>Ads</h2><p class="lead2">Add a ' + esc(P.group.toLowerCase()) + ' first.</p><button type="button" class="btn btn-amber" data-go2="5" style="margin:0">Go to ' + esc(P.groups.toLowerCase()) + "</button>";
  return '<h2>Ads</h2><p class="lead2">Write each ad. Counters follow ' + esc(P.label) + "'s text guidance — red means over the limit.</p>" +
    S.c.ad_groups.map(function (g, gi) {
      return '<div class="grp"><div class="grp-h"><b style="font-size:.92rem">' + esc(g.name || P.group + " " + (gi + 1)) + '</b><span class="sp"></span>' +
        (g.ads.length < CM_LIMITS.ads ? '<button type="button" class="btn btn-sm btn-ghost" data-aadd="' + gi + '" style="margin:0">' + icon("plus") + " Add ad</button>" : "") + '</div><div class="grp-b">' +
        (g.ads.length ? "" : '<p class="fine">No ads in this ' + esc(P.group.toLowerCase()) + " yet.</p>") +
        g.ads.map(function (a, ai) {
          var base = "g." + gi + ".ads." + ai + ".";
          var F = P.fields, rows = [];
          rows.push(fld("FORMAT", sel(base + "format", P.formats, "Choose…"), { for: "f-" + (base + "format").replace(/\./g, "-") }));
          rows.push(fld("CALL TO ACTION", sel(base + "cta", P.ctas, "Choose…"), { for: "f-" + (base + "cta").replace(/\./g, "-") }));
          ["primary_text", "headline", "description"].forEach(function (k) {
            var f = F[k]; if (!f) return;
            var el = k === "primary_text" ? ta(base + k, 'rows="3" maxlength="3000"') : inp(base + k, 'maxlength="' + (k === "headline" ? 300 : 1000) + '" dir="auto"');
            rows.push(fld(f.label.toUpperCase(), el, { full: true, for: "f-" + (base + k).replace(/\./g, "-"), cnt: cnt(base + k, f.max), help: esc(f.help) + (f.hard ? "" : " Recommendation.") }));
          });
          rows.push(fld("DESTINATION URL", inp(base + "destination_url", 'type="url" placeholder="https://" maxlength="2000"'), { full: true, for: "f-" + (base + "destination_url").replace(/\./g, "-") }));
          rows.push(fld("MEDIA URL", inp(base + "media_url", 'type="url" placeholder="Link to the image or video (optional)" maxlength="2000"'), { full: true, for: "f-" + (base + "media_url").replace(/\./g, "-"), help: "Paste a link to your creative (e.g. from your drive). It isn't uploaded anywhere." }));
          return '<div class="ad"><div class="ad-h">' + inp(base + "name", 'maxlength="120" aria-label="Ad name"') + '<span class="sp"></span><button type="button" class="icon-btn" data-adup="' + gi + "," + ai + '" title="Duplicate ad" aria-label="Duplicate ad">' + icon("copy") + '</button><button type="button" class="icon-btn danger" data-adel="' + gi + "," + ai + '" title="Remove ad" aria-label="Remove ad">' + icon("trash") + '</button></div><div class="fgrid">' + rows.join("") + "</div></div>";
        }).join("") + "</div></div>";
    }).join("");
}
function stepReview() {
  var c = S.c, P = pf(c.platform), v = validateCampaign(c), a = c.audience, e = estimate(c);
  var issues = v.errors.map(function (x) { return '<li class="e">✕ <span>' + esc(x.msg) + '</span><button type="button" data-go2="' + x.step + '">Fix</button></li>'; }).join("") +
    v.warnings.map(function (x) { return '<li class="w">! <span>' + esc(x.msg) + '</span><button type="button" data-go2="' + x.step + '">Review</button></li>'; }).join("");
  if (!issues) issues = '<li class="ok">✓ <span>Everything looks complete. You can mark this campaign ready.</span></li>';
  function sec(title, step, kv) { return '<div class="review-sec"><h5>' + esc(title) + '<button type="button" data-go2="' + step + '">Edit</button></h5><div class="kv">' + kv.map(function (r) { return "<span>" + esc(r[0]) + "</span><b>" + (r[1] || "—") + "</b>"; }).join("") + "</div></div>"; }
  var adsCount = c.ad_groups.reduce(function (n, g) { return n + g.ads.length; }, 0);
  return '<h2>Review</h2><p class="lead2">Errors must be fixed before marking the campaign ready. Warnings are suggestions.</p><ul class="issues">' + issues + "</ul>" +
    sec("Campaign", 0, [["Platform", P.label], ["Name", esc(c.name)], ["Objective", objLabel(c.objective)], ["Notes", esc(c.notes)]]) +
    sec("Budget & schedule", 2, [["Budget", c.budget_amount ? money(c.budget_amount, c.currency) + (c.budget_type === "daily" ? " per day" : " lifetime") : ""], ["Schedule", (c.start_date || "?") + " → " + (c.end_date || "no end date")], ["Estimated max spend", e.total != null ? money(e.total, c.currency) : e.perDay != null ? money(e.perDay, c.currency) + "/day, ongoing" : ""]]) +
    sec("Audience", 3, [["Locations", esc((a.locations || []).join(", "))], ["Age", (a.age_min || "?") + "–" + (a.age_max || "?") + (Number(a.age_max) >= 65 ? "+" : "")], ["Gender", { all: "All", female: "Women", male: "Men" }[a.gender] || "All"], ["Languages", esc((a.languages || []).join(", "))], [c.platform === "google" ? "Keywords & signals" : "Interests", esc((a.interests || []).join(", "))]]) +
    sec("Placements & bidding", 4, [["Placements", esc((c.placements || []).join(", "))], ["Bidding", bidLabel(c.platform, c.bidding) + (c.bid_amount ? " · " + esc(c.bid_amount) : "")]]) +
    sec("Structure", 5, [[P.groups, String(c.ad_groups.length)], ["Ads", String(adsCount)]]) +
    '<div class="publish-box"><span class="mod-ico" style="color:var(--dim);flex:none">' + icon("lock") + '</span><div><b>Publishing to ' + esc(P.label) + ' is coming soon</b><p>Marking a campaign ready only saves it in MarketScope. Nothing is sent to ' + esc(P.label) + " — connecting ad accounts requires an approved integration. You can copy everything over manually from the campaign page.</p></div></div>";
}

/* ---------- binding ---------- */
function bindBody(body) {
  $$("[data-k]", body).forEach(function (el) {
    el.addEventListener("input", function () {
      var k = el.getAttribute("data-k"), v = el.value;
      if (el.hasAttribute("data-num")) v = v === "" ? "" : v;
      setPath(k, v);
      var c = $('[data-cnt="' + k + '"]', body);
      if (c) { var n = v.length, m = Number(c.getAttribute("data-max")); c.textContent = n + " / " + m; c.classList.toggle("over", n > m); }
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.setAttribute("dir", isRtl(v) ? "rtl" : "auto");
      var sp = $("[data-spend-inline]", body); if (sp) sp.innerHTML = spendHtml(estimate(S.c));
      renderSummary();
    });
    if (el.tagName === "SELECT") el.addEventListener("change", function () { setPath(el.getAttribute("data-k"), el.value); renderSummary(); });
  });
  $$("[data-tags]", body).forEach(function (el) {
    var k = el.getAttribute("data-tags");
    tagInput(el, getPath(k) || [], { label: k, placeholder: k.indexOf("locations") > 0 ? "e.g. Israel, Tel Aviv" : "Type and press Enter", max: 50,
      onChange: function (vals) { setPath(k, vals); renderSummary(); } });
  });
  $$("[data-platform]", body).forEach(function (b) {
    b.onclick = function () {
      var id = b.getAttribute("data-platform"), P = pf(id), old = S.c.platform;
      S.c.platform = id; S.dirty = true;
      if (old !== id) {
        S.c.placements = S.c.placements.filter(function (p) { return P.placements.indexOf(p) >= 0; });
        if (!P.bidding.find(function (x) { return x.id === S.c.bidding; })) { S.c.bidding = ""; S.c.bid_amount = ""; }
        S.c.ad_groups.forEach(function (g, i) {
          if (P.optimization.indexOf(g.optimization) < 0) g.optimization = "";
          if (old && g.name === pf(old).group + " " + (i + 1)) g.name = P.group + " " + (i + 1);
          g.ads.forEach(function (a) { if (P.formats.indexOf(a.format) < 0) a.format = ""; if (P.ctas.indexOf(a.cta) < 0) a.cta = ""; });
        });
      }
      if (!S.c.ad_groups.length) S.c.ad_groups = [blankGroup(0)];
      render();
    };
  });
  $$("[data-objective]", body).forEach(function (b) { b.onclick = function () { S.c.objective = b.getAttribute("data-objective"); S.dirty = true; render(); }; });
  $$("[data-btype]", body).forEach(function (b) { b.onclick = function () { S.c.budget_type = b.getAttribute("data-btype"); S.dirty = true; render(); }; });
  $$("[data-gender]", body).forEach(function (b) { b.onclick = function () { S.c.audience.gender = b.getAttribute("data-gender"); S.dirty = true; render(); }; });
  $$("[data-place]", body).forEach(function (b) {
    var t = function () { var p = b.getAttribute("data-place"), i = S.c.placements.indexOf(p); if (i >= 0) S.c.placements.splice(i, 1); else S.c.placements.push(p); S.dirty = true; render(); };
    b.onclick = t; b.onkeydown = function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); t(); } };
  });
  $$("[data-bid]", body).forEach(function (b) { b.onclick = function () { S.c.bidding = b.getAttribute("data-bid"); S.dirty = true; render(); }; });
  var ga = $("[data-gadd]", body); if (ga) ga.onclick = function () { S.c.ad_groups.push(blankGroup(S.c.ad_groups.length)); S.dirty = true; render(); };
  $$("[data-gdel]", body).forEach(function (b) { b.onclick = function () { S.c.ad_groups.splice(Number(b.getAttribute("data-gdel")), 1); S.dirty = true; render(); }; });
  $$("[data-gdup]", body).forEach(function (b) { b.onclick = function () { if (S.c.ad_groups.length >= CM_LIMITS.ad_groups) return toast("Limit reached"); var i = Number(b.getAttribute("data-gdup")); var g = JSON.parse(JSON.stringify(S.c.ad_groups[i])); g.name = (g.name + " (copy)").slice(0, 120); S.c.ad_groups.splice(i + 1, 0, g); S.dirty = true; render(); }; });
  $$("[data-aadd]", body).forEach(function (b) { b.onclick = function () { var g = S.c.ad_groups[Number(b.getAttribute("data-aadd"))]; g.ads.push(blankAd(g.ads.length)); S.dirty = true; render(); }; });
  $$("[data-adel]", body).forEach(function (b) { b.onclick = function () { var p = b.getAttribute("data-adel").split(","); S.c.ad_groups[+p[0]].ads.splice(+p[1], 1); S.dirty = true; render(); }; });
  $$("[data-adup]", body).forEach(function (b) { b.onclick = function () { var p = b.getAttribute("data-adup").split(","), g = S.c.ad_groups[+p[0]]; if (g.ads.length >= CM_LIMITS.ads) return toast("Limit reached"); var a = JSON.parse(JSON.stringify(g.ads[+p[1]])); a.name = (a.name + " (copy)").slice(0, 120); g.ads.splice(+p[1] + 1, 0, a); S.dirty = true; render(); }; });
  $$("[data-go2]", body).forEach(function (b) { b.onclick = function () { go(Number(b.getAttribute("data-go2"))); }; });
  var pv = $("[data-prev]", body); if (pv) pv.onclick = function () { go(S.step - 1); };
  var nx = $("[data-next]", body); if (nx) nx.onclick = function () { go(S.step + 1); };
  var sv = $("[data-save]", body); if (sv) sv.onclick = function () { save(false); };
  var rd = $("[data-ready]", body); if (rd) rd.onclick = function () { save(true); };
}

function renderSummary() {
  var c = S.c, P = c.platform ? pf(c.platform) : null, e = estimate(c), v = validateCampaign(c);
  var ads = c.ad_groups.reduce(function (n, g) { return n + g.ads.length; }, 0);
  $("[data-summary]").innerHTML = "<h4>CAMPAIGN SUMMARY</h4>" +
    (P ? '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">' + pfBadge(c.platform) + '<div style="min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.name || "Untitled campaign") + "</b>" + statusChip(c.status || "draft") + "</div></div>" : '<p class="fine">Pick a platform to start.</p>') +
    [["Objective", objLabel(c.objective)], ["Budget", c.budget_amount ? money(c.budget_amount, c.currency) + (c.budget_type === "daily" ? "/day" : " total") : "—"],
     ["Schedule", c.start_date ? c.start_date + (c.end_date ? " → " + c.end_date : " → ongoing") : "—"], ["Locations", (c.audience.locations || []).length ? esc(c.audience.locations.slice(0, 3).join(", ")) + (c.audience.locations.length > 3 ? " +" + (c.audience.locations.length - 3) : "") : "—"],
     ["Bidding", c.bidding ? esc(bidLabel(c.platform, c.bidding)) : "—"], [P ? P.groups : "Groups", String(c.ad_groups.length)], ["Ads", String(ads)]]
      .map(function (r) { return '<div class="sum-row"><span>' + r[0] + "</span><b>" + r[1] + "</b></div>"; }).join("") +
    '<div class="spend">' + spendHtml(e) + "</div>" +
    '<div class="sum-row" style="border:0;margin-top:8px"><span>Checks</span><b>' + (v.errors.length ? '<span style="color:var(--red)">' + v.errors.length + " to fix</span>" : '<span style="color:var(--green)">No errors</span>') + (v.warnings.length ? ' · <span style="color:var(--amber)">' + v.warnings.length + " warning" + (v.warnings.length > 1 ? "s" : "") + "</span>" : "") + "</b></div>";
}

/* ---------- save ---------- */
function payload(status) {
  var c = S.c;
  return { id: c.id || "", platform: c.platform, name: (c.name || "").trim() || "Untitled campaign", objective: c.objective || "traffic", status: status,
    budget_type: c.budget_type, budget_amount: c.budget_amount === "" ? "" : String(c.budget_amount), currency: c.currency,
    start_date: c.start_date || "", end_date: c.end_date || "", bidding: c.bidding || "", bid_amount: c.bid_amount === "" ? "" : String(c.bid_amount),
    audience: c.audience, placements: c.placements, notes: c.notes || "",
    ad_groups: c.ad_groups.map(function (g, i) { return { name: (g.name || "").trim() || pf(c.platform).group + " " + (i + 1), optimization: g.optimization, audience_notes: g.audience_notes,
      ads: g.ads.map(function (a, j) { return Object.assign({}, a, { name: (a.name || "").trim() || "Ad " + (j + 1) }); }) }; }) };
}
async function save(ready) {
  if (S.saving) return;
  if (!S.c.platform) { toast("Choose a platform first"); go(0); return; }
  var v = validateCampaign(S.c);
  if (S.c.start_date && S.c.end_date && S.c.end_date < S.c.start_date) { toast("End date is before the start date"); go(2); return; }
  if (ready && v.errors.length) { toast("Fix " + v.errors.length + " issue" + (v.errors.length > 1 ? "s" : "") + " before marking ready"); go(7); return; }
  var status = ready ? "ready" : (S.c.status === "ready" && v.errors.length ? "draft" : (S.c.status || "draft"));
  S.saving = true;
  var r = await S.sb.rpc("josy_save_campaign", { p: payload(status) });
  S.saving = false;
  if (r.error) { toast(friendlyError(r.error)); return; }
  S.c.id = r.data; S.c.status = status; S.dirty = false;
  if (ready) { toast("Campaign marked ready"); location.href = "josy-campaign.html?id=" + r.data; return; }
  history.replaceState(null, "", "josy-campaign-new.html?id=" + r.data + "&step=" + S.step);
  $("[data-h1]").textContent = "Edit campaign"; $("[data-crumb]").textContent = S.c.name || "Untitled campaign";
  toast("Draft saved"); render();
}

/* ---------- Ask Josy (optional) ---------- */
async function askJosy() {
  var box = $("[data-assist]"), btn = $("[data-ask-josy]");
  if (!S.c.platform) { toast("Choose a platform first"); return; }
  var c = payload(S.c.status || "draft"); delete c.id;
  var json = JSON.stringify(c);
  if (json.length > 3000) json = json.slice(0, 3000) + "…";
  var msg = "Help me complete this " + pf(S.c.platform).label + " paid campaign draft from the MarketScope campaign manager. " +
    "Suggest concrete values for anything empty or weak: objective, audience (locations, ages, interests), placements, bidding strategy, " + pf(S.c.platform).groups.toLowerCase() +
    " and ad copy that fits the character limits (" + Object.keys(pf(S.c.platform).fields).filter(function (k) { return pf(S.c.platform).fields[k]; }).map(function (k) { var f = pf(S.c.platform).fields[k]; return f.label + " " + f.max; }).join(", ") + "). " +
    "Do not invent reach, results or performance numbers. Reply as a short checklist I can copy into the form. Draft: " + json;
  btn.disabled = true; box.hidden = false;
  box.innerHTML = '<div class="kicker mono" style="margin-bottom:6px">JOSY · SUGGESTIONS</div><p class="fine">Josy is reading your draft… (uses 1 Josy message)</p>';
  var r = await callJosy(S.sb, { message: msg, lang: isRtl(S.c.name + " " + (S.c.notes || "")) ? "he" : "en", market: "US" });
  btn.disabled = false;
  if (!r.ok) { box.innerHTML = '<div class="kicker mono" style="margin-bottom:6px">JOSY</div><p class="form-msg">' + esc((r.data && r.data.error) || "Josy couldn't answer right now.") + "</p>"; return; }
  box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px"><div class="kicker mono">JOSY · SUGGESTIONS</div><div style="display:flex;gap:6px"><a class="btn btn-sm btn-ghost" style="margin:0" href="josy-chat.html#c=' + esc(r.data.conversation_id) + '">Continue in chat</a><button type="button" class="icon-btn" data-close-assist aria-label="Close">✕</button></div></div>' +
    '<div class="md">' + renderMarkdown(r.data.reply || "") + '</div><p class="fine" style="margin-top:8px">Suggestions only — nothing in your form was changed. Copy what you like into the fields.</p>';
  $("[data-close-assist]").onclick = function () { box.hidden = true; };
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

boot();
