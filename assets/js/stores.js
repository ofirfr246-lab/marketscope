/* MarketScope Store Intelligence — example profiles, localStorage + optional Supabase. */
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
function money(n) { return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

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
    return (s.name + " " + s.url + " " + s.platform + " " + s.category).toLowerCase().indexOf(q) >= 0;
  });
  host.innerHTML = rows.map(function (s) {
    return '<a class="store-card" href="' + esc(profileLink(s.slug, s.url)) + '">' +
      '<div class="t-hd"><b>' + esc(s.name) + '</b><span class="chip early">' + esc(s.platform) + "</span></div>" +
      '<p class="muted mono" style="margin:0;font-size:.75rem">' + esc(s.url) + "</p>" +
      '<p style="margin:8px 0 0">' + esc(s.category) + " · " + s.catalog + " SKUs (example) · sentiment " + s.sentiment + "</p></a>";
  }).join("") || '<p class="muted">No directory examples match that search. You can still paste a store URL above — we will open a labelled placeholder profile.</p>';
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
  var apps = (s.apps || []).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("");
  var best = (s.bestsellers || []).map(function (p) {
    return "<tr><td>" + esc(p.name) + "</td><td class='mono'>" + money(p.price) + "</td><td class='mono'>" + esc(p.share) + "</td></tr>";
  }).join("");
  var dist = (s.priceDistribution || []).map(function (b) {
    var w = Math.round(b.n / maxN * 100);
    return '<div class="bar-row mono"><span>' + esc(b.band) + '</span><div class="bar"><i style="width:' + w + '%"></i></div><span>' + b.n + "</span></div>";
  }).join("");
  var tl = (s.timeline || []).map(function (e) {
    return '<div class="alert-row mono"><span>' + esc(e.date) + ' · ' + esc(e.type.replace(/_/g, " ")) + "</span><span>" + esc(e.text) + "</span></div>";
  }).join("");
  var ads = (s.ads || []).map(function (a) {
    return '<div class="alert-row"><span><b>' + esc(a.network) + "</b> · " + esc(a.status) + "</span><span class='muted'>" + esc(a.creative) + "</span></div>";
  }).join("");
  var countries = (s.topCountries || []).join(" · ");
  var sent = s.sentiment != null ? ('<svg data-store-gauge viewBox="0 0 160 100"></svg><p class="center muted">Review sentiment ' + s.sentiment + " · " + (s.reviews != null ? s.reviews + "★ example average" : "") + "</p>") : '<p class="muted">Sentiment is not modelled for URL-only placeholders.</p>';

  host.innerHTML =
    '<div class="banner-ex">' + esc(s.banner) + "</div>" +
    '<div class="dash-top" style="margin-top:18px"><div>' +
      '<div class="kicker mono">// STORE INTELLIGENCE · EARLY ACCESS</div>' +
      "<h1>" + esc(s.name) + "</h1>" +
      '<p class="mono muted">' + esc(s.url) + "</p>" +
    '</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">' +
      '<button type="button" class="btn btn-amber" data-track-store>Track store</button>' +
      '<a class="btn btn-ghost" href="stores.html">Back to directory</a></div></div>' +
    '<div class="dash-stats">' +
      '<div class="stat"><div class="k">PLATFORM</div><div class="v" style="font-size:1.15rem">' + esc(s.platform) + "</div><p>" + (s.platformGuessed ? "Guessed from the URL pattern" : "From the example directory") + "</p></div>" +
      '<div class="stat"><div class="k">CATALOG (EXAMPLE)</div><div class="v">' + (s.catalog != null ? s.catalog : "—") + "</div><p>Public SKU count when live collection is connected</p></div>" +
      '<div class="stat"><div class="k">TRAFFIC BAND</div><div class="v" style="font-size:1rem">' + esc(s.trafficBand || "—") + "</div><p>Top countries: " + esc(countries) + "</p></div>" +
    "</div>" +
    '<div class="dash-grid">' +
      '<div class="dash-card"><h2>Theme &amp; apps</h2><p class="muted">' + esc(s.theme || "—") + "</p><ul class='checks'>" + apps + "</ul></div>" +
      '<div class="dash-card"><h2>Bestseller-style products</h2><p class="muted" style="margin-top:0">Example ranking, not a live sales feed.</p><div class="screen-wrap"><table><thead><tr><th>Product</th><th>Price</th><th>Share</th></tr></thead><tbody>' + best + "</tbody></table></div></div>" +
      '<div class="dash-card"><h2>Price distribution</h2>' + dist + "</div>" +
      '<div class="dash-card"><h2>Review sentiment</h2>' + sent + "</div>" +
      '<div class="dash-card full"><h2>New products &amp; price changes</h2>' + tl + "</div>" +
      '<div class="dash-card full"><h2>Active ads (public libraries)</h2><p class="muted" style="margin-top:0">When live, this panel will only use public ad libraries. It does not log into ad accounts.</p>' + ads + "</div>" +
    "</div>" +
    '<div class="note" style="margin-top:22px"><b>Compliance:</b> Store Intelligence is designed to use only publicly available information from public storefronts and public ad libraries. We do not collect personal data about a store’s customers, and we do not bypass logins, paywalls or access controls. Live collection is not connected yet — treat every figure here as an example.</div>';

  if (s.sentiment != null && window.MSCharts && $("[data-store-gauge]", host)) {
    window.MSCharts.gauge($("[data-store-gauge]", host), { value: s.sentiment, label: "SENTIMENT · EXAMPLE" });
  }
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
