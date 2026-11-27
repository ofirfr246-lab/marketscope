/* MarketScope Workspace — shared helpers for the vision modules.
   Every number shown comes from the signed-in user's own rows (RLS) or a transparent
   computation on them. Nothing here generates sample or placeholder data. */
import { getClient } from "./josy-core.js";

export function $(s, r) { return (r || document).querySelector(s); }
export function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
export function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export function num(v) { var n = Number(v); return v === null || v === "" || v === undefined || !Number.isFinite(n) ? null : n; }
export function fmt(n, d) {
  n = num(n); if (n == null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: d == null ? 2 : d, minimumFractionDigits: 0 });
}
var SYM = { USD: "$", EUR: "€", GBP: "£", ILS: "₪", CAD: "CA$", AUD: "A$" };
export function money(n, cur) { n = num(n); if (n == null) return "—"; return (SYM[cur || "USD"] || ((cur || "") + " ")) + fmt(n, 2); }
export function pct(n, d) { n = num(n); if (n == null) return "—"; return (n > 0 ? "+" : "") + fmt(n, d == null ? 1 : d) + "%"; }
export function cls(n) { n = num(n); return n == null || n === 0 ? "" : (n > 0 ? "up" : "down"); }
export function fdate(iso, time) {
  if (!iso) return "—";
  var d = new Date(iso); if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + (time ? " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
}
export function productKey(p) { return String(p || "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200); }
export function verdictPill(v) {
  if (!v) return '<span class="pill" style="--vc:#8f99a6">NO SCORE</span>';
  var x = String(v).toUpperCase().replace(/\s+/g, "");
  var c = ({ STRONGBUY: "v-sbuy", BUY: "v-buy", HOLD: "v-hold", UNDERPERFORM: "v-under", AVOID: "v-avoid" })[x] || "v-hold";
  return '<span class="pill ' + c + '">' + esc(String(v).toUpperCase()) + "</span>";
}
export function empty(title, text, cta) {
  return '<div class="ws-empty"><b>' + esc(title) + "</b>" + esc(text) + (cta || "") + "</div>";
}
export function toast(msg) {
  var t = document.createElement("div"); t.className = "ws-toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3200);
}
export function errMsg(e) { return (e && (e.message || e.error_description || e.error)) || "Something went wrong."; }

/* Auth: show the module shell for signed-in users, a sign-in panel otherwise (no redirect). */
export async function boot(page, title) {
  var gate = $("[data-gate]"), shell = $("[data-shell]");
  var sb = await getClient();
  if (!sb) { if (gate) gate.innerHTML = '<div class="ws-gate"><h2>Accounts are not configured</h2><p class="muted">This module needs a MarketScope account.</p></div>'; return { sb: null, session: null }; }
  var res = await sb.auth.getSession();
  var session = res && res.data ? res.data.session : null;
  if (!session) {
    if (gate) gate.innerHTML = '<div class="ws-gate"><div class="kicker mono">SIGN IN REQUIRED</div><h2>' + esc(title) + ' works on your own data</h2>' +
      '<p class="muted">Everything here is private to your account and starts empty. Nothing is pre-filled with sample numbers.</p>' +
      '<p style="margin-top:18px"><a class="btn btn-amber" href="login.html?next=' + encodeURIComponent(page) + '">Log in</a> <a class="btn btn-ghost" href="signup.html">Create a free account</a></p></div>';
    return { sb: sb, session: null };
  }
  if (gate) gate.hidden = true;
  if (shell) shell.hidden = false;
  return { sb: sb, session: session };
}

/* Snapshots → products */
export async function loadSnapshots(sb) {
  var r = await sb.from("product_snapshots").select("*").order("captured_at", { ascending: true }).limit(5000);
  if (r.error) throw r.error;
  return r.data || [];
}
export function symbolOf(s) { return s.product_key + "|" + s.market; }
export function groupProducts(snaps) {
  var map = {}, list = [];
  snaps.forEach(function (s) {
    var k = symbolOf(s);
    if (!map[k]) { map[k] = { symbol: k, key: s.product_key, product: s.product, market: s.market, category: s.category, series: [] }; list.push(map[k]); }
    map[k].series.push(s);
    if (s.category) map[k].category = s.category;
    map[k].product = s.product;
  });
  list.forEach(function (p) {
    p.latest = p.series[p.series.length - 1];
    p.prev = p.series.length > 1 ? p.series[p.series.length - 2] : null;
  });
  return list;
}

/* Minimal SVG charts (no third-party code). */
function scale(d0, d1, r0, r1) { return function (v) { return d1 === d0 ? (r0 + r1) / 2 : r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }
export function lineChart(host, pts, opts) {
  opts = opts || {};
  var W = 640, H = opts.h || 240, P = { l: 44, r: 12, t: 12, b: 26 };
  pts = (pts || []).filter(function (p) { return num(p.y) != null; });
  if (!pts.length) { host.innerHTML = empty(opts.emptyTitle || "No data yet", opts.emptyText || ""); return; }
  var xs = pts.map(function (p) { return +p.x; }), ys = pts.map(function (p) { return +p.y; });
  var y0 = opts.min != null ? opts.min : Math.min.apply(null, ys), y1 = opts.max != null ? opts.max : Math.max.apply(null, ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  var sx = scale(Math.min.apply(null, xs), Math.max.apply(null, xs), P.l, W - P.r), sy = scale(y0, y1, H - P.b, P.t);
  var col = opts.color || "var(--amber)";
  var grid = "";
  for (var i = 0; i <= 4; i++) { var gv = y0 + (y1 - y0) * i / 4, gy = sy(gv); grid += '<line class="grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + gy + '" y2="' + gy + '"/><text x="' + (P.l - 6) + '" y="' + (gy + 3) + '" text-anchor="end">' + fmt(gv, gv >= 100 ? 0 : 1) + "</text>"; }
  var d = pts.map(function (p, i) { return (i ? "L" : "M") + sx(+p.x).toFixed(1) + " " + sy(+p.y).toFixed(1); }).join(" ");
  var dots = pts.map(function (p) { return '<circle cx="' + sx(+p.x).toFixed(1) + '" cy="' + sy(+p.y).toFixed(1) + '" r="3" fill="' + col + '"><title>' + esc((p.label || "") + " " + fmt(p.y)) + "</title></circle>"; }).join("");
  var first = pts[0], last = pts[pts.length - 1];
  var lab = '<text x="' + P.l + '" y="' + (H - 6) + '">' + esc(first.label || "") + '</text><text x="' + (W - P.r) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(last.label || "") + "</text>";
  host.innerHTML = '<svg class="ws-chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(opts.aria || "Chart") + '">' + grid +
    '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2"/>' + dots + lab + "</svg>";
}
export function candleChart(host, candles, opts) {
  opts = opts || {};
  var W = 640, H = opts.h || 260, P = { l: 40, r: 12, t: 12, b: 26 };
  if (!candles || !candles.length) { host.innerHTML = empty("No candles yet", opts.emptyText || "Candles appear after your first live report for this product."); return; }
  var lo = Math.min.apply(null, candles.map(function (c) { return c.l; })), hi = Math.max.apply(null, candles.map(function (c) { return c.h; }));
  if (lo === hi) { lo -= 2; hi += 2; }
  var sy = scale(lo, hi, H - P.b, P.t), n = candles.length, step = (W - P.l - P.r) / n, bw = Math.max(3, Math.min(22, step * 0.6));
  var g = "";
  for (var i = 0; i <= 4; i++) { var gv = lo + (hi - lo) * i / 4, gy = sy(gv); g += '<line class="grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + gy + '" y2="' + gy + '"/><text x="' + (P.l - 6) + '" y="' + (gy + 3) + '" text-anchor="end">' + fmt(gv, 0) + "</text>"; }
  candles.forEach(function (c, i) {
    var x = P.l + step * i + step / 2, up = c.c >= c.o, col = up ? "var(--green)" : "var(--red)";
    var top = sy(Math.max(c.o, c.c)), bot = sy(Math.min(c.o, c.c));
    g += '<line x1="' + x + '" x2="' + x + '" y1="' + sy(c.h) + '" y2="' + sy(c.l) + '" stroke="' + col + '" stroke-width="1.2"/>' +
      '<rect x="' + (x - bw / 2) + '" y="' + top + '" width="' + bw + '" height="' + Math.max(1.5, bot - top) + '" fill="' + col + '" rx="1.5"><title>' + esc(c.label + " O " + c.o + " H " + c.h + " L " + c.l + " C " + c.c + " · " + c.n + " snapshot(s)") + "</title></rect>";
  });
  g += '<text x="' + P.l + '" y="' + (H - 6) + '">' + esc(candles[0].label) + '</text><text x="' + (W - P.r) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(candles[n - 1].label) + "</text>";
  host.innerHTML = '<svg class="ws-chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Candlestick chart">' + g + "</svg>";
}
/* Daily OHLC of a metric from real snapshots. */
export function dailyCandles(series, field) {
  var by = {}, order = [];
  series.forEach(function (s) {
    var v = num(s[field]); if (v == null) return;
    var day = String(s.captured_at).slice(0, 10);
    if (!by[day]) { by[day] = { label: day, o: v, h: v, l: v, c: v, n: 0 }; order.push(day); }
    var c = by[day]; c.h = Math.max(c.h, v); c.l = Math.min(c.l, v); c.c = v; c.n++;
  });
  return order.map(function (d) { return by[d]; });
}
export function monthlyPoints(ms) {
  return (Array.isArray(ms) ? ms : []).filter(function (m) { return m && num(m.search_volume) != null; })
    .slice().sort(function (a, b) { return a.year - b.year || a.month - b.month; })
    .map(function (m) { return { x: Date.UTC(m.year, m.month - 1, 1), y: m.search_volume, label: m.year + "-" + String(m.month).padStart(2, "0") }; });
}

export var WS_PAGES = [
  ["my-terminal.html", "Live Terminal"], ["competitors.html", "Competitors"], ["suppliers.html", "Suppliers"],
  ["product-portfolio.html", "Portfolio"], ["backtesting.html", "Backtesting"], ["exchange.html", "Exchange · Sim"], ["roadmap.html", "Roadmap"]
];
export var WS_SECTIONS = [
  { label: "Research", pages: ["my-terminal.html", "competitors.html", "suppliers.html", "product-portfolio.html", "backtesting.html"] },
  { label: "Trading", pages: ["exchange.html"] },
  { label: "Vision", pages: ["roadmap.html"] }
];
export function paintSubnav() {
  var host = $("[data-ws-sub]"); if (!host) return;
  var file = (location.pathname.split("/").pop() || "index.html");
  var byHref = {};
  WS_PAGES.forEach(function (p) { byHref[p[0]] = p; });
  host.innerHTML = WS_SECTIONS.map(function (sec, i) {
    var id = "ws-sub-sec-" + sec.label.toLowerCase();
    var links = sec.pages.map(function (href) {
      var p = byHref[href]; if (!p) return "";
      return '<a href="' + p[0] + '"' + (p[0] === file ? ' class="on" aria-current="page"' : "") + ">" + esc(p[1]) + "</a>";
    }).join("");
    return '<div class="ws-sec" role="group" aria-labelledby="' + id + '"><p class="ws-sec-label" id="' + id + '">' + esc(sec.label) + "</p>" + links + "</div>";
  }).join("");
}
paintSubnav();
