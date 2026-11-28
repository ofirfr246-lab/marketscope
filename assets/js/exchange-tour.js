/* MarketScope Exchange (simulation): first-visit tutorial.
   5 steps: prices, buy, sell, portfolio, virtual money. Skip / Back / Next, plus a "Replay tutorial" button.
   "Seen" is kept in localStorage (per account) and in profiles.preferences.exchangeTourSeen (an existing
   JSON column; no new column). Reuses the site's .tour styles (style.css). */
var VERSION = "v1";
var IC = {
  prices: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/>',
  buy: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  sell: '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
  folio: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
  virt: '<path d="M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>'
};
var STEPS = [
  { ic: "prices", color: "var(--amber)", t: "Where the prices are",
    d: "Each instrument is a product you researched. Its price is the Opportunity score (0–100) from your newest live report on it. The watchlist shows the latest value and the change since the report before, and the big number above the chart is the same price for the selected symbol.",
    sel: ["[data-symbols]", ".xt-head"] },
  { ic: "buy", color: "var(--green)", t: "How to buy", tab: "trade",
    d: "Open the Trade tab and keep BUY selected. Choose Market (fills at the last price) or Limit (fills when a new report crosses your price), enter the units and press “Place simulated buy”. A simulated fee of 0.1% applies.",
    sel: ["[data-ticket]"] },
  { ic: "sell", color: "var(--red)", t: "How to sell", tab: "trade",
    d: "Switch to SELL to close or reduce a position you hold. You can only sell units you own, and units in an open sell order are reserved until it fills or you cancel it.",
    sel: [".xt-side"] },
  { ic: "folio", color: "var(--blue)", t: "Your portfolio",
    d: "The tabs under the chart show your open Positions, Open orders, Order history and the Order book. “Account & P&L” has your virtual cash, positions value and profit and loss. Price alerts are in the Alerts tab and the bell above.",
    sel: [".xt-tabs"] },
  { ic: "virt", color: "var(--amber)", t: "It’s virtual money only",
    d: "This is a simulation with 100,000 virtual credits. No real money, deposits, payments or cash-out, and no real trading. Virtual credits can’t be bought, withdrawn or exchanged for anything.",
    sel: [".xt-strip"] }
];

function lsKey(uid) { return "ms_xt_tour_" + VERSION + ":" + (uid || "anon"); }
function seenLocal(uid) { try { return localStorage.getItem(lsKey(uid)) === "done"; } catch (e) { return false; } }
function markLocal(uid) { try { localStorage.setItem(lsKey(uid), "done"); } catch (e) {} }
function visible(el) { if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; }
function pick(list) { for (var k = 0; k < list.length; k++) { var el = document.querySelector(list[k]); if (visible(el)) return el; } return null; }

async function readPrefs(sb, uid) {
  try { var r = await sb.from("profiles").select("preferences").eq("id", uid).maybeSingle(); return (r.data && r.data.preferences && typeof r.data.preferences === "object") ? r.data.preferences : {}; } catch (e) { return null; }
}
async function saveSeen(sb, uid) {
  markLocal(uid);
  if (!sb || !uid) return;
  var prefs = await readPrefs(sb, uid); if (prefs == null) return;
  if (prefs.exchangeTourSeen === VERSION) return;
  try { await sb.from("profiles").update({ preferences: Object.assign({}, prefs, { exchangeTourSeen: VERSION }) }).eq("id", uid); } catch (e) {}
}

var active = null;
export function startTour(ctx) {
  ctx = ctx || {};
  if (active) return;
  var i = 0, root = document.createElement("div"), restoreTab = null;
  root.className = "tour"; root.innerHTML = '<div class="tour-shade"></div><div class="tour-spot" hidden></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-t"></div>';
  document.body.appendChild(root); active = root;
  var spot = root.querySelector(".tour-spot"), card = root.querySelector(".tour-card"), shade = root.querySelector(".tour-shade");
  var prevTab = (document.querySelector("[data-rt].on") || {}).getAttribute ? document.querySelector("[data-rt].on").getAttribute("data-rt") : null;
  function setTab(name) { var b = document.querySelector('[data-rt="' + name + '"]'); if (b && !b.classList.contains("on")) b.click(); }
  function place() {
    var s = STEPS[i], el = pick(s.sel);
    if (el) {
      var er = el.getBoundingClientRect(), tall = er.height > innerHeight * 0.55;
      window.scrollTo({ top: Math.max(0, er.top + window.scrollY - (tall ? 90 : (innerHeight - er.height) / 2)), behavior: "instant" });
      var r = el.getBoundingClientRect(), pad = 8, cw = Math.min(380, innerWidth - 24), ch = 290;
      var rh = Math.min(r.height, innerHeight - 24);
      spot.hidden = false; shade.classList.add("clear");
      spot.style.cssText = "top:" + (r.top - pad) + "px;left:" + (r.left - pad) + "px;width:" + (r.width + pad * 2) + "px;height:" + (rh + pad * 2) + "px";
      card.classList.remove("center");
      var left = Math.max(12, Math.min(innerWidth - cw - 12, r.left + r.width / 2 - cw / 2)), pos;
      if (innerHeight - r.bottom >= ch) pos = "top:" + (r.bottom + 16) + "px;left:" + left + "px";
      else if (r.top >= ch) pos = "bottom:" + (innerHeight - r.top + 16) + "px;left:" + left + "px";
      else if (innerWidth - r.right >= cw + 32) pos = "top:" + Math.max(80, Math.min(innerHeight - ch - 16, r.top + 20)) + "px;left:" + (r.right + 20) + "px";
      else if (r.left >= cw + 32) pos = "top:" + Math.max(80, Math.min(innerHeight - ch - 16, r.top + 20)) + "px;left:" + (r.left - cw - 20) + "px";
      else pos = "bottom:16px;left:" + Math.round((innerWidth - cw) / 2) + "px";
      card.style.cssText = "width:" + cw + "px;" + pos;
    } else {
      spot.hidden = true; shade.classList.remove("clear"); card.classList.add("center"); card.style.cssText = "";
    }
  }
  function render() {
    var s = STEPS[i], last = i === STEPS.length - 1;
    if (s.tab) setTab(s.tab);
    card.innerHTML = '<div class="tour-top"><span class="tour-ic" style="--tc:' + s.color + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[s.ic] + '</svg></span><span class="tour-n">' + (i + 1) + " / " + STEPS.length + '</span><button type="button" class="tour-skip" data-skip>Skip</button></div>' +
      '<h3 id="tour-t">' + s.t + "</h3><p>" + s.d + "</p>" +
      '<div class="tour-foot"><div class="tour-dots">' + STEPS.map(function (_, k) { return '<i class="' + (k === i ? "on" : "") + '"></i>'; }).join("") + "</div>" +
      '<div class="tour-btns">' + (i ? '<button type="button" class="btn btn-sm btn-ghost" data-back>Back</button>' : "") + '<button type="button" class="btn btn-sm btn-amber" data-next>' + (last ? "Done" : "Next") + "</button></div></div>";
    card.querySelector("[data-skip]").onclick = finish;
    card.querySelector("[data-next]").onclick = function () { if (last) finish(); else { i++; render(); } };
    var b = card.querySelector("[data-back]"); if (b) b.onclick = function () { i--; render(); };
    place();
    card.querySelector("[data-next]").focus({ preventScroll: true });
  }
  function finish() {
    root.classList.add("out"); setTimeout(function () { root.remove(); }, 250);
    removeEventListener("resize", place); document.removeEventListener("keydown", onKey); active = null;
    if (prevTab) setTab(prevTab);
    if (ctx.onDone) ctx.onDone();
  }
  function onKey(e) {
    if (e.key === "Escape") finish();
    else if (e.key === "ArrowRight" && i < STEPS.length - 1) { i++; render(); }
    else if (e.key === "ArrowLeft" && i) { i--; render(); }
  }
  addEventListener("resize", place);
  document.addEventListener("keydown", onKey);
  render();
  requestAnimationFrame(function () { root.classList.add("in"); });
}

/* Show the tutorial once per account. Returns true when it was started. */
export async function maybeStartTour(sb, uid) {
  if (seenLocal(uid)) return false;
  var prefs = await readPrefs(sb, uid);
  if (prefs && prefs.exchangeTourSeen) { markLocal(uid); return false; }
  await waitForCookieChoice();
  if (document.querySelector(".tour")) return false;
  startTour({ onDone: function () { saveSeen(sb, uid); } });
  return true;
}
/* The cookie notice sits under the tour overlay, so let the visitor answer it first. */
function waitForCookieChoice() {
  return new Promise(function (resolve) {
    function shown() { var c = document.getElementById("cookie"); return !!(c && !c.hidden && c.getClientRects().length > 0); }
    setTimeout(function () {
      if (!shown()) return resolve();
      var t = setInterval(function () { if (!shown()) { clearInterval(t); setTimeout(resolve, 400); } }, 400);
    }, 900);
  });
}
export function bindReplay(sb, uid) {
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-tour-replay]"); if (!b) return;
    startTour({ onDone: function () { saveSeen(sb, uid); } });
  });
}
