/* Josy Market — shared browser helpers (ES module).
   Uses the publishable key only (RLS protects every table). */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";

var CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
var clientP = null;

/* Must match public.josy_daily_limit() in the database. */
export var JOSY_LIMITS = { free: 10, starter: 50, plus: 150, pro: 400 };
export var PLAN_NAMES = { free: "Free", starter: "Starter", plus: "Plus", pro: "Pro" };

export function getClient() {
  if (!isSupabaseConfigured()) return Promise.resolve(null);
  if (!clientP) {
    clientP = import(CDN).then(function (mod) {
      return mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" }
      });
    });
  }
  return clientP;
}

export async function requireSession(nextFile) {
  var sb = await getClient();
  if (!sb) return { sb: null, session: null };
  var res = await sb.auth.getSession();
  var session = res && res.data ? res.data.session : null;
  if (!session) {
    location.replace("login.html?next=" + encodeURIComponent(nextFile));
    return { sb: sb, session: null };
  }
  return { sb: sb, session: session };
}

export async function callJosy(sb, payload) {
  var res = await sb.auth.getSession();
  var token = res && res.data && res.data.session ? res.data.session.access_token : "";
  var r;
  try {
    r = await fetch(SUPABASE_URL + "/functions/v1/josy-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return { ok: false, status: 0, data: { error: "Network error. Check your connection and try again.", code: "network" } };
  }
  var data = {};
  try { data = await r.json(); } catch (e) { data = { error: "Unexpected response (" + r.status + ")." }; }
  return { ok: r.ok, status: r.status, data: data };
}

/* ---------- small DOM utils ---------- */
export function $(s, r) { return (r || document).querySelector(s); }
export function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
export function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export function isRtl(text) {
  var m = String(text || "").match(/[A-Za-z\u0590-\u05FF\u0600-\u06FF]/);
  return !!(m && /[\u0590-\u05FF\u0600-\u06FF]/.test(m[0]));
}
export function dirOf(text) { return isRtl(text) ? "rtl" : "ltr"; }

export function toast(msg) {
  var t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(function () { t.classList.remove("show"); }, 2200);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied to clipboard"); return true; }
  catch (e) {
    var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied to clipboard"); } catch (e2) { toast("Copy failed"); }
    ta.remove(); return false;
  }
}

export function download(filename, text, type) {
  var blob = new Blob([text], { type: type || "text/markdown;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function slug(s) {
  return String(s || "josy").toLowerCase().replace(/[^a-z0-9\u0590-\u05FF]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "josy";
}

export function confirmDialog(title, text, okLabel) {
  return new Promise(function (resolve) {
    var bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = '<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="mdl-t"><h3 id="mdl-t">' + esc(title) + "</h3><p>" + esc(text) +
      '</p><div class="acts"><button class="btn btn-sm btn-ghost" data-no>Cancel</button><button class="btn btn-sm btn-danger" data-yes>' + esc(okLabel || "Delete") + "</button></div></div>";
    document.body.appendChild(bg);
    var done = function (v) { bg.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    var onKey = function (e) { if (e.key === "Escape") done(false); };
    document.addEventListener("keydown", onKey);
    bg.addEventListener("click", function (e) { if (e.target === bg) done(false); });
    $("[data-no]", bg).onclick = function () { done(false); };
    $("[data-yes]", bg).onclick = function () { done(true); };
    $("[data-yes]", bg).focus();
  });
}

export function fmtNum(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US");
}
export function fmtDate(iso, withTime) {
  if (!iso) return "";
  var d = new Date(iso);
  var opts = withTime ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleString(undefined, opts);
}
export function relTime(iso) {
  var s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 604800) return Math.floor(s / 86400) + "d ago";
  return fmtDate(iso);
}

/* ---------- icons (generic, original line icons) ---------- */
var P = {
  spark: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/>',
  plan: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  dl: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  redo: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  megaphone: '<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  seo: '<path d="M4 6h10M4 12h7M4 18h6"/><circle cx="17" cy="15" r="3.5"/><path d="M21 19l-1.6-1.6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  arrow: '<path d="M15 6l-6 6 6 6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
};
export function icon(name, cls) {
  return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || "") + "</svg>";
}

/* ---------- source chips (only from real tool metadata) ---------- */
export function sourceChips(meta) {
  meta = meta || {};
  var out = [];
  var seenData = {};
  (meta.sources || []).forEach(function (s) {
    if (s.id === "josy_ai" || s.id === "gemini") {
      out.push('<span class="src-chip ai" title="Written by Josy AI · MarketScope">' + icon("spark") + "Josy AI</span>");
    } else if (s.id === "dataforseo") {
      var key = (s.market || "") + (s.fetched_at || "");
      if (seenData[key]) return; seenData[key] = 1;
      out.push('<span class="src-chip data" title="Live Google search data fetched by MarketScope from DataForSEO">' + icon("search") +
        "Search data · DataForSEO via MarketScope" + (s.market ? ' <span class="t">· ' + esc(s.market) + "</span>" : "") +
        (s.fetched_at ? ' <span class="t">· ' + esc(fmtDate(s.fetched_at, true)) + "</span>" : "") + "</span>");
    }
  });
  (meta.plan_ids || []).forEach(function (id) {
    out.push('<a class="src-chip saved" href="josy-plans.html#plan=' + encodeURIComponent(id) + '">' + icon("plan") + "Saved to My plans</a>");
  });
  return out.length ? '<div class="src-row">' + out.join("") + "</div>" : "";
}

/* ---------- demand card ---------- */
function spark(monthly) {
  var v = (monthly || []).map(function (m) { return m.search_volume; }).filter(function (x) { return typeof x === "number"; });
  if (v.length < 2) return '<span class="na mono">—</span>';
  var max = Math.max.apply(null, v), min = Math.min.apply(null, v), w = 96, h = 26, rng = max - min || 1;
  var pts = v.map(function (x, i) { return (i * (w - 4) / (v.length - 1) + 2).toFixed(1) + "," + (h - 3 - (x - min) / rng * (h - 6)).toFixed(1); });
  var up = v[v.length - 1] >= v[0];
  var c = up ? "#19d27c" : "#ff4d5e";
  return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts.join(" ") + '" fill="none" stroke="' + c + '" stroke-width="1.6" stroke-linejoin="round"/></svg>';
}
export function demandCard(d) {
  if (!d || !d.keywords) return "";
  var rows = d.keywords.map(function (k) {
    var t = k.trend_12m_pct;
    var trend = t == null ? '<span class="na mono">—</span>' : '<span class="trend ' + (t > 5 ? "up" : t < -5 ? "down" : "flat") + '">' + (t > 0 ? "+" : "") + t + "%</span>";
    return '<tr><td class="kw" dir="auto">' + esc(k.keyword) + '</td><td class="num">' + (k.search_volume == null ? '<span class="na">n/a</span>' : fmtNum(k.search_volume)) +
      "</td><td>" + trend + "</td><td>" + spark(k.monthly) + '</td><td class="num col-cpc">' + (k.cpc == null ? '<span class="na">—</span>' : "$" + Number(k.cpc).toFixed(2)) +
      '</td><td class="col-comp mono" style="font-size:.74rem;color:var(--muted)">' + esc(k.competition || "—") + "</td></tr>";
  }).join("");
  var rel = (d.related || []).length ? '<div class="related"><div class="lbl">RELATED SEARCHES</div>' + d.related.map(function (r) {
    return '<button type="button" class="rel" data-rel="' + esc(r.keyword) + '" dir="auto">' + esc(r.keyword) + (r.search_volume != null ? "<b>" + fmtNum(r.search_volume) + "</b>" : "") + "</button>";
  }).join("") + "</div>" : "";
  return '<div class="demand"><div class="demand-head"><h4>' + icon("chart") + "LIVE DEMAND · " + esc(d.market_name || d.market) +
    "</h4><span>Monthly Google searches · last 12 months</span></div>" +
    '<div style="overflow:auto"><table><thead><tr><th>KEYWORD</th><th>VOLUME / MO</th><th>12M TREND</th><th>TREND</th><th class="col-cpc">CPC</th><th class="col-comp">COMPETITION</th></tr></thead><tbody>' +
    rows + "</tbody></table></div>" + rel +
    '<div class="demand-foot"><span class="src-chip data">' + icon("search") + esc(d.source || "Search data · DataForSEO via MarketScope") + ' <span class="t">· ' + esc(fmtDate(d.fetched_at, true)) + "</span></span></div></div>";
}

/* ---------- markdown (safe: escape first, then format) ---------- */
function inline(s) {
  s = esc(s);
  var codes = [];
  s = s.replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|josy-plans\.html[^\s)]*)\)/g, function (_, t, u) {
    var ext = /^https?:/.test(u);
    return '<a href="' + u + '"' + (ext ? ' target="_blank" rel="noopener noreferrer nofollow"' : "") + ">" + t + "</a>";
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return "<code>" + codes[+i] + "</code>"; });
  return s;
}
export function renderMarkdown(src) {
  var lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
  var out = [], i = 0;
  function isTableSep(l) { return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l); }
  function cells(l) { return l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); }); }
  while (i < lines.length) {
    var l = lines[i];
    if (/^\s*```/.test(l)) {
      var buf = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push('<pre dir="auto"><button type="button" class="copy-code">COPY</button><code>' + esc(buf.join("\n")) + "</code></pre>");
      continue;
    }
    if (!l.trim()) { i++; continue; }
    var h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) { var n = h[1].length; out.push("<h" + n + ' dir="auto">' + inline(h[2]) + "</h" + n + ">"); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/\|/.test(l) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      var head = cells(l); i += 2;
      var body = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) { body.push(cells(lines[i])); i++; }
      out.push('<div class="tbl"><table dir="auto"><thead><tr>' + head.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        body.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>");
      continue;
    }
    if (/^\s*>/.test(l)) {
      var q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push('<blockquote dir="auto">' + q.map(inline).join("<br>") + "</blockquote>");
      continue;
    }
    var lm = l.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
    if (lm) {
      var ordered = /\d/.test(lm[2]);
      var items = [];
      while (i < lines.length) {
        var m2 = lines[i].match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
        if (m2) { items.push(inline(m2[3])); i++; continue; }
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1] += "<br>" + inline(lines[i].trim()); i++; continue; }
        break;
      }
      out.push("<" + (ordered ? "ol" : "ul") + ' dir="auto">' + items.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</" + (ordered ? "ol" : "ul") + ">");
      continue;
    }
    var p = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s|^\s*```|^\s*>|^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) && !(/\|/.test(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1]))) { p.push(lines[i]); i++; }
    if (!p.length) { p.push(lines[i]); i++; }
    out.push('<p dir="auto">' + p.map(inline).join("<br>") + "</p>");
  }
  return out.join("");
}

export function bindCodeCopy(root) {
  root.addEventListener("click", function (e) {
    var b = e.target.closest(".copy-code");
    if (!b) return;
    var code = b.parentNode.querySelector("code");
    copyText(code ? code.textContent : "");
  });
}

/* ---------- plan → markdown / csv ---------- */
export function planToMarkdown(plan, items) {
  var md = "# " + plan.title + "\n\n";
  md += "_" + (plan.kind === "content_calendar" ? "Content calendar" : "Marketing plan") + " · created with Josy (MarketScope) · " + fmtDate(plan.created_at) + "_\n\n";
  if (plan.goal) md += "**Goal:** " + plan.goal + "\n\n";
  if (plan.channels && plan.channels.length) md += "**Channels:** " + plan.channels.join(", ") + "\n\n";
  if (plan.summary) md += plan.summary + "\n\n";
  if (items && items.length) {
    md += "## " + (plan.kind === "content_calendar" ? "Calendar" : "Action items") + "\n\n";
    items.forEach(function (it) {
      md += "### " + (it.scheduled_date ? it.scheduled_date + " — " : it.day ? "Day " + it.day + " — " : "") + it.title + "\n";
      var tags = [it.channel, it.format, it.status].filter(Boolean).join(" · ");
      if (tags) md += "_" + tags + "_\n\n";
      if (it.body) md += it.body + "\n\n";
    });
  }
  return md;
}
export function planToCsv(items) {
  var q = function (v) { v = v == null ? "" : String(v); return '"' + v.replace(/"/g, '""') + '"'; };
  var rows = [["day", "date", "channel", "format", "title", "copy", "status"]];
  items.forEach(function (it) { rows.push([it.day, it.scheduled_date, it.channel, it.format, it.title, it.body, it.status]); });
  return "\ufeff" + rows.map(function (r) { return r.map(q).join(","); }).join("\n");
}
