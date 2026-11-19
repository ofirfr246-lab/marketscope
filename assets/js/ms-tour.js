/* First-run onboarding tour (dashboard). Dismissible; remembered in localStorage ("ms_tour_v1").
   Add ?tour=1 to the URL to see it again. */
(function () {
  var KEY = "ms_tour_v1";
  var IC = {
    report: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M7 15l4-4 3 3 5-6"/>',
    josy: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    cm: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    bill: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>'
  };
  var STEPS = [
    { ic: "report", color: "var(--amber)", t: "Run your first report", d: "Paste a product link or describe a product. MarketScope checks live demand, competition and price bands — 1 credit per report.", sel: ".dash-grid .dash-card" },
    { ic: "josy", color: "var(--violet)", t: "Meet Josy, your marketing assistant", d: "Ask Josy for posts, video ideas, SEO briefs and content calendars. Numbers only come from live data, and every answer shows its sources.", sel: ".nav-josy", link: ["josy-chat.html", "Open Josy"] },
    { ic: "cm", color: "var(--green)", t: "Plan campaigns in the campaign manager", d: "Schedule organic posts per platform and build paid campaign drafts for Meta, TikTok and Google — with your own media uploads.", sel: null, link: ["josy-campaigns.html", "Open campaign manager"] },
    { ic: "bill", color: "var(--blue)", t: "Your plan, credits and billing", d: "See your credit balance here. Upgrade or buy credit packs from Pricing, and manage billing any time.", sel: "[data-plan-name]", up: ".stat" }
  ];
  function done() { try { localStorage.setItem(KEY, "done"); } catch (e) { /* ignore */ } }
  function seen() { try { return localStorage.getItem(KEY) === "done"; } catch (e) { return true; } }
  function visible(el) { if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; }

  function start() {
    var i = 0, root = document.createElement("div");
    root.className = "tour"; root.innerHTML = '<div class="tour-shade"></div><div class="tour-spot" hidden></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-t"></div>';
    document.body.appendChild(root);
    var spot = root.querySelector(".tour-spot"), card = root.querySelector(".tour-card"), shade = root.querySelector(".tour-shade");
    function target(s) { if (!s.sel) return null; var el = document.querySelector(s.sel); if (el && s.up) el = el.closest(s.up) || el; return visible(el) ? el : null; }
    function place() {
      var s = STEPS[i], el = target(s);
      if (el) {
        var er = el.getBoundingClientRect(), tall = er.height > innerHeight * 0.55;
        window.scrollTo({ top: Math.max(0, er.top + window.scrollY - (tall ? 90 : (innerHeight - er.height) / 2)), behavior: "instant" });
        var r = el.getBoundingClientRect(), pad = 8, cw = Math.min(380, innerWidth - 24), ch = 270;
        spot.hidden = false; shade.classList.add("clear");
        spot.style.cssText = "top:" + (r.top - pad) + "px;left:" + (r.left - pad) + "px;width:" + (r.width + pad * 2) + "px;height:" + (r.height + pad * 2) + "px";
        card.classList.remove("center");
        var left = Math.max(12, Math.min(innerWidth - cw - 12, r.left + r.width / 2 - cw / 2)), pos;
        if (innerHeight - r.bottom >= ch) pos = "top:" + (r.bottom + 16) + "px;left:" + left + "px";
        else if (r.top >= ch) pos = "bottom:" + (innerHeight - r.top + 16) + "px;left:" + left + "px";
        else if (innerWidth - r.right >= cw + 32) pos = "top:" + Math.max(80, Math.min(innerHeight - ch - 16, r.top + 20)) + "px;left:" + (r.right + 20) + "px";
        else pos = "bottom:16px;left:" + Math.round((innerWidth - cw) / 2) + "px";
        card.style.cssText = "width:" + cw + "px;" + pos;
      } else {
        spot.hidden = true; shade.classList.remove("clear"); card.classList.add("center"); card.style.cssText = "";
      }
    }
    function render() {
      var s = STEPS[i], last = i === STEPS.length - 1;
      card.innerHTML = '<div class="tour-top"><span class="tour-ic" style="--tc:' + s.color + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[s.ic] + '</svg></span><span class="tour-n">' + (i + 1) + " / " + STEPS.length + '</span><button type="button" class="tour-skip" data-skip>Skip tour</button></div>' +
        '<h3 id="tour-t">' + s.t + "</h3><p>" + s.d + "</p>" +
        (s.link ? '<a class="tour-link" href="' + s.link[0] + '">' + s.link[1] + " →</a>" : "") +
        '<div class="tour-foot"><div class="tour-dots">' + STEPS.map(function (_, k) { return '<i class="' + (k === i ? "on" : "") + '"></i>'; }).join("") + "</div>" +
        '<div class="tour-btns">' + (i ? '<button type="button" class="btn btn-sm btn-ghost" data-back>Back</button>' : "") + '<button type="button" class="btn btn-sm btn-amber" data-next>' + (last ? "Get started" : "Next") + "</button></div></div>";
      card.querySelector("[data-skip]").onclick = finish;
      card.querySelector("[data-next]").onclick = function () { if (last) finish(); else { i++; render(); } };
      var b = card.querySelector("[data-back]"); if (b) b.onclick = function () { i--; render(); };
      card.querySelectorAll(".tour-link").forEach(function (a) { a.addEventListener("click", done); });
      place();
      card.querySelector("[data-next]").focus();
    }
    function finish() { done(); root.classList.add("out"); setTimeout(function () { root.remove(); }, 250); removeEventListener("resize", place); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") finish(); if (e.key === "ArrowRight" && i < STEPS.length - 1) { i++; render(); } if (e.key === "ArrowLeft" && i) { i--; render(); } }
    addEventListener("resize", place);
    document.addEventListener("keydown", onKey);
    render();
    requestAnimationFrame(function () { root.classList.add("in"); });
  }

  function init() {
    var q = new URLSearchParams(location.search);
    var force = q.get("tour") === "1";
    if (!force && (seen() || q.get("checkout") === "success")) return;
    var tries = 0, t = setInterval(function () {
      var shell = document.querySelector("[data-dash-shell]");
      if (shell && !shell.hidden) { clearInterval(t); setTimeout(start, 600); }
      else if (++tries > 40) clearInterval(t);
    }, 250);
  }
  window.MSTour = { start: start };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
