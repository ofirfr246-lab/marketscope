/* MarketScope — stock-market-style demand chart (TradingView lightweight-charts)
   and a Shopping price-distribution histogram.

   Monthly demand candles are built honestly from Google Ads monthly search
   volume, not from modelled OHLC:
     open  = previous month's search volume (or this month if it is the first)
     close = this month's search volume
     high  = max(open, close)
     low   = min(open, close)
   Volume bars are the same monthly search volume. The 3-month moving average
   is the simple average of the last up-to-3 monthly closes.
   Timeframes 3M / 6M / 12M slice that series; we do not invent intra-month data.
*/
(function (g) {
  "use strict";
  var CDN = "https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js";
  var libPromise = null;
  var BG = "#0a0c0f";
  var TEXT = "#c3cad3";
  var GRID = "rgba(255,255,255,0.06)";
  var LINE = "#1b2128";
  var UP = "#19d27c";
  var DOWN = "#ff4d5e";
  var MA = "#ffb000";

  function loadLib() {
    if (g.LightweightCharts) return Promise.resolve(g.LightweightCharts);
    if (libPromise) return libPromise;
    libPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = CDN;
      s.async = true;
      s.onload = function () {
        if (g.LightweightCharts) resolve(g.LightweightCharts);
        else reject(new Error("lightweight-charts failed to expose a global"));
      };
      s.onerror = function () { reject(new Error("Could not load the chart library.")); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  function monthDate(row) {
    var y = Number(row.year), m = Number(row.month);
    if (!y || !m) return null;
    var mm = m < 10 ? "0" + m : String(m);
    return y + "-" + mm + "-01";
  }

  function sortMonths(rows) {
    return (rows || []).filter(function (r) {
      return r && r.search_volume != null && Number.isFinite(Number(r.search_volume)) && r.year && r.month;
    }).slice().sort(function (a, b) {
      return a.year - b.year || a.month - b.month;
    });
  }

  function candlesFromMonthly(rows) {
    var months = sortMonths(rows);
    var out = [];
    for (var i = 0; i < months.length; i++) {
      var close = Number(months[i].search_volume);
      var open = i === 0 ? close : Number(months[i - 1].search_volume);
      var time = monthDate(months[i]);
      if (!time) continue;
      out.push({
        time: time,
        open: open,
        high: Math.max(open, close),
        low: Math.min(open, close),
        close: close,
        volume: close,
        year: months[i].year,
        month: months[i].month
      });
    }
    return out;
  }

  function sma(candles, n) {
    var out = [];
    var run = 0;
    for (var i = 0; i < candles.length; i++) {
      run += candles[i].close;
      if (i >= n) run -= candles[i - n].close;
      if (i >= n - 1) out.push({ time: candles[i].time, value: Math.round((run / n) * 100) / 100 });
    }
    return out;
  }

  function sliceTf(candles, tf) {
    var n = tf === "3M" ? 3 : tf === "6M" ? 6 : 12;
    if (candles.length <= n) return candles;
    return candles.slice(-n);
  }

  function monthLabel(c) {
    var d = new Date(Date.UTC(c.year, c.month - 1, 1));
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  }

  function fmtInt(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    return Math.round(Number(n)).toLocaleString("en-US");
  }

  var mounted = [];

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function toolbar(el, current, onChange) {
    var bar = document.createElement("div");
    bar.className = "tv-toolbar";
    ["3M", "6M", "12M"].forEach(function (tf) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tv-tf" + (tf === current ? " active" : "");
      b.textContent = tf;
      b.setAttribute("data-tv-tf", tf);
      b.addEventListener("click", function () { onChange(tf); });
      bar.appendChild(b);
    });
    var legend = document.createElement("p");
    legend.className = "tv-legend mono";
    legend.innerHTML = "Monthly demand candles — open = previous month volume, close = this month volume, high/low = max/min of the two. Volume bars = monthly searches. Gold line = 3-month moving average of closes.";
    el.appendChild(bar);
    el.appendChild(legend);
    return bar;
  }

  function mountDemandChart(host, opts) {
    opts = opts || {};
    if (!host) return Promise.resolve(null);
    var all = candlesFromMonthly(opts.monthly_searches || opts.months || []);
    clearNode(host);
    host.classList.add("tv-wrap");
    if (!all.length) {
      host.innerHTML = '<p class="muted">No monthly search-volume series is available for this product.</p>';
      return Promise.resolve(null);
    }
    var state = { tf: opts.timeframe || "12M", chart: null };
    toolbar(host, state.tf, function (tf) {
      state.tf = tf;
      host.querySelectorAll("[data-tv-tf]").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-tv-tf") === tf);
      });
      draw();
    });
    var chartHost = document.createElement("div");
    chartHost.className = "tv-chart";
    host.appendChild(chartHost);
    var read = document.createElement("p");
    read.className = "tv-readout mono";
    read.setAttribute("aria-live", "polite");
    host.appendChild(read);

    function paintReadout(c) {
      if (!c) { read.textContent = ""; return; }
      var dir = c.close >= c.open ? "up" : "down";
      read.innerHTML = monthLabel(c) + " · O " + fmtInt(c.open) + " · H " + fmtInt(c.high) + " · L " + fmtInt(c.low) + " · C " + fmtInt(c.close) +
        ' · <span class="' + (dir === "up" ? "g" : "r") + '">vol ' + fmtInt(c.volume) + "</span> monthly searches";
    }

    function draw() {
      var candles = sliceTf(all, state.tf);
      if (!candles.length) return;
      paintReadout(candles[candles.length - 1]);
      if (state.chart) {
        try { state.chart.remove(); } catch (e) { /* ignore */ }
        state.chart = null;
        chartHost.innerHTML = "";
      }
      var LW = g.LightweightCharts;
      var chart = LW.createChart(chartHost, {
        width: chartHost.clientWidth || host.clientWidth || 640,
        height: opts.height || 360,
        layout: { background: { type: "solid", color: BG }, textColor: TEXT, fontFamily: "IBM Plex Mono, ui-monospace, monospace" },
        grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
        crosshair: { mode: LW.CrosshairMode.Normal, vertLine: { color: "rgba(255,176,0,.45)", width: 1, style: 0, labelBackgroundColor: "#ffb000" }, horzLine: { color: "rgba(255,176,0,.35)", labelBackgroundColor: "#ffb000" } },
        rightPriceScale: { borderColor: LINE, scaleMargins: { top: 0.08, bottom: 0.28 } },
        timeScale: { borderColor: LINE, timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
        handleScroll: true,
        handleScale: true
      });
      var candleSeries = chart.addCandlestickSeries({
        upColor: UP, downColor: DOWN,
        borderUpColor: UP, borderDownColor: DOWN,
        wickUpColor: UP, wickDownColor: DOWN,
        priceLineVisible: false
      });
      candleSeries.setData(candles.map(function (c) {
        return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
      }));
      var volSeries = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
        priceLineVisible: false,
        lastValueVisible: false
      });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 }, borderVisible: false });
      volSeries.setData(candles.map(function (c) {
        return { time: c.time, value: c.volume, color: c.close >= c.open ? "rgba(25,210,124,.35)" : "rgba(255,77,94,.35)" };
      }));
      var maSeries = chart.addLineSeries({
        color: MA, lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: true
      });
      maSeries.setData(sma(candles, Math.min(3, candles.length)));
      chart.subscribeCrosshairMove(function (param) {
        var point = param && param.seriesData && param.seriesData.get(candleSeries);
        if (!point || point.close == null) {
          paintReadout(candles[candles.length - 1]);
          return;
        }
        var hit = candles.filter(function (c) { return c.time === param.time || c.time === (point.time); })[0];
        if (!hit && param.time) {
          var t = typeof param.time === "string" ? param.time : null;
          hit = candles.filter(function (c) { return c.time === t; })[0];
        }
        if (hit) paintReadout(hit);
      });
      state.chart = chart;
      try { chart.timeScale().fitContent(); } catch (e2) { /* ignore */ }
    }

    return loadLib().then(function () {
      draw();
      if (typeof ResizeObserver !== "undefined") {
        var ro = new ResizeObserver(function () {
          if (state.chart) state.chart.applyOptions({ width: chartHost.clientWidth || host.clientWidth });
        });
        ro.observe(host);
        state.ro = ro;
      }
      mounted.push(state);
      return state;
    }).catch(function (err) {
      chartHost.innerHTML = '<p class="muted">The trading chart could not load. ' + (err && err.message ? err.message : "") + "</p>";
    });
  }

  function mountPriceHistogram(host, opts) {
    opts = opts || {};
    if (!host) return;
    var samples = (opts.samples || opts.prices || []).map(Number).filter(function (n) { return Number.isFinite(n) && n > 0; }).sort(function (a, b) { return a - b; });
    clearNode(host);
    host.classList.add("px-hist");
    if (samples.length < 2) {
      host.innerHTML = '<p class="muted">Not enough priced Google Shopping listings for a distribution.</p>';
      return;
    }
    var bins = Math.min(16, Math.max(6, Math.round(Math.sqrt(samples.length))));
    var min = samples[0], max = samples[samples.length - 1];
    if (min === max) max = min + 1;
    var width = (max - min) / bins;
    var counts = [];
    var i;
    for (i = 0; i < bins; i++) counts.push({ i: i, lo: min + i * width, hi: min + (i + 1) * width, n: 0 });
    samples.forEach(function (v) {
      var idx = Math.min(bins - 1, Math.floor((v - min) / width));
      counts[idx].n += 1;
    });
    var peak = counts.reduce(function (m, b) { return Math.max(m, b.n); }, 1);
    var currency = opts.currency || "USD";
    function money(n) {
      try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency, maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n); }
      catch (e) { return currency + " " + Math.round(n * 100) / 100; }
    }
    var band = opts.band || null;
    var h = document.createElement("div");
    h.className = "px-hist-bars";
    counts.forEach(function (b) {
      var col = document.createElement("div");
      col.className = "px-hist-col";
      var inBand = band && band.low != null && band.high != null && b.hi >= band.low && b.lo <= band.high;
      if (inBand) col.classList.add("in-band");
      col.style.height = Math.max(4, (b.n / peak) * 100) + "%";
      col.title = money(b.lo) + "–" + money(b.hi) + " · " + b.n + " listings";
      h.appendChild(col);
    });
    var cap = document.createElement("p");
    cap.className = "tv-legend mono";
    cap.textContent = samples.length + " Google Shopping prices · " + money(min) + "–" + money(max) +
      (band && band.low != null ? " · gold bars overlap the recommended band " + money(band.low) + "–" + money(band.high) : "");
    var axis = document.createElement("div");
    axis.className = "px-hist-axis mono";
    axis.innerHTML = "<span>" + money(min) + "</span><span>" + money((min + max) / 2) + "</span><span>" + money(max) + "</span>";
    host.appendChild(h);
    host.appendChild(axis);
    host.appendChild(cap);
  }

  g.MSTrading = {
    loadLib: loadLib,
    candlesFromMonthly: candlesFromMonthly,
    mountDemandChart: mountDemandChart,
    mountPriceHistogram: mountPriceHistogram
  };
})(window);
