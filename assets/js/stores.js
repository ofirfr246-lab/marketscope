/* MarketScope Store Intelligence — snapshot sellers, localStorage + optional Supabase. */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";

var CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
var LS_KEY = "ms_tracked_stores";
var sbPromise = null;
var sessionUser = null;

function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function money(n) {
  if (n == null || n === "" || !isFinite(Number(n))) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pctShare(n) {
  if (n == null || !isFinite(Number(n))) return "—";
  return (Number(n) * 100).toFixed(1) + "%";
}

function readLS() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) { return []; } }
function writeLS(v) { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (e) {} }

async function getSb() {
  if (!isSupabaseConfigured()) return null;
  if (!sbPromise) {
    sbPromise = import(CDN).then(function (m) {
      return m.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    });
  }
  return sbPromise;
}
async function currentUser() {
  if (sessionUser !== null) return sessionUser;
  try {
    var sb = await getSb();
    if (!sb) { sessionUser = false; return null; }
    var res = await sb.auth.getSession();
    sessionUser = (res.data && res.data.session && res.data.session.user) || false;
    return sessionUser || null;
  } catch (e) { sessionUser = false; return null; }
}

var DEFAULT_ALERTS = [
  { type: "new_product", label: "New product", enabled: true },
  { type: "price_change", label: "Price change", enabled: true },
  { type: "new_ad", label: "New ad in a public ad library", enabled: true }
];

async function loadTracked() {
  var local = readLS();
  var user = await currentUser();
  if (!user) return local;
  try {
    var sb = await getSb();
    var res = await sb.from("tracked_stores").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (res.error) throw res.error;
    writeLS(res.data || []);
    return res.data || [];
  } catch (e) { return local; }
}
async function upsertTracked(row) {
  var list = readLS();
  var i = list.findIndex(function (x) { return x.slug === row.slug; });
  if (i >= 0) list[i] = Object.assign({}, list[i], row);
  else list.unshift(row);
  writeLS(list);
  var user = await currentUser();
  if (!user) return list;
  try {
    var sb = await getSb();
    var payload = Object.assign({}, row, { user_id: user.id });
    delete payload.id;
    var res = await sb.from("tracked_stores").upsert(payload, { onConflict: "user_id,slug" });
    if (res.error) throw res.error;
  } catch (e) { /* local already saved */ }
  return list;
}
async function removeTracked(slug) {
  var list = readLS().filter(function (x) { return x.slug !== slug; });
  writeLS(list);
  var user = await currentUser();
  if (!user) return list;
  try {
    var sb = await getSb();
    await sb.from("tracked_stores").delete().eq("user_id", user.id).eq("slug", slug);
  } catch (e) { /* local already saved */ }
  return list;
}
async function isTracked(slug) {
  return (await loadTracked()).some(function (x) { return x.slug === slug; });
}

function profileLink(slug, url) {
  return "stores.html?s=" + encodeURIComponent(slug) + (url ? "&url=" + encodeURIComponent(url) : "");
}

function resolveStore() {
  var S = window.MSStores;
  if (!S) return null;
  var q = new URLSearchParams(location.search);
  var slug = q.get("s") || "";
  var url = q.get("url") || "";
  if (slug && S.get(slug)) return S.get(slug);
  if (url) return S.fromUrl(url);
  if (slug) return S.fromUrl(slug);
  return null;
}

function paintDirectory() {
  var S = window.MSStores;
  var host = $("[data-store-dir]");
  if (!host || !S) return;
  var q = (($("[data-store-q]") || {}).value || "").toLowerCase();
  var rows = S.all.filter(function (s) {
    if (!q) return true;
    return (s.name + " " + (s.url || "") + " " + (s.domain || "") + " " + (s.platform || "") + " " + (s.products || []).join(" ")).toLowerCase().indexOf(q) >= 0;
  });
  host.innerHTML = rows.map(function (s) {
    return '<a class="store-card" href="' + esc(profileLink(s.slug, s.url)) + '">' +
      '<div class="t-hd"><b>' + esc(s.name) + '</b><span class="chip early">' + esc(s.platform || "Seller") + "</span></div>" +
      '<p class="muted mono" style="margin:0;font-size:.75rem">' + esc(s.domain || s.url || "") + "</p>" +
      '<p style="margin:8px 0 0">' + (s.listings != null ? s.listings + " visible listings" : "Not in snapshot") +
      " · share " + pctShare(s.share) +
      (s.products && s.products.length ? " · " + s.products.length + " basket products" : "") + "</p></a>";
  }).join("") || '<p class="muted">No sellers in this snapshot match that search. You can still paste a store URL — if it is not in the basket we will open a Coming soon placeholder, with no invented numbers.</p>';
}

async function paintTracked() {
  var host = $("[data-tracked-stores]");
  if (!host) return;
  var list = await loadTracked();
  if (!list.length) {
    host.innerHTML = '<p class="muted">You are not tracking any stores yet. Open a profile and use <b>Track store</b>. Saved in your account when Supabase is configured, otherwise in this browser.</p>';
    return;
  }
  host.innerHTML = list.map(function (r) {
    var alerts = (r.alerts || DEFAULT_ALERTS).filter(function (a) { return a.enabled !== false; }).map(function (a) { return a.type.replace(/_/g, " "); }).join(", ");
    return '<article class="watch-card"><header><a class="link-btn" href="' + esc(profileLink(r.slug, r.url)) + '"><b>' + esc(r.name || r.slug) + "</b></a> " +
      '<span class="chip early">' + esc(r.platform || "Store") + "</span> " +
      '<button type="button" class="link-btn r" data-untrack="' + esc(r.slug) + '">Untrack</button></header>' +
      '<p class="mono muted" style="margin:0;font-size:.75rem">' + esc(r.url || "") + "</p>" +
      '<p class="muted" style="margin:6px 0 0">Alerts: ' + esc(alerts || "none") + "</p></article>";
  }).join("");
}

function renderProfile(s) {
  var host = $("[data-store-profile]");
  if (!host || !s) return;
  var maxN = 1;
  (s.priceDistribution || []).forEach(function (b) { if (b.n > maxN) maxN = b.n; });
  var best = (s.bestsellers || []).map(function (p) {
    return "<tr><td>" + esc(p.name || "—") + "</td><td class='mono'>" + money(p.price) + "</td><td class='mono'>" + esc(p.share || p.ticker || "") + "</td></tr>";
  }).join("");
  var dist = (s.priceDistribution || []).map(function (b) {
    var w = Math.round(b.n / maxN * 100);
    return '<div class="bar-row mono"><span>' + esc(b.band) + '</span><div class="bar"><i style="width:' + w + '%"></i></div><span>' + b.n + "</span></div>";
  }).join("") || '<p class="muted">No priced listings for this seller in the snapshot.</p>';
  var coming = '<div class="coming-soon-panel"><h3>Coming soon</h3><p class="muted">This panel needs a longer public crawl or an ad-library lookup, which is not in the Nov 12, 2026 Shopping snapshot. We will not invent the figures.</p></div>';
  var sent = s.sentiment != null
    ? ('<p class="center" style="font-size:1.6rem;margin:8px 0">' + s.sentiment + ' / 5</p><p class="center muted">Average star rating on this seller’s visible Google Shopping listings in the snapshot.</p>')
    : coming;
  var bannerClass = s.inSnapshot ? "banner-live" : "banner-ex";

  host.innerHTML =
    '<div class="' + bannerClass + '">' + esc(s.banner) + "</div>" +
    '<div class="dash-top" style="margin-top:18px"><div>' +
      '<div class="kicker mono">// STORE INTELLIGENCE · GOOGLE SHOPPING BASKET</div>' +
      "<h1>" + esc(s.name) + "</h1>" +
      '<p class="mono muted">' + esc(s.domain || s.url || "") + "</p>" +
    '</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">' +
      '<button type="button" class="btn btn-amber" data-track-store>Track store</button>' +
      '<a class="btn btn-ghost" href="stores.html">Back to directory</a></div></div>' +
    '<div class="dash-stats">' +
      '<div class="stat"><div class="k">PLATFORM</div><div class="v" style="font-size:1.15rem">' + esc(s.platform || "—") + "</div><p>" + (s.platformGuessed ? "Guessed from the URL or name" : "Inferred from the seller domain") + "</p></div>" +
      '<div class="stat"><div class="k">VISIBLE LISTINGS</div><div class="v">' + (s.listings != null ? s.listings : "—") + "</div><p>Count of this seller’s Google Shopping listings across the snapshot basket. Not a full catalog crawl.</p></div>" +
      '<div class="stat"><div class="k">LISTING SHARE</div><div class="v" style="font-size:1.15rem">' + pctShare(s.share) + "</div><p>Share of visible listings in this basket, not website traffic.</p></div>" +
    "</div>" +
    '<div class="dash-grid">' +
      '<div class="dash-card"><h2>Theme &amp; apps</h2>' + coming + "</div>" +
      '<div class="dash-card"><h2>Listings in this basket</h2><p class="muted" style="margin-top:0">Titles and prices from the live Google Shopping snapshot. Ranked by review count when present, not by sales.</p><div class="screen-wrap"><table><thead><tr><th>Listing</th><th>Price</th><th>Basket product</th></tr></thead><tbody>' + (best || "<tr><td colspan='3'>None in this snapshot.</td></tr>") + "</tbody></table></div></div>" +
      '<div class="dash-card"><h2>Price distribution</h2><p class="muted" style="margin-top:0">From this seller’s priced listings in the snapshot.</p>' + dist + "</div>" +
      '<div class="dash-card"><h2>Average listing rating</h2>' + sent + "</div>" +
      '<div class="dash-card full"><h2>New products &amp; price changes</h2>' + coming + "</div>" +
      '<div class="dash-card full"><h2>Active ads (public libraries)</h2>' + coming + "</div>" +
    "</div>" +
    '<div class="note" style="margin-top:22px"><b>Compliance:</b> Store Intelligence uses only publicly visible Google Shopping listings from this snapshot. We do not collect personal data about a store’s customers, and we do not bypass logins, paywalls or access controls.</div>';

  paintTrackButton(s);
}

async function paintTrackButton(s) {
  var btn = $("[data-track-store]");
  if (!btn || !s) return;
  var on = await isTracked(s.slug);
  btn.textContent = on ? "Tracking · manage alerts" : "Track store";
  btn.classList.toggle("btn-ghost", on);
  btn.classList.toggle("btn-amber", !on);
  btn.setAttribute("data-on", on ? "1" : "0");
}

async function toggleTrack(s) {
  if (await isTracked(s.slug)) {
    await removeTracked(s.slug);
  } else {
    await upsertTracked({
      slug: s.slug,
      name: s.name,
      url: s.url,
      platform: s.platform,
      alerts: DEFAULT_ALERTS.map(function (a) { return { type: a.type, enabled: a.enabled }; })
    });
  }
  await paintTrackButton(s);
  await paintTracked();
  document.dispatchEvent(new CustomEvent("ms:stores"));
}

function bindSearch() {
  var form = $("[data-store-search]");
  if (!form) return;
  var input = $("[data-store-url]", form) || $("#store-url", form);
  var chip = $("[data-store-chip]", form);
  var msg = $(".form-msg", form);
  var q = $("[data-store-q]");
  if (q) q.addEventListener("input", paintDirectory);
  if (input) {
    input.addEventListener("input", function () {
      var d = window.MSStores && window.MSStores.detectPlatform(input.value);
      if (chip) {
        if (input.value.trim() && d) {
          chip.hidden = false;
          chip.innerHTML = '<span class="source-chip-in" style="--chip:#ffb000"><i></i>' + esc(d.name) + "</span>";
        } else { chip.hidden = true; chip.innerHTML = ""; }
      }
    });
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var raw = (input && input.value || "").trim();
    if (!raw) { if (msg) { msg.className = "form-msg"; msg.textContent = "Paste a competitor store URL to open a profile."; } return; }
    var prof = window.MSStores.fromUrl(raw);
    if (!prof) { if (msg) { msg.className = "form-msg"; msg.textContent = "That does not look like a valid store URL."; } return; }
    window.location.href = profileLink(prof.slug, prof.url);
  });
}

async function boot() {
  if (window.MSStores && window.MSStores.ready) {
    try { await window.MSStores.ready; } catch (e) { console.warn(e); }
  }
  var page = (document.body && document.body.getAttribute("data-page")) || "";
  bindSearch();
  if (page === "stores") {
    var profile = resolveStore();
    var listView = $("[data-stores-home]");
    var profView = $("[data-store-profile]");
    if (profile && profView) {
      if (listView) listView.hidden = true;
      profView.hidden = false;
      renderProfile(profile);
      var btn = $("[data-track-store]");
      if (btn) btn.addEventListener("click", function () { toggleTrack(profile); });
    } else {
      if (listView) listView.hidden = false;
      if (profView) profView.hidden = true;
      paintDirectory();
      await paintTracked();
      var tracked = $("[data-tracked-stores]");
      if (tracked) tracked.addEventListener("click", async function (e) {
        var b = e.target.closest("[data-untrack]");
        if (!b) return;
        await removeTracked(b.getAttribute("data-untrack"));
        await paintTracked();
      });
    }
  }
  if (page === "watchlist") {
    var slot = $("[data-tracked-stores]");
    if (slot) {
      await paintTracked();
      slot.addEventListener("click", async function (e) {
        var b = e.target.closest("[data-untrack]");
        if (!b) return;
        await removeTracked(b.getAttribute("data-untrack"));
        await paintTracked();
      });
    }
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
