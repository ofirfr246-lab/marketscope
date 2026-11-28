/* MarketScope — data-deletion status lookup. Calls the public GET endpoint of the meta-data-deletion
   Edge Function (no login, no secrets). The confirmation code comes from ?code= or the form. */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

var form = document.querySelector("[data-dd-form]");
var out = document.querySelector("[data-dd-result]");
var input = form && form.querySelector("input");

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function fmt(iso) {
  if (!iso) return "—";
  var d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}
function show(html, kind) { out.className = "meta-msg dd-result" + (kind ? " " + kind : ""); out.innerHTML = html; out.hidden = false; }

async function lookup(code) {
  code = String(code || "").trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(code)) { show("That doesn\u2019t look like a confirmation code. It has 32 letters and digits (0\u20139, a\u2013f).", "warn"); return; }
  show("Checking\u2026");
  try {
    var res = await fetch(SUPABASE_URL + "/functions/v1/meta-data-deletion?code=" + encodeURIComponent(code), { headers: { apikey: SUPABASE_ANON_KEY } });
    var d = null;
    try { d = await res.json(); } catch (e) { d = null; }
    if (res.status === 404) { show("We couldn\u2019t find a request with that code. Check it and try again.", "warn"); return; }
    if (!res.ok || !d) { show("We couldn\u2019t check that code right now. Please try again in a moment.", "err"); return; }
    var done = d.status === "completed";
    show("<b>" + (done ? "Completed" : "Received, in progress") + "</b><br>" +
      "Type: " + (d.kind === "deauthorize" ? "Meta access removed" : "Meta data deletion request") + "<br>" +
      "Requested: " + esc(fmt(d.requested_at)) + "<br>" +
      "Completed: " + esc(done ? fmt(d.completed_at) : "not yet") + "<br>" +
      "Confirmation code: <span class=\"mono\">" + esc(code) + "</span>", done ? "ok" : "warn");
  } catch (e) {
    show("Network problem. Check your connection and try again.", "err");
  }
}

if (form && out) {
  form.addEventListener("submit", function (ev) { ev.preventDefault(); lookup(input.value); });
  var c = new URLSearchParams(location.search).get("code");
  if (c) { input.value = c; lookup(c); }
}
