/* Josy Campaign Manager — organic planner: compose, schedule, calendar, import from My plans */
import { requireSession, $, $$, esc, toast, confirmDialog, copyText, fmtDate, isRtl } from "./josy-core.js";
import { icon, ORG, ORG_KEYS, statusChip, emptyState, friendlyError, isUrl, tagInput } from "./josy-cm.js";

var S = { sb: null, posts: [], items: [], plans: [], view: "list", month: null, edit: null, prevPf: null };

async function boot() {
  var r = await requireSession("josy-organic.html");
  if (!r.session) return;
  S.sb = r.sb;
  var d = new Date(); S.month = new Date(d.getFullYear(), d.getMonth(), 1);
  await Promise.all([loadPosts(), loadPlanItems()]);
  $("[data-gate]").hidden = true; $("[data-shell]").hidden = false;
  $("[data-new-post]").onclick = function () { openComposer(null); };
  $("[data-import]").onclick = openImport;
  $$("[data-view]").forEach(function (b) { b.onclick = function () { S.view = b.getAttribute("data-view"); $$("[data-view]").forEach(function (x) { x.classList.toggle("on", x === b); }); renderPosts(); }; });
  ["[data-q]", "[data-f-platform]", "[data-f-status]"].forEach(function (s) { $(s).addEventListener("input", renderPosts); });
  window.addEventListener("beforeunload", function (e) { if (S.edit && S.edit.dirty) { e.preventDefault(); e.returnValue = ""; } });
  renderPosts();
  route();
}
function route() {
  var h = location.hash;
  if (h === "#new") openComposer(null);
  var m = h.match(/post=([0-9a-f-]{36})/i);
  if (m) { var p = S.posts.find(function (x) { return x.id === m[1]; }); if (p) openComposer(p); }
}

async function loadPosts() {
  var r = await S.sb.from("josy_organic_posts").select("*").order("updated_at", { ascending: false }).limit(2000);
  if (r.error) toast("Couldn't load posts. Please refresh.");
  S.posts = r.data || [];
}
async function loadPlanItems() {
  var r = await S.sb.from("josy_plans").select("id, title, kind, josy_plan_items(id, title, body, channel, format, scheduled_date, position)").order("created_at", { ascending: false }).limit(200);
  S.plans = (r.data || []).filter(function (p) { return (p.josy_plan_items || []).length; });
  S.items = [];
  S.plans.forEach(function (p) { (p.josy_plan_items || []).forEach(function (it) { it.plan_title = p.title; it.plan_id = p.id; S.items.push(it); }); });
}

/* ---------- composer ---------- */
function openComposer(p) {
  S.edit = p ? JSON.parse(JSON.stringify(p)) : { id: null, title: "", platforms: [], content: "", hashtags: [], media_url: "", media_notes: "", status: "draft", scheduled_at: null, published_at: null, plan_item_id: null };
  S.edit.dirty = false;
  S.prevPf = S.edit.platforms[0] || "instagram";
  $("[data-composer-wrap]").hidden = false;
  renderComposer();
  $("[data-composer-wrap]").scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", p ? "#post=" + p.id : "#new");
}
function closeComposer() { S.edit = null; $("[data-composer-wrap]").hidden = true; history.replaceState(null, "", location.pathname); }

function toLocalInput(iso) { if (!iso) return ""; var d = new Date(iso); var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); }
function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }
function fullText(e) { var t = (e.content || "").trim(); var h = (e.hashtags || []).map(function (x) { return "#" + x; }).join(" "); return h ? (t ? t + "\n\n" : "") + h : t; }

function checks(e) {
  var E = [], W = [], len = fullText(e).length;
  if (!e.platforms.length) E.push("Choose at least one platform.");
  if (!(e.content || "").trim() && !e.media_url) E.push("Write something or add a media link.");
  if (e.status === "scheduled" && !e.scheduled_at) E.push("Pick a date and time to schedule.");
  if (e.media_url && !isUrl(e.media_url)) E.push("Media URL must be a valid link.");
  e.platforms.forEach(function (k) {
    var o = ORG[k];
    if (len > o.max) (e.status === "draft" ? W : E).push(o.label + ": " + len + "/" + o.max + " characters" + (e.status === "draft" ? " — shorten before scheduling." : "."));
    if (o.tagsHard && e.hashtags.length > o.tags) (e.status === "draft" ? W : E).push(o.label + " allows up to " + o.tags + " hashtags.");
    else if (o.tags && !o.tagsHard && e.hashtags.length > o.tags) W.push(o.label + ": more than " + o.tags + " hashtags is usually too many.");
  });
  if ((e.platforms.indexOf("tiktok") >= 0 || e.platforms.indexOf("instagram") >= 0) && !e.media_url && !e.media_notes) W.push("Instagram and TikTok posts need an image or video — add a media link or notes.");
  if (e.status === "scheduled" && e.scheduled_at && new Date(e.scheduled_at) < new Date()) W.push("Scheduled time is in the past.");
  return { errors: E, warnings: W };
}

function renderComposer() {
  var e = S.edit;
  var el = $("[data-composer]");
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px"><h2 style="margin:0">' + (e.id ? "Edit post" : "New post") + "</h2>" +
    (e.plan_item_id ? '<span class="chip live">From My plans</span>' : "") + '<button type="button" class="icon-btn" data-close aria-label="Close composer">✕</button></div>' +
    '<div class="fgrid">' +
    '<div class="fld full"><label for="o-title">TITLE (INTERNAL)</label><input class="inp" id="o-title" data-f="title" maxlength="160" dir="auto" placeholder="e.g. Launch teaser #1" value="' + esc(e.title || "") + '"></div>' +
    '<div class="fld full"><span class="lbl">PLATFORMS</span><div class="pf-pick">' + ORG_KEYS.map(function (k) { return '<span class="pf-chip' + (e.platforms.indexOf(k) >= 0 ? " on" : "") + '" role="checkbox" tabindex="0" aria-checked="' + (e.platforms.indexOf(k) >= 0) + '" data-pf="' + k + '"><span class="pf-dot" style="background:' + ORG[k].color + '"></span>' + ORG[k].label + "</span>"; }).join("") + "</div></div>" +
    '<div class="fld full"><label for="o-content">POST TEXT</label><textarea class="ta" id="o-content" data-f="content" rows="7" maxlength="10000" dir="' + (isRtl(e.content) ? "rtl" : "auto") + '" placeholder="Write your caption…">' + esc(e.content || "") + '</textarea><div class="limits-row" data-limits></div></div>' +
    '<div class="fld full"><span class="lbl">HASHTAGS</span><div class="tags" data-hashtags></div><div class="help">Without the # — press Enter after each. Instagram allows up to 30.</div></div>' +
    '<div class="fld"><label for="o-media">MEDIA URL</label><input class="inp" id="o-media" data-f="media_url" type="url" maxlength="2000" placeholder="https://" value="' + esc(e.media_url || "") + '"></div>' +
    '<div class="fld"><label for="o-mnotes">MEDIA NOTES</label><input class="inp" id="o-mnotes" data-f="media_notes" maxlength="2000" dir="auto" placeholder="e.g. 15s vertical video, product close-up" value="' + esc(e.media_notes || "") + '"></div>' +
    '<div class="fld full"><span class="lbl">STATUS</span><div class="cseg" role="group">' + [["draft", "Draft"], ["scheduled", "Scheduled"], ["published", "Published"]].map(function (s) { return '<button type="button" data-st="' + s[0] + '" class="' + (e.status === s[0] ? "on" : "") + '">' + s[1] + "</button>"; }).join("") + "</div>" +
    '<div class="help">MarketScope doesn\'t post for you. “Scheduled” is your plan; mark it “Published” after you post it yourself.</div></div>' +
    (e.status !== "draft" || e.scheduled_at ? '<div class="fld"><label for="o-when">' + (e.status === "published" ? "PLANNED FOR" : "SCHEDULED FOR") + '</label><input class="inp" id="o-when" type="datetime-local" data-when value="' + toLocalInput(e.scheduled_at) + '"></div>' : '<div class="fld"><label for="o-when">DATE (OPTIONAL)</label><input class="inp" id="o-when" type="datetime-local" data-when value="' + toLocalInput(e.scheduled_at) + '"></div>') +
    (e.status === "published" ? '<div class="fld"><label for="o-pub">PUBLISHED AT</label><input class="inp" id="o-pub" type="datetime-local" data-pub value="' + toLocalInput(e.published_at || new Date().toISOString()) + '"></div>' : "") +
    "</div>" +
    '<ul class="issues" data-checks style="margin-top:16px"></ul>' +
    '<div class="wiz-foot"><div style="display:flex;gap:8px;flex-wrap:wrap">' + (e.id ? '<button type="button" class="btn btn-ghost" data-del style="color:var(--red)">' + icon("trash") + " Delete</button>" : "") +
    '<button type="button" class="btn btn-ghost" data-copy>' + icon("copy") + ' Copy text</button></div><div style="display:flex;gap:8px"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="button" class="btn btn-amber" data-save>' + icon("check") + " Save post</button></div></div>";
  if (!e.platforms.length || e.platforms.indexOf(S.prevPf) < 0) S.prevPf = e.platforms[0] || "instagram";
  tagInput($("[data-hashtags]", el), e.hashtags, { label: "Hashtags", placeholder: "e.g. smallbusiness", max: 60, maxLen: 100,
    transform: function (v) { return v.replace(/^#+/, "").replace(/\s+/g, ""); }, onChange: function (vals) { e.hashtags = vals; e.dirty = true; live(); } });
  $$("[data-f]", el).forEach(function (i) { i.addEventListener("input", function () { e[i.getAttribute("data-f")] = i.value; e.dirty = true; if (i.tagName === "TEXTAREA") i.setAttribute("dir", isRtl(i.value) ? "rtl" : "auto"); live(); }); });
  $$("[data-pf]", el).forEach(function (c) {
    var t = function () { var k = c.getAttribute("data-pf"), i = e.platforms.indexOf(k); if (i >= 0) e.platforms.splice(i, 1); else { e.platforms.push(k); S.prevPf = k; } e.dirty = true; c.classList.toggle("on", i < 0); c.setAttribute("aria-checked", String(i < 0)); live(); };
    c.onclick = t; c.onkeydown = function (ev) { if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); t(); } };
  });
  $$("[data-st]", el).forEach(function (b) { b.onclick = function () { e.status = b.getAttribute("data-st"); if (e.status === "published" && !e.published_at) e.published_at = new Date().toISOString(); e.dirty = true; renderComposer(); }; });
  $("[data-when]", el).addEventListener("input", function () { e.scheduled_at = fromLocalInput(this.value); e.dirty = true; live(); });
  var pub = $("[data-pub]", el); if (pub) pub.addEventListener("input", function () { e.published_at = fromLocalInput(this.value); e.dirty = true; });
  $("[data-close]", el).onclick = $("[data-cancel]", el).onclick = async function () { if (e.dirty && !(await confirmDialog("Discard changes?", "Your unsaved changes to this post will be lost.", "Discard"))) return; closeComposer(); };
  $("[data-copy]", el).onclick = function () { copyText(fullText(e)); toast("Post text copied"); };
  $("[data-save]", el).onclick = savePost;
  var d = $("[data-del]", el); if (d) d.onclick = async function () { if (!(await confirmDialog("Delete post?", "This post will be permanently deleted.", "Delete"))) return; var r = await S.sb.from("josy_organic_posts").delete().eq("id", e.id); if (r.error) return toast(friendlyError(r.error)); S.posts = S.posts.filter(function (x) { return x.id !== e.id; }); e.dirty = false; closeComposer(); renderPosts(); toast("Deleted"); };
  live();
}

function live() {
  var e = S.edit, len = fullText(e).length;
  $("[data-limits]").innerHTML = (e.platforms.length ? e.platforms : ORG_KEYS).map(function (k) { var o = ORG[k], over = len > o.max; return '<span class="lim ' + (e.platforms.length ? (over ? "over" : "ok") : "") + '">' + o.label + " " + len.toLocaleString() + "/" + o.max.toLocaleString() + (o.tags ? " · #" + e.hashtags.length + "/" + o.tags : "") + "</span>"; }).join("");
  var c = checks(e);
  $("[data-checks]").innerHTML = c.errors.map(function (x) { return '<li class="e">✕ <span>' + esc(x) + "</span></li>"; }).join("") + c.warnings.map(function (x) { return '<li class="w">! <span>' + esc(x) + "</span></li>"; }).join("");
  renderPreview();
}

function renderPreview() {
  var e = S.edit, el = $("[data-preview]");
  var k = e.platforms.indexOf(S.prevPf) >= 0 ? S.prevPf : (e.platforms[0] || "instagram"), o = ORG[k];
  var text = esc(e.content || "").replace(/(^|\s)#([\p{L}\p{N}_]+)/gu, '$1<span class="ht">#$2</span>');
  var tags = (e.hashtags || []).map(function (t) { return '<span class="ht">#' + esc(t) + "</span>"; }).join(" ");
  var shown = text + (tags ? (text ? "\n\n" : "") + tags : "");
  var truncated = fullText(e).length > o.max;
  var media = e.media_url && /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(e.media_url) ? '<img src="' + esc(e.media_url) + '" alt="" style="width:100%;height:100%;object-fit:cover" referrerpolicy="no-referrer">' : esc(e.media_url ? "Media: " + e.media_url : (e.media_notes || "No media yet"));
  el.innerHTML = (e.platforms.length > 1 ? '<div class="cseg" style="margin-bottom:10px;flex-wrap:wrap">' + e.platforms.map(function (p) { return '<button type="button" data-pv="' + p + '" class="' + (p === k ? "on" : "") + '">' + ORG[p].label + "</button>"; }).join("") + "</div>" : "") +
    '<div class="post-prev"><div class="ph-top"><span class="av"></span><div><b>Your account</b><small>' + o.label + (e.scheduled_at ? " · " + fmtDate(e.scheduled_at, true) : "") + "</small></div></div>" +
    (k === "instagram" || k === "tiktok" ? '<div class="media">' + media + '</div><div class="acts2">' + icon("heart") + icon("comment") + icon("share") + '</div><div class="body2" dir="auto" style="padding-top:10px">' + (shown || '<span style="color:var(--dim)">Your caption appears here</span>') + "</div>"
      : '<div class="body2" dir="auto">' + (shown || '<span style="color:var(--dim)">Your post appears here</span>') + "</div>" + (e.media_url || e.media_notes ? '<div class="media" style="aspect-ratio:16/10">' + media + "</div>" : "") + '<div class="acts2">' + icon("heart") + icon("comment") + icon("share") + "</div>") +
    "</div>" + (truncated ? '<p class="fine" style="color:var(--red);margin-top:8px">Over ' + o.label + "'s " + o.max.toLocaleString() + "-character limit.</p>" : "") +
    '<p class="fine" style="margin-top:8px">Simplified preview — each platform renders posts differently.</p>';
  $$("[data-pv]", el).forEach(function (b) { b.onclick = function () { S.prevPf = b.getAttribute("data-pv"); renderPreview(); }; });
}

async function savePost() {
  var e = S.edit, c = checks(e);
  if (c.errors.length) { toast(c.errors[0]); return; }
  var row = { title: (e.title || "").trim() || null, platforms: e.platforms, content: e.content || "", hashtags: e.hashtags, media_url: (e.media_url || "").trim() || null, media_notes: (e.media_notes || "").trim() || null,
    status: e.status, scheduled_at: e.scheduled_at, published_at: e.status === "published" ? (e.published_at || new Date().toISOString()) : null, plan_item_id: e.plan_item_id || null };
  var r = e.id ? await S.sb.from("josy_organic_posts").update(row).eq("id", e.id).select("*").single() : await S.sb.from("josy_organic_posts").insert(row).select("*").single();
  if (r.error) { toast(friendlyError(r.error)); return; }
  S.posts = S.posts.filter(function (x) { return x.id !== r.data.id; }); S.posts.unshift(r.data);
  e.dirty = false; closeComposer(); renderPosts(); toast(e.id ? "Post updated" : "Post saved");
}

/* ---------- list / calendar ---------- */
function filtered() {
  var q = $("[data-q]").value.trim().toLowerCase(), fp = $("[data-f-platform]").value, fs = $("[data-f-status]").value;
  return S.posts.filter(function (p) {
    if (fp && (p.platforms || []).indexOf(fp) < 0) return false;
    if (fs && p.status !== fs) return false;
    if (q && ((p.title || "") + " " + (p.content || "") + " " + (p.hashtags || []).join(" ")).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}
function when(p) { return p.status === "published" ? (p.published_at || p.scheduled_at) : p.scheduled_at; }
function pfTags(p) { return (p.platforms || []).map(function (k) { return '<span class="lim" style="border-color:' + ORG[k].color + '55">' + ORG[k].label + "</span>"; }).join(""); }

function renderPosts() {
  var el = $("[data-posts]");
  if (S.view === "cal") return renderCal(el);
  if (!S.posts.length) {
    el.innerHTML = emptyState("leaf", "No posts yet", "Compose your first post, or import ideas from a content calendar you saved with Josy.",
      '<button type="button" class="btn btn-amber" data-e-new>' + icon("pen") + " New post</button>" + (S.items.length ? ' <button type="button" class="btn btn-ghost" data-e-imp>' + icon("plan") + " Import from My plans</button>" : ""));
    $("[data-e-new]", el).onclick = function () { openComposer(null); };
    var ei = $("[data-e-imp]", el); if (ei) ei.onclick = openImport;
    return;
  }
  var rows = filtered();
  if (!rows.length) { el.innerHTML = emptyState("search", "No matches", "No posts match these filters.", ""); return; }
  var groups = { scheduled: [], draft: [], published: [] };
  rows.forEach(function (p) { groups[p.status].push(p); });
  groups.scheduled.sort(function (a, b) { return (a.scheduled_at || "") < (b.scheduled_at || "") ? -1 : 1; });
  groups.published.sort(function (a, b) { return (when(a) || "") < (when(b) || "") ? 1 : -1; });
  var T = { scheduled: "Scheduled", draft: "Drafts", published: "Published" };
  el.innerHTML = ["scheduled", "draft", "published"].filter(function (k) { return groups[k].length; }).map(function (k) {
    return '<div class="sec-t" style="margin-top:22px"><h3>' + T[k] + ' <span class="mono" style="color:var(--dim);font-size:.8rem">' + groups[k].length + '</span></h3></div><div class="post-list">' +
      groups[k].map(function (p) {
        var w = when(p), d = w ? new Date(w) : null;
        return '<div class="post-row" data-open="' + p.id + '"><div class="when">' + (d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + "<small>" + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) + "</small>" : "<small>No date</small>") + "</div>" +
          '<div style="min-width:0"><div class="t" dir="auto">' + esc(p.title || (p.content || "").split("\n")[0].slice(0, 80) || "Untitled post") + '</div><div class="x" dir="auto">' + esc((p.content || "").replace(/\s+/g, " ").slice(0, 160)) + '</div><div class="meta2">' + pfTags(p) + (p.plan_item_id ? '<span class="lim">from plan</span>' : "") + "</div></div>" +
          '<div style="display:flex;gap:6px;align-items:center">' + statusChip(p.status) +
          (p.status !== "published" ? '<button type="button" class="icon-btn" data-mark="' + p.id + '" title="Mark published" aria-label="Mark published">' + icon("check") + "</button>" : "") +
          '<button type="button" class="icon-btn" data-dupp="' + p.id + '" title="Duplicate" aria-label="Duplicate">' + icon("copy") + '</button><button type="button" class="icon-btn danger" data-delp="' + p.id + '" title="Delete" aria-label="Delete">' + icon("trash") + "</button></div></div>";
      }).join("") + "</div>";
  }).join("");
  bindRows(el);
}
function bindRows(el) {
  $$("[data-open]", el).forEach(function (r) { r.addEventListener("click", function (ev) { if (ev.target.closest("button")) return; var p = S.posts.find(function (x) { return x.id === r.getAttribute("data-open"); }); if (p) openComposer(p); }); });
  $$("[data-mark]", el).forEach(function (b) { b.onclick = async function () { var id = b.getAttribute("data-mark"); var r = await S.sb.from("josy_organic_posts").update({ status: "published", published_at: new Date().toISOString() }).eq("id", id).select("*").single(); if (r.error) return toast(friendlyError(r.error)); S.posts = S.posts.map(function (x) { return x.id === id ? r.data : x; }); renderPosts(); toast("Marked as published"); }; });
  $$("[data-dupp]", el).forEach(function (b) { b.onclick = async function () { var p = S.posts.find(function (x) { return x.id === b.getAttribute("data-dupp"); }); var r = await S.sb.from("josy_organic_posts").insert({ title: p.title ? (p.title + " (copy)").slice(0, 160) : null, platforms: p.platforms, content: p.content, hashtags: p.hashtags, media_url: p.media_url, media_notes: p.media_notes, status: "draft" }).select("*").single(); if (r.error) return toast(friendlyError(r.error)); S.posts.unshift(r.data); renderPosts(); toast("Duplicated as a draft"); }; });
  $$("[data-delp]", el).forEach(function (b) { b.onclick = async function () { if (!(await confirmDialog("Delete post?", "This post will be permanently deleted.", "Delete"))) return; var id = b.getAttribute("data-delp"); var r = await S.sb.from("josy_organic_posts").delete().eq("id", id); if (r.error) return toast(friendlyError(r.error)); S.posts = S.posts.filter(function (x) { return x.id !== id; }); renderPosts(); toast("Deleted"); }; });
}

function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function renderCal(el) {
  var m = S.month, first = new Date(m.getFullYear(), m.getMonth(), 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  var rows = filtered(), byDay = {};
  rows.forEach(function (p) { var w = when(p); if (!w) return; var k = ymd(new Date(w)); (byDay[k] = byDay[k] || []).push({ t: "post", p: p }); });
  var imported = {}; S.posts.forEach(function (p) { if (p.plan_item_id) imported[p.plan_item_id] = true; });
  S.items.forEach(function (it) { if (it.scheduled_date && !imported[it.id]) (byDay[it.scheduled_date] = byDay[it.scheduled_date] || []).push({ t: "item", it: it }); });
  var today = ymd(new Date()), cells = [];
  for (var i = 0; i < 42; i++) {
    var d = new Date(start); d.setDate(start.getDate() + i); var k = ymd(d), ev = byDay[k] || [];
    if (i >= 35 && d.getMonth() !== m.getMonth()) break;
    cells.push('<div class="cal-d' + (d.getMonth() !== m.getMonth() ? " out" : "") + (k === today ? " today" : "") + (ev.length ? "" : " empty-day") + '"><span class="n">' + d.getDate() + "</span>" +
      ev.map(function (x) {
        if (x.t === "post") return '<button type="button" class="cal-ev org ' + x.p.status + '" data-open="' + x.p.id + '" title="' + esc(x.p.title || x.p.content || "") + '">' + esc((x.p.platforms || []).map(function (k2) { return ORG[k2].label[0]; }).join("") + " · " + (x.p.title || (x.p.content || "").slice(0, 40) || "Post")) + "</button>";
        return '<button type="button" class="cal-ev plan" data-item="' + x.it.id + '" title="From “' + esc(x.it.plan_title) + '” — click to import">' + esc((x.it.channel ? x.it.channel + " · " : "") + (x.it.title || "Idea")) + "</button>";
      }).join("") + "</div>");
  }
  el.innerHTML = '<div class="sec-t" style="margin-top:16px"><div class="cal-nav"><button type="button" class="icon-btn" data-m="-1" aria-label="Previous month">' + icon("arrow") + "</button><b>" + m.toLocaleDateString(undefined, { month: "long", year: "numeric" }) + '</b><button type="button" class="icon-btn" data-m="1" aria-label="Next month" style="transform:scaleX(-1)">' + icon("arrow") + '</button><button type="button" class="btn btn-sm btn-ghost" data-m="0" style="margin:0">Today</button></div>' +
    '<div class="legend"><span><i style="background:rgba(25,210,124,.5)"></i>Scheduled / published</span><span><i style="background:rgba(255,255,255,.2)"></i>Draft</span><span><i style="background:rgba(167,139,250,.5)"></i>Idea from My plans (not imported)</span></div></div>' +
    '<div class="cal cal-big">' + ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (x) { return '<div class="cal-h">' + x + "</div>"; }).join("") + cells.join("") + "</div>" +
    (S.posts.length || S.items.length ? "" : '<p class="fine" style="margin-top:12px">Nothing on the calendar yet. Posts with a date appear here.</p>');
  $$("[data-m]", el).forEach(function (b) { b.onclick = function () { var v = Number(b.getAttribute("data-m")); var now = new Date(); S.month = v === 0 ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(S.month.getFullYear(), S.month.getMonth() + v, 1); renderPosts(); }; });
  $$("[data-open]", el).forEach(function (b) { b.onclick = function () { var p = S.posts.find(function (x) { return x.id === b.getAttribute("data-open"); }); if (p) openComposer(p); }; });
  $$("[data-item]", el).forEach(function (b) { b.onclick = function () { importItems([b.getAttribute("data-item")]); }; });
}

/* ---------- import from My plans ---------- */
function guessPlatforms(ch) {
  ch = (ch || "").toLowerCase(); var out = [];
  if (/insta|reel|אינסט/.test(ch)) out.push("instagram");
  if (/face|פייס/.test(ch)) out.push("facebook");
  if (/tik ?tok|טיק/.test(ch)) out.push("tiktok");
  if (/linked|לינק/.test(ch)) out.push("linkedin");
  if (/(^|\W)x(\W|$)|twitter|טוויטר/.test(ch)) out.push("x");
  return out;
}
function openImport() {
  var imported = {}; S.posts.forEach(function (p) { if (p.plan_item_id) imported[p.plan_item_id] = true; });
  var bg = document.createElement("div"); bg.className = "drawer-bg";
  var dr = document.createElement("aside"); dr.className = "drawer"; dr.setAttribute("role", "dialog"); dr.setAttribute("aria-modal", "true"); dr.setAttribute("aria-label", "Import from My plans");
  dr.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><h3>Import from My plans</h3><button type="button" class="icon-btn" data-x aria-label="Close">✕</button></div>' +
    '<p class="fine" style="margin:0 0 14px">Pick calendar items to turn into draft posts. Their dates carry over; platforms are guessed from the channel and you can change them.</p>' +
    (S.plans.length ? S.plans.map(function (p) {
      var its = (p.josy_plan_items || []).slice().sort(function (a, b) { return a.position - b.position; });
      return '<div class="grp"><div class="grp-h"><label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" data-all="' + p.id + '"> <b style="font-size:.9rem">' + esc(p.title) + '</b></label><span class="sp"></span><span class="mono" style="font-size:.7rem;color:var(--dim)">' + its.length + ' items</span></div><div class="grp-b" style="display:grid;gap:6px">' +
        its.map(function (it) { var done = imported[it.id]; return '<label style="display:flex;gap:10px;align-items:flex-start;font-size:.86rem;' + (done ? "opacity:.5" : "cursor:pointer") + '"><input type="checkbox" data-it="' + it.id + '" data-plan="' + p.id + '"' + (done ? " disabled" : "") + '><span><b dir="auto">' + esc(it.title || "Untitled") + '</b><br><span class="mono" style="font-size:.7rem;color:var(--dim)">' + esc([it.scheduled_date, it.channel, it.format].filter(Boolean).join(" · ")) + (done ? " · already imported" : "") + "</span></span></label>"; }).join("") + "</div></div>";
    }).join("") + '<div class="wiz-foot"><span class="fine" data-sel-count>0 selected</span><button type="button" class="btn btn-amber" data-go-imp disabled>' + icon("plus") + " Import as drafts</button></div>"
      : emptyState("plan", "No saved calendars", "Ask Josy to build a content calendar — it will appear here to import.", '<a class="btn btn-ghost" href="josy-chat.html">' + icon("spark") + " Open Josy chat</a>"));
  document.body.appendChild(bg); document.body.appendChild(dr);
  var close = function () { bg.remove(); dr.remove(); document.removeEventListener("keydown", onKey); };
  var onKey = function (e) { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  bg.onclick = close; $("[data-x]", dr).onclick = close;
  var upd = function () { var n = $$("[data-it]:checked", dr).length; var c = $("[data-sel-count]", dr); if (c) c.textContent = n + " selected"; var g = $("[data-go-imp]", dr); if (g) g.disabled = !n; };
  $$("[data-all]", dr).forEach(function (a) { a.onchange = function () { $$('[data-plan="' + a.getAttribute("data-all") + '"]:not(:disabled)', dr).forEach(function (x) { x.checked = a.checked; }); upd(); }; });
  $$("[data-it]", dr).forEach(function (x) { x.onchange = upd; });
  var g = $("[data-go-imp]", dr); if (g) g.onclick = async function () { g.disabled = true; var ok = await importItems($$("[data-it]:checked", dr).map(function (x) { return x.getAttribute("data-it"); })); if (ok) close(); else g.disabled = false; };
}
async function importItems(ids) {
  var rows = ids.map(function (id) { return S.items.find(function (x) { return x.id === id; }); }).filter(Boolean).map(function (it) {
    return { title: (it.title || "").slice(0, 160) || null, platforms: guessPlatforms(it.channel), content: (it.body || "").slice(0, 10000), hashtags: [], media_notes: it.format ? ("Format: " + it.format).slice(0, 2000) : null,
      status: "draft", scheduled_at: it.scheduled_date ? new Date(it.scheduled_date + "T10:00:00").toISOString() : null, plan_item_id: it.id };
  });
  if (!rows.length) return false;
  var r = await S.sb.from("josy_organic_posts").insert(rows).select("*");
  if (r.error) { toast(friendlyError(r.error)); return false; }
  S.posts = (r.data || []).concat(S.posts); renderPosts();
  toast(rows.length + " draft" + (rows.length > 1 ? "s" : "") + " imported");
  return true;
}

boot();
