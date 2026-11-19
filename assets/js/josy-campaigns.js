/* Josy Campaign Manager — hub */
import { requireSession, $, esc, fmtDate, relTime } from "./josy-core.js";
import { icon, pf, pfBadge, objLabel, money, statusChip, connectCards, emptyState, CM_LIMITS, PLAN_NAMES, getPlan, ORG } from "./josy-cm.js";
import { autoBell } from "./josy-notify.js";

async function boot() {
  var r = await requireSession("josy-campaigns.html");
  if (!r.session) return;
  var sb = r.sb, uid = r.session.user.id;
  autoBell(sb);
  var res = await Promise.all([
    sb.from("josy_campaigns").select("id, platform, name, objective, status, budget_type, budget_amount, currency, start_date, end_date, updated_at").order("updated_at", { ascending: false }).limit(1000),
    sb.from("josy_organic_posts").select("id, title, content, platforms, status, scheduled_at, published_at").order("scheduled_at", { ascending: true, nullsFirst: false }).limit(2000),
    getPlan(sb, uid)
  ]);
  $("[data-gate]").hidden = true; $("[data-shell]").hidden = false;
  var camps = res[0].data || [], posts = res[1].data || [], plan = res[2];
  var active = camps.filter(function (c) { return c.status !== "archived"; });
  var now = new Date().toISOString();
  var upcoming = posts.filter(function (p) { return p.status === "scheduled" && p.scheduled_at && p.scheduled_at >= now; });
  var published = posts.filter(function (p) { return p.status === "published"; });

  $("[data-kpis]").innerHTML = [
    ["PAID CAMPAIGNS", active.length, "not archived"],
    ["READY TO LAUNCH", camps.filter(function (c) { return c.status === "ready"; }).length, "passed all checks"],
    ["SCHEDULED POSTS", upcoming.length, "upcoming"],
    ["PUBLISHED POSTS", published.length, "marked by you"]
  ].map(function (k) { return '<div class="kpi"><div class="k">' + k[0] + '</div><div class="v">' + k[1] + '</div><div class="d">' + k[2] + "</div></div>"; }).join("");

  var rc = $("[data-recent-campaigns]");
  if (!active.length) rc.innerHTML = emptyState("megaphone", "No paid campaigns yet", "Build your first campaign draft step by step — platform, objective, budget, audience and ads.", '<a class="btn btn-amber" href="josy-campaign-new.html">' + icon("plus") + " New campaign</a>");
  else rc.innerHTML = '<div class="post-list">' + active.slice(0, 5).map(function (c) {
    return '<a class="post-row" href="josy-campaign.html?id=' + c.id + '" style="color:inherit">' + pfBadge(c.platform) +
      '<div style="min-width:0"><div class="t">' + esc(c.name) + '</div><div class="meta2"><span class="muted2 mono" style="font-size:.72rem;color:var(--dim)">' + pf(c.platform).label + " · " + objLabel(c.objective) + " · " +
      (c.budget_amount ? money(c.budget_amount, c.currency) + (c.budget_type === "daily" ? "/day" : " lifetime") : "no budget") + '</span></div></div>' +
      '<div style="text-align:end">' + statusChip(c.status) + '<div class="mono" style="font-size:.68rem;color:var(--dim);margin-top:6px">edited ' + relTime(c.updated_at) + "</div></div></a>";
  }).join("") + "</div>";

  var up = $("[data-upcoming]");
  if (!upcoming.length) up.innerHTML = emptyState("cal", "Nothing scheduled", "Compose a post, pick the platforms and a date — it shows up here and on your calendar.", '<a class="btn btn-ghost" href="josy-organic.html#new">' + icon("pen") + " New post</a>");
  else up.innerHTML = '<div class="post-list">' + upcoming.slice(0, 5).map(function (p) {
    var d = new Date(p.scheduled_at);
    return '<a class="post-row" href="josy-organic.html#post=' + p.id + '" style="color:inherit"><div class="when">' + d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + "<small>" + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) + "</small></div>" +
      '<div style="min-width:0"><div class="t">' + esc(p.title || (p.content || "").slice(0, 60) || "Untitled post") + '</div><div class="meta2">' +
      (p.platforms || []).map(function (k) { return '<span class="lim" style="border-color:' + (ORG[k] ? ORG[k].color : "") + '55">' + esc(ORG[k] ? ORG[k].label : k) + "</span>"; }).join("") + "</div></div>" + statusChip(p.status) + "</a>";
  }).join("") + "</div>";

  $("[data-connect]").innerHTML = connectCards();
  var cl = CM_LIMITS.campaigns[plan] || 5, pl = CM_LIMITS.posts[plan] || 60;
  $("[data-limits]").innerHTML = '<div class="cm-table-wrap"><table class="cm-table" style="min-width:0"><thead><tr><th>ITEM</th><th>YOUR PLAN · ' + esc((PLAN_NAMES[plan] || plan).toUpperCase()) + '</th><th>IN USE</th></tr></thead><tbody>' +
    '<tr style="cursor:default"><td>Paid campaigns (incl. archived)</td><td class="num">' + cl + '</td><td class="num">' + camps.length + "</td></tr>" +
    '<tr style="cursor:default"><td>Organic posts</td><td class="num">' + pl + '</td><td class="num">' + posts.length + "</td></tr>" +
    '<tr style="cursor:default"><td>' + "Ad sets / ad groups per campaign" + '</td><td class="num">' + CM_LIMITS.ad_groups + '</td><td class="num">—</td></tr>' +
    '<tr style="cursor:default"><td>Ads per ad set / ad group</td><td class="num">' + CM_LIMITS.ads + '</td><td class="num">—</td></tr>' +
    '</tbody></table></div><p class="fine" style="margin-top:10px">The campaign manager doesn\'t use credits. Limits keep storage fair across plans — <a href="pricing.html" style="color:var(--amber)">compare plans</a>.</p>';
}
boot();
