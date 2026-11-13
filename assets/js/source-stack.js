/* 3D data-source card stack: optional pointer tilt. Respects reduced motion. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  function reduced() { return !!(reduce && reduce.matches); }

  function bind(root) {
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

    if (window.matchMedia && window.matchMedia("(pointer:fine)").matches && !reduced()) {
      root.addEventListener("pointermove", onMove);
      root.addEventListener("pointerleave", clear);
      root.addEventListener("pointercancel", clear);
    }
    if (reduce && reduce.addEventListener) {
      reduce.addEventListener("change", function () { if (reduced()) clear(); });
    }
  }

  function init() {
    document.querySelectorAll("[data-source-stack]").forEach(bind);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
