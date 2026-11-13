/* Hydrate marketing/demo/product sample reports and the landing hero
   from assets/data/live-snapshot.json. Nothing here is invented. */
(function (g) {
  "use strict";
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function money(n) {
    if (n == null || !isFinite(Number(n))) return "—";
    return "$" + (Math.round(Number(n) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function num(n) { return n == null ? "—" : Number(n).toLocaleString("en-US"); }
  function trendLabel(slope) {
    if (slope == null || !isFinite(Number(slope))) return "—";
    var p = Number(slope) * 100;
    if (Math.abs(p) < 5) return "Roughly stable (" + (p >= 0 ? "+" : "") + p.toFixed(1) + "%)";
    return (p >= 0 ? "Up " : "Down ") + Math.abs(p).toFixed(1) + "% (last 3 months vs prior 3)";
  }
  function pickProduct(snap) {
    var list = (snap && snap.products) || [];
    var want = list.filter(function (p) { return p.ticker === "MAGMOUNT-US" || /magnetic phone mount/i.test(p.query || p.product || ""); })[0];
    return want || list[0] || null;
  }
  function advisorText(p) {
    if (p.advisor) return p.advisor;
    var d = p.demand_detail || {}, pr = p.prices || {}, sc = p.scores || {};
    var parts = [];
    parts.push("For “" + (p.product || p.query) + "” in " + (p.market || "the United States") + ".");
    if (d.search_volume != null) parts.push("Google Ads monthly search volume is " + num(d.search_volume) + ".");
    if (d.trend_slope != null) parts.push("12-month demand trend: " + trendLabel(d.trend_slope) + ".");
    if (sc.demand != null) parts.push("Demand " + sc.demand + ", competition " + sc.competition + ", saturation " + sc.saturation + ", opportunity " + sc.opportunity + " — verdict " + (p.verdict || "—") + ".");
    if (pr.listing_count != null) parts.push(pr.listing_count + " Google Shopping listings from " + (pr.seller_count != null ? pr.seller_count : "—") + " sellers, priced " + money(pr.min) + "–" + money(pr.max) + " (median " + money(pr.median) + ").");
    if (pr.recommended_band) parts.push("Recommended selling band " + money(pr.recommended_band.low) + "–" + money(pr.recommended_band.high) + ".");
    return parts.join(" ");
  }
  function setText(sel, val) {
    $$(sel).forEach(function (el) { el.textContent = val; });
  }
  function hydrateHero(p, snap) {
    var d = p.demand_detail || {}, pr = p.prices || {}, sc = p.scores || {};
    var qEl = $("#t-cmd-q"); if (qEl) qEl.textContent = '"' + (p.query || p.product) + '"';
    var mEl = $("#t-cmd-m"); if (mEl) mEl.textContent = p.market_code || "US";
    if (g.MS && g.MS.setVerdict && $("#t-verdict")) g.MS.setVerdict($("#t-verdict"), p.verdict || "HOLD");
    else if ($("#t-verdict")) $("#t-verdict").textContent = p.verdict || "—";
    var opp = $("#t-opp");
    if (opp) {
      opp.textContent = sc.opportunity != null ? sc.opportunity : "—";
      if (g.MS && g.MS.setRing) { /* color via score helper if present */ }
    }
    $$(".terminal .gauge").forEach(function (gEl) {
      var key = gEl.dataset.key;
      var ring = gEl.querySelector(".ring");
      if (ring && g.MS && g.MS.setRing && sc[key] != null) g.MS.setRing(ring, sc[key], key);
    });
    var stats = {
      "Monthly searches": d.search_volume != null ? num(d.search_volume) + "/mo" : "—",
      "12-MONTH TREND": trendLabel(d.trend_slope),
      "CPC": d.cpc != null ? "~" + money(d.cpc) : "—",
      "LISTINGS": pr.listing_count != null ? String(pr.listing_count) : "—",
      "Price range": (pr.min != null ? money(pr.min) + "–" + money(pr.max) : "—"),
      "MEDIAN": money(pr.median),
      "Recommended price range": pr.recommended_band ? (money(pr.recommended_band.low) + "–" + money(pr.recommended_band.high)) : "—"
    };
    $$(".hero-stats > div").forEach(function (box) {
      var k = (box.querySelector(".k") || {}).textContent || "";
      var v = box.querySelector(".v");
      if (v && stats[k]) v.textContent = stats[k];
      if (k === "LISTINGS") {
        var dEl = box.querySelector(".d");
        if (dEl) dEl.textContent = pr.seller_count != null ? ("from " + pr.seller_count + " sellers") : "";
      }
    });
    var comp = $("#t-comp");
    if (comp) {
      var rows = (p.competitors || []).slice(0, 5);
      var total = rows.reduce(function (s, r) { return s + Number(r.listings || 0); }, 0) || (pr.listing_count || 1);
      /* Prefer explicit listing share when the competitor row has it; else compute from listings. */
      comp.innerHTML = rows.map(function (r) {
        var share = r.share != null ? r.share : (r.listings != null ? r.listings / total : null);
        var label = share == null ? "—" : (share <= 1 ? (share * 100).toFixed(0) + "%" : share + "%");
        return "<tr><td>" + (r.seller || "—") + "</td><td>" + label + "</td></tr>";
      }).join("");
    }
    var adv = $("#t-advisor");
    if (adv) adv.textContent = advisorText(p);
  }
  function hydrateDemo(p, snap) {
    var d = p.demand_detail || {}, pr = p.prices || {}, sc = p.scores || {};
    $$("[data-live-product]").forEach(function (el) { el.textContent = p.product || p.query; });
    $$("[data-live-market]").forEach(function (el) { el.textContent = p.market || "United States"; });
    $$("[data-live-verdict]").forEach(function (el) { el.textContent = p.verdict || "—"; });
    $$("[data-verdict]").forEach(function (el) {
      if (g.MS && g.MS.setVerdict) g.MS.setVerdict(el, p.verdict || "HOLD");
      else el.textContent = p.verdict || "—";
    });
    var oppEl = $("#demo-opp") || $("#t-opp");
    if (oppEl && sc.opportunity != null) oppEl.textContent = sc.opportunity;
    $$("[data-live-advisor]").forEach(function (el) { el.textContent = advisorText(p); });
    $$(".score-card").forEach(function (card) {
      var h = card.querySelector("h3");
      var ring = card.querySelector("[data-ring]");
      if (!h || !ring) return;
      var key = (h.textContent || "").trim().toLowerCase();
      if (sc[key] != null) {
        ring.setAttribute("data-ring", String(sc[key]));
        if (g.MS && g.MS.setRing) g.MS.setRing(ring, sc[key], key);
        var pEl = card.querySelector("p");
        if (pEl && key === "saturation") {
          pEl.textContent = sc.saturation + "/100" + (pr.listing_count != null ? (". " + pr.listing_count + " Google Shopping listings" + (pr.seller_count != null ? " from " + pr.seller_count + " sellers." : ".")) : ".");
        } else if (pEl && key === "demand" && d.search_volume != null) {
          pEl.textContent = sc.demand + "/100. Google Ads volume " + num(d.search_volume) + "/mo. " + trendLabel(d.trend_slope) + ".";
        } else if (pEl && sc[key] != null) {
          pEl.textContent = sc[key] + "/100" + (key === "opportunity" && p.verdict ? ", verdict " + p.verdict + "." : ".");
        }
      }
    });
    function setStat(k, value, detail) {
      $$(".stat").forEach(function (box) {
        var label = ((box.querySelector(".k") || {}).textContent || "").trim();
        if (label !== k) return;
        var v = box.querySelector(".v");
        var dd = box.querySelector(".d");
        if (v) v.textContent = value;
        if (dd && detail != null) dd.textContent = detail;
      });
    }
    if (d.search_volume != null) setStat("Monthly searches", num(d.search_volume) + "/mo", "Google Ads");
    setStat("12-MONTH TREND", trendLabel(d.trend_slope), "last 3 months vs prior 3");
    if (d.cpc != null) setStat("CPC", "~" + money(d.cpc), "Google Ads");
    if (pr.listing_count != null) setStat("LISTINGS", String(pr.listing_count), pr.seller_count != null ? ("from " + pr.seller_count + " sellers") : "");
    if (pr.min != null) setStat("Price range", money(pr.min) + "–" + money(pr.max), "Google Shopping");
    if (pr.median != null) { setStat("MEDIAN", money(pr.median), "Google Shopping"); setStat("MEDIAN PRICE", money(pr.median), "Google Shopping"); }
    if (pr.recommended_band) setStat("Recommended price range", money(pr.recommended_band.low) + "–" + money(pr.recommended_band.high), pr.recommended_rule || "");
    var comps = (p.competitors || []).slice();
    if (comps.length) {
      var top3 = comps.slice(0, 3);
      var share3 = top3.reduce(function (s, r) { return s + (Number(r.share) || 0); }, 0);
      var bits = top3.map(function (r) { return (Number(r.share) * 100).toFixed(0) + "%"; }).join(" + ");
      setStat("TOP-3 LISTING SHARE", (share3 * 100).toFixed(0) + "%", bits);
    }
    var table = $("[data-demo-competitors]");
    if (table && comps.length) {
      var tb = table.tBodies[0] || table;
      var rows = comps.map(function (r, i) {
        var share = r.share != null ? (Number(r.share) * 100).toFixed(1) + "%" : "—";
        return "<tr><td>" + (i + 1) + "</td><td>" + (r.seller || "—") + "</td><td>" + share + "</td></tr>";
      }).join("");
      if (table.tBodies[0]) table.tBodies[0].innerHTML = rows;
    }
    var oppUl = $("[data-live-opportunities]");
    if (oppUl && (p.opportunities || []).length) {
      oppUl.innerHTML = p.opportunities.map(function (x) { return "<li>" + x + "</li>"; }).join("");
    }
    var riskUl = $("[data-live-risks]");
    if (riskUl && (p.risks || []).length) {
      riskUl.innerHTML = p.risks.map(function (x) { return "<li>" + x + "</li>"; }).join("");
    }
  }

  function displayProduct(t) {
    var s = (t && (t.product || t.query || t.ticker)) || "";
    return s.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
  }
  function hydrateTicker(snap) {
    var tk = $("#ticker");
    var label = document.querySelector(".ticker .ticker-label, #ticker") && document.querySelector(".ticker .ticker-label");
    if (label) label.innerHTML = "LIVE&nbsp;SNAPSHOT · US";
    var tape = document.querySelector(".ticker");
    if (tape) tape.setAttribute("aria-label", "Live US snapshot tape — last is median Google Shopping price, change is search-demand last 3 months vs prior 3");
    if (!tk) return;
    var items = ((g.MSData && g.MSData.tickers) || []).map(function (t) {
      var chg = t.chg;
      var chgStr = chg == null ? "—" : ((chg >= 0 ? "▲" : "▼") + Math.abs(chg).toFixed(1));
      var cls = chg == null ? "muted" : (chg >= 0 ? "g" : "r");
      var px = t.price != null ? money(t.price) : "—";
      return "<span><b>" + displayProduct(t) + "</b> " + px + ' <i class="' + cls + '" style="font-style:normal">' + chgStr + "</i></span>";
    }).join("");
    if (items) tk.innerHTML = items + items;
  }
  function hydrateCharts(p) {
    var months = (p.demand_detail && p.demand_detail.monthly_searches) || p.monthly_searches || [];
    var samples = (p.prices && p.prices.samples) || [];
    var hosts = $$("[data-hero-chart], [data-demo-chart], [data-product-chart], #chart-terminal-host, #chart-demand-host");
    hosts.forEach(function (h) {
      if (g.MSTrading) g.MSTrading.mountDemandChart(h, { monthly_searches: months, timeframe: "12M", height: 320 });
    });
    $$("[data-price-hist], #chart-bands-host").forEach(function (h) {
      if (g.MSTrading) g.MSTrading.mountPriceHistogram(h, { samples: samples, currency: (p.prices && p.prices.currency) || "USD", band: p.prices && p.prices.recommended_band });
    });
    /* Replace invented SVG series on product/app pages when a real demand series exists. */
    var demandVals = months.map(function (m) { return Number(m.search_volume); }).filter(function (n) { return isFinite(n); });
    if (demandVals.length && g.MS && g.MS.lineChart) {
      var labels = months.map(function (m) {
        return new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
      });
      var c2 = $("#chart-demand");
      if (c2) g.MS.lineChart(c2, { labels: labels, min: 0, series: [{ data: demandVals, color: "#19d27c", area: true }] });
      var c4 = $("#chart-terminal");
      if (c4) g.MS.lineChart(c4, { labels: labels, min: 0, series: [{ data: demandVals, color: "#ffb000", area: true }] });
    }
    /* Do not draw a fake price history on #chart-price — label it. */
    var c1 = $("#chart-price");
    if (c1) {
      var note = c1.parentNode && c1.parentNode.querySelector(".chart-note");
      if (!note && c1.parentNode) {
        note = document.createElement("p");
        note.className = "fine chart-note";
        c1.parentNode.appendChild(note);
      }
      if (note) note.textContent = "Coming soon — we have a current median Google Shopping price, not a 12-month price history. The demand candles below use real monthly search volume.";
    }
  }
  function hydrateAppPreview(p, snap) {
    $$(".tag-example").forEach(function (el) {
      if (/EXAMPLE DATA/.test(el.textContent) && el.closest && (el.closest(".mock") || el.closest("#view-dashboard") || el.closest(".mock-head"))) {
        el.textContent = "LIVE SNAPSHOT";
        el.classList.remove("tag-example");
        el.classList.add("tag-live");
      }
    });
    var chat = document.querySelector("#view-dashboard .msg.ai, .view .msg.ai");
    if (chat && p) chat.textContent = advisorText(p);
  }

  function run(api) {
    var snap = g.MS_SNAPSHOT;
    if (!snap) return;
    var p = pickProduct(snap);
    if (!p) return;
    hydrateHero(p, snap);
    hydrateDemo(p, snap);
    hydrateTicker(snap);
    hydrateCharts(p);
    hydrateAppPreview(p, snap);
  }

  function start() {
    var ready = g.MSData && g.MSData.ready;
    if (!ready) return;
    ready.then(run).catch(function (e) { console.warn("live snapshot", e); });
  }
  if (g.MSData) start();
  else document.addEventListener("DOMContentLoaded", start);
})(window);
