/* MarketScope site script — static chrome. Market figures come from live-report.js + the snapshot. */
(function () {
  "use strict";
  var C = window.MS_CONFIG || { plans: [], topups: [], matrix: [], currency: "$", annualMonthsFree: 2 };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cur = C.currency || "$";
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  $$(".year").forEach(function (e) { e.textContent = new Date().getFullYear(); });

  /* ---------- Site nav: Workspace + Exchange, and section headings in every menu ---------- */
  (function enhanceSiteNav() {
    var CHEV = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
    var WS = {
      "Research desk": [
        ["my-terminal.html", "Live Terminal", "History, movers and alerts from your reports"],
        ["competitors.html", "Competitor Intelligence", "Stores, logged prices and alerts"],
        ["suppliers.html", "Supplier Intelligence", "Compare cost, margin, shipping and MOQ"],
        ["product-portfolio.html", "Product Portfolio", "Unit economics linked to live research"],
        ["backtesting.html", "Backtesting", "Test rules on real history"]
      ],
      "Trading": [
        ["exchange.html", "Exchange · Simulation", "Virtual credits only, no real money"]
      ],
      "Vision": [
        ["roadmap.html", "Vision & roadmap", "What's live, in progress and planned"]
      ]
    };
    var MEGA_GROUPS = {
      Product: [
        { label: "Research", hrefs: ["./", "demo.html", "app.html"] },
        { label: "Platform", hrefs: ["integrations.html", "changelog.html"] }
      ],
      Terminal: [
        { label: "Market desk", hrefs: ["terminal.html", "screener.html", "heatmap.html", "indices.html"] },
        { label: "Tools", hrefs: ["watchlist.html", "portfolio.html", "backtest.html", "calendar.html", "stores.html"] }
      ],
      Solutions: [
        { label: "By use case", hrefs: ["solutions.html#dropshippers", "solutions.html#amazon", "solutions.html#dtc", "solutions.html#agencies"] },
        { label: "Compare", hrefs: ["compare.html"] }
      ],
      Resources: [
        { label: "Guides", hrefs: ["guides.html", "blog.html", "how-to-find-winning-products.html"] },
        { label: "Reference", hrefs: ["docs.html", "methodology.html", "status.html"] }
      ],
      Company: [
        { label: "About", hrefs: ["about.html", "careers.html", "contact.html"] },
        { label: "Trust", hrefs: ["security.html"] }
      ]
    };
    var JOSY = {
      "Assistant": [
        ["josy.html", "Josy overview", "AI marketing assistant"],
        ["josy-chat.html", "Josy chat", "Ask about a product or campaign"],
        ["josy-plans.html", "My plans", "Saved content plans"]
      ],
      "Campaigns": [
        ["josy-campaigns.html", "Campaign manager", "Organic posts and paid drafts"]
      ]
    };

    function hrefKey(a) { return (a.getAttribute("href") || "").split("?")[0]; }
    function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
    function sectionLabel(tag, className, id, text) {
      var el = document.createElement(tag);
      el.className = className;
      el.id = id;
      el.textContent = text;
      return el;
    }
    function applyGroups(container, itemSel, groups, labelClass, secClass, prefix) {
      if (!container || container.getAttribute("data-nav-sections")) return;
      var map = {};
      var all = $$(itemSel, container);
      all.forEach(function (a) { map[hrefKey(a)] = a; });
      var used = {};
      groups.forEach(function (g) {
        var id = "nav-sec-" + prefix + "-" + slug(g.label);
        var sec = document.createElement("div");
        sec.className = secClass;
        sec.setAttribute("role", "group");
        sec.setAttribute("aria-labelledby", id);
        sec.appendChild(sectionLabel("p", labelClass, id, g.label));
        g.hrefs.forEach(function (h) {
          if (map[h]) { sec.appendChild(map[h]); used[h] = 1; }
        });
        if (sec.querySelector(itemSel)) container.appendChild(sec);
      });
      all.forEach(function (a) { if (!used[hrefKey(a)]) container.appendChild(a); });
      container.setAttribute("data-nav-sections", "1");
    }
    function mmItem(href, title, sub) {
      return '<a href="' + href + '" class="mm-item"><b>' + title + "</b><span>" + sub + "</span></a>";
    }
    function mmSections(groups) {
      var html = "";
      Object.keys(groups).forEach(function (label) {
        var id = "nav-sec-ws-" + slug(label);
        html += '<div class="mm-sec" role="group" aria-labelledby="' + id + '"><p class="mm-label" id="' + id + '">' + label + "</p>";
        groups[label].forEach(function (w) { html += mmItem(w[0], w[1], w[2]); });
        html += "</div>";
      });
      return html;
    }
    function decorateMobGroup(g, prefix) {
      if (!g || g.getAttribute("role") === "group") return;
      var lab = g.querySelector(".mob-label");
      if (!lab) return;
      if (!lab.id) lab.id = "nav-sec-mob-" + slug(prefix || lab.textContent);
      g.setAttribute("role", "group");
      g.setAttribute("aria-labelledby", lab.id);
    }

    var links = $(".nav-links");
    if (links && !links.querySelector("[data-ws-nav]")) {
      var g = document.createElement("div");
      g.className = "nav-group"; g.setAttribute("data-ws-nav", "");
      g.innerHTML = '<button class="nav-trigger" aria-expanded="false">Workspace' + CHEV + '</button><div class="mega"><div class="mega-in" data-nav-sections="1">' + mmSections(WS) + "</div></div>";
      var groups = links.querySelectorAll(".nav-group");
      var after = groups.length > 1 ? groups[1] : groups[0];
      if (after && after.nextSibling) links.insertBefore(g, after.nextSibling); else links.appendChild(g);
    }

    /* Guides hub: add to Resources mega, mobile menu and footer if the HTML is older. */
    (function injectGuidesHub() {
      function addIfMissing(container, href, opts) {
        if (!container) return;
        var sel = 'a[href="' + href + '"]';
        if (container.querySelector(sel)) return;
        var a = document.createElement("a");
        a.href = href;
        if (opts.className) a.className = opts.className;
        if (opts.html) a.innerHTML = opts.html;
        else a.textContent = opts.text;
        var after = opts.after && container.querySelector('a[href="' + opts.after + '"]');
        if (opts.first) container.insertBefore(a, container.firstElementChild && container.firstElementChild.tagName === "A" ? container.firstElementChild : (container.querySelector("a, .mm-item") || null));
        else if (after) after.parentNode.insertBefore(a, after.nextSibling);
        else container.appendChild(a);
      }
      $$(".nav-group").forEach(function (grp) {
        var tr = grp.querySelector(".nav-trigger");
        if (!tr || tr.textContent.replace(/\s+/g, " ").trim().indexOf("Resources") !== 0) return;
        addIfMissing(grp.querySelector(".mega-in"), "guides.html", {
          className: "mm-item",
          html: "<b>All guides</b><span>Product research playbooks</span>",
          first: true
        });
      });
      $$("#mobile-menu .mob-group, .mobile-menu .mob-group").forEach(function (grp) {
        var lab = grp.querySelector(".mob-label");
        if (!lab || lab.textContent.trim().toUpperCase() !== "RESOURCES") return;
        var blog = grp.querySelector('a[href="blog.html"]');
        if (blog) addIfMissing(grp, "guides.html", { text: "All guides", first: false });
        var g = grp.querySelector('a[href="guides.html"]');
        if (g && blog && g.compareDocumentPosition(blog) & Node.DOCUMENT_POSITION_PRECEDING) {
          grp.insertBefore(g, blog);
        } else if (g && blog) {
          grp.insertBefore(g, blog);
        }
      });
      $$(".footer .foot-grid div, footer .foot-grid div").forEach(function (col) {
        var h = col.querySelector("h4");
        if (!h || h.textContent.trim() !== "RESOURCES") return;
        addIfMissing(col, "guides.html", { text: "All guides", after: null });
        var g = col.querySelector('a[href="guides.html"]');
        var blog = col.querySelector('a[href="blog.html"]');
        if (g && blog) col.insertBefore(g, blog);
      });
    })();

    if (links) {
      $$(".nav-group", links).forEach(function (grp) {
        var t = grp.querySelector(".nav-trigger");
        var name = t ? t.textContent.trim() : "";
        var plan = MEGA_GROUPS[name];
        var mega = grp.querySelector(".mega-in");
        if (plan && mega) applyGroups(mega, ".mm-item", plan, "mm-label", "mm-sec", slug(name));
      });
    }

    /* Josy: turn the plain link into a labelled mega menu (Assistant / Campaigns). */
    if (links && !links.querySelector("[data-josy-nav]")) {
      var josyLink = links.querySelector("a.nav-plain.nav-josy, a.nav-plain[href='josy.html']");
      if (josyLink) {
        var jg = document.createElement("div");
        jg.className = "nav-group"; jg.setAttribute("data-josy-nav", "");
        jg.innerHTML = '<button class="nav-trigger nav-josy" aria-expanded="false">Josy <span class="nav-new">AI</span>' + CHEV + '</button><div class="mega"><div class="mega-in" data-nav-sections="1">' + mmSections(JOSY) + "</div></div>";
        links.insertBefore(jg, josyLink);
        josyLink.parentNode.removeChild(josyLink);
      }
    }

    /* Top-level Exchange, next to Pricing, so it is visible without opening Workspace. */
    if (links && !links.querySelector("[data-x-nav]")) {
      var ex = document.createElement("a");
      ex.href = "exchange.html";
      ex.className = "nav-plain";
      ex.setAttribute("data-x-nav", "");
      ex.textContent = "Exchange";
      var pricing = links.querySelector('a.nav-plain[href="pricing.html"]');
      if (pricing) links.insertBefore(ex, pricing); else links.appendChild(ex);
    }

    var mob = $("#mobile-menu");
    if (mob && !mob.querySelector("[data-ws-mob]")) {
      var m = document.createElement("div");
      m.className = "mob-group"; m.setAttribute("data-ws-mob", "");
      m.setAttribute("role", "group");
      m.setAttribute("aria-labelledby", "nav-sec-mob-workspace");
      var mh = '<p class="mob-label mono" id="nav-sec-mob-workspace">Workspace</p>';
      Object.keys(WS).forEach(function (label) {
        if (label === "Trading") return; /* Exchange has its own mobile group, so it is not listed twice. */
        var id = "nav-sec-mob-ws-" + slug(label);
        mh += '<div class="mob-sec" role="group" aria-labelledby="' + id + '"><p class="mob-sub mono" id="' + id + '">' + label + "</p>";
        WS[label].forEach(function (w) { mh += '<a href="' + w[0] + '">' + w[1] + "</a>"; });
        mh += "</div>";
      });
      m.innerHTML = mh;
      var mg = mob.querySelectorAll(".mob-group");
      var ref = mg.length > 1 ? mg[1] : mg[0];
      if (ref && ref.nextSibling) mob.insertBefore(m, ref.nextSibling); else mob.appendChild(m);
    }

    if (mob && !mob.querySelector("[data-x-mob]")) {
      var xg = document.createElement("div");
      xg.className = "mob-group"; xg.setAttribute("data-x-mob", "");
      xg.setAttribute("role", "group");
      xg.setAttribute("aria-labelledby", "nav-sec-mob-exchange");
      xg.innerHTML = '<p class="mob-label mono" id="nav-sec-mob-exchange">Exchange</p><a href="exchange.html">Exchange · Simulation</a>';
      var wsMob = mob.querySelector("[data-ws-mob]");
      if (wsMob && wsMob.nextSibling) mob.insertBefore(xg, wsMob.nextSibling);
      else if (wsMob) mob.appendChild(xg);
      else {
        var jes = mob.querySelector('a[href="josy.html"]');
        var jg0 = jes && jes.closest(".mob-group");
        if (jg0) mob.insertBefore(xg, jg0); else mob.appendChild(xg);
      }
    }

    if (mob && !mob.getAttribute("data-nav-sections")) {
      $$(".mob-group", mob).forEach(function (grp) {
        var lab = (grp.querySelector(".mob-label") || {}).textContent || "";
        decorateMobGroup(grp, lab);
        var trigger = lab.trim();
        /* Match desktop groups: Product, Terminal, Solutions, Resources, Company. */
        var plan = MEGA_GROUPS[trigger] || MEGA_GROUPS[trigger.charAt(0) + trigger.slice(1).toLowerCase()];
        if (!plan && trigger.toUpperCase() === "PRODUCT") plan = MEGA_GROUPS.Product;
        if (!plan && trigger.toUpperCase() === "TERMINAL") plan = MEGA_GROUPS.Terminal;
        if (!plan && trigger.toUpperCase() === "SOLUTIONS") plan = MEGA_GROUPS.Solutions;
        if (!plan && trigger.toUpperCase() === "RESOURCES") plan = MEGA_GROUPS.Resources;
        if (!plan && trigger.toUpperCase() === "COMPANY") plan = MEGA_GROUPS.Company;
        if (plan) applyGroups(grp, "a", plan, "mob-sub mono", "mob-sec", "mob-" + slug(trigger));
      });
      /* Split the unlabelled Josy / pricing / account cluster. */
      $$(".mob-group", mob).forEach(function (grp) {
        if (grp.querySelector(".mob-label, .mob-sub") || grp.getAttribute("data-ws-mob") || grp.getAttribute("data-x-mob")) return;
        if (!grp.querySelector('a[href="josy.html"], a[href="josy-chat.html"]')) return;
        var map = {};
        $$("a, .btn, .mob-auth, [data-sign-out]", grp).forEach(function (el) {
          if (el.matches && el.matches("a")) map[hrefKey(el)] = el;
        });
        var leftovers = Array.prototype.slice.call(grp.childNodes);
        function take(hrefs) {
          return hrefs.map(function (h) { return map[h]; }).filter(Boolean);
        }
        function emit(label, nodes, attr) {
          if (!nodes.length) return;
          var d = document.createElement("div");
          d.className = "mob-group";
          d.setAttribute("role", "group");
          var id = "nav-sec-mob-" + slug(label);
          d.setAttribute("aria-labelledby", id);
          if (attr) d.setAttribute(attr, "");
          d.appendChild(sectionLabel("p", "mob-label mono", id, label));
          nodes.forEach(function (n) { d.appendChild(n); });
          grp.parentNode.insertBefore(d, grp);
        }
        emit("Josy", take(["josy.html", "josy-chat.html", "josy-plans.html"]), "data-josy-mob");
        emit("Campaigns", take(["josy-campaigns.html"]), "data-campaigns-mob");
        var rest = leftovers.filter(function (n) { return n.parentNode === grp; });
        if (rest.length) {
          var acc = document.createElement("div");
          acc.className = "mob-group";
          acc.setAttribute("role", "group");
          acc.setAttribute("aria-labelledby", "nav-sec-mob-account");
          acc.setAttribute("data-account-mob", "");
          acc.appendChild(sectionLabel("p", "mob-label mono", "nav-sec-mob-account", "Account"));
          rest.forEach(function (n) { acc.appendChild(n); });
          grp.parentNode.insertBefore(acc, grp);
        }
        grp.parentNode.removeChild(grp);
      });
      mob.setAttribute("data-nav-sections", "1");
    }
  })();

  /* ---------- micro-interactions: nav scroll state + card pointer glow ---------- */
  (function () {
    var hdr = $("header.nav");
    if (hdr) {
      var onScroll = function () { hdr.classList.toggle("is-scrolled", (window.scrollY || 0) > 8); };
      onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    }
    if (reduce || !window.matchMedia || !matchMedia("(hover:hover)").matches) return;
    document.addEventListener("pointermove", function (e) {
      var c = e.target && e.target.closest && e.target.closest(".card,.mod,.quote,.dash-card");
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px");
      c.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
  })();

  /* ---------- nav ---------- */
  var burger = $(".burger"), menu = $("#mobile-menu");
  if (burger && menu) burger.addEventListener("click", function () {
    var open = burger.getAttribute("aria-expanded") === "true";
    burger.setAttribute("aria-expanded", String(!open)); menu.hidden = open;
    burger.setAttribute("aria-label", open ? "Open menu" : "Close menu");
    if (!open) {
      var current = menu.querySelector("a.active, a[aria-current]");
      if (current && current.scrollIntoView) {
        requestAnimationFrame(function () {
          current.scrollIntoView({ block: "center", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
        });
      }
    }
  });
  $$(".nav-trigger").forEach(function (t) {
    t.addEventListener("click", function (e) {
      e.stopPropagation();
      var g = t.parentNode, was = g.classList.contains("open");
      $$(".nav-group.open").forEach(function (x) { x.classList.remove("open"); x.firstChild.setAttribute("aria-expanded", "false"); });
      if (!was) { g.classList.add("open"); t.setAttribute("aria-expanded", "true"); }
    });
  });
  document.addEventListener("click", function () { $$(".nav-group.open").forEach(function (x) { x.classList.remove("open"); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") $$(".nav-group.open").forEach(function (x) { x.classList.remove("open"); }); });

  /* ---------- current page in nav ---------- */
  var navRoot = $("header.nav") || $(".nav");
  var sectionObs = null;
  function navFile(pathname) {
    var p = (pathname || "/").split("?")[0].split("#")[0];
    try { p = decodeURIComponent(p); } catch (e) {}
    p = p.replace(/\/+$/, "") || "/";
    var last = p.split("/").pop() || "";
    if (!last || /^index\.html$/i.test(last)) return "index.html";
    return last.toLowerCase();
  }
  function navHref(a) {
    var raw = a.getAttribute("href");
    if (!raw || raw.charAt(0) === "#" || /^(mailto:|tel:|javascript:)/i.test(raw)) return null;
    try { return new URL(raw, location.href); } catch (e) { return null; }
  }
  function isNavCandidate(a) {
    if (!a || a.closest(".brand") || a.classList.contains("btn") || a.classList.contains("nav-cta")) return false;
    return !!(a.closest(".nav-links, #mobile-menu, .account-drop, .nav-right"));
  }
  function clearNavCurrent() {
    if (!navRoot) return;
    $$(".nav-group.active", navRoot).forEach(function (g) { g.classList.remove("active"); });
    $$(".account-menu.has-current", navRoot).forEach(function (m) { m.classList.remove("has-current"); });
    $$("a.active, a[aria-current]", navRoot).forEach(function (a) {
      a.classList.remove("active");
      a.removeAttribute("aria-current");
    });
  }
  function markNavLink(a, current) {
    a.classList.add("active");
    a.setAttribute("aria-current", current);
    var group = a.closest(".nav-group");
    if (group) {
      var href = navHref(a);
      var file = href ? navFile(href.pathname) : "";
      var plainMarks = file && $$(".nav-links > a.nav-plain", navRoot).some(function (p) {
        var u = navHref(p); return u && navFile(u.pathname) === file;
      });
      if (!plainMarks) group.classList.add("active");
    }
    var menu = a.closest(".account-menu");
    if (menu) menu.classList.add("has-current");
  }
  function setSectionCurrent(id) {
    if (!navRoot || !id) return;
    var file = navFile(location.pathname);
    $$("a[href]", navRoot).forEach(function (a) {
      if (!isNavCandidate(a)) return;
      var url = navHref(a);
      if (!url || navFile(url.pathname) !== file) return;
      var hash = (url.hash || "").replace(/^#/, "");
      if (!hash) return;
      var on = hash === id;
      a.classList.toggle("active", on);
      if (on) {
        a.setAttribute("aria-current", "location");
        var group = a.closest(".nav-group");
        if (group) group.classList.add("active");
      } else {
        a.removeAttribute("aria-current");
      }
    });
  }
  function bindSectionObserver(ids) {
    if (sectionObs) { sectionObs.disconnect(); sectionObs = null; }
    if (!ids.length) return;
    if (location.hash) {
      var start = location.hash.replace(/^#/, "");
      if (ids.indexOf(start) !== -1) setSectionCurrent(start);
    }
    if (!("IntersectionObserver" in window)) return;
    var visible = {};
    sectionObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        visible[en.target.id] = en.isIntersecting ? en.intersectionRatio : 0;
      });
      if (menu && !menu.hidden) return;
      var hashId = (location.hash || "").replace(/^#/, "");
      var hashVisible = hashId && ids.indexOf(hashId) !== -1 && (visible[hashId] || 0) > 0;
      var anyVisible = ids.some(function (id) { return (visible[id] || 0) > 0; });
      if (hashVisible || (hashId && ids.indexOf(hashId) !== -1 && !anyVisible)) {
        setSectionCurrent(hashId);
        return;
      }
      var bestId = null, best = 0;
      ids.forEach(function (id) {
        var v = visible[id] || 0;
        if (v > best) { best = v; bestId = id; }
      });
      if (bestId) setSectionCurrent(bestId);
    }, { rootMargin: "-28% 0px -55% 0px", threshold: [0, 0.1, 0.25, 0.5, 1] });
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) sectionObs.observe(el);
    });
  }
  function markCurrentNav() {
    if (!navRoot) return;
    clearNavCurrent();
    var file = navFile(location.pathname);
    var hash = (location.hash || "").replace(/^#/, "");
    var pageLinks = [];
    var sectionIds = [];
    var seenIds = {};
    $$("a[href]", navRoot).forEach(function (a) {
      if (!isNavCandidate(a)) return;
      var url = navHref(a);
      if (!url || navFile(url.pathname) !== file) return;
      var linkHash = (url.hash || "").replace(/^#/, "");
      if (linkHash) {
        if (document.getElementById(linkHash) && !seenIds[linkHash]) {
          seenIds[linkHash] = true;
          sectionIds.push(linkHash);
        }
        if (hash && linkHash === hash) pageLinks.push(a);
        return;
      }
      pageLinks.push(a);
    });
    pageLinks.forEach(function (a) { markNavLink(a, "page"); });
    navRoot.classList.add("nav-ready");
    bindSectionObserver(sectionIds);
  }
  markCurrentNav();
  window.addEventListener("hashchange", markCurrentNav);
  if (navRoot && "MutationObserver" in window) {
    var navMoTimer;
    var navMo = new MutationObserver(function () {
      clearTimeout(navMoTimer);
      navMoTimer = setTimeout(markCurrentNav, 0);
    });
    navMo.observe(navRoot, { childList: true, subtree: true });
  }

  /* ---------- cookie consent (no analytics are loaded either way) ---------- */
  var ck = $("#cookie");
  if (ck) {
    if (!store.get("ms_consent", null)) ck.hidden = false;
    $$("[data-consent]", ck).forEach(function (b) {
      b.addEventListener("click", function () { store.set("ms_consent", { level: b.dataset.consent, at: new Date().toISOString() }); ck.hidden = true; });
    });
    $$("[data-cookie-settings]").forEach(function (b) { b.addEventListener("click", function () { ck.hidden = false; }); });
  }

  /* ---------- reveal ---------- */
  var rv = $$(".reveal");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }); }, { rootMargin: "0px 0px -8% 0px" });
    rv.forEach(function (e) { io.observe(e); });
  } else rv.forEach(function (e) { e.classList.add("in"); });

  /* ---------- helpers ---------- */
  function scoreColor(k, v) {
    if (k === "competition" || k === "saturation") return v >= 70 ? "#ff4d5e" : v >= 50 ? "#ffb000" : "#19d27c";
    return v >= 70 ? "#19d27c" : v >= 50 ? "#ffb000" : "#ff4d5e";
  }
  function setRing(ring, v, key) {
    ring.style.setProperty("--c", scoreColor(key, v));
    ring.style.setProperty("--v", v);
    var span = ring.querySelector("span"); if (!span) return;
    var from = parseInt(span.textContent, 10) || 0, t0 = performance.now(), dur = reduce ? 0 : 900;
    (function step(t) { var p = dur ? Math.min(1, (t - t0) / dur) : 1; span.textContent = Math.round(from + (v - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); })(t0);
  }
  $$("[data-ring]").forEach(function (r) { setRing(r, +r.dataset.ring, r.dataset.key || "opportunity"); });
  var vclass = { "STRONG BUY": "v-sbuy", "BUY": "v-buy", "HOLD": "v-hold", "UNDERPERFORM": "v-under", "AVOID": "v-avoid" };
  function setVerdict(el, v) { el.className = el.className.replace(/\bv-\w+/g, "").trim() + " " + vclass[v]; el.textContent = v; }
  $$("[data-verdict]").forEach(function (e) { setVerdict(e, e.dataset.verdict); });
  function path(data, w, h, pad) {
    var mn = Math.min.apply(null, data), mx = Math.max.apply(null, data), rg = mx - mn || 1;
    return data.map(function (d, i) { return [(i / (data.length - 1)) * w, pad + (1 - (d - mn) / rg) * (h - pad * 2)]; });
  }
  function toD(pts) { return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(""); }
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  /* multi-series line chart with axes: opts {series:[{data,color,dash,area}], labels:[], min, max, fmt} */
  function lineChart(svg, o) {
    var W = 640, H = 240, L = 44, R = 10, T = 12, B = 26; svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.innerHTML = "";
    var all = [].concat.apply([], o.series.map(function (s) { return s.data; }));
    var mn = o.min != null ? o.min : Math.min.apply(null, all), mx = o.max != null ? o.max : Math.max.apply(null, all), rg = mx - mn || 1;
    var ax = el("g", { "class": "axis" }, svg), n = o.series[0].data.length;
    for (var i = 0; i <= 4; i++) { var y = T + i * (H - T - B) / 4, val = mx - i * rg / 4;
      el("line", { x1: L, x2: W - R, y1: y, y2: y, stroke: "#1a2027" }, ax);
      el("text", { x: L - 8, y: y + 3, "text-anchor": "end" }, ax).textContent = o.fmt ? o.fmt(val) : Math.round(val); }
    (o.labels || []).forEach(function (lb, j) { if (n > 12 && j % 2) return; el("text", { x: L + j * (W - L - R) / (n - 1), y: H - 6, "text-anchor": "middle" }, ax).textContent = lb; });
    o.series.forEach(function (s, si) {
      var pts = s.data.map(function (d, j) { return [L + j * (W - L - R) / (n - 1), T + (1 - (d - mn) / rg) * (H - T - B)]; });
      if (s.area) { var gid = "ga" + Math.random().toString(36).slice(2, 7), df = el("defs", {}, svg), lg = el("linearGradient", { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 }, df);
        el("stop", { offset: 0, "stop-color": s.color, "stop-opacity": .28 }, lg); el("stop", { offset: 1, "stop-color": s.color, "stop-opacity": 0 }, lg);
        el("path", { d: toD(pts) + "L" + pts[n - 1][0] + "," + (H - B) + "L" + L + "," + (H - B) + "Z", fill: "url(#" + gid + ")" }, svg); }
      var p = el("path", { d: toD(pts), fill: "none", stroke: s.color, "stroke-width": 2, "stroke-dasharray": s.dash || "", "stroke-linejoin": "round" }, svg);
      if (!s.dash && !reduce) { var len = p.getTotalLength ? p.getTotalLength() : 0; if (len) { p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.getBoundingClientRect(); p.style.transition = "stroke-dashoffset 1.4s ease " + (si * .2) + "s"; requestAnimationFrame(function () { p.style.strokeDashoffset = 0; }); } }
      el("circle", { cx: pts[n - 1][0], cy: pts[n - 1][1], r: 3.5, fill: s.color }, svg);
    });
  }
  function barChart(svg, o) {
    var W = 640, H = 240, L = 44, R = 10, T = 12, B = 26; svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.innerHTML = "";
    var mx = o.max || Math.max.apply(null, o.data), ax = el("g", { "class": "axis" }, svg), n = o.data.length, bw = (W - L - R) / n;
    for (var i = 0; i <= 4; i++) { var y = T + i * (H - T - B) / 4; el("line", { x1: L, x2: W - R, y1: y, y2: y, stroke: "#1a2027" }, ax); el("text", { x: L - 8, y: y + 3, "text-anchor": "end" }, ax).textContent = o.fmt ? o.fmt(mx - i * mx / 4) : Math.round(mx - i * mx / 4); }
    o.data.forEach(function (d, j) { var h = (d / mx) * (H - T - B);
      el("rect", { x: L + j * bw + bw * .18, y: H - B - h, width: bw * .64, height: h, rx: 3, fill: o.colors ? o.colors[j] : "#ffb000", opacity: .9 }, svg);
      el("text", { x: L + j * bw + bw / 2, y: H - 8, "text-anchor": "middle" }, ax).textContent = o.labels[j]; });
  }
  window.MS = { lineChart: lineChart, barChart: barChart, setRing: setRing, setVerdict: setVerdict };
  var MONTHS = ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];

  /* ---------- hero terminal: live-report.js hydrates from the snapshot ---------- */
  /* Rings already present in the markup will be updated once MSData is ready. */

  /* ---------- ticker is filled by live-report.js from the snapshot ---------- */

  /* ---------- pricing ---------- */
  var yearly = false;
  function money(n) { return cur + (Math.round(n * 100) / 100).toLocaleString("en-US"); }
  function renderPlans() {
    $$("#pricing-grid").forEach(function (grid) {
      grid.innerHTML = C.plans.map(function (p) {
        var m = C.annualMonthsFree || 0, per = yearly && p.price ? p.price * (12 - m) / 12 : p.price;
        var billed = p.price === 0 ? "Free forever" : yearly ? money(p.price * (12 - m)) + " billed yearly" : "billed monthly";
        return '<div class="plan' + (p.popular ? " popular" : "") + '">' + (p.popular ? '<span class="badge-pop">MOST POPULAR</span>' : "") +
          "<h3>" + p.name + '</h3><p class="blurb">' + p.blurb + "</p>" +
          (p.question ? '<p class="ask mono">' + p.question + "</p>" : "") +
          '<div class="price"><span class="amt">' + money(Math.round(per)) + '</span><span class="per">/mo</span></div>' +
          '<div class="billed">' + billed + '</div><div class="credits">◆ ' + p.creditsLabel + "</div><ul>" +
          p.features.map(function (f) { var inc = /^Everything in /i.test(f); return "<li" + (inc ? ' class="inc"' : "") + ">" + f + "</li>"; }).join("") + "</ul>" +
          (p.id === "free"
            ? '<a class="btn btn-amber" href="signup.html?plan=free">' + p.cta + "</a>"
            : '<button type="button" class="btn btn-amber" data-checkout-plan="' + p.id + '">' + p.cta + "</button>") +
          "</div>";
      }).join("");
    });
    $$("[data-annual-note]").forEach(function (e) { e.textContent = (C.annualMonthsFree || 2) + " months free"; });
  }
  if ($("#pricing-grid")) renderPlans();
  $$(".switch").forEach(function (sw) { sw.addEventListener("click", function () { yearly = !yearly; sw.setAttribute("aria-checked", String(yearly)); renderPlans(); }); });
  var mx = $("#matrix");
  if (mx) {
    var head = "<thead><tr><th>Feature</th>" + C.plans.map(function (p) { return '<th class="' + (p.popular ? "hl" : "") + '">' + p.name + '<br><span class="muted" style="font-weight:400">' + money(p.price) + "/mo</span></th>"; }).join("") + "</tr></thead>";
    var body = C.matrix.map(function (r) {
      if (r.group) return '<tr class="grp"><th colspan="' + (C.plans.length + 1) + '">' + r.group.toUpperCase() + "</th></tr>";
      return "<tr><th>" + r[0] + "</th>" + r.slice(1).map(function (v, i) { var hl = C.plans[i] && C.plans[i].popular ? " hl" : "";
        return v === true ? '<td class="yes' + hl + '" aria-label="Included">✓</td>'
          : v === false ? '<td class="no' + hl + '" aria-label="Not included">—</td>'
          : v === "Live" ? '<td class="yes' + hl + '"><span class="chip live">Live</span></td>'
          : v === "Coming soon" ? '<td class="' + hl + '"><span class="chip soon">Coming soon</span></td>'
          : v === "Soon" ? '<td class="' + hl + '"><span class="chip soon">Soon · DataForSEO</span></td>'
          : '<td class="' + hl + '">' + v + "</td>"; }).join("") + "</tr>";
    }).join("");
    mx.innerHTML = head + "<tbody>" + body + "</tbody>";
  }
  var tu = $("#topups");
  if (tu) tu.innerHTML = C.topups.map(function (t) {
    return '<div class="topup">' + (t.tag ? '<span class="t chip live">' + t.tag + "</span>" : "") + '<span class="c">' + t.credits + ' <small class="muted" style="font-size:.9rem">credits</small></span><span class="p">' + money(t.price) + '</span><span class="u">' + money(t.price / t.credits) + ' per credit · kept while your account is active</span><button type="button" class="btn btn-sm btn-amber" data-checkout-topup="' + t.credits + '">Buy ' + t.credits + " credits</button></div>";
  }).join("");
  // signup plan picker
  var pp = $("#plan-pick");
  if (pp) {
    var want = (location.search.match(/plan=(\w+)/) || [])[1] || "free";
    pp.innerHTML = C.plans.map(function (p) { return '<label><input type="radio" name="plan" value="' + p.id + '"' + (p.id === want ? " checked" : "") + ">" + p.name + "<small>" + (p.price ? money(p.price) + "/mo" : "Free") + "</small></label>"; }).join("");
  }

  /* ---------- forms (localStorage + optional Supabase leads insert) ---------- */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function leadSource(f, fallback) {
    return String((f && f.getAttribute("data-lead-source")) || fallback || "waitlist").slice(0, 40);
  }
  function submitLead(payload) {
    try {
      if (window.MSLeads && typeof window.MSLeads.submit === "function") {
        return window.MSLeads.submit(payload).catch(function () { return { ok: false }; });
      }
    } catch (err) { /* ignore */ }
    return Promise.resolve({ ok: false, skipped: true });
  }
  $$(".waitlist-form").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var em = f.querySelector("input[type=email]"), msg = f.querySelector(".form-msg"), v = em.value.trim();
      if (!EMAIL.test(v)) { msg.className = "form-msg"; msg.textContent = "Please enter a valid email address."; em.focus(); return; }
      var plan = (f.querySelector("select") || {}).value || "";
      var source = leadSource(f, "waitlist");
      var list = store.get("marketscope_waitlist", []);
      if (!list.some(function (x) { return x.email === v.toLowerCase(); })) list.push({ email: v.toLowerCase(), plan: plan, source: source, page: location.pathname, at: new Date().toISOString() });
      store.set("marketscope_waitlist", list);
      var th = f.parentNode.querySelector(".thanks");
      if (th) { f.hidden = true; th.hidden = false; $(".thanks-email", th).textContent = v; }
      else {
        msg.className = "form-msg ok";
        msg.textContent = source === "blog" || source === "newsletter"
          ? "✓ Thanks. We'll email " + v + " when there's a new post."
          : "✓ You're on the list. We'll email " + v + " when your spot opens.";
        em.value = "";
      }
      submitLead({ email: v, source: source, page: location.pathname, message: plan ? ("Plan interest: " + plan) : undefined });
    });
  });
  $$("form[data-demo-form]").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = f.querySelector(".form-msg"), bad = $$("[required]", f).filter(function (i) { return i.type === "email" ? !EMAIL.test(i.value.trim()) : (i.type === "checkbox" ? !i.checked : !i.value.trim()); });
      if (bad.length) { msg.className = "form-msg"; msg.textContent = "Please complete the highlighted fields."; bad.forEach(function (b) { b.style.borderColor = "#ff4d5e"; }); bad[0].focus(); return; }
      $$("[required]", f).forEach(function (b) { b.style.borderColor = ""; });
      var kind = f.dataset.demoForm;
      if (kind === "contact") {
        var nameVal = (f.name && f.name.value || "").trim();
        var emailVal = (f.email && f.email.value || "").trim();
        var messageVal = (f.message && f.message.value || "").trim();
        var topicEl = f.querySelector("[name=topic], #c-topic");
        var topicVal = topicEl ? String(topicEl.value || "").trim() : "";
        var body = (topicVal ? ("Topic: " + topicVal + "\n\n") : "") + messageVal;
        var l = store.get("marketscope_contact", []);
        l.push({ at: new Date().toISOString(), email: emailVal, name: nameVal, topic: topicVal, message: messageVal, page: location.pathname });
        store.set("marketscope_contact", l);
        msg.className = "form-msg";
        msg.textContent = "Sending…";
        var btn = f.querySelector('[type=submit]');
        if (btn) btn.disabled = true;
        submitLead({ email: emailVal, source: leadSource(f, "contact"), name: nameVal, message: body, page: location.pathname }).then(function (res) {
          if (btn) btn.disabled = false;
          if (res && res.ok) {
            msg.className = "form-msg ok";
            msg.textContent = "✓ Thanks. Your message was sent. We'll get back to you at the email you provided.";
            f.reset();
          } else {
            msg.className = "form-msg";
            msg.textContent = "We couldn't reach the server. Please try again in a moment.";
          }
        });
        return;
      }
      msg.className = "form-msg ok";
      msg.textContent = "✓ Thanks.";
    });
  });

  /* ---------- simple tab filters (integrations, blog, docs) ---------- */
  $$("[data-filter-tabs]").forEach(function (bar) {
    var target = $(bar.dataset.filterTabs);
    $$("button", bar).forEach(function (b) { b.addEventListener("click", function () {
      $$("button", bar).forEach(function (x) { x.classList.toggle("active", x === b); });
      $$("[data-cat]", target).forEach(function (c) { c.hidden = b.dataset.f !== "all" && c.dataset.cat.indexOf(b.dataset.f) < 0; });
    }); });
  });

  /* ---------- page charts: live-report.js draws real demand series from the snapshot.
       Invented price-history and modelled series are no longer drawn. ---------- */
  $$("svg[data-spark]").forEach(function (s) {
    if (!s.dataset.spark) return;
    /* Only draw a spark if the values were provided as a data attribute from a live page. */
    var d = s.dataset.spark.split(",").map(Number).filter(function (n) { return isFinite(n); });
    if (d.length < 2) return;
    var pts = path(d, 100, 30, 3); s.setAttribute("viewBox", "0 0 100 30"); s.setAttribute("preserveAspectRatio", "none");
    el("path", { d: toD(pts), fill: "none", stroke: d[d.length - 1] >= d[0] ? "#19d27c" : "#ff4d5e", "stroke-width": 1.6, "vector-effect": "non-scaling-stroke" }, s);
  });

  /* ---------- app preview views ---------- */
  var side = $(".side");
  if (side) {
    $$("button[data-view]", side).forEach(function (b) { b.addEventListener("click", function () {
      $$("button[data-view]", side).forEach(function (x) { x.classList.toggle("active", x === b); });
      $$(".view").forEach(function (v) { v.classList.toggle("active", v.id === "view-" + b.dataset.view); });
      var vt = $("#view-title"); if (vt) vt.textContent = b.dataset.title || b.textContent.trim();
      if (b.dataset.view === "terminal" && window.MSTrading && window.MS_SNAPSHOT) {
        var prod = (window.MS_SNAPSHOT.products || [])[0];
        var host = document.getElementById("chart-terminal-host") || document.getElementById("chart-terminal");
        if (prod && window.MSTrading.mountDemandChart && host && host.getAttribute && host.tagName !== "svg") {
          window.MSTrading.mountDemandChart(host, { monthly_searches: (prod.demand_detail || {}).monthly_searches || [], timeframe: "12M", height: 280 });
        }
      }
    }); });
    // App preview rows are labelled example data and should not open the real Google report.
  }
})();


/* Data sources: mouse-tilt parallax. No-ops when the user prefers reduced motion. */
(function () {
  var root = document.querySelector("[data-sources]");
  if (!root) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var cards = root.querySelectorAll(".sources-card");
  var defaults = [];
  cards.forEach(function (c) {
    var st = window.getComputedStyle(c);
    defaults.push({ el: c, rx: st.getPropertyValue("--rx").trim() || "8deg", ry: st.getPropertyValue("--ry").trim() || "0deg" });
  });
  function reset() {
    defaults.forEach(function (d) {
      d.el.style.setProperty("--rx", d.rx);
      d.el.style.setProperty("--ry", d.ry);
      d.el.style.setProperty("--mx", "50%");
      d.el.style.setProperty("--my", "12%");
    });
  }
  function onMove(e) {
    if (reduce && reduce.matches) return;
    var cx = e.clientX, cy = e.clientY;
    defaults.forEach(function (d) {
      var r = d.el.getBoundingClientRect();
      var px = (cx - (r.left + r.width / 2)) / (r.width / 2);
      var py = (cy - (r.top + r.height / 2)) / (r.height / 2);
      px = Math.max(-1.6, Math.min(1.6, px));
      py = Math.max(-1.6, Math.min(1.6, py));
      var dist = Math.hypot(px, py);
      var strength = Math.max(0.25, 1 - dist * 0.28);
      d.el.style.setProperty("--rx", (-py * 11 * strength).toFixed(2) + "deg");
      d.el.style.setProperty("--ry", (px * 13 * strength).toFixed(2) + "deg");
      var lx = ((cx - r.left) / Math.max(1, r.width)) * 100;
      var ly = ((cy - r.top) / Math.max(1, r.height)) * 100;
      d.el.style.setProperty("--mx", Math.max(0, Math.min(100, lx)).toFixed(1) + "%");
      d.el.style.setProperty("--my", Math.max(0, Math.min(100, ly)).toFixed(1) + "%");
    });
  }
  if (!(reduce && reduce.matches)) {
    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseleave", reset);
    if (reduce && reduce.addEventListener) {
      reduce.addEventListener("change", function () {
        if (reduce.matches) {
          root.removeEventListener("mousemove", onMove);
          root.removeEventListener("mouseleave", reset);
          reset();
        } else {
          root.addEventListener("mousemove", onMove);
          root.addEventListener("mouseleave", reset);
        }
      });
    }
  }
})();
