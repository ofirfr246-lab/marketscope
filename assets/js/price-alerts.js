/* MarketScope Exchange (simulation): price alerts.
   Alerts live in public.price_alerts (row level security: own rows only). A symbol's "price" is the
   Opportunity index value of the user's newest snapshot. The database evaluates armed alerts whenever a
   new snapshot is stored (trigger on product_snapshots), so an alert can fire even if no page is open.
   This page-side code only shows what the database recorded: a toast and a bell badge on the Exchange and
   the dashboard. There is no email and no push notification. Nothing here is sample data. */
import { getClient } from "./josy-core.js";

export var LIMIT = 20;
var POLL_MS = 60000;
var TABLE = "price_alerts";
var COLS = "id, product_key, market, product, direction, target, note, triggered_at, triggered_value, seen_at, created_at";

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function n2(v) { var n = Number(v); return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"; }
export function symbolOf(a) { return a.product_key + "|" + a.market; }
export function isArmed(a) { return !a.triggered_at; }
export function isUnseen(a) { return !!a.triggered_at && !a.seen_at; }
export function dirLabel(d) { return d === "above" ? "at or above" : "at or below"; }
export function describe(a) { return (a.product || a.product_key) + " (" + a.market + ") " + dirLabel(a.direction) + " " + n2(a.target); }
export function splitSymbol(sym) { var i = String(sym).lastIndexOf("|"); return i < 0 ? null : { product_key: sym.slice(0, i), market: sym.slice(i + 1) }; }

/* ---------- data (every call returns {error} instead of throwing) ---------- */
export async function listAlerts(sb) {
  var r = await sb.from(TABLE).select(COLS).order("created_at", { ascending: false }).limit(100);
  return r.error ? { error: r.error, rows: [] } : { rows: r.data || [] };
}
export async function addAlert(sb, row) {
  var r = await sb.from(TABLE).insert({
    product_key: row.product_key, market: row.market, product: row.product || null,
    direction: row.direction, target: row.target, note: row.note ? String(row.note).slice(0, 80) : null
  }).select(COLS).single();
  return r.error ? { error: r.error } : { row: r.data };
}
export async function deleteAlert(sb, id) {
  var r = await sb.from(TABLE).delete().eq("id", id);
  return r.error ? { error: r.error } : {};
}
export async function markSeen(sb, ids) {
  if (!ids.length) return {};
  var r = await sb.from(TABLE).update({ seen_at: new Date().toISOString() }).in("id", ids).is("seen_at", null);
  return r.error ? { error: r.error } : {};
}
/* Fallback for the open Exchange: if the newest value already satisfies an armed alert (for example the
   database trigger was not deployed yet when it was created), record it exactly like the trigger would. */
export async function clientCheck(sb, rows, lastMap) {
  var fired = [];
  for (var i = 0; i < rows.length; i++) {
    var a = rows[i]; if (!isArmed(a)) continue;
    var px = lastMap[symbolOf(a)]; if (px == null) continue;
    var hit = a.direction === "above" ? px >= Number(a.target) : px <= Number(a.target);
    if (!hit) continue;
    var r = await sb.from(TABLE).update({ triggered_at: new Date().toISOString(), triggered_value: px }).eq("id", a.id).is("triggered_at", null).select(COLS);
    if (!r.error && r.data && r.data.length) fired.push(r.data[0]);
  }
  return fired;
}
/* One-time import of alerts the old Exchange kept only in this browser (localStorage). */
export async function importLocal(sb, uid) {
  var key = "ms_xt_alerts:" + (uid || "anon"), list = [];
  try { list = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { list = []; }
  if (!Array.isArray(list) || !list.length) return 0;
  var done = 0;
  for (var i = 0; i < list.length; i++) {
    var a = list[i], s = a && a.symbol ? splitSymbol(a.symbol) : null, price = Number(a && a.price);
    if (!s || a.active === false || a.firedAt || !(price >= 0.01 && price <= 1000)) continue;
    var r = await addAlert(sb, { product_key: s.product_key, market: s.market, direction: a.op === "<=" ? "below" : "above", target: price, note: a.note || null });
    if (r.error) { if (/up to \d+ active/i.test(r.error.message || "")) break; continue; }
    done++;
  }
  try { localStorage.removeItem(key); } catch (e) {}
  return done;
}

/* ---------- notification UI ---------- */
function toastedKey(uid) { return "ms_pa_toasted:" + (uid || "anon"); }
function readToasted(uid) { try { return JSON.parse(localStorage.getItem(toastedKey(uid)) || "[]"); } catch (e) { return []; } }
function toastHost() {
  var h = document.querySelector(".pa-toasts");
  if (!h) { h = document.createElement("div"); h.className = "pa-toasts"; h.setAttribute("aria-live", "polite"); document.body.appendChild(h); }
  return h;
}
export function showAlertToast(a, onView) {
  var el = document.createElement("div"); el.className = "pa-toast"; el.setAttribute("role", "status");
  el.innerHTML = '<span class="pa-toast-ic" aria-hidden="true">' + BELL + '</span><div class="pa-toast-b"><b>Price alert</b>' +
    "<span>" + esc(a.product || a.product_key) + " (" + esc(a.market) + ") reached " + esc(n2(a.triggered_value)) + ", " + esc(dirLabel(a.direction)) + " your target " + esc(n2(a.target)) + ". Simulation only.</span>" +
    '<a href="exchange.html#alerts" data-pa-view>View alerts</a></div><button type="button" class="pa-toast-x" aria-label="Dismiss">×</button>';
  var kill = function () { el.classList.add("out"); setTimeout(function () { el.remove(); }, 220); };
  el.querySelector(".pa-toast-x").onclick = kill;
  var v = el.querySelector("[data-pa-view]");
  v.onclick = function (e) { if (onView) { e.preventDefault(); onView(); } kill(); };
  toastHost().appendChild(el);
  setTimeout(kill, 12000);
}
/* Show a toast once per triggered alert (remembered in this browser), up to 3 at a time. */
export function toastNew(uid, rows, onView) {
  var seen = readToasted(uid), fresh = rows.filter(function (a) { return isUnseen(a) && seen.indexOf(a.id) < 0; });
  if (!fresh.length) return;
  fresh.slice(0, 3).forEach(function (a) { showAlertToast(a, onView); });
  try { localStorage.setItem(toastedKey(uid), JSON.stringify(seen.concat(fresh.map(function (a) { return a.id; })).slice(-200))); } catch (e) {}
}
export function paintBadge(rows) {
  var n = rows.filter(isUnseen).length;
  Array.prototype.forEach.call(document.querySelectorAll("[data-pa-bell]"), function (b) {
    var c = b.querySelector("[data-pa-count]");
    if (c) { c.textContent = n > 9 ? "9+" : String(n); c.hidden = n === 0; }
    b.classList.toggle("has", n > 0);
    b.setAttribute("aria-label", n ? "Price alerts: " + n + " new" : "Price alerts");
  });
  return n;
}
export var BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';

/* ---------- dashboard bell (self-starting when the page has [data-pa-bell][data-pa-auto]) ---------- */
async function autoStart() {
  var bell = document.querySelector("[data-pa-bell][data-pa-auto]"); if (!bell) return;
  var sb = await getClient(); if (!sb) return;
  var s = await sb.auth.getSession(), session = s && s.data && s.data.session; if (!session) return;
  var uid = session.user && session.user.id;
  async function tick() {
    if (document.hidden) return;
    var r = await listAlerts(sb); if (r.error) return;
    paintBadge(r.rows); toastNew(uid, r.rows, function () { location.href = "exchange.html#alerts"; });
  }
  await tick(); setInterval(tick, POLL_MS);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoStart); else autoStart();
}
export var POLL = POLL_MS;
