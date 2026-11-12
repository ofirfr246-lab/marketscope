/* MarketScope desk data.
   Every number comes from assets/data/live-snapshot.json
   (Google Shopping & Google Search via DataForSEO, United States, 12 Nov 2026)
   or is a transparent computation on that file. Nothing is invented. */
(function (g) {
  "use strict";
  var SNAP_URL = "assets/data/live-snapshot.json";
  var CATEGORY_META = [
    { id: "kitchen", name: "Kitchen", color: "#ffb000" },
    { id: "pet", name: "Pet", color: "#19d27c" },
    { id: "beauty", name: "Beauty", color: "#a78bfa" },
    { id: "fitness", name: "Fitness", color: "#4da3ff" },
    { id: "home", name: "Home", color: "#ff8a3d" },
    { id: "tech", name: "Tech Accessories", color: "#ff4d5e" }
  ];
  var CAT_BY_ID = {};
  CATEGORY_META.forEach(function (c) { CAT_BY_ID[c.id] = c; });
  function round(n, d) { var m = Math.pow(10, d == null ? 2 : d); return Math.round(n * m) / m; }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }

  function trendPct(p) {
    var s = num(p.demand_detail && p.demand_detail.trend_slope);
    if (s == null) return null;
    return round(s * 100, 1);
  }

  function avgRating(listings) {
    var vals = (listings || []).map(function (L) { return num(L.rating); }).filter(function (n) { return n != null; });
    if (!vals.length) return null;
    return round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length, 2);
  }

  function toTicker(p) {
    var scores = p.scores || {};
    var prices = p.prices || {};
    var demand = p.demand_detail || {};
    return {
      ticker: p.ticker,
      product: p.product,
      query: p.query,
      market: p.market || "United States",
      category: p.category,
      /* "Last" on the tape is the median Google Shopping price in USD. */
      price: prices.median,
      priceLabel: "median Google Shopping price",
      /* % change is the 12-month Google Ads trend: last 3 months vs the prior 3, as a percent. */
      chg: trendPct(p),
      chgLabel: "search-demand change, last 3 months vs prior 3",
      demand: scores.demand,
      competition: scores.competition,
      saturation: scores.saturation,
      opportunity: scores.opportunity,
      verdict: p.verdict,
      volume: demand.search_volume,
      volumeLabel: "Google Ads monthly search volume",
      target: prices.recommended_band ? [prices.recommended_band.low, prices.recommended_band.high] : null,
      targetLabel: "recommended selling band (30th–50th percentile of Shopping prices)",
      sentiment: avgRating(p.listings),
      sentimentLabel: "average star rating on visible Shopping listings",
      reviews: avgRating(p.listings),
      seller_count: prices.seller_count,
      listing_count: prices.listing_count,
      cpc: demand.cpc,
      monthly_searches: (demand.monthly_searches || []).slice(),
      prices: prices,
      competitors: p.competitors || [],
      listings: p.listings || [],
      advisor: p.advisor,
      related_keywords: p.related_keywords || [],
      opportunities: p.opportunities || [],
      risks: p.risks || [],
      raw: p
    };
  }

  function sortMonths(rows) {
    return (rows || []).filter(function (r) { return r && r.year && r.month && r.search_volume != null; })
      .slice().sort(function (a, b) { return a.year - b.year || a.month - b.month; });
  }

  function demandSeries(tickerObj, n) {
    var months = sortMonths(tickerObj && tickerObj.monthly_searches);
    if (n && months.length > n) months = months.slice(-n);
    return months.map(function (m) { return Number(m.search_volume); });
  }

  function labelsForMonths(tickerObj, n) {
    var months = sortMonths(tickerObj && tickerObj.monthly_searches);
    if (n && months.length > n) months = months.slice(-n);
    return months.map(function (m) {
      return new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
    });
  }

  function candlesFor(tickerObj, n) {
    var months = sortMonths(tickerObj && tickerObj.monthly_searches);
    if (n && months.length > n) months = months.slice(-n);
    var out = [], prev = null;
    for (var i = 0; i < months.length; i++) {
      var c = Number(months[i].search_volume);
      var o = prev == null ? c : prev;
      out.push({ t: i, o: o, h: Math.max(o, c), l: Math.min(o, c), c: c, v: c, year: months[i].year, month: months[i].month });
      prev = c;
    }
    return out;
  }

  var TF = {
    "3M": { n: 3, label: "3 months" },
    "6M": { n: 6, label: "6 months" },
    "12M": { n: 12, label: "12 months" }
  };

  function build(snap) {
    var products = (snap && snap.products) || [];
    var TICKERS = products.map(toTicker);
    var BY_TICKER = {};
    TICKERS.forEach(function (t) { BY_TICKER[t.ticker] = t; });
    var presentCats = {};
    TICKERS.forEach(function (t) { presentCats[t.category] = true; });
    var CATEGORIES = CATEGORY_META.filter(function (c) { return presentCats[c.id]; });

    function history(ticker, tf, kind) {
      var t = BY_TICKER[ticker] || TICKERS[0];
      var spec = TF[tf] || TF["12M"];
      if (kind === "ohlc") return { tf: tf, labels: labelsForMonths(t, spec.n), candles: candlesFor(t, spec.n) };
      /* We do not have a historical Shopping price series — only a current median.
         "price" history is therefore not a time series; callers should use demand. */
      if (kind === "price") {
        return { tf: tf, labels: labelsForMonths(t, spec.n), values: [], current: t.price, note: "Only a current median Google Shopping price is available, not a price history." };
      }
      return { tf: tf, labels: labelsForMonths(t, spec.n), values: demandSeries(t, spec.n) };
    }

    function indexOf(catId) {
      var meta = CAT_BY_ID[catId] || { id: catId, name: catId, color: "#ffb000" };
      var members = TICKERS.filter(function (t) { return t.category === catId; });
      var avgChg = 0, avgOpp = 0, chgN = 0;
      members.forEach(function (t) {
        if (t.chg != null) { avgChg += t.chg; chgN += 1; }
        if (t.opportunity != null) avgOpp += t.opportunity;
      });
      if (chgN) avgChg /= chgN;
      if (members.length) avgOpp /= members.length;
      /* Spark: average monthly search volume of members, rebased to 1000 at the first month with data. */
      var monthMap = {};
      members.forEach(function (t) {
        sortMonths(t.monthly_searches).forEach(function (m) {
          var k = m.year + "-" + m.month;
          if (!monthMap[k]) monthMap[k] = { year: m.year, month: m.month, sum: 0, n: 0 };
          monthMap[k].sum += Number(m.search_volume);
          monthMap[k].n += 1;
        });
      });
      var keys = Object.keys(monthMap).sort(function (a, b) {
        var A = monthMap[a], B = monthMap[b];
        return A.year - B.year || A.month - B.month;
      });
      var avgs = keys.map(function (k) { return monthMap[k].sum / monthMap[k].n; });
      var base = avgs[0] || 1;
      var spark = avgs.map(function (v) { return round(1000 * (v / base), 2); });
      var level = spark.length ? spark[spark.length - 1] : 1000;
      return {
        id: catId,
        name: meta.name + " Index",
        color: meta.color,
        level: level,
        chg: round(avgChg, 2),
        opportunity: round(avgOpp, 1),
        members: members.map(function (t) { return t.ticker; }),
        spark: spark,
        note: "Index level is the members' average Google Ads monthly search volume, rebased to 1000 at the first month in the snapshot. Change is the average 3-month vs prior-3-month demand change of members."
      };
    }

    var INDICES = CATEGORIES.map(function (c) { return indexOf(c.id); });

    /* Heatmap is a product grid (US only — the snapshot has no other countries).
       Tile size is driven by search volume; color by 12-month demand trend. */
    var vols = TICKERS.map(function (t) { return t.volume || 0; });
    var vmax = Math.max.apply(null, vols.concat([1]));
    var HEAT = {
      kind: "products",
      market: snap.market || "United States",
      cells: TICKERS.map(function (t, i) {
        return {
          i: i,
          ticker: t.ticker,
          product: t.product,
          category: t.category,
          categoryName: (CAT_BY_ID[t.category] || {}).name,
          market: t.market,
          volume: t.volume,
          chg: t.chg,
          opportunity: t.opportunity,
          verdict: t.verdict,
          size: t.volume != null ? Math.sqrt(t.volume / vmax) : 0.3
        };
      })
    };

    var NEWS = TICKERS.slice().sort(function (a, b) {
      return Math.abs(b.chg || 0) - Math.abs(a.chg || 0);
    }).slice(0, 8).map(function (t) {
      var dir = (t.chg || 0) >= 0 ? "rises" : "softens";
      var vol = t.volume != null ? Number(t.volume).toLocaleString("en-US") + " monthly searches" : "search volume unreported";
      return {
        t: "",
        tag: "DEMAND",
        title: t.product + ": demand " + dir + " " + (t.chg != null ? Math.abs(t.chg).toFixed(1) + "%" : "") + " (last 3 months vs prior 3) · " + vol,
        ticker: t.ticker
      };
    });

    function movers() {
      var withChg = TICKERS.filter(function (t) { return t.chg != null; }).slice().sort(function (a, b) { return b.chg - a.chg; });
      return {
        gainers: withChg.slice(0, 5),
        losers: withChg.slice(-5).reverse(),
        active: TICKERS.slice().sort(function (a, b) { return (b.volume || 0) - (a.volume || 0); }).slice(0, 5)
      };
    }

    function backtest(ticker) {
      var t = BY_TICKER[ticker];
      if (!t) return null;
      var months = sortMonths(t.monthly_searches);
      if (months.length < 7) {
        return { ticker: ticker, available: false, note: "Coming soon — a demand backtest needs at least 7 months of Google Ads volume. This product does not have enough monthly points." };
      }
      var then = Number(months[months.length - 7].search_volume);
      var now = Number(months[months.length - 1].search_volume);
      var mid = months.slice(-7);
      var labels = mid.map(function (m) {
        return new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
      });
      var equity = mid.map(function (m) { return then ? round((Number(m.search_volume) / then) * 100, 2) : null; });
      var ret = then ? round((now / then - 1) * 100, 2) : null;
      var cat = indexOf(t.category);
      return {
        ticker: ticker,
        available: true,
        entry: then,
        last: now,
        ret: ret,
        indexRet: null,
        alpha: null,
        maxDrawdown: null,
        equity: equity,
        index: [],
        labels: labels,
        note: "Demand-only backtest: Google Ads monthly search volume six months ago versus the latest month, rebased to 100 at entry. This is not revenue, price or profit, and it is not a tradable track record."
      };
    }

    var api = {
      EXAMPLE: false,
      ready: Promise.resolve(),
      disclaimer: (snap && snap.label) || "Live data snapshot · Google Shopping & Search · US · Nov 12, 2026",
      asOf: snap && snap.as_of,
      source: snap && snap.source,
      markets: ["United States"],
      marketAbbr: { "United States": "US" },
      categories: CATEGORIES,
      tickers: TICKERS,
      byTicker: BY_TICKER,
      indices: INDICES,
      heat: HEAT,
      news: NEWS,
      events: [],
      earnings: [],
      stores: (snap && snap.stores) || [],
      timeframes: TF,
      history: history,
      labelsFor: function (tf) { return labelsForMonths(TICKERS[0], (TF[tf] || TF["12M"]).n); },
      seriesFor: function (ticker, n, kind) {
        var t = BY_TICKER[ticker] || TICKERS[0];
        if (kind === "price") return [];
        return demandSeries(t, n);
      },
      movers: movers,
      consensus: function (t) { return null; },
      backtest: backtest,
      indexOf: indexOf,
      get: function (ticker) { return BY_TICKER[ticker] || null; },
      defaultTicker: function () { return (TICKERS[0] && TICKERS[0].ticker) || ""; }
    };
    g.MSData = api;
    return api;
  }

  var pending;
  function load() {
    if (g.MS_SNAPSHOT) return Promise.resolve(build(g.MS_SNAPSHOT));
    pending = fetch(SNAP_URL, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("Could not load the live snapshot (" + r.status + ").");
      return r.json();
    }).then(function (snap) {
      g.MS_SNAPSHOT = snap;
      var api = build(snap);
      document.dispatchEvent(new CustomEvent("ms:data-ready", { detail: api }));
      return api;
    });
    return pending;
  }

  g.MSData = {
    EXAMPLE: false,
    ready: load(),
    tickers: [],
    get: function () { return null; },
    disclaimer: "Loading live snapshot…"
  };
})(window);
