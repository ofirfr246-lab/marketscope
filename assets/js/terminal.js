/* MarketScope Terminal desk — live snapshot + localStorage / optional Supabase. */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";

var CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
var LS_W = "ms_watchlist";
var LS_P = "ms_portfolio";
var sbPromise = null;
var sessionUser = null;

function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function D() { return window.MSData; }
function C() { return window.MSCharts; }
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function money(n) {
  if (n == null || n === "" || !isFinite(Number(n))) return "—";
  return "$" + (Math.round(Number(n) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(n, s) {
  if (n == null || n === "" || !isFinite(Number(n))) return '<span class="muted">—</span>';
  var v = Number(n); var sign = v > 0 ? "+" : ""; var cls = v > 0 ? "g" : v < 0 ? "r" : "muted";
  return '<span class="' + cls + '">' + sign + v.toFixed(s == null ? 1 : s) + "%</span>";
}
function verdictClass(v) {
  var x = String(v || "").toUpperCase().replace(/\s+/g, "");
  return ({ STRONGBUY: "v-sbuy", BUY: "v-buy", HOLD: "v-hold", UNDERPERFORM: "v-under", AVOID: "v-avoid" })[x] || "v-hold";
}
function channel(t) {
  return "Google Shopping & Search";
}

/* ---------- persistence ---------- */
function readLS(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; } }
function writeLS(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

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

async function loadList(table, lsKey) {
  var local = readLS(lsKey);
  var user = await currentUser();
  if (!user) return local;
  try {
    var sb = await getSb();
    var res = await sb.from(table).select("*").eq("user_id", user.id).order("created_at", { ascending: true });
    if (res.error) throw res.error;
    var rows = res.data || [];
    writeLS(lsKey, rows);
    return rows;
  } catch (e) { return local; }
}
async function upsertRow(table, lsKey, row, matchKey) {
  matchKey = matchKey || "ticker";
  var user = await currentUser();
  var list = readLS(lsKey);
  var i = list.findIndex(function (x) { return x[matchKey] === row[matchKey]; });
  if (i >= 0) list[i] = Object.assign({}, list[i], row);
  else list.push(row);
  writeLS(lsKey, list);
  if (!user) return list;
  try {
    var sb = await getSb();
    var payload = Object.assign({}, row, { user_id: user.id });
    delete payload.id;
    var res = await sb.from(table).upsert(payload, { onConflict: "user_id," + matchKey });
    if (res.error) throw res.error;
  } catch (e) { /* local already saved */ }
  return list;
}
async function deleteRow(table, lsKey, ticker) {
  var list = readLS(lsKey).filter(function (x) { return x.ticker !== ticker; });
  writeLS(lsKey, list);
  var user = await currentUser();
  if (!user) return list;
  try {
    var sb = await getSb();
    await sb.from(table).delete().eq("user_id", user.id).eq("ticker", ticker);
  } catch (e) { /* local already saved */ }
  return list;
}

var Watch = {
  all: function () { return loadList("watchlist", LS_W); },
  has: async function (ticker) { return (await Watch.all()).some(function (x) { return x.ticker === ticker; }); },
  add: async function (t, alerts) {
    var row = { ticker: t.ticker, product: t.product, market: t.market, alerts: alerts || [] };
    return upsertRow("watchlist", LS_W, row);
  },
  remove: function (ticker) { return deleteRow("watchlist", LS_W, ticker); },
  setAlerts: async function (ticker, alerts) {
    var list = await Watch.all();
    var row = list.filter(function (x) { return x.ticker === ticker; })[0];
    if (!row) return list;
    row.alerts = alerts;
    return upsertRow("watchlist", LS_W, row);
  }
};
var Port = {
  all: function () { return loadList("portfolio", LS_P); },
  add: function (t, extra) {
    var row = Object.assign({ ticker: t.ticker, product: t.product, market: t.market, allocation: 10, units: 1 }, extra || {});
    return upsertRow("portfolio", LS_P, row);
  },
  update: function (row) { return upsertRow("portfolio", LS_P, row); },
  remove: function (ticker) { return deleteRow("portfolio", LS_P, ticker); }
};

function starBtn(ticker, compact) {
  var t = D().get(ticker);
  if (!t) return "";
  return '<button type="button" class="star-btn" data-star="' + esc(ticker) + '" title="Add to watchlist" aria-label="Watch ' + esc(ticker) + '">' + (compact ? "☆" : "☆ Watch") + "</button>";
}
async function paintStars() {
  var list = await Watch.all();
  var set = {};
  list.forEach(function (x) { set[x.ticker] = true; });
  $$("[data-star]").forEach(function (b) {
    var on = !!set[b.getAttribute("data-star")];
    b.classList.toggle("on", on);
    b.textContent = on ? (b.textContent.indexOf("Watch") >= 0 ? "★ Watching" : "★") : (b.textContent.indexOf("Watch") >= 0 || b.textContent.indexOf("Watching") >= 0 ? "☆ Watch" : "☆");
  });
}
function bindStars(root) {
  (root || document).addEventListener("click", async function (e) {
    var b = e.target.closest && e.target.closest("[data-star]");
    if (!b) return;
    e.preventDefault();
    var ticker = b.getAttribute("data-star");
    var t = D().get(ticker);
    if (!t) return;
    if (await Watch.has(ticker)) await Watch.remove(ticker);
    else await Watch.add(t, [{ type: "demand_jump", enabled: true }, { type: "competition_drop", enabled: false }]);
    await paintStars();
    document.dispatchEvent(new CustomEvent("ms:watchlist"));
  });
}

/* ---------- shared chrome ---------- */
function renderTape(el) {
  if (!el) return;
  var items = D().tickers.map(function (t) {
    return '<span><b>' + esc(t.ticker) + "</b> " + money(t.price) + " " + pct(t.chg) + "</span>";
  }).join("");
  el.innerHTML = '<div class="ticker-label mono">LIVE TAPE · US</div><div class="ticker-track mono">' + items + items + "</div>";
}

function gotoPage(file, q) { window.location.href = file + (q ? "?" + q : ""); }
function selectTicker(ticker, tf) {
  var url = new URL(window.location.href);
  if (ticker) url.searchParams.set("t", ticker);
  if (tf) url.searchParams.set("tf", tf);
  if ($("[data-term-chart]") || document.body.getAttribute("data-page") === "terminal") {
    history.replaceState({}, "", url);
    drawMainChart();
    paintFocus();
  } else {
    gotoPage("terminal.html", "t=" + encodeURIComponent(ticker) + (tf ? "&tf=" + tf : ""));
  }
}

var COMMANDS = [
  { k: "SCREEN", d: "Open the screener", go: "screener.html" },
  { k: "HEAT", d: "Open the category heatmap", go: "heatmap.html" },
  { k: "INDEX", d: "Category indices", go: "indices.html" },
  { k: "WATCH", d: "Watchlist and alerts", go: "watchlist.html" },
  { k: "PORT", d: "Portfolio desk", go: "portfolio.html" },
  { k: "BACKTEST", d: "Open the backtest tool", go: "backtest.html" },
  { k: "CAL", d: "Events calendar", go: "calendar.html" },
  { k: "COMPARE", d: "Compare products on the terminal", go: "terminal.html?view=compare" },
  { k: "HELP", d: "Keyboard shortcuts", fn: "help" }
];

function runCommand(raw) {
  var q = String(raw || "").trim();
  if (!q) return;
  var up = q.toUpperCase();
  var hit = D().tickers.filter(function (t) { return t.ticker === up || t.ticker.indexOf(up) === 0; })[0];
  if (hit) { selectTicker(hit.ticker); return; }
  var words = up.split(/\s+/);
  var cmd = words[0].replace(/^\//, "");
  if (cmd === "BACKTEST" && words[1] && D().get(words[1])) { gotoPage("backtest.html", "t=" + words[1]); return; }
  if (cmd === "COMPARE") {
    var ts = words.slice(1).filter(function (x) { return D().get(x); }).slice(0, 4);
    gotoPage("terminal.html", "view=compare" + (ts.length ? "&c=" + ts.join(",") : ""));
    return;
  }
  var c = COMMANDS.filter(function (x) { return x.k === cmd || x.k.indexOf(cmd) === 0; })[0];
  if (c && c.go) { gotoPage(c.go); return; }
  if (c && c.fn === "help") { toggleHelp(true); return; }
  /* fuzzy product search */
  var f = D().tickers.filter(function (t) {
    return (t.product + " " + t.market + " " + t.ticker).toLowerCase().indexOf(q.toLowerCase()) >= 0;
  });
  if (f.length === 1) { selectTicker(f[0].ticker); return; }
  if (f.length) { gotoPage("screener.html", "q=" + encodeURIComponent(q)); return; }
  var msg = $("[data-cmd-msg]");
  if (msg) { msg.textContent = "No match for “" + q + "”. Try a ticker like MAGMOUNT-US, or SCREEN / HEAT / WATCH."; msg.hidden = false; }
}

function bindCommandBar() {
  var input = $("[data-cmd]");
  if (!input) return;
  var form = input.closest("form") || input.parentNode;
  form.addEventListener("submit", function (e) { e.preventDefault(); runCommand(input.value); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/input|textarea|select/i.test((e.target.tagName || "")) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault(); input.focus(); input.select();
    }
    if (e.key === "?" && !/input|textarea|select/i.test((e.target.tagName || ""))) { e.preventDefault(); toggleHelp(true); }
    if (e.key === "Escape") { toggleHelp(false); if (document.activeElement === input) input.blur(); }
  });
}

function toggleHelp(on) {
  var m = $("[data-help-modal]");
  if (!m) return;
  m.hidden = on === false ? true : (on === true ? false : !m.hidden);
}

function currentTicker() {
  var fallback = (D() && D().defaultTicker && D().defaultTicker()) || ((D() && D().tickers[0]) ? D().tickers[0].ticker : "");
  try { return new URLSearchParams(location.search).get("t") || fallback; } catch (e) { return fallback; }
}
function currentTf() {
  try { return new URLSearchParams(location.search).get("tf") || "12M"; } catch (e) { return "12M"; }
}

/* ---------- charts / focus ---------- */
var chartKind = "line";
function drawMainChart() {
  var host = $("[data-term-chart-host]") || $("[data-term-chart]");
  var ticker = currentTicker();
  var tf = currentTf();
  var t = D().get(ticker);
  $$("[data-tf]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-tf") === tf); });
  var lab = $("[data-chart-caption]");
  if (lab) lab.textContent = ticker + " · " + tf + " · monthly Google Ads search volume (candles built from adjacent months)";
  if (host && window.MSTrading && t) {
    window.MSTrading.mountDemandChart(host, { monthly_searches: t.monthly_searches, timeframe: tf, height: 360 });
  }
  var hist = $("[data-price-hist]");
  if (hist && window.MSTrading && t) {
    window.MSTrading.mountPriceHistogram(hist, { samples: (t.prices && t.prices.samples) || [], currency: (t.prices && t.prices.currency) || "USD", band: t.prices && t.prices.recommended_band });
  }
}
function bindChartControls() {
  $$("[data-tf]").forEach(function (b) {
    b.addEventListener("click", function () { selectTicker(currentTicker(), b.getAttribute("data-tf")); });
  });
  $$("[data-chart-kind]").forEach(function (b) {
    b.addEventListener("click", function () {
      $$("[data-chart-kind]").forEach(function (x) { x.classList.toggle("active", x === b); });
      drawMainChart();
    });
  });
  $$("[data-series]").forEach(function (b) {
    b.addEventListener("click", function () {
      $$("[data-series]").forEach(function (x) { x.classList.toggle("active", x === b); });
      drawMainChart();
    });
  });
}
function paintFocus() {
  var t = D().get(currentTicker());
  if (!t) return;
  $$("[data-focus-ticker]").forEach(function (e) { e.textContent = t.ticker; });
  $$("[data-focus-name]").forEach(function (e) { e.textContent = t.product + " · " + t.market; });
  $$("[data-focus-price]").forEach(function (e) { e.innerHTML = money(t.price) + '<div class="fine">median Shopping price</div>'; });
  $$("[data-focus-chg]").forEach(function (e) { e.innerHTML = pct(t.chg) + '<div class="fine">demand, last 3 mo vs prior 3</div>'; });
  $$("[data-focus-verdict]").forEach(function (e) { e.className = "pill " + verdictClass(t.verdict); e.textContent = t.verdict; });
  var box = $("[data-rating]");
  if (box) {
    var band = t.target;
    box.innerHTML = '<p class="muted" style="margin:0 0 8px">We do not have a third-party analyst consensus. The desk verdict from this snapshot is:</p>' +
      '<div class="pill ' + verdictClass(t.verdict) + '">' + esc(t.verdict || "—") + "</div>" +
      (band ? '<p class="muted" style="margin:8px 0 0;font-size:.82rem">Recommended selling band (30th–50th percentile of Google Shopping prices) <b class="amber">' + money(band[0]) + " – " + money(band[1]) + "</b></p>" : '<p class="muted">No recommended price band — not enough priced listings.</p>');
  }
  var g = $("[data-sentiment]");
  if (g && C()) {
    if (t.sentiment != null) C().gauge(g, { value: Math.round(t.sentiment / 5 * 100), label: "AVG RATING " + t.sentiment + "/5" });
    else g.innerHTML = "";
  }
  var sentNote = $("[data-sentiment-note]");
  if (sentNote) sentNote.textContent = t.sentiment != null ? "Average star rating on visible Google Shopping listings in this snapshot." : "No listing ratings were present in the snapshot for this product.";
  var starSlot = $("[data-focus-star]");
  if (starSlot) { starSlot.innerHTML = starBtn(t.ticker, false); paintStars(); }
  var meta = $("[data-focus-scores]");
  if (meta) {
    meta.innerHTML = ["Demand", "Competition", "Saturation", "Opportunity"].map(function (k) {
      var key = k.toLowerCase();
      return '<div class="score-mini"><span class="muted">' + k + "</span><b class='mono'>" + t[key] + "</b></div>";
    }).join("");
  }
}

/* ---------- panels ---------- */
function renderMovers() {
  var m = D().movers();
  function list(el, rows, field) {
    if (!el) return;
    el.innerHTML = rows.map(function (t) {
      return '<button type="button" class="mv-row" data-jump="' + esc(t.ticker) + '"><span class="mono">' + esc(t.ticker) + "</span>" +
        (field === "vol" ? "<span class='muted'>" + (t.volume != null ? Number(t.volume).toLocaleString("en-US") : "—") + "</span>" : pct(t.chg)) + "</button>";
    }).join("");
  }
  list($("[data-gainers]"), m.gainers);
  list($("[data-losers]"), m.losers);
  list($("[data-active]"), m.active, "vol");
}
function renderNews() {
  var el = $("[data-news]");
  if (!el) return;
  el.innerHTML = D().news.map(function (n) {
    return '<article class="news-row"' + (n.ticker ? ' data-jump="' + esc(n.ticker) + '"' : "") + "><span class='mono muted'>" + esc(n.t) + '</span> <span class="chip early">' + esc(n.tag) + "</span><p>" + esc(n.title) + "</p></article>";
  }).join("");
}
function renderIndicesMini() {
  var el = $("[data-indices-mini]");
  if (!el) return;
  el.innerHTML = D().indices.map(function (ix) {
    return '<a class="idx-row" href="indices.html?id=' + esc(ix.id) + '"><span><b>' + esc(ix.name) + "</b> " + pct(ix.chg) + '</span><svg class="spark" data-spark-vals></svg></a>';
  }).join("");
  $$("[data-spark-vals]", el).forEach(function (svg, i) { C().spark(svg, D().indices[i].spark, D().indices[i].color); });
}
function renderWatchMini() {
  var el = $("[data-watch-mini]");
  if (!el) return;
  Watch.all().then(function (list) {
    if (!list.length) {
      el.innerHTML = '<p class="muted">No names on your watchlist yet. Star a ticker or <button type="button" class="link-btn amber" data-load-example-watch>load the snapshot defaults</button> (top demand-change names from the live US basket).</p>';
      return;
    }
    el.innerHTML = list.map(function (w) {
      var t = D().get(w.ticker);
      if (!t) return "";
      return '<button type="button" class="mv-row" data-jump="' + esc(t.ticker) + '"><span class="mono">' + esc(t.ticker) + "</span>" + pct(t.chg) + "</button>";
    }).join("");
    paintStars();
  });
}

function bindJumps(root) {
  (root || document).addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-jump]");
    if (!b) return;
    selectTicker(b.getAttribute("data-jump"));
  });
}

/* ---------- screener ---------- */
function initScreener() {
  var q0 = "";
  try { q0 = new URLSearchParams(location.search).get("q") || ""; } catch (e) {}
  var qIn = $("[data-screen-q]"); if (qIn && q0) qIn.value = q0;
  function rows() {
    var q = ((qIn && qIn.value) || "").toLowerCase();
    var mkt = ($("[data-f-market]") || {}).value || "";
    var cat = ($("[data-f-cat]") || {}).value || "";
    var src = ($("[data-f-source]") || {}).value || "";
    var verd = ($("[data-f-verdict]") || {}).value || "";
    var oppMin = Number(($("[data-f-opp-min]") || {}).value || 0);
    var compMax = Number(($("[data-f-comp-max]") || {}).value || 100);
    var satMax = Number(($("[data-f-sat-max]") || {}).value || 100);
    var pBand = ($("[data-f-price]") || {}).value || "";
    return D().tickers.filter(function (t) {
      if (q && (t.ticker + " " + t.product + " " + t.market).toLowerCase().indexOf(q) < 0) return false;
      if (mkt && t.market !== mkt) return false;
      if (cat && t.category !== cat) return false;
      if (src && channel(t) !== src) return false;
      if (verd && t.verdict !== verd) return false;
      if (t.opportunity < oppMin) return false;
      if (t.competition > compMax) return false;
      if (t.saturation > satMax) return false;
      if (pBand === "lt20" && !(t.price < 20)) return false;
      if (pBand === "20-40" && !(t.price >= 20 && t.price <= 40)) return false;
      if (pBand === "gt40" && !(t.price > 40)) return false;
      return true;
    });
  }
  var sortKey = "opportunity", sortDir = -1;
  function paint() {
    var data = rows().slice().sort(function (a, b) {
      var va = a[sortKey], vb = b[sortKey];
      if (typeof va === "string") return va.localeCompare(vb) * sortDir;
      return (va - vb) * sortDir;
    });
    var tb = $("[data-screen-body]");
    if (!tb) return;
    tb.innerHTML = data.map(function (t) {
      return "<tr data-jump='" + esc(t.ticker) + "'><td class='mono'><button type='button' class='star-btn' data-star='" + esc(t.ticker) + "'>☆</button> " + esc(t.ticker) + "</td><td>" + esc(t.product) + "</td><td>" + esc(D().marketAbbr[t.market]) + "</td><td>" + esc(channel(t)) + "</td><td class='mono'>" + money(t.price) + "</td><td>" + pct(t.chg) + "</td><td class='mono'>" + t.demand + "</td><td class='mono'>" + t.competition + "</td><td class='mono'>" + t.saturation + "</td><td class='mono'>" + t.opportunity + "</td><td><span class='pill " + verdictClass(t.verdict) + "'>" + esc(t.verdict) + "</span></td></tr>";
    }).join("");
    var n = $("[data-screen-count]"); if (n) n.textContent = data.length + " names · live US snapshot";
    paintStars();
  }
  $$("[data-f-market],[data-f-cat],[data-f-source],[data-f-verdict],[data-f-opp-min],[data-f-comp-max],[data-f-sat-max],[data-f-price]").forEach(function (el) {
    el.addEventListener("change", paint);
    el.addEventListener("input", paint);
  });
  if (qIn) qIn.addEventListener("input", paint);
  $$("[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.getAttribute("data-sort");
      if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = k === "product" || k === "ticker" ? 1 : -1; }
      paint();
    });
  });
  paint();
}

/* ---------- heatmap / indices / calendar ---------- */
function initHeatmapMini(el) {
  var cells = (D().heat && D().heat.cells) || [];
  el.classList.add("heat-tiles");
  el.innerHTML = cells.slice(0, 12).map(function (c) {
    var color = c.chg == null ? "#1b2128" : (c.chg >= 5 ? "#0a5" : c.chg >= 0 ? "#1a6b45" : c.chg <= -5 ? "#7a2030" : "#5a2a20");
    return '<button type="button" class="heat-tile" data-jump="' + esc(c.ticker) + '" style="background:' + color + '"><span class="ht-name">' + esc(c.product) + '</span><span class="ht-meta">' + (c.chg == null ? "—" : ((c.chg > 0 ? "+" : "") + c.chg.toFixed(1) + "%")) + "</span></button>";
  }).join("");
}
function initHeatmap() {
  var el = $("[data-heatmap]");
  if (!el) return;
  var cells = (D().heat && D().heat.cells) || [];
  el.className = (el.className || "") + " heat-tiles";
  el.innerHTML = cells.map(function (c) {
    var chg = c.chg;
    var color = chg == null ? "#1b2128" : (chg >= 5 ? "#0a5" : chg >= 0 ? "#1a6b45" : chg <= -5 ? "#7a2030" : "#5a2a20");
    var size = 70 + (c.size || 0.3) * 70;
    return '<button type="button" class="heat-tile" data-jump="' + esc(c.ticker) + '" style="background:' + color + ';min-height:' + size + 'px">' +
      '<span class="ht-name">' + esc(c.product) + '</span>' +
      '<span class="ht-meta">' + esc(c.ticker) + " · vol " + (c.volume != null ? Number(c.volume).toLocaleString("en-US") : "—") +
      " · " + (c.chg == null ? "—" : ((c.chg > 0 ? "+" : "") + c.chg.toFixed(1) + "%")) + "</span></button>";
  }).join("");
}

function initIndices() {
  var host = $("[data-indices-table]");
  if (!host) return;
  host.innerHTML = D().indices.map(function (ix) {
    return '<article class="idx-card" id="idx-' + esc(ix.id) + '"><header><div><div class="kicker mono">COMPOSITE · REBASED DEMAND</div><h2>' + esc(ix.name) + '</h2></div><div class="idx-lvl mono">' + ix.level.toLocaleString() + " " + pct(ix.chg) + "</div></header>" +
      '<svg class="idx-chart" data-idx-chart="' + esc(ix.id) + '"></svg>' +
      '<p class="muted">' + esc(ix.note || "") + ' Opportunity (avg of members) <b class="amber">' + ix.opportunity + "</b>. Constituents: " + ix.members.map(function (tk) { return '<button type="button" class="link-btn amber" data-jump="' + esc(tk) + '">' + esc(tk) + "</button>"; }).join(" · ") + "</p></article>";
  }).join("");
  $$("[data-idx-chart]").forEach(function (svg) {
    var ix = D().indices.filter(function (x) { return x.id === svg.getAttribute("data-idx-chart"); })[0];
    if (ix) C().line(svg, { values: ix.spark, color: ix.color, area: true });
  });
  var want = "";
  try { want = new URLSearchParams(location.search).get("id") || ""; } catch (e) {}
  if (want && $("#idx-" + want)) $("#idx-" + want).scrollIntoView({ block: "start" });
}
function initCalendar() {
  var ev = $("[data-events]");
  if (ev) {
    ev.innerHTML = '<div class="coming-soon-panel"><h3>Coming soon</h3><p class="muted">Event-level demand impact (Black Friday, Prime Day, holidays) is not in this Google Shopping &amp; Search snapshot. We will not invent lift percentages. This calendar will light up when we can measure those windows from live data.</p></div>';
  }
  var er = $("[data-earnings]");
  if (er) {
    er.innerHTML = '<div class="coming-soon-panel"><h3>Coming soon</h3><p class="muted">Niche “earnings” would need a longer financial history than the 12-month search-volume series we have here. Nothing on this panel is estimated.</p></div>';
  }
}

/* ---------- watchlist / portfolio / backtest / compare ---------- */
var ALERT_TYPES = [
  { id: "demand_jump", label: "Notify when demand jumps" },
  { id: "competition_drop", label: "Notify when competition drops" },
  { id: "price_up", label: "Notify when price rises 5%+" },
  { id: "price_down", label: "Notify when price falls 5%+" },
  { id: "verdict_change", label: "Notify on verdict change" }
];
function alertFires(t, type) {
  if (type === "demand_jump") return t.chg >= 4 && t.demand >= 70;
  if (type === "competition_drop") return t.competition <= 50 && t.chg > 0;
  if (type === "price_up") return t.chg >= 5;
  if (type === "price_down") return t.chg <= -5;
  if (type === "verdict_change") return false;
  return false;
}
async function initWatchlist() {
  var host = $("[data-watch-full]");
  if (!host) return;
  async function paint() {
    var list = await Watch.all();
    if (!list.length) {
      host.innerHTML = '<div class="note"><b>Your watchlist is empty.</b> Star names from the terminal or screener, or <button type="button" class="link-btn amber" data-load-example-watch>load the snapshot defaults</button> (top demand-change names from the live US basket, stored on this device until you sign in).</div>';
      return;
    }
    host.innerHTML = list.map(function (w) {
      var t = D().get(w.ticker);
      if (!t) return "";
      var alerts = w.alerts || [];
      var rules = ALERT_TYPES.map(function (a) {
        var on = alerts.some(function (x) { return x.type === a.id && x.enabled !== false; });
        var fire = on && alertFires(t, a.id);
        return '<label class="alert-rule"><input type="checkbox" data-alert="' + esc(w.ticker) + '" data-type="' + a.id + '"' + (on ? " checked" : "") + "> " + esc(a.label) + (fire ? ' <span class="chip early">WOULD FIRE · from snapshot trend</span>' : "") + "</label>";
      }).join("");
      return '<article class="watch-card"><header><button type="button" class="link-btn" data-jump="' + esc(t.ticker) + '"><b class="mono">' + esc(t.ticker) + "</b> " + esc(t.product) + "</button> " + pct(t.chg) + ' <button type="button" class="link-btn r" data-unwatch="' + esc(t.ticker) + '">Remove</button></header><div class="alert-rules">' + rules + "</div></article>";
    }).join("");
  }
  host.addEventListener("change", async function (e) {
    var inp = e.target.closest("[data-alert]");
    if (!inp) return;
    var ticker = inp.getAttribute("data-alert");
    var list = await Watch.all();
    var row = list.filter(function (x) { return x.ticker === ticker; })[0];
    if (!row) return;
    var alerts = ALERT_TYPES.map(function (a) {
      var box = host.querySelector('[data-alert="' + ticker + '"][data-type="' + a.id + '"]');
      return { type: a.id, enabled: !!(box && box.checked) };
    });
    await Watch.setAlerts(ticker, alerts);
    await paint();
  });
  host.addEventListener("click", async function (e) {
    var b = e.target.closest("[data-unwatch]");
    if (!b) return;
    await Watch.remove(b.getAttribute("data-unwatch"));
    await paint();
    document.dispatchEvent(new CustomEvent("ms:watchlist"));
  });
  document.addEventListener("ms:watchlist", paint);
  await paint();
}
function bindExampleWatch() {
  document.addEventListener("click", async function (e) {
    var b = e.target.closest && e.target.closest("[data-load-example-watch]");
    if (!b) return;
    var sample = (D().movers() && D().movers().gainers ? D().movers().gainers : D().tickers).slice(0, 3);
    for (var i = 0; i < sample.length; i++) {
      var t = sample[i].ticker ? sample[i] : D().get(sample[i]);
      if (t) await Watch.add(t, [{ type: "demand_jump", enabled: true }, { type: "competition_drop", enabled: true }]);
    }
    document.dispatchEvent(new CustomEvent("ms:watchlist"));
    await paintStars();
    if (document.body.getAttribute("data-page") === "watchlist") initWatchlist();
    renderWatchMini();
  });
}

async function initPortfolio() {
  var table = $("[data-port-table]");
  var donut = $("[data-port-donut]");
  var stats = $("[data-port-stats]");
  var empty = $("[data-port-empty]");
  async function paint() {
    var list = await Port.all();
    if (empty) empty.hidden = list.length > 0;
    if (!list.length) {
      if (table) table.innerHTML = "";
      if (donut) donut.innerHTML = "";
      if (stats) stats.innerHTML = "";
      return;
    }
    var total = list.reduce(function (s, r) { return s + Number(r.allocation || 0); }, 0) || 1;
    var colors = ["#ffb000", "#19d27c", "#4da3ff", "#a78bfa", "#ff8a3d", "#ff4d5e", "#8b95a3"];
    var slices = list.map(function (r, i) { return { label: r.ticker, value: Number(r.allocation || 0), color: colors[i % colors.length] }; });
    if (donut && C()) C().donut(donut, slices, { center: "ALLOC" });
    var cats = {};
    var risk = 0;
    list.forEach(function (r) {
      var t = D().get(r.ticker);
      if (!t) return;
      cats[t.category] = (cats[t.category] || 0) + Number(r.allocation || 0);
      risk += (100 - t.opportunity) * (Number(r.allocation || 0) / total);
    });
    var nCats = Object.keys(cats).length;
    if (stats) {
      stats.innerHTML = '<div class="stat"><div class="k">NAMES</div><div class="v">' + list.length + '</div></div>' +
        '<div class="stat"><div class="k">RISK SCORE</div><div class="v">' + Math.round(risk) + '</div><p>Allocation-weighted (100 − opportunity) from the snapshot scores. Not a financial risk measure.</p></div>' +
        '<div class="stat"><div class="k">DIVERSIFICATION</div><div class="v">' + nCats + '</div><p>Distinct category sleeves in this book.</p></div>';
    }
    if (table) {
      table.innerHTML = "<thead><tr><th>Ticker</th><th>Product</th><th>Alloc %</th><th>Opp</th><th></th></tr></thead><tbody>" + list.map(function (r) {
        var t = D().get(r.ticker);
        return "<tr><td class='mono'><button type='button' class='link-btn' data-jump='" + esc(r.ticker) + "'>" + esc(r.ticker) + "</button></td><td>" + esc(r.product) + "</td><td><input type='number' min='0' max='100' step='1' value='" + esc(r.allocation) + "' data-alloc='" + esc(r.ticker) + "'></td><td class='mono'>" + (t ? t.opportunity : "—") + "</td><td><button type='button' class='link-btn r' data-unport='" + esc(r.ticker) + "'>Remove</button></td></tr>";
      }).join("") + "</tbody>";
    }
  }
  if (table) {
    table.addEventListener("change", async function (e) {
      var inp = e.target.closest("[data-alloc]");
      if (!inp) return;
      var list = await Port.all();
      var row = list.filter(function (x) { return x.ticker === inp.getAttribute("data-alloc"); })[0];
      if (!row) return;
      row.allocation = Number(inp.value || 0);
      await Port.update(row);
      await paint();
    });
    table.addEventListener("click", async function (e) {
      var b = e.target.closest("[data-unport]");
      if (!b) return;
      await Port.remove(b.getAttribute("data-unport"));
      await paint();
    });
  }
  var portSel = $("[data-port-ticker]");
  if (portSel) {
    portSel.innerHTML = D().tickers.map(function (tk) {
      return '<option value="' + esc(tk.ticker) + '">' + esc(tk.ticker) + " — " + esc(tk.product) + "</option>";
    }).join("");
  }
  var add = $("[data-port-add]");
  if (add) add.addEventListener("submit", async function (e) {
    e.preventDefault();
    var sel = $("[data-port-ticker]", add);
    var t = D().get(sel && sel.value);
    if (!t) return;
    await Port.add(t, { allocation: Number(($("[data-port-alloc]", add) || {}).value || 10) });
    await paint();
  });
  var ex = $("[data-load-example-port]");
  if (ex) ex.addEventListener("click", async function () {
    var names = D().tickers || [];
    var n = names.length;
    if (!n) return;
    var base = Math.floor(100 / n), rem = 100 - base * n;
    for (var i = 0; i < n; i++) {
      await Port.add(names[i], { allocation: base + (i === n - 1 ? rem : 0) });
    }
    await paint();
  });
  await paint();
}

function initBacktest() {
  var sel = $("[data-bt-ticker]");
  if (sel && !sel.options.length) {
    D().tickers.forEach(function (t) {
      var o = document.createElement("option"); o.value = t.ticker; o.textContent = t.ticker + " — " + t.product; sel.appendChild(o);
    });
  }
  try {
    var t0 = new URLSearchParams(location.search).get("t");
    if (t0 && sel) sel.value = t0;
  } catch (e) {}
  function run() {
    var ticker = (sel && sel.value) || currentTicker();
    var bt = D().backtest(ticker);
    if (!bt) return;
    if (!bt.available) {
      $("[data-bt-ret]") && ($("[data-bt-ret]").textContent = "—");
      $("[data-bt-idx]") && ($("[data-bt-idx]").textContent = "—");
      $("[data-bt-alpha]") && ($("[data-bt-alpha]").textContent = "—");
      $("[data-bt-dd]") && ($("[data-bt-dd]").textContent = "—");
      $("[data-bt-note]") && ($("[data-bt-note]").textContent = bt.note);
      return;
    }
    $("[data-bt-ret]") && ($("[data-bt-ret]").innerHTML = pct(bt.ret));
    $("[data-bt-idx]") && ($("[data-bt-idx]").textContent = "—");
    $("[data-bt-alpha]") && ($("[data-bt-alpha]").textContent = "—");
    $("[data-bt-dd]") && ($("[data-bt-dd]").textContent = "—");
    $("[data-bt-note]") && ($("[data-bt-note]").textContent = bt.note);
    var ch = $("[data-bt-chart]");
    if (ch && C() && bt.equity && bt.equity.length) C().line(ch, { series: [
      { data: bt.equity, color: "#ffb000", area: true }
    ] });
  }
  if (sel) sel.addEventListener("change", run);
  var btn = $("[data-bt-run]"); if (btn) btn.addEventListener("click", run);
  run();
}

function initCompare() {
  var host = $("[data-compare]");
  if (!host) return;
  var picked = [];
  try {
    var q = new URLSearchParams(location.search).get("c") || "";
    picked = q.split(",").filter(function (t) { return D().get(t); }).slice(0, 4);
  } catch (e) {}
  if (!picked.length) picked = D().tickers.slice(0, 3).map(function (x) { return x.ticker; });
  function paint() {
    host.innerHTML = '<div class="compare-picks">' + D().tickers.map(function (t) {
      var on = picked.indexOf(t.ticker) >= 0;
      return '<label><input type="checkbox" data-cmp="' + esc(t.ticker) + '"' + (on ? " checked" : "") + ( !on && picked.length >= 4 ? " disabled" : "") + "> " + esc(t.ticker) + "</label>";
    }).join("") + '</div><div class="compare-grid">' + picked.map(function (tk) {
      var t = D().get(tk);
      var band = t.target;
      return '<article class="cmp-col"><h3 class="mono"><button type="button" class="link-btn" data-jump="' + esc(t.ticker) + '">' + esc(t.ticker) + "</button></h3><p>" + esc(t.product) + " · " + esc(t.market) + "</p>" +
        "<p class='mono'>" + money(t.price) + " <span class='fine'>median</span> " + pct(t.chg) + "</p><span class='pill " + verdictClass(t.verdict) + "'>" + esc(t.verdict) + "</span>" +
        '<svg class="cmp-chart" data-cmp-chart="' + esc(t.ticker) + '"></svg>' +
        '<div class="score-mini-row"><span>D ' + (t.demand != null ? t.demand : "—") + "</span><span>C " + (t.competition != null ? t.competition : "—") + "</span><span>S " + (t.saturation != null ? t.saturation : "—") + "</span><span>O " + (t.opportunity != null ? t.opportunity : "—") + "</span></div>" +
        '<p class="muted">' + (band ? ("Band " + money(band[0]) + "–" + money(band[1])) : "No recommended band") +
        "<br>Sellers " + (t.seller_count != null ? t.seller_count : "—") +
        " · vol " + (t.volume != null ? Number(t.volume).toLocaleString("en-US") : "—") +
        (t.sentiment != null ? " · avg rating " + t.sentiment + "/5" : "") + "</p></article>";
    }).join("") + "</div>";
    $$("[data-cmp-chart]", host).forEach(function (svg) {
      var h = D().history(svg.getAttribute("data-cmp-chart"), "12M", "demand");
      if (C() && h && h.values && h.values.length) C().line(svg, { values: h.values, color: "#ffb000", area: true });
    });
  }
  host.addEventListener("change", function (e) {
    var inp = e.target.closest("[data-cmp]");
    if (!inp) return;
    var tk = inp.getAttribute("data-cmp");
    if (inp.checked) { if (picked.indexOf(tk) < 0 && picked.length < 4) picked.push(tk); }
    else picked = picked.filter(function (x) { return x !== tk; });
    paint();
  });
  paint();
}

/* ---------- terminal desk ---------- */
function initTerminal() {
  var view = "";
  try { view = new URLSearchParams(location.search).get("view") || ""; } catch (e) {}
  if (view === "compare") {
    var cmp = $("[data-compare-panel]");
    if (cmp) { cmp.hidden = false; cmp.scrollIntoView({ block: "start" }); }
  }
  renderMovers();
  renderNews();
  renderIndicesMini();
  renderWatchMini();
  document.addEventListener("ms:watchlist", renderWatchMini);
  var heat = $("[data-heatmap-mini]");
  if (heat) initHeatmapMini(heat);
  bindChartControls();
  drawMainChart();
  paintFocus();
  initCompare();
  $$("[data-port-quick]").forEach(function (b) {
    b.addEventListener("click", async function () {
      var t = D().get(currentTicker());
      if (t) { await Port.add(t, { allocation: 10 }); b.textContent = "Added to portfolio"; }
    });
  });
}

/* ---------- boot ---------- */
async function boot() {
  if (D() && D().ready) {
    try { await D().ready; } catch (e) {
      var box0 = $("[data-term-error]");
      if (box0) { box0.hidden = false; box0.textContent = "Could not load the live snapshot. " + (e && e.message ? e.message : ""); }
      return;
    }
  }
  if (!D() || !D().tickers || !D().tickers.length) return;
  renderTape($("[data-tape]"));
  bindCommandBar();
  bindStars(document);
  bindJumps(document);
  bindExampleWatch();
  $$("[data-help-open]").forEach(function (b) { b.addEventListener("click", function () { toggleHelp(true); }); });
  $$("[data-help-close]").forEach(function (b) { b.addEventListener("click", function () { toggleHelp(false); }); });
  var page = (document.body && document.body.getAttribute("data-page")) || "";
  try {
    if (page === "terminal") initTerminal();
    if (page === "screener") initScreener();
    if (page === "heatmap") initHeatmap();
    if (page === "indices") initIndices();
    if (page === "watchlist") await initWatchlist();
    if (page === "portfolio") await initPortfolio();
    if (page === "backtest") initBacktest();
    if (page === "calendar") initCalendar();
  } catch (e) {
    var box = $("[data-term-error]");
    if (box) { box.hidden = false; box.textContent = "This desk failed to load. " + (e && e.message ? e.message : ""); }
  }
  await paintStars();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
