/* Josy Market — My plans page (list, detail, calendar view, export, delete) */
import {
  requireSession, $, $$, esc, dirOf, toast, copyText, download, slug, confirmDialog,
  renderMarkdown, bindCodeCopy, icon, fmtDate, planToMarkdown, planToCsv
} from "./josy-core.js";
import { mountBell } from "./josy-notify.js";

var S = { sb: null, plans: [], filter: "all", plan: null, items: [], view: "calendar" };

async function boot() {
  var r = await requireSession("josy-plans.html");
  if (!r.session) return;
  S.sb = r.sb;
  (function () { var pt = document.querySelector(".plans-top"), a = pt && pt.querySelector("a.btn"); if (!a) return; var g = document.createElement("div"); g.style.cssText = "display:flex;gap:10px;align-items:center"; a.before(g); mountBell(S.sb, g, { cls: "in-hero" }); g.appendChild(a); })();
  $("[data-gate]").hidden = true;
  $("[data-shell]").hidden = false;
  bind();
  await loadPlans();
  route();
  window.addEventListener("hashchange", route);
}

async function loadPlans() {
  var r = await S.sb.from("josy_plans").select("id, kind, title, goal, summary, channels, start_date, created_at, conversation_id, josy_plan_items(count)")
    .order("created_at", { ascending: false }).limit(200);
  if (r.error) { $("[data-list]").innerHTML = '<p class="form-msg">Could not load your plans. Please refresh.</p>'; return; }
  S.plans = (r.data || []).map(function (p) { p.count = (p.josy_plan_items && p.josy_plan_items[0] && p.josy_plan_items[0].count) || 0; return p; });
}

function route() {
  var m = location.hash.match(/plan=([0-9a-f-]{36})/i);
  if (m) openPlan(m[1]); else showList();
}

/* ---------- list ---------- */
function showList() {
  S.plan = null;
  $("[data-detail]").hidden = true;
  $("[data-listview]").hidden = false;
  var plans = S.plans.filter(function (p) { return S.filter === "all" || (S.filter === "cal" ? p.kind === "content_calendar" : p.kind === "marketing_plan"); });
  $$("[data-filter]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-filter") === S.filter)); });
  var list = $("[data-list]");
  if (!S.plans.length) {
    list.innerHTML = '<div class="empty"><span class="josy-mark lg"><img src="favicon.svg" alt=""></span><h3>No plans yet</h3>' +
      "<p>Ask Josy for a marketing plan or a content calendar and it will be saved here — with ready-to-post copy you can copy, export and track.</p>" +
      '<a class="btn btn-amber" href="josy-chat.html">' + icon("spark", "") + " Start with Josy</a></div>";
    return;
  }
  if (!plans.length) { list.innerHTML = '<div class="empty"><h3>Nothing in this view</h3><p>Try another filter.</p></div>'; return; }
  list.innerHTML = '<div class="plan-grid">' + plans.map(function (p) {
    var cal = p.kind === "content_calendar";
    return '<button type="button" class="plan-card" data-plan="' + p.id + '">' +
      '<span class="kind ' + (cal ? "kcal" : "mplan") + '">' + icon(cal ? "cal" : "plan") + (cal ? "CONTENT CALENDAR" : "MARKETING PLAN") + "</span>" +
      '<h3 dir="auto">' + esc(p.title) + "</h3>" + (p.goal ? '<p dir="auto">' + esc(p.goal) + "</p>" : p.summary ? '<p dir="auto">' + esc(p.summary.replace(/[#*_>`-]/g, "").slice(0, 200)) + "</p>" : "") +
      (p.channels && p.channels.length ? '<div class="ch-row">' + p.channels.slice(0, 5).map(function (c) { return '<span class="ch">' + esc(c) + "</span>"; }).join("") + "</div>" : "") +
      '<div class="foot"><span>' + p.count + " item" + (p.count === 1 ? "" : "s") + (p.start_date ? " · from " + esc(fmtDate(p.start_date + "T00:00:00")) : "") + "</span><span>" + esc(fmtDate(p.created_at)) + "</span></div></button>";
  }).join("") + "</div>";
}

/* ---------- detail ---------- */
async function openPlan(id) {
  var det = $("[data-detail]");
  $("[data-listview]").hidden = true; det.hidden = false;
  det.innerHTML = '<p class="mono muted">Loading plan…</p>';
  var r = await S.sb.from("josy_plans").select("id, kind, title, goal, summary, channels, start_date, created_at, conversation_id").eq("id", id).maybeSingle();
  if (r.error || !r.data) { det.innerHTML = '<button class="back" data-back>' + icon("arrow", "") + ' All plans</button><div class="empty" style="margin-top:16px"><h3>Plan not found</h3><p>It may have been deleted.</p></div>'; return; }
  var it = await S.sb.from("josy_plan_items").select("id, position, day, scheduled_date, channel, format, title, body, status").eq("plan_id", id).order("position", { ascending: true });
  S.plan = r.data; S.items = it.data || [];
  S.view = S.plan.kind === "content_calendar" && S.items.some(function (x) { return x.scheduled_date; }) ? "calendar" : "list";
  renderDetail();
  window.scrollTo({ top: 0 });
}

function renderDetail() {
  var p = S.plan, cal = p.kind === "content_calendar";
  var hasDates = S.items.some(function (x) { return x.scheduled_date; });
  var done = S.items.filter(function (x) { return x.status === "done"; }).length;
  $("[data-detail]").innerHTML =
    '<div class="detail"><div><button class="back" data-back>' + icon("arrow", "") + " All plans</button></div>" +
    '<div class="detail-head"><div style="min-width:0;flex:1"><span class="kind ' + (cal ? "kcal" : "mplan") + '">' + icon(cal ? "cal" : "plan") + (cal ? "CONTENT CALENDAR" : "MARKETING PLAN") + "</span>" +
    '<h2 dir="auto">' + esc(p.title) + "</h2>" +
    '<div class="src-row" style="margin-top:4px"><span class="src-chip ai">' + icon("spark") + "Created by Josy AI</span><span class=\"src-chip\">" + icon("cal") + esc(fmtDate(p.created_at)) + "</span>" +
    (S.items.length ? '<span class="src-chip">' + icon("check") + done + " / " + S.items.length + " done</span>" : "") +
    (p.conversation_id ? '<a class="src-chip saved" href="josy-chat.html#c=' + p.conversation_id + '">' + icon("spark") + "Open the chat</a>" : "") + "</div></div>" +
    '<div class="acts"><button class="btn btn-sm btn-ghost" data-copy-all>' + icon("copy", "") + ' Copy</button><button class="btn btn-sm btn-ghost" data-md>' + icon("dl", "") + " .md</button>" +
    (S.items.length ? '<button class="btn btn-sm btn-ghost" data-csv>' + icon("dl", "") + " .csv</button>" : "") +
    '<button class="btn btn-sm btn-ghost" data-del-plan style="color:var(--red)">' + icon("trash", "") + " Delete</button></div></div>" +
    (p.goal || (p.channels && p.channels.length) ? '<div class="panel"><h4>GOAL & CHANNELS</h4>' + (p.goal ? '<p dir="auto" style="margin:0 0 10px">' + esc(p.goal) + "</p>" : "") +
      (p.channels && p.channels.length ? '<div class="ch-row">' + p.channels.map(function (c) { return '<span class="ch">' + esc(c) + "</span>"; }).join("") + "</div>" : "") + "</div>" : "") +
    (p.summary ? '<div class="panel"><h4>STRATEGY</h4><div class="md" dir="' + dirOf(p.summary) + '">' + renderMarkdown(p.summary) + "</div></div>" : "") +
    (S.items.length ? '<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"><h4 style="margin:0">' + (cal ? "CALENDAR" : "ACTION ITEMS") + " · " + S.items.length + "</h4>" +
      (hasDates ? '<div class="tabs"><button type="button" data-view="calendar" aria-pressed="' + (S.view === "calendar") + '">Calendar</button><button type="button" data-view="list" aria-pressed="' + (S.view === "list") + '">List</button></div>' : "") +
      "</div>" + (S.view === "calendar" && hasDates ? calendarHtml() : "") + '<div class="items" data-items' + (S.view === "calendar" && hasDates ? ' style="margin-top:18px"' : "") + ">" + S.items.map(itemHtml).join("") + "</div></div>"
      : '<div class="empty"><p>This plan has no items.</p></div>') +
    "</div>";
}

function itemHtml(it) {
  var when = it.scheduled_date ? fmtDate(it.scheduled_date + "T00:00:00") : it.day ? "Day " + it.day : "";
  return '<div class="item' + (it.status === "done" ? " done" : "") + '" id="item-' + it.id + '" data-item="' + it.id + '"><div class="item-top">' +
    (when ? '<span class="day">' + esc(when) + "</span>" : "") +
    (it.channel ? '<span class="ch">' + esc(it.channel) + "</span>" : "") + (it.format ? '<span class="ch">' + esc(it.format) + "</span>" : "") +
    '<span class="sp"></span><select data-status aria-label="Status"><option value="idea"' + (it.status === "idea" ? " selected" : "") + '>Idea</option><option value="scheduled"' + (it.status === "scheduled" ? " selected" : "") +
    '>Scheduled</option><option value="done"' + (it.status === "done" ? " selected" : "") + '>Done</option></select>' +
    '<button type="button" class="icon-btn" data-copy-item aria-label="Copy post" title="Copy post">' + icon("copy") + "</button></div>" +
    '<h5 dir="auto">' + esc(it.title) + "</h5>" + (it.body ? '<div class="txt" dir="' + dirOf(it.body) + '">' + esc(it.body.replace(/\\n/g, "\n")) + "</div>" : "") + "</div>";
}

function calendarHtml() {
  var dated = S.items.filter(function (x) { return x.scheduled_date; });
  var byDate = {};
  dated.forEach(function (x) { (byDate[x.scheduled_date] = byDate[x.scheduled_date] || []).push(x); });
  var dates = Object.keys(byDate).sort();
  var start = new Date(dates[0] + "T00:00:00Z"), end = new Date(dates[dates.length - 1] + "T00:00:00Z");
  var s = new Date(start); s.setUTCDate(s.getUTCDate() - s.getUTCDay());
  var e = new Date(end); e.setUTCDate(e.getUTCDate() + (6 - e.getUTCDay()));
  var today = new Date().toISOString().slice(0, 10);
  var html = '<div class="cal">' + ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(function (d) { return '<div class="cal-h">' + d + "</div>"; }).join("");
  for (var d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    var key = d.toISOString().slice(0, 10);
    var evs = byDate[key] || [];
    var inRange = d >= start && d <= end;
    html += '<div class="cal-d' + (inRange ? "" : " out") + (key === today ? " today" : "") + (evs.length ? "" : " empty-day") + '"><span class="n">' +
      d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) + "</span>" +
      evs.map(function (x) { return '<button type="button" class="cal-ev' + (x.status === "done" ? " done" : "") + '" data-jump="' + x.id + '" dir="auto" title="' + esc(x.title) + '">' + esc((x.channel ? x.channel + " · " : "") + x.title) + "</button>"; }).join("") + "</div>";
  }
  return html + "</div>";
}

/* ---------- events ---------- */
function bind() {
  $$("[data-filter]").forEach(function (b) { b.addEventListener("click", function () { S.filter = b.getAttribute("data-filter"); showList(); }); });
  $("[data-list]").addEventListener("click", function (e) {
    var c = e.target.closest("[data-plan]"); if (c) location.hash = "plan=" + c.getAttribute("data-plan");
  });
  var det = $("[data-detail]");
  bindCodeCopy(det);
  det.addEventListener("click", async function (e) {
    if (e.target.closest("[data-back]")) { history.pushState(null, "", location.pathname); showList(); return; }
    var v = e.target.closest("[data-view]"); if (v) { S.view = v.getAttribute("data-view"); renderDetail(); return; }
    var j = e.target.closest("[data-jump]");
    if (j) { var el = document.getElementById("item-" + j.getAttribute("data-jump")); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); } return; }
    if (e.target.closest("[data-copy-all]")) { copyText(planToMarkdown(S.plan, S.items)); return; }
    if (e.target.closest("[data-md]")) { download("josy-" + slug(S.plan.title) + ".md", planToMarkdown(S.plan, S.items)); return; }
    if (e.target.closest("[data-csv]")) { download("josy-" + slug(S.plan.title) + ".csv", planToCsv(S.items), "text/csv;charset=utf-8"); return; }
    var ci = e.target.closest("[data-copy-item]");
    if (ci) { var it = findItem(ci); if (it) copyText(it.title + (it.body ? "\n\n" + it.body : "")); return; }
    if (e.target.closest("[data-del-plan]")) {
      var ok = await confirmDialog("Delete this plan?", "“" + S.plan.title + "” and all its items will be permanently deleted.", "Delete plan");
      if (!ok) return;
      var r = await S.sb.from("josy_plans").delete().eq("id", S.plan.id);
      if (r.error) { toast("Could not delete the plan"); return; }
      S.plans = S.plans.filter(function (p) { return p.id !== S.plan.id; });
      toast("Plan deleted");
      history.pushState(null, "", location.pathname); showList();
    }
  });
  det.addEventListener("change", async function (e) {
    var sel = e.target.closest("[data-status]"); if (!sel) return;
    var it = findItem(sel); if (!it) return;
    var prev = it.status; it.status = sel.value;
    var r = await S.sb.from("josy_plan_items").update({ status: sel.value }).eq("id", it.id);
    if (r.error) { it.status = prev; sel.value = prev; toast("Could not update status"); return; }
    renderDetail();
  });
}
function findItem(el) {
  var row = el.closest("[data-item]"); if (!row) return null;
  var id = +row.getAttribute("data-item");
  return S.items.find(function (x) { return x.id === id; });
}

boot();
