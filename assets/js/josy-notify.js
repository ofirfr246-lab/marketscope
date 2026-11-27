/* Josy notifications: "Published" toast + bell with the user's stored events (ES module).
   Events are written by database triggers only when a post/campaign really changes to published/launched.
   Manual events always say they were marked by the user — never that MarketScope posted them. */
import { esc, relTime } from "./josy-core.js";

var PF = {
  instagram: { label: "Instagram", c1: "#ff8fa3", c2: "#ffb36b", g: '<rect x="4" y="5" width="16" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l5-5 4 4 2-2 3 3"/>' },
  facebook: { label: "Facebook", c1: "#a8b0bb", c2: "#c0c5cd", g: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.3"/><path d="M15.5 14.5a4.5 4.5 0 0 1 5 4.5"/>' },
  tiktok: { label: "TikTok", c1: "#c8b896", c2: "#a8b0bb", g: '<path d="M10 17.5V6l9-2v11"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>' },
  linkedin: { label: "LinkedIn", c1: "#e9ecef", c2: "#a8b0bb", g: '<rect x="4" y="8" width="16" height="11" rx="2"/><path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 13h16"/>' },
  x: { label: "X", c1: "#e8ecf1", c2: "#9aa4b1", g: '<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>' },
  meta: { label: "Meta", c1: "#a8b0bb", c2: "#8f99a6", g: '<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17 9a4 4 0 0 1 0 6"/>' },
  google: { label: "Google", c1: "#ffb000", c2: "#a8b0bb", g: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>' }
};
export function pfIcon(k, size) {
  var p = PF[k] || { label: k, c1: "#ffb000", c2: "#a8b0bb", g: '<path d="M5 12.5l4.5 4.5L19 7"/>' };
  return '<span class="pf-ico" style="--c1:' + p.c1 + ";--c2:" + p.c2 + (size ? ";--sz:" + size + "px" : "") + '" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + p.g + "</svg></span>";
}
export function pfLabel(k) { return (PF[k] && PF[k].label) || k; }
function joinNames(list) {
  var n = list.map(pfLabel);
  if (n.length <= 1) return n[0] || "";
  return n.slice(0, -1).join(", ") + " & " + n[n.length - 1];
}
function headline(platforms, source) { return (source === "api" ? "Published to " : "Published to ") + joinNames(platforms); }
function subline(source, entity) {
  return source === "api" ? "Posted by MarketScope through your connected account." :
    "Marked as published by you — MarketScope didn't post this " + (entity === "campaign" ? "campaign" : "post") + ".";
}

/* ---------- toast ---------- */
function stack() {
  var s = document.querySelector(".pub-stack");
  if (!s) { s = document.createElement("div"); s.className = "pub-stack"; s.setAttribute("aria-live", "polite"); document.body.appendChild(s); }
  return s;
}
export function publishedToast(platforms, title, opts) {
  opts = opts || {};
  platforms = (platforms || []).filter(Boolean);
  var t = document.createElement("div");
  t.className = "pub-toast"; t.setAttribute("role", "status");
  var first = PF[platforms[0]] || PF.google;
  t.style.setProperty("--c1", first.c1); t.style.setProperty("--c2", first.c2);
  var burst = "";
  for (var i = 0; i < 12; i++) burst += '<i style="--a:' + (i * 30) + "deg;--d:" + (38 + (i % 3) * 12) + 'px"></i>';
  t.innerHTML = '<div class="pub-icons"><span class="pub-burst" aria-hidden="true">' + burst + "</span>" + platforms.slice(0, 4).map(function (k, i) { return '<span class="pub-ic" style="--i:' + i + '">' + pfIcon(k, 38) + "</span>"; }).join("") +
    '<span class="pub-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span></div>' +
    '<div class="pub-txt"><b>' + esc(headline(platforms, opts.source)) + "</b>" + (title ? '<span class="pub-title" dir="auto">“' + esc(title.length > 70 ? title.slice(0, 70) + "…" : title) + "”</span>" : "") + '<small>' + esc(subline(opts.source, opts.entity)) + "</small></div>" +
    '<button type="button" class="pub-x" aria-label="Dismiss">✕</button><span class="pub-bar"></span>';
  stack().appendChild(t);
  requestAnimationFrame(function () { t.classList.add("in"); });
  var close = function () { t.classList.remove("in"); t.classList.add("out"); setTimeout(function () { t.remove(); }, 400); };
  t.querySelector(".pub-x").onclick = close;
  var timer = setTimeout(close, opts.duration || 6500);
  t.addEventListener("mouseenter", function () { clearTimeout(timer); t.classList.add("hold"); });
  t.addEventListener("mouseleave", function () { t.classList.remove("hold"); timer = setTimeout(close, 2500); });
  if (window.__josyBell) window.__josyBell.refresh();
}

/* ---------- bell ---------- */
export function mountBell(sb, host, opts) {
  if (!host || host.querySelector(".bell")) return;
  opts = opts || {};
  var wrap = document.createElement("div");
  wrap.className = "bell" + (opts.cls ? " " + opts.cls : "");
  wrap.innerHTML = '<button type="button" class="bell-btn" aria-haspopup="true" aria-expanded="false" aria-label="Notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg><span class="bell-n" hidden></span></button>' +
    '<div class="bell-pop" hidden role="dialog" aria-label="Notifications"><div class="bell-h"><b>Notifications</b><button type="button" data-read-all>Mark all read</button></div><div class="bell-list" data-bell-list></div></div>';
  host.appendChild(wrap);
  var btn = wrap.querySelector(".bell-btn"), pop = wrap.querySelector(".bell-pop"), rows = [];
  async function load() {
    var r = await sb.from("josy_notifications").select("id, kind, source, entity_type, entity_id, platforms, title, read_at, created_at").order("created_at", { ascending: false }).limit(30);
    rows = r.data || [];
    var unread = rows.filter(function (x) { return !x.read_at; }).length, n = wrap.querySelector(".bell-n");
    n.hidden = !unread; n.textContent = unread > 9 ? "9+" : String(unread);
    btn.setAttribute("aria-label", unread ? "Notifications, " + unread + " unread" : "Notifications");
    if (!pop.hidden) paint();
  }
  function paint() {
    var list = wrap.querySelector("[data-bell-list]");
    if (!rows.length) { list.innerHTML = '<div class="bell-empty"><b>No notifications yet</b><span>When you mark a post or campaign as published, it shows up here.</span></div>'; return; }
    list.innerHTML = rows.map(function (x) {
      var href = x.entity_type === "campaign" ? "josy-campaign.html?id=" + x.entity_id : "josy-organic.html#post=" + x.entity_id;
      return '<a class="bell-item' + (x.read_at ? "" : " unread") + '" href="' + esc(href) + '" data-nid="' + x.id + '"><span class="bell-ics">' + (x.platforms || []).slice(0, 3).map(function (k) { return pfIcon(k, 26); }).join("") + "</span>" +
        '<span class="bell-t"><b>' + esc(headline(x.platforms || [], x.source)) + '</b><span dir="auto">' + esc(x.title) + "</span><small>" + (x.source === "api" ? "Via MarketScope" : "Marked by you") + " · " + relTime(x.created_at) + "</small></span></a>";
    }).join("");
    list.querySelectorAll("[data-nid]").forEach(function (a) { a.addEventListener("click", function () { sb.from("josy_notifications").update({ read_at: new Date().toISOString() }).eq("id", a.getAttribute("data-nid")).then(function () {}); }); });
  }
  function toggle(show) {
    if (show) { var rc = btn.getBoundingClientRect(); pop.style.top = Math.round(rc.bottom + 8) + "px"; pop.style.right = Math.max(8, Math.round(window.innerWidth - rc.right - 4)) + "px"; }
    pop.hidden = !show; btn.setAttribute("aria-expanded", String(show));
    if (show) { paint(); load(); }
  }
  btn.onclick = function (e) { e.stopPropagation(); toggle(pop.hidden); };
  var repos = function () { if (pop.hidden) return; var rc = btn.getBoundingClientRect(); pop.style.top = Math.round(rc.bottom + 8) + "px"; pop.style.right = Math.max(8, Math.round(window.innerWidth - rc.right - 4)) + "px"; };
  window.addEventListener("scroll", repos, { passive: true }); window.addEventListener("resize", repos);
  document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) toggle(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !pop.hidden) { toggle(false); btn.focus(); } });
  wrap.querySelector("[data-read-all]").onclick = async function () {
    var ids = rows.filter(function (x) { return !x.read_at; }).map(function (x) { return x.id; });
    if (!ids.length) return;
    await sb.from("josy_notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    load();
  };
  load();
  setInterval(function () { if (!document.hidden) load(); }, 60000);
  window.__josyBell = { refresh: function () { setTimeout(load, 600); } };
}

/* Mount the bell wherever the Josy area has a header. */
export function autoBell(sb) {
  var host = document.querySelector(".cm-nav .wrap") || document.querySelector(".chat-head .tools") || document.querySelector("[data-bell-host]");
  if (host) mountBell(sb, host, { cls: host.classList.contains("tools") ? "in-tools" : "" });
}
