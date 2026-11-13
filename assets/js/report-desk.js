/* MarketScope — trading-desk widgets for a live report.
   Frontend only. Charts and ticker chips render solely from values already
   on the report (collector output). Missing data → the widget is hidden.
   No invented series, trends or numbers. */
(function (global) {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

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

  function num(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function sourceOk(block) {
    return !!(block && block.status === "ok" && !block.sandbox);
  }

  function money(n, currency, digits) {
    if (n == null || !isFinite(Number(n))) return "—";
    var cur = currency || "USD";
    var d = digits != null ? digits : (Math.abs(Number(n)) >= 100 ? 0 : 2);
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n));
    } catch (e) {
      return cur + " " + Number(n).toFixed(d);
    }
  }

  function compactInt(n) {
    if (n == null || !isFinite(Number(n))) return "—";
    var x = Number(n);
    if (Math.abs(x) >= 1000000) return (x / 1000000).toFixed(x >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (Math.abs(x) >= 1000) return (x / 1000).toFixed(x >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K";
    return String(Math.round(x));
  }

  function pct(sorted, p) {
    if (!sorted || !sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var i = (sorted.length - 1) * p;
    var lo = Math.floor(i), hi = Math.ceil(i);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (1 - (i - lo)) + sorted[hi] * (i - lo);
  }

  function sortedPrices(list) {
    return (list || []).map(Number).filter(function (n) { return isFinite(n) && n > 0; }).slice().sort(function (a, b) { return a - b; });
  }

  function shoppingSamples(c) {
    var samples = (c.prices && (c.prices.samples || c.prices.price_samples)) || [];
    if (samples.length) return sortedPrices(samples);
    if (c.listings && c.listings.length) {
      return sortedPrices(c.listings.map(function (L) { return L.price; }));
    }
    return [];
  }

  /* ---------- ticker tape ---------- */
  function tickerChips(c) {
    var chips = [];
    var cur = (c.prices && c.prices.currency) || (c.amazon && c.amazon.prices && c.amazon.prices.currency) || "USD";
    var p = c.prices || {};
    if (num(p.median) != null) chips.push({ k: "Median price", v: money(p.median, cur), title: "Median Google Shopping price in this snapshot" });
    if (num(p.seller_count) != null) chips.push({ k: "Sellers", v: String(Math.round(p.seller_count)), title: "Distinct sellers on Google Shopping" });
    if (num(p.listing_count) != null) chips.push({ k: "Listings", v: String(Math.round(p.listing_count)), title: "Google Shopping listings in this snapshot" });
    var vol = c.demand_detail && num(c.demand_detail.search_volume);
    if (vol != null) chips.push({ k: "Monthly searches", v: compactInt(vol), title: "Google Ads monthly search volume" });
    if (c.demand_detail && num(c.demand_detail.cpc) != null) {
      chips.push({ k: "CPC", v: money(c.demand_detail.cpc, cur), title: "Google Ads average CPC" });
    }
    var amz = c.amazon;
    if (sourceOk(amz) && amz.prices && num(amz.prices.median) != null) {
      chips.push({ k: "Amazon median", v: money(amz.prices.median, amz.prices.currency || cur), title: "Median organic Amazon listing price" });
    }
    var meta = c.meta_ads;
    if (sourceOk(meta) && num(meta.active_ads) != null) {
      chips.push({ k: "Meta ads", v: String(meta.active_ads) + (meta.capped ? "+" : ""), title: "Active ads in the Meta Ad Library sample" });
      if (num(meta.advertisers_count) != null) chips.push({ k: "Advertisers", v: String(meta.advertisers_count), title: "Distinct advertisers in the Meta sample" });
      if (meta.days_running && num(meta.days_running.median) != null) {
        chips.push({ k: "Ad longevity", v: Math.round(meta.days_running.median) + "d median", title: "Median days running among active Meta ads in the sample" });
      }
    }
    var tt = c.tiktok;
    if (sourceOk(tt) && num(tt.videos) != null && tt.videos > 0) {
      chips.push({ k: "TikTok videos", v: String(tt.videos) + (tt.capped ? "+" : ""), title: "TikTok videos in this sample" });
      if (tt.views && num(tt.views.median) != null) chips.push({ k: "TikTok median views", v: compactInt(tt.views.median), title: "Median views among sampled TikTok videos" });
    }
    var ali = c.aliexpress;
    if (sourceOk(ali) && ali.landed_cost && num(ali.landed_cost.median) != null) {
      chips.push({ k: "Landed cost", v: money(ali.landed_cost.median, ali.currency || cur), title: ali.landed_cost.basis || "Median AliExpress landed cost" });
    }
    var profit = c.profit;
    if (profit && profit.status === "ok" && profit.scenarios && profit.scenarios[0] && num(profit.scenarios[0].gross_margin) != null) {
      var s0 = profit.scenarios[0];
      chips.push({ k: "Gross margin", v: Math.round(s0.gross_margin * 100) + "%", title: "Gross margin at the " + s0.source + " recommended-band midpoint, before ads" });
    }
    var shop = c.shopify;
    if (sourceOk(shop) && num(shop.store_count) != null) {
      chips.push({ k: "Shopify stores", v: String(shop.store_count) + (shop.capped ? "+" : ""), title: "Distinct Shopify stores in this sample" });
    }
    return chips;
  }

  function mountTicker(panel, c) {
    var chips = tickerChips(c);
    if (!chips.length) return null;
    var el = document.createElement("div");
    el.className = "desk-tape";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Key figures from this report");
    el.innerHTML = '<div class="desk-tape-track">' + chips.map(function (ch) {
      return '<span class="desk-chip"' + (ch.title ? ' title="' + escapeHtml(ch.title) + '"' : "") + ">" +
        '<span class="k">' + escapeHtml(ch.k) + '</span><span class="v">' + escapeHtml(ch.v) + "</span></span>";
    }).join("") + "</div>";
    var head = panel.querySelector(".report-view-head");
    if (head && head.parentNode) head.parentNode.insertBefore(el, head);
    else panel.insertBefore(el, panel.firstChild);
    return el;
  }

  /* ---------- score vs 50 ---------- */
  var BEARISH = { competition: true, saturation: true };

  function enhanceScores(panel) {
    $$(".score-card", panel).forEach(function (card) {
      card.classList.remove("is-bull", "is-bear");
      $$(".score-vs", card).forEach(function (n) { n.parentNode.removeChild(n); });
      var h = $("h3", card);
      var key = (card.getAttribute("data-score-key") || (h && h.textContent) || "").toLowerCase().trim();
      var ring = $("[data-count-to], .ring-plain", card);
      var raw = ring && (ring.getAttribute("data-count-to") || ring.textContent);
      var n = num(raw);
      if (n == null) return;
      var bearish = !!BEARISH[key];
      var above = n >= 50;
      var bull = bearish ? !above : above;
      card.classList.add(bull ? "is-bull" : "is-bear");
      var delta = Math.round(n - 50);
      var vs = document.createElement("p");
      vs.className = "score-vs mono " + (bull ? "g" : "r");
      vs.textContent = (delta > 0 ? "+" : "") + delta + " vs 50" + (bearish ? (above ? " · crowded" : " · quieter") : (above ? " · constructive" : " · soft"));
      var copy = $("div:last-child", card) || card;
      copy.appendChild(vs);
    });
  }

  /* ---------- price curve ---------- */
  function mountPriceCurve(host, c, opts) {
    var samples = shoppingSamples(c);
    if (samples.length < 2) return false;
    var cur = (c.prices && c.prices.currency) || "USD";
    var p25 = pct(samples, 0.25);
    var p75 = pct(samples, 0.75);
    var min = num(c.prices && c.prices.min);
    var max = num(c.prices && c.prices.max);
    var med = num(c.prices && c.prices.median);
    if (min == null) min = samples[0];
    if (max == null) max = samples[samples.length - 1];
    if (med == null) med = pct(samples, 0.5);
    if (min > samples[0]) min = samples[0];
    if (max < samples[samples.length - 1]) max = samples[samples.length - 1];
    var band = c.prices && c.prices.recommended_band;
    var W = 640, H = 260;
    var pad = { l: 56, r: 18, t: 18, b: 32 };
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var span = max - min || 1;
    function xAt(i) { return pad.l + (samples.length === 1 ? iw / 2 : (i / (samples.length - 1)) * iw); }
    function yAt(v) { return pad.t + (1 - (v - min) / span) * ih; }

    var pts = samples.map(function (v, i) { return { x: xAt(i), y: yAt(v), v: v, i: i }; });
    var dLine = pts.map(function (p, i) { return (i ? "L" : "M") + p.x.toFixed(2) + " " + p.y.toFixed(2); }).join(" ");
    var dArea = dLine + " L" + pts[pts.length - 1].x.toFixed(2) + " " + (pad.t + ih) + " L" + pts[0].x.toFixed(2) + " " + (pad.t + ih) + " Z";

    function hLine(v, cls, label) {
      if (v == null) return "";
      var y = yAt(v);
      return '<line class="' + cls + '" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y.toFixed(2) + '" y2="' + y.toFixed(2) + '" />' +
        '<text class="desk-svg-label" x="' + (W - pad.r - 2) + '" y="' + (y - 4).toFixed(2) + '" text-anchor="end">' + escapeHtml(label) + "</text>";
    }

    var ticks = [min, med, max].filter(function (v, i, a) { return v != null && a.indexOf(v) === i; });
    var yTicks = ticks.map(function (v) {
      return '<line class="desk-grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + yAt(v).toFixed(2) + '" y2="' + yAt(v).toFixed(2) + '" />' +
        '<text class="desk-svg-axis" x="' + (pad.l - 6) + '" y="' + (yAt(v) + 3).toFixed(2) + '" text-anchor="end">' + escapeHtml(money(v, cur)) + "</text>";
    }).join("");

    var bandRect = "";
    if (p25 != null && p75 != null && p75 > p25) {
      var y75 = yAt(p75), y25 = yAt(p25);
      bandRect = '<rect class="desk-band" x="' + pad.l + '" y="' + y75.toFixed(2) + '" width="' + iw + '" height="' + Math.max(1, y25 - y75).toFixed(2) + '" />';
    }

    var recBand = "";
    var medianLabel = "Median " + money(med, cur);
    if (band && num(band.low) != null && num(band.high) != null) {
      recBand = hLine(band.low, "desk-ref-band", "") + hLine(band.high, "desk-ref-band", "");
      var far = Math.abs(yAt(band.high) - yAt(med)) >= Math.abs(yAt(band.low) - yAt(med)) ? band.high : band.low;
      if (Math.abs(yAt(far) - yAt(med)) >= 14) recBand += '<text class="desk-svg-label" x="' + (W - pad.r - 2) + '" y="' + (yAt(far) - 4).toFixed(2) + '" text-anchor="end">' + escapeHtml("Band " + money(band.low, cur) + "–" + money(band.high, cur)) + "</text>";
      else medianLabel = "Median " + money(med, cur) + " · band " + money(band.low, cur) + "–" + money(band.high, cur);
    }

    var last = pts[pts.length - 1];
    var summary = samples.length + " Google Shopping prices, sorted low to high. Range " + money(min, cur) + "–" + money(max, cur) +
      "; median " + money(med, cur) + "; P25–P75 " + money(p25, cur) + "–" + money(p75, cur) + ".";

    host.className = "desk-card desk-curve";
    host.innerHTML =
      "<h3 class=\"desk-h mono\">Sorted listing prices</h3>" +
      "<p class=\"desk-sub muted\">Each point is one Google Shopping price in this snapshot, sorted. The gold band is the 25th–75th percentile. Nothing here is a time series.</p>" +
      '<div class="desk-svg-wrap">' +
        '<svg class="desk-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + escapeHtml(summary) + '">' +
          '<rect class="desk-plot" x="' + pad.l + '" y="' + pad.t + '" width="' + iw + '" height="' + ih + '" />' +
          yTicks + bandRect + recBand +
          hLine(med, "desk-median", medianLabel) +
          '<path class="desk-area" d="' + dArea + '" />' +
          '<path class="desk-line" d="' + dLine + '" />' +
          '<circle class="desk-pulse" cx="' + last.x.toFixed(2) + '" cy="' + last.y.toFixed(2) + '" r="4.5" />' +
          '<line class="desk-cross-v" hidden x1="0" x2="0" y1="' + pad.t + '" y2="' + (pad.t + ih) + '" />' +
          '<circle class="desk-hover-dot" hidden r="4" />' +
        "</svg>" +
        '<div class="desk-tip mono" hidden></div>' +
      "</div>" +
      '<p class="desk-cap mono">' + escapeHtml(summary) + "</p>";

    var svg = $("svg", host);
    var tip = $(".desk-tip", host);
    var cross = $(".desk-cross-v", host);
    var dot = $(".desk-hover-dot", host);
    var line = $(".desk-line", host);

    if (line && opts && opts.reveal && !reducedMotion()) {
      try {
        var len = line.getTotalLength();
        line.style.strokeDasharray = String(len);
        line.style.strokeDashoffset = String(len);
        line.getBoundingClientRect();
        line.classList.add("is-drawing");
        line.style.strokeDashoffset = "0";
      } catch (e) { /* ignore */ }
    }

    function hit(evt) {
      var rect = svg.getBoundingClientRect();
      var px = ((evt.clientX - rect.left) / rect.width) * W;
      var best = pts[0], bd = Infinity;
      pts.forEach(function (p) {
        var d = Math.abs(p.x - px);
        if (d < bd) { bd = d; best = p; }
      });
      return best;
    }

    function show(p, evt) {
      cross.removeAttribute("hidden");
      dot.removeAttribute("hidden");
      cross.setAttribute("x1", p.x.toFixed(2));
      cross.setAttribute("x2", p.x.toFixed(2));
      dot.setAttribute("cx", p.x.toFixed(2));
      dot.setAttribute("cy", p.y.toFixed(2));
      tip.hidden = false;
      tip.textContent = "Listing " + (p.i + 1) + " of " + samples.length + " · " + money(p.v, cur);
      var wrap = $(".desk-svg-wrap", host);
      var wr = wrap.getBoundingClientRect();
      var x = evt.clientX - wr.left + 12;
      var y = evt.clientY - wr.top - 28;
      if (x + tip.offsetWidth > wr.width - 8) x = wr.width - tip.offsetWidth - 8;
      if (y < 4) y = evt.clientY - wr.top + 16;
      tip.style.left = Math.max(4, x) + "px";
      tip.style.top = y + "px";
    }

    function hide() {
      cross.setAttribute("hidden", "");
      dot.setAttribute("hidden", "");
      tip.hidden = true;
    }

    svg.addEventListener("mousemove", function (e) { show(hit(e), e); });
    svg.addEventListener("mouseleave", hide);
    return true;
  }

  /* ---------- per-source price boxes ---------- */
  function sourceRanges(c) {
    var cur = (c.prices && c.prices.currency) || "USD";
    var rows = [];
    var shop = shoppingSamples(c);
    if (shop.length >= 2) {
      rows.push({
        name: "Google Shopping",
        currency: cur,
        min: shop[0], p25: pct(shop, 0.25), median: pct(shop, 0.5), p75: pct(shop, 0.75), max: shop[shop.length - 1],
        n: shop.length,
        kind: "Retail listings"
      });
    } else if (c.prices && num(c.prices.min) != null && num(c.prices.max) != null) {
      rows.push({
        name: "Google Shopping",
        currency: c.prices.currency || cur,
        min: c.prices.min, p25: null, median: c.prices.median, p75: null, max: c.prices.max,
        n: c.prices.listing_count || null,
        kind: "Retail listings"
      });
    }
    var amz = c.amazon;
    if (sourceOk(amz) && amz.prices && (amz.prices.currency || cur) === cur && num(amz.prices.min) != null && num(amz.prices.max) != null) {
      var ap = amz.prices;
      rows.push({ name: "Amazon", currency: cur, min: ap.min, p25: ap.p25, median: ap.median, p75: ap.p75, max: ap.max, n: (ap.samples && ap.samples.length) || null, kind: "Retail listings" });
    }
    var shopify = c.shopify;
    if (sourceOk(shopify) && shopify.price && (shopify.currency || cur) === cur && num(shopify.price.min) != null && num(shopify.price.max) != null) {
      var sp = shopify.price;
      rows.push({ name: "Shopify", currency: cur, min: sp.min, p25: sp.p25, median: sp.median, p75: sp.p75, max: sp.max, n: sp.of, kind: "Retail listings" });
    }
    var ali = c.aliexpress;
    if (sourceOk(ali) && (ali.currency || cur) === cur && ali.cost_band && num(ali.cost_band.low) != null && num(ali.cost_band.high) != null) {
      rows.push({
        name: "AliExpress unit",
        currency: cur,
        min: ali.cost_band.low, p25: ali.cost_band.low, median: ali.cost_band.median, p75: ali.cost_band.high, max: ali.cost_band.high,
        n: (ali.suppliers && ali.suppliers.length) || ali.listings_returned,
        kind: "Supplier unit (P25–P75)"
      });
    }
    if (sourceOk(ali) && (ali.currency || cur) === cur && ali.landed_cost && num(ali.landed_cost.low) != null && num(ali.landed_cost.median) != null) {
      var lo = ali.landed_cost.low, mid = ali.landed_cost.median;
      rows.push({
        name: "AliExpress landed",
        currency: cur,
        min: lo, p25: lo, median: mid, p75: mid, max: mid,
        n: ali.shipping_coverage && ali.shipping_coverage.known,
        kind: "Unit + shipping"
      });
    }
    return rows;
  }

  function mountBoxes(host, c) {
    var rows = sourceRanges(c);
    if (!rows.length) return false;
    var cur = rows[0].currency;
    var vals = [];
    rows.forEach(function (r) { [r.min, r.p25, r.median, r.p75, r.max].forEach(function (v) { if (num(v) != null) vals.push(v); }); });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) max = min + 1;
    var W = 640, H = 260;
    var pad = { l: 56, r: 16, t: 16, b: 48 };
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    function yAt(v) { return pad.t + (1 - (v - min) / (max - min)) * ih; }
    var colW = iw / rows.length;
    var boxW = Math.min(36, colW * 0.38);

    var yTicks = [min, (min + max) / 2, max].map(function (v) {
      return '<line class="desk-grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + yAt(v).toFixed(2) + '" y2="' + yAt(v).toFixed(2) + '" />' +
        '<text class="desk-svg-axis" x="' + (pad.l - 6) + '" y="' + (yAt(v) + 3).toFixed(2) + '" text-anchor="end">' + escapeHtml(money(v, cur)) + "</text>";
    }).join("");

    var bodies = rows.map(function (r, i) {
      var cx = pad.l + colW * (i + 0.5);
      var yMin = yAt(r.min), yMax = yAt(r.max), yMed = r.median != null ? yAt(r.median) : null;
      var yLo = r.p25 != null ? yAt(r.p25) : yMin;
      var yHi = r.p75 != null ? yAt(r.p75) : yMax;
      var boxTop = Math.min(yHi, yLo), boxH = Math.max(3, Math.abs(yLo - yHi));
      var box = '<rect class="desk-box-body" x="' + (cx - boxW / 2).toFixed(2) + '" y="' + boxTop.toFixed(2) + '" width="' + boxW.toFixed(2) + '" height="' + boxH.toFixed(2) + '" />';
      var wick = '<line class="desk-box-wick" x1="' + cx.toFixed(2) + '" x2="' + cx.toFixed(2) + '" y1="' + yMax.toFixed(2) + '" y2="' + yMin.toFixed(2) + '" />';
      var med = yMed != null ? '<line class="desk-box-med" x1="' + (cx - boxW / 2).toFixed(2) + '" x2="' + (cx + boxW / 2).toFixed(2) + '" y1="' + yMed.toFixed(2) + '" y2="' + yMed.toFixed(2) + '" />' : "";
      var label = '<text class="desk-svg-axis" x="' + cx.toFixed(2) + '" y="' + (H - 28) + '" text-anchor="middle">' + escapeHtml(r.name) + "</text>" +
        '<text class="desk-svg-axis dim" x="' + cx.toFixed(2) + '" y="' + (H - 14) + '" text-anchor="middle">' + escapeHtml(r.kind) + "</text>";
      var title = escapeHtml(r.name + ": min " + money(r.min, cur) + (r.p25 != null ? ", P25 " + money(r.p25, cur) : "") + ", median " + money(r.median, cur) + (r.p75 != null ? ", P75 " + money(r.p75, cur) : "") + ", max " + money(r.max, cur));
      return '<g class="desk-box-col"><title>' + title + "</title>" + wick + box + med + label + "</g>";
    }).join("");

    var summary = rows.map(function (r) {
      return r.name + " " + money(r.min, cur) + "–" + money(r.max, cur) + " (median " + money(r.median, cur) + ")";
    }).join("; ") + ". Same currency only (" + cur + ").";

    host.className = "desk-card desk-boxes";
    host.innerHTML =
      "<h3 class=\"desk-h mono\">Price range by source</h3>" +
      "<p class=\"desk-sub muted\">Box = P25–P75 (or the available band). Whiskers = min–max. Median is the gold tick. Sources with no priced data are omitted. Supplier costs sit on the same scale when they share this currency.</p>" +
      '<div class="desk-svg-wrap"><svg class="desk-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + escapeHtml(summary) + '">' +
        '<rect class="desk-plot" x="' + pad.l + '" y="' + pad.t + '" width="' + iw + '" height="' + ih + '" />' +
        yTicks + bodies +
      "</svg></div>" +
      '<p class="desk-cap mono">' + escapeHtml(summary) + "</p>";
    return true;
  }

  /* ---------- Meta longevity ---------- */
  function mountLongevity(host, c) {
    var meta = c.meta_ads;
    if (!sourceOk(meta)) return false;
    var dr = meta.days_running || {};
    var ads = (meta.longest_running || []).filter(function (a) { return num(a.days_running) != null; });
    if (num(dr.median) == null && !ads.length) return false;
    var maxD = num(dr.max);
    if (maxD == null && ads.length) maxD = Math.max.apply(null, ads.map(function (a) { return a.days_running; }));
    if (maxD == null || maxD < 0) return false;

    var stats = [];
    if (num(dr.median) != null) stats.push({ k: "Median", v: Math.round(dr.median) + " days" });
    if (num(dr.p75) != null) stats.push({ k: "P75", v: Math.round(dr.p75) + " days" });
    if (num(dr.max) != null) stats.push({ k: "Longest", v: Math.round(dr.max) + " days" });
    if (num(dr.share_30_plus) != null) stats.push({ k: "30+ days", v: Math.round(dr.share_30_plus * 100) + "%" });
    if (num(meta.active_ads) != null) stats.push({ k: "Active ads", v: String(meta.active_ads) + (meta.capped ? "+" : "") });

    var railMarks = [];
    if (num(dr.median) != null) railMarks.push({ v: dr.median, label: "Median" });
    if (num(dr.p75) != null) railMarks.push({ v: dr.p75, label: "P75" });
    if (maxD >= 30) railMarks.push({ v: 30, label: "30d" });

    var rail = '<div class="desk-rail" role="img" aria-label="Longevity scale from 0 to ' + Math.round(maxD) + ' days.">' +
      '<span class="desk-rail-line"></span>' +
      railMarks.map(function (m) {
        var left = Math.max(0, Math.min(100, (m.v / maxD) * 100));
        return '<span class="desk-rail-mark" style="left:' + left.toFixed(2) + '%"><i></i><b>' + escapeHtml(m.label) + "</b></span>";
      }).join("") +
      '<span class="desk-rail-end mono">0</span><span class="desk-rail-end is-right mono">' + Math.round(maxD) + "d</span>" +
      "</div>";

    var bars = "";
    if (ads.length) {
      bars = '<ul class="desk-long-list">' + ads.slice().sort(function (a, b) { return b.days_running - a.days_running; }).map(function (a) {
        var w = maxD ? (a.days_running / maxD) * 100 : 0;
        var name = a.advertiser || "Unknown";
        return "<li><div class=\"desk-long-row\">" +
          '<span class="desk-long-name" title="' + escapeHtml(name) + '">' + escapeHtml(name) + "</span>" +
          '<span class="desk-long-bar-wrap"><span class="desk-long-bar" style="width:' + w.toFixed(1) + '%"></span></span>' +
          '<span class="desk-long-days mono">' + Math.round(a.days_running) + "d</span>" +
          "</div></li>";
      }).join("") + "</ul>";
    }

    host.className = "desk-card desk-meta";
    host.innerHTML =
      "<h3 class=\"desk-h mono\">Meta ad longevity</h3>" +
      "<p class=\"desk-sub muted\">Days running among active ads in the Meta Ad Library sample" +
        (meta.country ? " (" + escapeHtml(meta.country) + ")" : "") +
        ". The list is the longest-running ads returned (up to 8), not a full histogram of every ad.</p>" +
      '<div class="desk-stat-row">' + stats.map(function (s) {
        return '<div class="desk-stat"><span class="k">' + escapeHtml(s.k) + '</span><span class="v mono">' + escapeHtml(s.v) + "</span></div>";
      }).join("") + "</div>" +
      rail + bars;
    return true;
  }

  /* ---------- margin gauge ---------- */
  function mountMargin(host, c) {
    var profit = c.profit;
    if (!profit || profit.status !== "ok" || !profit.scenarios || !profit.scenarios.length) return false;
    var cur = profit.currency || "USD";
    var cards = profit.scenarios.map(function (s) {
      if (num(s.selling_price) == null || num(s.landed_cost) == null) return "";
      var sell = s.selling_price, landed = s.landed_cost, fee = num(s.payment_fee) || 0;
      var profitU = num(s.profit_per_unit);
      var margin = num(s.gross_margin);
      var sum = landed + fee + Math.max(0, profitU != null ? profitU : (sell - landed - fee));
      if (sum <= 0) sum = sell || 1;
      var wLand = (landed / sum) * 100;
      var wFee = (fee / sum) * 100;
      var wPr = 100 - wLand - wFee;
      if (profitU != null && profitU < 0) { wPr = 0; wLand = Math.min(100, (landed / sell) * 100); wFee = Math.max(0, 100 - wLand); }
      var mPct = margin != null ? Math.round(margin * 100) : null;
      var gauge = "";
      if (mPct != null) {
        var r = 42, cx = 54, cy = 54, circ = 2 * Math.PI * r;
        var clamped = Math.max(0, Math.min(100, mPct));
        var dash = (clamped / 100) * circ;
        var col = mPct >= 0 ? "#19d27c" : "#ff4d5e";
        gauge = '<svg class="desk-gauge-ring" viewBox="0 0 108 108" aria-hidden="true">' +
          '<circle class="bg" cx="' + cx + '" cy="' + cy + '" r="' + r + '" />' +
          '<circle class="fg" cx="' + cx + '" cy="' + cy + '" r="' + r + '" style="stroke:' + col + ";stroke-dasharray:" + dash.toFixed(2) + " " + circ.toFixed(2) + '" />' +
          '<text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" class="desk-gauge-num">' + escapeHtml(String(mPct)) + "%</text>" +
          "</svg>";
      }
      return '<div class="desk-margin-scen">' +
        gauge +
        "<div>" +
          "<h4>" + escapeHtml(s.source) + " recommended band</h4>" +
          '<p class="mono desk-margin-fig">Sell ' + escapeHtml(money(sell, cur)) +
            (s.band && s.band.low != null ? " <span class=\"muted\">(" + escapeHtml(money(s.band.low, cur)) + "–" + escapeHtml(money(s.band.high, cur)) + ")</span>" : "") +
            " · Landed " + escapeHtml(money(landed, cur)) +
            " · Fee " + escapeHtml(money(fee, cur)) +
            (profitU != null ? " · Profit " + escapeHtml(money(profitU, cur)) : "") +
          "</p>" +
          '<div class="desk-stack" role="img" aria-label="Cost stack: landed, payment fee, remaining profit.">' +
            '<i class="land" style="width:' + wLand.toFixed(1) + '%" title="Landed cost"></i>' +
            '<i class="fee" style="width:' + wFee.toFixed(1) + '%" title="Payment fee"></i>' +
            (wPr > 0 ? '<i class="profit" style="width:' + wPr.toFixed(1) + '%" title="Gross profit"></i>' : "") +
          "</div>" +
          '<p class="desk-stack-legend mono"><span class="land">Landed</span> · <span class="fee">Fee</span> · <span class="profit">Profit before ads</span></p>' +
        "</div></div>";
    }).join("");
    if (!cards.replace(/\s/g, "")) return false;

    host.className = "desk-card desk-margin";
    host.innerHTML =
      "<h3 class=\"desk-h mono\">Gross margin</h3>" +
      "<p class=\"desk-sub muted\">Median AliExpress landed cost versus the midpoint of each source's recommended selling band. Payment-fee assumption is included; advertising and platform fees are not.</p>" +
      '<div class="desk-margin-list">' + cards + "</div>" +
      (profit.landed_cost_basis ? '<p class="desk-cap mono">' + escapeHtml(profit.landed_cost_basis) + "</p>" : "") +
      (profit.break_even_price != null ? '<p class="desk-cap mono">Break-even selling price (landed + payment fee): ' + escapeHtml(money(profit.break_even_price, cur)) + ".</p>" : "");
    return true;
  }

  function sectionHost() {
    var el = document.createElement("div");
    return el;
  }

  function mount(panel, content, opts) {
    if (!panel || !content) return;
    opts = opts || {};
    $$("[data-report-desk]", panel).forEach(function (n) { n.parentNode.removeChild(n); });
    var existingTape = panel.querySelector(".desk-tape");
    if (existingTape) existingTape.parentNode.removeChild(existingTape);

    mountTicker(panel, content);
    enhanceScores(panel);

    var desk = document.createElement("div");
    desk.className = "report-desk";
    desk.setAttribute("data-report-desk", "");

    var curve = sectionHost();
    var boxes = sectionHost();
    var meta = sectionHost();
    var margin = sectionHost();
    var shown = [];
    if (mountPriceCurve(curve, content, opts)) shown.push(curve);
    if (mountBoxes(boxes, content)) shown.push(boxes);
    if (mountMargin(margin, content)) shown.push(margin);
    if (mountLongevity(meta, content)) shown.push(meta);
    if (!shown.length) return;

    shown.forEach(function (el) { desk.appendChild(el); });
    var hist = panel.querySelector("[data-live-price-hist], .px-hist");
    var demand = panel.querySelector("[data-live-demand-chart], .tv-wrap");
    var anchor = hist || demand;
    if (anchor && anchor.parentNode) {
      if (anchor.nextSibling) anchor.parentNode.insertBefore(desk, anchor.nextSibling);
      else anchor.parentNode.appendChild(desk);
    } else {
      var advisor = panel.querySelector(".advisor-box");
      if (advisor && advisor.parentNode) advisor.parentNode.insertBefore(desk, advisor);
      else panel.appendChild(desk);
    }
  }

  global.MSReportDesk = {
    mount: mount,
    tickerChips: tickerChips,
    sourceRanges: sourceRanges
  };
})(window);
