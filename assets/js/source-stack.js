/* 3D data-source card stack + floating source cards: optional pointer tilt.
   Clicking a [data-sf-card] preselects that provider in the supplier finder.
   Respects prefers-reduced-motion. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  function reduced() { return !!(reduce && reduce.matches); }
  var FINE = window.matchMedia && window.matchMedia("(pointer:fine)").matches;

  function bindStack(root) {
    var tilt = root.querySelector(".source-stack-tilt");
    if (!tilt) return;

    function clear() {
      root.classList.remove("is-tilting");
      root.style.removeProperty("--tilt-x");
      root.style.removeProperty("--tilt-y");
      tilt.style.removeProperty("--tilt-x");
      tilt.style.removeProperty("--tilt-y");
    }

    function onMove(e) {
      if (reduced()) return;
      var r = root.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      px = Math.max(-1, Math.min(1, px));
      py = Math.max(-1, Math.min(1, py));
      root.classList.add("is-tilting");
      tilt.style.setProperty("--tilt-x", (py * -7).toFixed(2) + "deg");
      tilt.style.setProperty("--tilt-y", (px * 10).toFixed(2) + "deg");
    }

    if (FINE && !reduced()) {
      root.addEventListener("pointermove", onMove);
      root.addEventListener("pointerleave", clear);
      root.addEventListener("pointercancel", clear);
    }
    if (reduce && reduce.addEventListener) {
      reduce.addEventListener("change", function () { if (reduced()) clear(); });
    }
  }

  function bindCard(card) {
    function clear() {
      card.classList.remove("is-tilting");
      card.style.setProperty("--hx", "0deg");
      card.style.setProperty("--hy", "0deg");
    }

    function onMove(e) {
      if (reduced()) return;
      var r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      px = Math.max(-1, Math.min(1, px));
      py = Math.max(-1, Math.min(1, py));
      card.classList.add("is-tilting");
      card.style.setProperty("--hx", (py * -8).toFixed(2) + "deg");
      card.style.setProperty("--hy", (px * 10).toFixed(2) + "deg");
      card.style.setProperty("--mx", ((px + 0.5) * 100).toFixed(1) + "%");
      card.style.setProperty("--my", ((py + 0.5) * 80).toFixed(1) + "%");
    }

    if (FINE && !reduced()) {
      card.addEventListener("pointermove", onMove);
      card.addEventListener("pointerleave", clear);
      card.addEventListener("pointercancel", clear);
    }
    if (reduce && reduce.addEventListener) {
      reduce.addEventListener("change", function () { if (reduced()) clear(); });
    }
  }

  var SIGNALS = { shopify: 1, meta: 1, tiktok: 1 };

  function applyPreselect(id) {
    var boxes = document.querySelectorAll("[data-sf-prov]");
    var form = document.querySelector("[data-sf-form]");
    document.querySelectorAll(".sf-prov.is-preselected").forEach(function (el) {
      el.classList.remove("is-preselected");
    });
    var actions = document.querySelector(".sf-actions");
    if (actions) actions.classList.remove("is-signals");

    if (boxes.length) {
      var isSignal = !!SIGNALS[id];
      boxes.forEach(function (c) {
        c.checked = !isSignal && c.value === id;
        var lab = c.closest(".sf-prov");
        if (lab) lab.classList.toggle("is-preselected", c.checked);
      });
      if (isSignal && actions) actions.classList.add("is-signals");
    }

    var target = form || document.querySelector("[data-finder]") || document.querySelector("[data-gate]") || document.querySelector("[data-shell]");
    if (target) {
      target.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    }
    var kw = document.querySelector("[data-sf-kw]");
    if (kw) {
      try { kw.focus({ preventScroll: true }); } catch (e) { kw.focus(); }
    }
    return !!boxes.length;
  }

  function preselect(id) {
    if (!id) return;
    try { sessionStorage.setItem("ms-sf-preselect", id); } catch (e) { /* private mode */ }
    applyPreselect(id);
    try { document.dispatchEvent(new CustomEvent("ms-sf-preselect", { detail: { id: id } })); } catch (e) { /* old browsers */ }
  }

  function init() {
    document.querySelectorAll("[data-source-stack]").forEach(bindStack);
    var roots = document.querySelectorAll("[data-float-cards], .sources-grid");
    var seen = [];
    roots.forEach(function (root) {
      if (seen.indexOf(root) !== -1) return;
      seen.push(root);
      root.querySelectorAll(".sources-card").forEach(bindCard);
    });
    document.addEventListener("click", function (e) {
      var card = e.target.closest("[data-sf-card]");
      if (!card) return;
      preselect(card.getAttribute("data-sf-card"));
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
