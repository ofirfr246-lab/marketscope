/* MarketScope site script — static, no dependencies. All market data here is EXAMPLE data. */
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

  /* ---------- nav ---------- */
  var burger = $(".burger"), menu = $("#mobile-menu");
  if (burger && menu) burger.addEventListener("click", function () {
    var open = burger.getAttribute("aria-expanded") === "true";
    burger.setAttribute("aria-expanded", String(!open)); menu.hidden = open;
    burger.setAttribute("aria-label", open ? "Open menu" : "Close menu");
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

  /* ---------- hero terminal (EXAMPLE DATA) ---------- */
  var MARKETS = [
    { q: "wireless earbuds", m: "US", verdict: "BUY", conf: "High", s: { demand: 81, competition: 64, saturation: 52, opportunity: 74 },
      price: "$42.80 ▲3.1%", up: true, chart: [38, 39.5, 38.8, 40.2, 41, 40.1, 41.8, 42.5, 41.6, 42.9, 42.2, 42.8],
      comp: [["SoundPeak", "$39.99", "18%", "+2.4%"], ["AeroBuds Co", "$54.00", "14%", "-1.1%"], ["Nordic Audio", "$29.95", "11%", "+0.6%"], ["Pulse&Co", "$47.50", "9%", "-3.2%"], ["EchoLane", "$34.99", "7%", "+1.8%"]],
      ai: "Demand is strong and growing (+12% YoY search interest). The top 3 stores hold 43% share, but there is a clear price gap between $30 and $40 with few well-reviewed listings. Main risk: heavy ad competition in Q4." },
    { q: "yoga mats", m: "DE", verdict: "HOLD", conf: "Medium", s: { demand: 58, competition: 71, saturation: 69, opportunity: 47 },
      price: "€31.40 ▼1.4%", up: false, chart: [33, 32.6, 33.1, 32.4, 32.8, 32, 31.9, 32.2, 31.5, 31.8, 31.2, 31.4],
      comp: [["FlowMat", "€29.90", "21%", "-0.8%"], ["ZenGrip", "€39.00", "16%", "-2.0%"], ["Asana Haus", "€24.95", "12%", "+0.4%"], ["CoreForm", "€34.50", "8%", "-1.5%"], ["Leaf Studio", "€27.00", "6%", "+0.9%"]],
      ai: "Demand is stable but flat, and the market is crowded with similar products competing on price. Opportunity exists only with a differentiated angle, such as eco-materials or a premium travel mat. Consider watching for 60 days." },
    { q: "pet water fountains", m: "UK", verdict: "STRONG BUY", conf: "High", s: { demand: 86, competition: 42, saturation: 35, opportunity: 85 },
      price: "£27.10 ▲5.6%", up: true, chart: [22, 22.8, 23.1, 23.9, 24.2, 24, 25.1, 25.6, 25.9, 26.4, 26.8, 27.1],
      comp: [["PawSpring", "£24.99", "15%", "+3.1%"], ["Kitty Falls", "£32.00", "10%", "+1.2%"], ["Hydropet", "£19.99", "8%", "+4.5%"], ["Whisker&Co", "£29.50", "6%", "+0.2%"], ["Aqua Paws", "£22.00", "5%", "+2.7%"]],
      ai: "Rising demand (+28% YoY) with a fragmented field: no store holds more than 15% share. Reviews highlight noise and cleaning pain points, a clear product gap. Watch supplier lead times ahead of winter." }
  ];
  var term = $(".terminal"), typer;
  function renderMarket(i) {
    var d = MARKETS[i]; if (!term) return;
    $("#t-cmd-q").textContent = '"' + d.q + '"'; $("#t-cmd-m").textContent = d.m;
    setVerdict($("#t-verdict"), d.verdict); $("#t-conf").textContent = d.conf;
    var opp = $("#t-opp"); opp.textContent = d.s.opportunity; opp.style.color = scoreColor("opportunity", d.s.opportunity);
    $$(".terminal .gauge").forEach(function (g) { setRing($(".ring", g), d.s[g.dataset.key], g.dataset.key); });
    var pr = $("#t-price"); pr.textContent = d.price; pr.className = d.up ? "g" : "r";
    var pts = path(d.chart, 300, 110, 10), line = toD(pts);
    $("#t-line").setAttribute("d", line); $("#t-area").setAttribute("d", line + "L300,110L0,110Z");
    $("#t-comp").innerHTML = d.comp.map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + '</td><td class="' + (r[3][0] === "+" ? "g" : "r") + '">' + r[3] + "</td></tr>"; }).join("");
    var adv = $("#t-advisor"), txt = d.ai, k = 0; clearInterval(typer);
    if (reduce) { adv.textContent = txt; return; }
    adv.innerHTML = '<span class="cur"></span>';
    typer = setInterval(function () { k += 3; adv.innerHTML = txt.slice(0, k) + '<span class="cur"></span>'; if (k >= txt.length) { clearInterval(typer); adv.textContent = txt; } }, 18);
  }
  if (term) {
    var tabs = $$(".t-tabs button"), idx = 0, auto;
    tabs.forEach(function (b) { b.addEventListener("click", function () { idx = +b.dataset.market; select(idx); clearInterval(auto); }); });
    function select(i) { tabs.forEach(function (t, j) { t.classList.toggle("active", i === j); t.setAttribute("aria-selected", i === j); }); renderMarket(i); }
    select(0);
    if (!reduce) auto = setInterval(function () { idx = (idx + 1) % MARKETS.length; select(idx); }, 9000);
  }

  /* ---------- ticker (EXAMPLE DATA) ---------- */
  var tk = $("#ticker");
  if (tk) {
    var items = [["EARBUDS·US", "OPP 74", "▲2.1", 1], ["YOGA MATS·DE", "OPP 47", "▼0.8", 0], ["PET FOUNTAIN·UK", "OPP 85", "▲3.4", 1], ["LED STRIPS·CA", "OPP 39", "▼1.9", 0], ["AIR FRYER·AU", "OPP 61", "▲0.7", 1], ["PHONE CASE·US", "OPP 28", "▼2.6", 0], ["SMART RING·UK", "OPP 69", "▲4.2", 1], ["DESK LAMP·FR", "OPP 55", "▲0.3", 1], ["HAIR DRYER·IL", "OPP 63", "▲1.1", 1], ["KNIFE SET·US", "OPP 44", "▼0.5", 0], ["PROTEIN SHAKER·DE", "OPP 52", "▲0.9", 1], ["DOG BED·US", "OPP 58", "▼0.4", 0]];
    var html = items.map(function (x) { return "<span><b>" + x[0] + "</b>" + x[1] + ' <i class="' + (x[3] ? "g" : "r") + '" style="font-style:normal">' + x[2] + "</i></span>"; }).join("");
    tk.innerHTML = html + html;
  }

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
          '<a class="btn btn-amber" href="signup.html?plan=' + p.id + '">' + p.cta + "</a></div>";
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
        return v === true ? '<td class="yes' + hl + '" aria-label="Included">✓</td>' : v === false ? '<td class="no' + hl + '" aria-label="Not included">—</td>' : '<td class="' + hl + '">' + v + "</td>"; }).join("") + "</tr>";
    }).join("");
    mx.innerHTML = head + "<tbody>" + body + "</tbody>";
  }
  var tu = $("#topups");
  if (tu) tu.innerHTML = C.topups.map(function (t) {
    return '<div class="topup">' + (t.tag ? '<span class="t chip live">' + t.tag + "</span>" : "") + '<span class="c">' + t.credits + ' <small class="muted" style="font-size:.9rem">credits</small></span><span class="p">' + money(t.price) + '</span><span class="u">' + money(t.price / t.credits) + " per credit · kept while your account is active</span></div>";
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
        var l = store.get("marketscope_contact", []);
        l.push({ at: new Date().toISOString(), email: emailVal, name: nameVal, message: messageVal, page: location.pathname });
        store.set("marketscope_contact", l);
        submitLead({ email: emailVal, source: leadSource(f, "contact"), name: nameVal, message: messageVal, page: location.pathname });
      }
      msg.className = "form-msg ok";
      msg.textContent = { contact: "✓ Thanks! Your message was sent. We'll get back to you at the email you provided.", login: "This is a UI preview. Accounts open soon — join the waitlist on the home page.", signup: "✓ Looks good! Sign-up opens soon. This preview doesn't create accounts yet." }[kind];
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

  /* ---------- page charts (EXAMPLE DATA) ---------- */
  var c1 = $("#chart-price"); if (c1) lineChart(c1, { labels: MONTHS, fmt: function (v) { return "$" + v.toFixed(0); }, series: [
    { data: [38, 39.5, 38.8, 40.2, 41, 40.1, 41.8, 42.5, 41.6, 42.9, 42.2, 42.8], color: "#ffb000", area: true },
    { data: [31, 31.4, 30.9, 31.8, 32.2, 31.9, 32.6, 33.1, 32.7, 33.4, 33.2, 33.5], color: "#19d27c" },
    { data: [55, 54.2, 55.1, 54.8, 56, 55.3, 56.4, 57.2, 56.8, 57.5, 57.1, 57.9], color: "#4da3ff", dash: "5 5" }] });
  var c2 = $("#chart-demand"); if (c2) lineChart(c2, { labels: MONTHS, min: 0, max: 100, series: [
    { data: [58, 61, 57, 60, 63, 62, 66, 70, 68, 74, 88, 96], color: "#19d27c", area: true },
    { data: [52, 54, 51, 53, 56, 55, 58, 61, 60, 64, 77, 85], color: "#5d6672", dash: "4 4" }] });
  var c3 = $("#chart-bands"); if (c3) barChart(c3, { labels: ["<$20", "$20–30", "$30–40", "$40–60", "$60–100", "$100+"], data: [14, 31, 9, 24, 15, 7], fmt: function (v) { return Math.round(v) + "%"; }, colors: ["#5d6672", "#ffb000", "#19d27c", "#ffb000", "#ffb000", "#5d6672"] });
  var c4 = $("#chart-terminal"); if (c4) lineChart(c4, { labels: MONTHS, min: 0, max: 100, series: [
    { data: [62, 64, 63, 66, 68, 67, 70, 71, 70, 73, 72, 74], color: "#ffb000", area: true },
    { data: [70, 71, 69, 72, 73, 75, 76, 78, 77, 79, 80, 81], color: "#19d27c" },
    { data: [55, 56, 57, 58, 58, 60, 61, 61, 62, 63, 63, 64], color: "#ff4d5e", dash: "4 4" }] });
  $$("svg[data-spark]").forEach(function (s) {
    var d = s.dataset.spark.split(",").map(Number), pts = path(d, 100, 30, 3); s.setAttribute("viewBox", "0 0 100 30"); s.setAttribute("preserveAspectRatio", "none");
    el("path", { d: toD(pts), fill: "none", stroke: d[d.length - 1] >= d[0] ? "#19d27c" : "#ff4d5e", "stroke-width": 1.6, "vector-effect": "non-scaling-stroke" }, s);
  });

  /* ---------- app preview views ---------- */
  var side = $(".side");
  if (side) {
    $$("button[data-view]", side).forEach(function (b) { b.addEventListener("click", function () {
      $$("button[data-view]", side).forEach(function (x) { x.classList.toggle("active", x === b); });
      $$(".view").forEach(function (v) { v.classList.toggle("active", v.id === "view-" + b.dataset.view); });
      var vt = $("#view-title"); if (vt) vt.textContent = b.dataset.title || b.textContent.trim();
      if (b.dataset.view === "terminal" && c4) lineChart(c4, { labels: MONTHS, min: 0, max: 100, series: [
        { data: [62, 64, 63, 66, 68, 67, 70, 71, 70, 73, 72, 74], color: "#ffb000", area: true },
        { data: [70, 71, 69, 72, 73, 75, 76, 78, 77, 79, 80, 81], color: "#19d27c" },
        { data: [55, 56, 57, 58, 58, 60, 61, 61, 62, 63, 63, 64], color: "#ff4d5e", dash: "4 4" }] });
    }); });
    $$(".list-table tbody tr").forEach(function (r) { r.addEventListener("click", function () { location.href = "demo.html"; }); });
  }
})();
