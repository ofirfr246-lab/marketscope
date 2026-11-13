/* MarketScope — dashboard analyze loading overlay and results reveal.
   Frontend only. Does not invent source completion or numbers. */
(function (global) {
  var SOURCE_META = {
    "Google Shopping": { brand: "google", wide: false },
    "Google Search": { brand: "google", wide: false },
    "Amazon": { brand: "amazon", wide: false },
    "Meta Ad Library": { brand: "meta", wide: false },
    "TikTok": { brand: "tiktok", wide: false },
    "AliExpress": { brand: "aliexpress", wide: true },
    "Shopify": { brand: "shopify", wide: false }
  };
  var BASE_TIPS = [
    "What we’re checking: search demand and shopping listings.",
    "What we’re checking: competitor prices and how crowded the niche looks.",
    "This is one request — results from every source arrive together when it’s done.",
    "What we’re checking: the data sources included in your plan.",
    "Typical reports finish in about a minute."
  ];

  var startedAt = 0;
  var tickTimer = null;
  var tipTimer = null;
  var scanTimer = null;
  var slowTimer = null;
  var lastFocus = null;
  var active = false;
  var finishing = false;
  var tipIndex = 0;
  var tips = BASE_TIPS.slice();

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function reducedMotion() {
    return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function planId(plan) {
    return String(plan || "free").toLowerCase();
  }

  function planLabel(plan) {
    var id = planId(plan);
    var C = global.MS_CONFIG;
    if (C && C.plans) {
      for (var i = 0; i < C.plans.length; i++) {
        if (C.plans[i].id === id) return C.plans[i].name;
      }
    }
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  function sourcesForPlan(plan) {
    var id = planId(plan);
    var C = global.MS_CONFIG;
    if (C && C.plans) {
      for (var i = 0; i < C.plans.length; i++) {
        if (C.plans[i].id === id && C.plans[i].sources && C.plans[i].sources.length) {
          return C.plans[i].sources.slice();
        }
      }
    }
    return ["Google Shopping", "Google Search", "Amazon"];
  }

  function overlayEl() { return $("[data-analyze-overlay]"); }
  function panelEl() { return $("[data-analyze-panel]"); }

  function formatElapsed(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function progressAt(ms) {
    var t = ms / 1000;
    return 90 * (1 - Math.exp(-t / 28));
  }

  function setProgress(pct, complete) {
    var bar = $("[data-analyze-bar]");
    var wrap = $("[data-analyze-bar-wrap]");
    var v = Math.max(0, Math.min(100, pct));
    if (bar) {
      bar.style.width = v.toFixed(2) + "%";
      bar.classList.toggle("is-complete", !!complete);
    }
    if (wrap) {
      wrap.setAttribute("aria-valuenow", String(Math.round(v)));
      wrap.setAttribute("aria-valuetext", complete ? "Complete" : "In progress");
    }
  }

  function setLive(text) {
    var live = $("[data-analyze-live]");
    if (live) live.textContent = text || "";
  }

  function setPageInert(on) {
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el.getAttribute && el.getAttribute("data-analyze-overlay") != null) return;
      if (on) el.setAttribute("aria-hidden", "true");
      else el.removeAttribute("aria-hidden");
    });
  }

  function stopTimers() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (tipTimer) { clearInterval(tipTimer); tipTimer = null; }
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
  }

  function renderSources(names) {
    var list = $("[data-analyze-sources]");
    if (!list) return;
    list.innerHTML = names.map(function (name) {
      var meta = SOURCE_META[name] || { brand: "google", wide: false };
      return '<li class="analyze-source brand-' + escapeHtml(meta.brand) + '">' +
        '<span class="analyze-source-logo' + (meta.wide ? " is-wide" : "") + '" aria-hidden="true"></span>' +
        '<span class="analyze-source-name' + (meta.wide ? ' sr' : '') + '">' + escapeHtml(name) + "</span>" +
        '<span class="analyze-source-state mono">Scanning</span>' +
        "</li>";
    }).join("");
  }

  function startScan() {
    var list = $("[data-analyze-sources]");
    if (!list) return;
    var items = list.children;
    if (!items.length) return;
    if (reducedMotion()) {
      Array.prototype.forEach.call(items, function (el) { el.classList.remove("is-scanning"); });
      return;
    }
    var i = 0;
    function tick() {
      Array.prototype.forEach.call(items, function (el, idx) {
        el.classList.toggle("is-scanning", idx === i);
      });
      i = (i + 1) % items.length;
    }
    tick();
    scanTimer = setInterval(tick, 700);
  }

  function buildTips(plan, sources) {
    var list = BASE_TIPS.slice();
    var names = sources || [];
    var hasAds = names.indexOf("Meta Ad Library") !== -1 || names.indexOf("TikTok") !== -1;
    var hasSupply = names.indexOf("AliExpress") !== -1 || names.indexOf("Shopify") !== -1;
    if (hasAds) list.splice(3, 0, "What we’re checking: ad libraries included in your plan.");
    if (hasSupply) list.splice(3, 0, "What we’re checking: supplier and store signals included in your plan.");
    return list;
  }

  function showTip(i) {
    var el = $("[data-analyze-tip]");
    if (!el || !tips.length) return;
    tipIndex = ((i % tips.length) + tips.length) % tips.length;
    el.textContent = tips[tipIndex];
  }

  function tickClock() {
    if (!active || finishing) return;
    var elapsed = Date.now() - startedAt;
    var el = $("[data-analyze-elapsed]");
    if (el) el.textContent = formatElapsed(elapsed);
    setProgress(progressAt(elapsed), false);
  }

  function showSlowNote() {
    var el = $("[data-analyze-slow]");
    if (el) {
      el.hidden = false;
      setLive("Still working — big markets take longer.");
    }
  }

  function start(opts) {
    opts = opts || {};
    var overlay = overlayEl();
    if (!overlay) return;
    stopTimers();
    active = true;
    finishing = false;
    startedAt = Date.now();
    lastFocus = document.activeElement;
    var sources = sourcesForPlan(opts.plan);
    tips = buildTips(opts.plan, sources);
    renderSources(sources);

    var planLine = $("[data-analyze-plan-line]");
    if (planLine) planLine.textContent = "Sources included in your " + planLabel(opts.plan) + " plan";

    var title = $("[data-analyze-title]");
    if (title) title.textContent = "Analyzing your market… this usually takes about a minute.";

    var subject = $("[data-analyze-subject]");
    if (subject) {
      var bits = [];
      if (opts.product) bits.push(String(opts.product));
      if (opts.market) bits.push(String(opts.market));
      subject.hidden = !bits.length;
      subject.textContent = bits.join(" · ");
    }

    var slow = $("[data-analyze-slow]");
    if (slow) slow.hidden = true;

    setProgress(0, false);
    var elapsedEl = $("[data-analyze-elapsed]");
    if (elapsedEl) elapsedEl.textContent = "0:00";
    showTip(0);
    setLive("Analyzing your market. This usually takes about a minute.");

    overlay.hidden = false;
    document.body.classList.add("is-analyzing");
    setPageInert(true);
    var panel = panelEl();
    if (panel) {
      panel.setAttribute("aria-busy", "true");
      try { panel.focus(); } catch (e) { /* ignore */ }
    }

    tickTimer = setInterval(tickClock, 100);
    if (!reducedMotion()) {
      tipTimer = setInterval(function () { showTip(tipIndex + 1); }, 6000);
    }
    startScan();
    slowTimer = setTimeout(showSlowNote, 90000);
  }

  function hideOverlay() {
    var overlay = overlayEl();
    var panel = panelEl();
    if (panel) panel.setAttribute("aria-busy", "false");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("is-analyzing");
    setPageInert(false);
    active = false;
    finishing = false;
    if (lastFocus && typeof lastFocus.focus === "function") {
      try { lastFocus.focus(); } catch (e) { /* ignore */ }
    }
    lastFocus = null;
  }

  function finish() {
    return new Promise(function (resolve) {
      if (!active && !overlayEl()) { resolve(); return; }
      finishing = true;
      stopTimers();
      setProgress(100, true);
      setLive("Analysis finished.");
      var wait = reducedMotion() ? 0 : 280;
      setTimeout(function () {
        hideOverlay();
        resolve();
      }, wait);
    });
  }

  function zeroCountTargets(root) {
    var nodes = root.querySelectorAll("[data-count-to]");
    Array.prototype.forEach.call(nodes, function (el) {
      var raw = el.getAttribute("data-count-to");
      if (raw == null || raw === "" || !isFinite(Number(raw))) return;
      if (!el.getAttribute("data-count-final")) el.setAttribute("data-count-final", el.textContent);
      var target = Number(raw);
      var isInt = Math.abs(target - Math.round(target)) < 1e-9;
      el.textContent = isInt ? "0" : "0.00";
    });
  }

  function runCountUps(root) {
    var nodes = root.querySelectorAll("[data-count-to]");
    Array.prototype.forEach.call(nodes, function (el, idx) {
      var raw = el.getAttribute("data-count-to");
      if (raw == null || raw === "" || !isFinite(Number(raw))) return;
      var target = Number(raw);
      var finalText = el.getAttribute("data-count-final");
      var isInt = Math.abs(target - Math.round(target)) < 1e-9;
      var delay = 180 + idx * 90;
      var duration = 800;
      setTimeout(function () {
        var start = global.performance && performance.now ? performance.now() : Date.now();
        function frame(now) {
          var t = Math.min(1, (now - start) / duration);
          var eased = 1 - Math.pow(1 - t, 3);
          var val = target * eased;
          el.textContent = isInt ? String(Math.round(val)) : val.toFixed(2);
          if (t < 1) requestAnimationFrame(frame);
          else el.textContent = finalText != null ? finalText : (isInt ? String(Math.round(target)) : String(target));
        }
        requestAnimationFrame(frame);
      }, delay);
    });
  }

  function reveal(root) {
    if (!root) return;
    root.classList.remove("is-revealing", "is-revealed");
    if (reducedMotion()) {
      root.classList.add("is-revealed");
      return;
    }
    root.classList.add("is-revealing");
    zeroCountTargets(root);
    var delay = 0;
    function queue(el, step) {
      if (!el) return;
      el.classList.add("analyze-reveal-item");
      el.style.animationDelay = delay + "ms";
      delay += step || 80;
    }
    Array.prototype.forEach.call(root.children, function (el) {
      if (el.classList && el.classList.contains("score-grid")) {
        var cards = el.querySelectorAll(".score-card");
        if (cards.length) {
          Array.prototype.forEach.call(cards, function (card) { queue(card, 70); });
        } else {
          queue(el, 80);
        }
      } else {
        queue(el, el.classList && el.classList.contains("report-view-head") ? 100 : 80);
      }
    });
    var head = root.querySelector(".report-view-head");
    if (head) {
      head.classList.remove("analyze-ready-flash");
      void head.offsetWidth;
      head.classList.add("analyze-ready-flash");
    }
    requestAnimationFrame(function () { runCountUps(root); });
    var total = delay + 700;
    setTimeout(function () {
      root.classList.remove("is-revealing");
      root.classList.add("is-revealed");
    }, total);
  }

  global.MSAnalyzeOverlay = {
    start: start,
    finish: finish,
    reveal: reveal,
    sourcesForPlan: sourcesForPlan,
    planLabel: planLabel
  };
})(window);
