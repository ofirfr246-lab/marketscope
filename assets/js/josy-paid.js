/* Josy Campaign Manager — paid campaigns list */
import { requireSession, $, $$, esc, toast, confirmDialog, relTime, fmtDate } from "./josy-core.js";
import { icon, pf, pfBadge, objLabel, money, statusChip, estimate, emptyState, friendlyError } from "./josy-cm.js";
import { autoBell } from "./josy-notify.js";

var S = { sb: null, rows: [] };

async function boot() {
  var r = await requireSession("josy-paid.html");
  if (!r.session) return;
  S.sb = r.sb;
  autoBell(S.sb);
  var p = new URLSearchParams(location.search);
  if (p.get("platform")) $("[data-f-platform]").value = p.get("platform");
  if (p.get("status") != null) $("[data-f-status]").value = p.get("status");
  await load();
  $("[data-gate]").hidden = true; $("[data-shell]").hidden = false;
  ["[data-q]", "[data-f-platform]", "[data-f-status]", "[data-f-sort]"].forEach(function (s) { $(s).addEventListener("input", render); });
  render();
}

async function load() {
  var r = await S.sb.from("josy_campaigns").select("id, platform, name, objective, status, budget_type, budget_amount, currency, start_date, end_date, updated_at, josy_ad_groups(count), josy_ads(count)")
    .order("updated_at", { ascending: false }).limit(1000);
  if (r.error) { toast("Couldn't load campaigns. Please refresh."); S.rows = []; return; }
  S.rows = (r.data || []).map(function (c) {
    c.groups = (c.josy_ad_groups && c.josy_ad_groups[0] && c.josy_ad_groups[0].count) || 0;
    c.ads = (c.josy_ads && c.josy_ads[0] && c.josy_ads[0].count) || 0;
    return c;
  });
}

function render() {
  var q = $("[data-q]").value.trim().toLowerCase(), fp = $("[data-f-platform]").value, fs = $("[data-f-status]").value, so = $("[data-f-sort]").value;
  var rows = S.rows.filter(function (c) {
    if (q && c.name.toLowerCase().indexOf(q) < 0) return false;
    if (fp && c.platform !== fp) return false;
    if (fs === "active" && c.status === "archived") return false;
    if (fs && fs !== "active" && c.status !== fs) return false;
    return true;
  });
  rows.sort(function (a, b) {
    if (so === "name") return a.name.localeCompare(b.name);
    if (so === "start") return (a.start_date || "9999") < (b.start_date || "9999") ? -1 : 1;
    if (so === "budget") return (Number(b.budget_amount) || 0) - (Number(a.budget_amount) || 0);
    return a.updated_at < b.updated_at ? 1 : -1;
  });
  var list = $("[data-list]");
  $("[data-count]").textContent = S.rows.length ? rows.length + " of " + S.rows.length + " campaign" + (S.rows.length > 1 ? "s" : "") : "";
  if (!S.rows.length) { list.innerHTML = emptyState("megaphone", "No campaigns yet", "Create a campaign draft for Meta, TikTok or Google. You'll set the objective, budget, schedule, audience, " + "ad sets / ad groups and ads — then review it before marking it ready.", '<a class="btn btn-amber" href="josy-campaign-new.html">' + icon("plus") + " New campaign</a>"); return; }
  if (!rows.length) { list.innerHTML = emptyState("search", "No matches", "No campaigns match these filters.", '<button type="button" class="btn btn-ghost" data-clear>Clear filters</button>'); $("[data-clear]").onclick = function () { $("[data-q]").value = ""; $("[data-f-platform]").value = ""; $("[data-f-status]").value = "active"; render(); }; return; }
  list.innerHTML = '<div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>CAMPAIGN</th><th>STATUS</th><th>OBJECTIVE</th><th>BUDGET</th><th>SCHEDULE</th><th>EST. MAX SPEND</th><th>STRUCTURE</th><th></th></tr></thead><tbody>' +
    rows.map(function (c) {
      var e = estimate(c);
      return '<tr data-id="' + c.id + '"><td><div class="nm">' + pfBadge(c.platform, true) + '<div><a href="josy-campaign.html?id=' + c.id + '" style="color:inherit">' + esc(c.name) + '</a><div class="muted2">' + pf(c.platform).label + " · edited " + relTime(c.updated_at) + "</div></div></div></td>" +
        "<td>" + statusChip(c.status) + "</td><td>" + objLabel(c.objective) + '</td><td class="num">' + (c.budget_amount ? money(c.budget_amount, c.currency) + '<span class="muted2"> ' + (c.budget_type === "daily" ? "/day" : "total") + "</span>" : "—") + "</td>" +
        '<td class="num" style="font-size:.8rem">' + (c.start_date ? fmtDate(c.start_date) : "—") + (c.end_date ? " → " + fmtDate(c.end_date) : c.start_date ? " → ongoing" : "") + "</td>" +
        '<td class="num">' + (e.total != null ? money(e.total, c.currency) : "—") + "</td>" +
        '<td class="muted2">' + c.groups + " " + (c.groups === 1 ? pf(c.platform).group.toLowerCase() : pf(c.platform).groups.toLowerCase()) + " · " + c.ads + " ad" + (c.ads === 1 ? "" : "s") + "</td>" +
        '<td><div class="row-acts">' +
        '<a class="icon-btn" href="josy-campaign-new.html?id=' + c.id + '" title="Edit" aria-label="Edit">' + icon("edit") + "</a>" +
        '<button type="button" class="icon-btn" data-dup title="Duplicate" aria-label="Duplicate">' + icon("copy") + "</button>" +
        '<button type="button" class="icon-btn" data-arch title="' + (c.status === "archived" ? "Unarchive" : "Archive") + '" aria-label="Archive">' + icon("archive") + "</button>" +
        '<button type="button" class="icon-btn danger" data-del title="Delete" aria-label="Delete">' + icon("trash") + "</button></div></td></tr>";
    }).join("") + "</tbody></table></div>";
  $$("tbody tr", list).forEach(function (tr) {
    var id = tr.getAttribute("data-id"), c = S.rows.find(function (x) { return x.id === id; });
    tr.addEventListener("click", function (e) {
      if (e.target.closest("button,a")) return;
      location.href = "josy-campaign.html?id=" + id;
    });
    tr.querySelector("[data-dup]").onclick = async function () {
      var r = await S.sb.rpc("josy_duplicate_campaign", { p_id: id });
      if (r.error) return toast(friendlyError(r.error));
      toast("Duplicated as a draft"); await load(); render();
    };
    tr.querySelector("[data-arch]").onclick = async function () {
      var ns = c.status === "archived" ? "draft" : "archived";
      var r = await S.sb.from("josy_campaigns").update({ status: ns }).eq("id", id);
      if (r.error) return toast(friendlyError(r.error));
      c.status = ns; toast(ns === "archived" ? "Archived" : "Moved back to drafts"); render();
    };
    tr.querySelector("[data-del]").onclick = async function () {
      if (!(await confirmDialog("Delete campaign?", "“" + c.name + "” and all its " + pf(c.platform).groups.toLowerCase() + " and ads will be permanently deleted.", "Delete"))) return;
      var r = await S.sb.from("josy_campaigns").delete().eq("id", id);
      if (r.error) return toast(friendlyError(r.error));
      S.rows = S.rows.filter(function (x) { return x.id !== id; }); toast("Deleted"); render();
    };
  });
}
boot();
