/* Live status checks — run in the browser against real endpoints. No sample uptime. */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";

var CHECKS = [
  {
    id: "pages",
    name: "GitHub Pages (this site)",
    detail: "Fetches this site's robots.txt (or favicon) from the host serving this page.",
    run: function () {
      var url = new URL("robots.txt", location.href).href + "?t=" + Date.now();
      return ping(url);
    }
  },
  {
    id: "pages-prod",
    name: "GitHub Pages (production)",
    detail: "Fetches https://ofirfr246-lab.github.io/marketscope/robots.txt.",
    run: function () {
      return ping("https://ofirfr246-lab.github.io/marketscope/robots.txt?t=" + Date.now());
    }
  },
  {
    id: "auth",
    name: "Supabase Auth",
    detail: "GET /auth/v1/health with the project's publishable key.",
    run: function () {
      if (!isSupabaseConfigured()) return Promise.resolve({ ok: false, error: "Publishable key is not configured in this build." });
      return ping(SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/health", {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY }
      });
    }
  },
  {
    id: "rest",
    name: "Supabase REST",
    detail: "GET /rest/v1/profiles?select=id&limit=0 with the publishable key. A 200 with an empty list means the API is up; it does not return other people's data.",
    run: function () {
      if (!isSupabaseConfigured()) return Promise.resolve({ ok: false, error: "Publishable key is not configured in this build." });
      return ping(SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/profiles?select=id&limit=0", {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY,
          Accept: "application/json"
        }
      });
    }
  }
];

function ping(url, opts) {
  var t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 10000);
  var init = Object.assign({ cache: "no-store", mode: "cors", signal: ctrl && ctrl.signal }, opts || {});
  return fetch(url, init).then(function (r) {
    var ms = Math.round(((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - t0);
    return { ok: r.ok, status: r.status, ms: ms, url: url };
  }).catch(function (err) {
    var ms = Math.round(((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - t0);
    var msg = (err && err.name === "AbortError") ? "Timed out after 10s" : ((err && err.message) || "Network error");
    return { ok: false, error: msg, ms: ms, url: url };
  }).finally(function () { clearTimeout(timer); });
}

function $(sel) { return document.querySelector(sel); }

function paint(results) {
  var list = $("[data-status-list]");
  var headline = $("[data-status-headline]");
  var checked = $("[data-status-checked]");
  var dot = $("[data-status-dot]");
  if (!list) return;
  var okN = results.filter(function (r) { return r.ok; }).length;
  var all = results.length;
  var failed = results.filter(function (r) { return !r.ok; });
  if (okN === all) {
    headline.textContent = "All checked endpoints responded";
    if (dot) { dot.className = "dot live"; }
  } else if (okN === 0) {
    headline.textContent = "All checked endpoints failed";
    if (dot) { dot.className = "dot"; dot.style.background = "#ff4d5e"; }
  } else {
    headline.textContent = okN + " of " + all + " checked endpoints responded";
    if (dot) { dot.className = "dot"; dot.style.background = "#ffb000"; }
  }
  var now = new Date();
  if (checked) {
    checked.textContent = "Checked " + now.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) + " in your timezone";
  }
  list.innerHTML = results.map(function (r) {
    var chip = r.ok
      ? '<span class="chip live">OK' + (r.status ? " · HTTP " + r.status : "") + (typeof r.ms === "number" ? " · " + r.ms + " ms" : "") + "</span>"
      : '<span class="chip soon">' + (r.status ? "HTTP " + r.status : "FAILED") + (typeof r.ms === "number" ? " · " + r.ms + " ms" : "") + "</span>";
    var why = r.ok
      ? ""
      : '<p class="mono muted" style="font-size:.75rem;margin-top:8px">' + escapeHtml(r.error || "No response") + "</p>";
    return '<div class="card status-check"><div class="svc"><b>' + escapeHtml(r.name) + "</b>" + chip + "</div><p class=\"muted\" style=\"font-size:.85rem;margin-top:8px\">" + escapeHtml(r.detail) + "</p>" + why + "</div>";
  }).join("");
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
  });
}

async function run() {
  var btn = $("[data-status-refresh]");
  var headline = $("[data-status-headline]");
  if (headline) headline.textContent = "Running checks…";
  if (btn) btn.disabled = true;
  var results = [];
  for (var i = 0; i < CHECKS.length; i++) {
    var c = CHECKS[i];
    var r = await c.run();
    results.push(Object.assign({ name: c.name, detail: c.detail, id: c.id }, r));
  }
  paint(results);
  if (btn) btn.disabled = false;
}

function init() {
  if (!$("[data-status-list]")) return;
  $("[data-status-refresh]").addEventListener("click", function () { run(); });
  run();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
