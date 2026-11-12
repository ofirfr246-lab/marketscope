/* MarketScope — EXAMPLE market dataset for the Terminal desk.
   All figures are illustrative. Nothing here is a live measurement. */
(function (g) {
  "use strict";
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedFrom(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function round(n, d) { var m = Math.pow(10, d == null ? 2 : d); return Math.round(n * m) / m; }

  var MARKETS = ["United States", "United Kingdom", "Germany", "France", "Canada", "Australia"];
  var MARKET_ABBR = { "United States": "US", "United Kingdom": "UK", "Germany": "DE", "France": "FR", "Canada": "CA", "Australia": "AU" };
  var CATEGORIES = [
    { id: "kitchen", name: "Kitchen", color: "#ffb000" },
    { id: "pet", name: "Pet", color: "#19d27c" },
    { id: "beauty", name: "Beauty", color: "#a78bfa" },
    { id: "fitness", name: "Fitness", color: "#4da3ff" },
    { id: "home", name: "Home", color: "#ff8a3d" },
    { id: "tech", name: "Tech Accessories", color: "#ff4d5e" }
  ];
  var CAT_BY_ID = {};
  CATEGORIES.forEach(function (c) { CAT_BY_ID[c.id] = c; });

  /* Base snapshot used to generate series. Scores 0–100. Prices in USD. */
  var TICKERS = [
    { ticker: "EARBUDS-US", product: "Wireless earbuds", market: "United States", category: "tech", price: 42.8, chg: 3.1, demand: 81, competition: 64, saturation: 52, opportunity: 74, verdict: "BUY", volume: 1240, target: [30, 40], rating: { buy: 9, hold: 4, sell: 2 }, sentiment: 72, reviews: 4.4 },
    { ticker: "YOGAMATS-DE", product: "Yoga mats", market: "Germany", category: "fitness", price: 28.4, chg: -1.2, demand: 58, competition: 71, saturation: 66, opportunity: 49, verdict: "HOLD", volume: 640, target: [24, 32], rating: { buy: 3, hold: 8, sell: 3 }, sentiment: 54, reviews: 4.1 },
    { ticker: "PETFNT-UK", product: "Pet fountains", market: "United Kingdom", category: "pet", price: 36.9, chg: 6.8, demand: 86, competition: 41, saturation: 38, opportunity: 82, verdict: "STRONG BUY", volume: 880, target: [32, 44], rating: { buy: 12, hold: 2, sell: 1 }, sentiment: 81, reviews: 4.6 },
    { ticker: "SKILLETS-US", product: "Cast iron skillets", market: "United States", category: "kitchen", price: 49.0, chg: 1.8, demand: 76, competition: 55, saturation: 48, opportunity: 71, verdict: "BUY", volume: 910, target: [42, 55], rating: { buy: 8, hold: 3, sell: 1 }, sentiment: 77, reviews: 4.7 },
    { ticker: "SERUM-US", product: "Vitamin C serum", market: "United States", category: "beauty", price: 22.5, chg: 0.4, demand: 69, competition: 78, saturation: 74, opportunity: 51, verdict: "HOLD", volume: 1580, target: [18, 26], rating: { buy: 4, hold: 9, sell: 3 }, sentiment: 61, reviews: 4.2 },
    { ticker: "RESBAND-UK", product: "Resistance bands", market: "United Kingdom", category: "fitness", price: 18.2, chg: 4.4, demand: 73, competition: 58, saturation: 50, opportunity: 68, verdict: "BUY", volume: 720, target: [14, 22], rating: { buy: 7, hold: 4, sell: 1 }, sentiment: 70, reviews: 4.3 },
    { ticker: "DESKLAMP-DE", product: "Desk lamps", market: "Germany", category: "home", price: 31.6, chg: -3.6, demand: 47, competition: 69, saturation: 72, opportunity: 38, verdict: "UNDERPERFORM", volume: 410, target: [22, 28], rating: { buy: 2, hold: 5, sell: 7 }, sentiment: 44, reviews: 3.9 },
    { ticker: "PHONECASE-US", product: "Phone cases", market: "United States", category: "tech", price: 14.9, chg: -5.1, demand: 62, competition: 88, saturation: 91, opportunity: 24, verdict: "AVOID", volume: 2100, target: [8, 12], rating: { buy: 1, hold: 3, sell: 12 }, sentiment: 39, reviews: 3.7 },
    { ticker: "AIRFRYER-US", product: "Air fryers", market: "United States", category: "kitchen", price: 79.0, chg: 2.6, demand: 84, competition: 70, saturation: 61, opportunity: 66, verdict: "BUY", volume: 1340, target: [69, 89], rating: { buy: 8, hold: 5, sell: 2 }, sentiment: 74, reviews: 4.5 },
    { ticker: "LITTERBOX-CA", product: "Self-cleaning litter boxes", market: "Canada", category: "pet", price: 129.0, chg: 8.2, demand: 79, competition: 36, saturation: 29, opportunity: 85, verdict: "STRONG BUY", volume: 360, target: [119, 149], rating: { buy: 11, hold: 2, sell: 0 }, sentiment: 83, reviews: 4.5 },
    { ticker: "HAIRMASK-UK", product: "Hair masks", market: "United Kingdom", category: "beauty", price: 16.8, chg: 1.1, demand: 64, competition: 67, saturation: 63, opportunity: 55, verdict: "HOLD", volume: 540, target: [14, 19], rating: { buy: 4, hold: 7, sell: 2 }, sentiment: 66, reviews: 4.3 },
    { ticker: "YOGABLK-AU", product: "Yoga blocks", market: "Australia", category: "fitness", price: 12.4, chg: 3.3, demand: 61, competition: 44, saturation: 40, opportunity: 67, verdict: "BUY", volume: 290, target: [10, 15], rating: { buy: 6, hold: 3, sell: 1 }, sentiment: 71, reviews: 4.4 },
    { ticker: "DIFFUSER-FR", product: "Essential oil diffusers", market: "France", category: "home", price: 24.7, chg: -0.8, demand: 55, competition: 60, saturation: 58, opportunity: 52, verdict: "HOLD", volume: 470, target: [20, 28], rating: { buy: 4, hold: 6, sell: 3 }, sentiment: 58, reviews: 4.0 },
    { ticker: "CABLE-US", product: "USB-C cables", market: "United States", category: "tech", price: 9.4, chg: -2.2, demand: 70, competition: 86, saturation: 88, opportunity: 31, verdict: "UNDERPERFORM", volume: 2600, target: [6, 9], rating: { buy: 2, hold: 4, sell: 9 }, sentiment: 41, reviews: 3.8 },
    { ticker: "DUTCHOVEN-UK", product: "Dutch ovens", market: "United Kingdom", category: "kitchen", price: 64.5, chg: 2.1, demand: 71, competition: 49, saturation: 45, opportunity: 70, verdict: "BUY", volume: 390, target: [58, 72], rating: { buy: 7, hold: 3, sell: 1 }, sentiment: 76, reviews: 4.6 },
    { ticker: "CATTREE-DE", product: "Cat trees", market: "Germany", category: "pet", price: 54.2, chg: 5.0, demand: 75, competition: 47, saturation: 42, opportunity: 73, verdict: "BUY", volume: 430, target: [48, 62], rating: { buy: 8, hold: 3, sell: 1 }, sentiment: 78, reviews: 4.4 }
  ];

  var BY_TICKER = {};
  TICKERS.forEach(function (t) { BY_TICKER[t.ticker] = t; });

  function seriesFor(ticker, n, kind) {
    var t = BY_TICKER[ticker] || TICKERS[0];
    var rng = mulberry32(seedFrom(ticker + ":" + kind + ":" + n));
    var start = t.price * (kind === "demand" ? (t.demand / 70) : 1) * 0.86;
    var out = [];
    var v = start;
    var i;
    for (i = 0; i < n; i++) {
      var drift = (t.chg >= 0 ? 0.0012 : -0.0006) + (rng() - 0.48) * 0.035;
      if (kind === "demand") drift = (t.demand - 55) / 12000 + (rng() - 0.5) * 0.03;
      v = Math.max(kind === "demand" ? 20 : t.price * 0.45, v * (1 + drift));
      out.push(round(kind === "demand" ? Math.min(100, v * (t.demand / start)) : v, 2));
    }
    /* Pin the last point near the snapshot so timeframes feel consistent. */
    if (kind === "price") out[out.length - 1] = t.price;
    if (kind === "demand") out[out.length - 1] = t.demand;
    return out;
  }

  function candlesFor(ticker, n) {
    var closes = seriesFor(ticker, n, "price");
    var rng = mulberry32(seedFrom(ticker + ":ohlc:" + n));
    var out = [], prev = closes[0];
    for (var i = 0; i < closes.length; i++) {
      var c = closes[i], o = i === 0 ? c * (1 - (rng() - 0.5) * 0.01) : prev;
      var hi = Math.max(o, c) * (1 + rng() * 0.018);
      var lo = Math.min(o, c) * (1 - rng() * 0.018);
      var vol = Math.round(200 + rng() * 1800);
      out.push({ t: i, o: round(o, 2), h: round(hi, 2), l: round(lo, 2), c: round(c, 2), v: vol });
      prev = c;
    }
    return out;
  }

  var TF = {
    "1D": { n: 24, label: "1 day", unit: "hour" },
    "1W": { n: 7, label: "1 week", unit: "day" },
    "1M": { n: 22, label: "1 month", unit: "day" },
    "6M": { n: 26, label: "6 months", unit: "week" },
    "1Y": { n: 52, label: "1 year", unit: "week" }
  };

  function labelsFor(tf) {
    var spec = TF[tf] || TF["1M"];
    var out = [], i;
    if (spec.unit === "hour") {
      for (i = 0; i < spec.n; i++) out.push((i < 10 ? "0" : "") + i + ":00");
    } else if (spec.unit === "day") {
      var d = new Date(2026, 10, 12);
      d.setDate(d.getDate() - (spec.n - 1));
      for (i = 0; i < spec.n; i++) {
        out.push(d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
        d.setDate(d.getDate() + 1);
      }
    } else {
      var w = new Date(2026, 10, 12);
      w.setDate(w.getDate() - (spec.n - 1) * 7);
      for (i = 0; i < spec.n; i++) {
        out.push(w.toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
        w.setDate(w.getDate() + 7);
      }
    }
    return out;
  }

  function history(ticker, tf, kind) {
    var spec = TF[tf] || TF["1M"];
    if (kind === "ohlc") return { tf: tf, labels: labelsFor(tf), candles: candlesFor(ticker, spec.n) };
    return { tf: tf, labels: labelsFor(tf), values: seriesFor(ticker, spec.n, kind || "price") };
  }

  /* Category index level ~ 1000, plus daily-ish series and breakdown by market. */
  function indexOf(catId) {
    var members = TICKERS.filter(function (t) { return t.category === catId; });
    var avgChg = 0, avgOpp = 0, level = 1000;
    members.forEach(function (t) { avgChg += t.chg; avgOpp += t.opportunity; });
    if (members.length) { avgChg /= members.length; avgOpp /= members.length; }
    level = round(1000 * (1 + avgChg / 100), 2);
    var rng = mulberry32(seedFrom("idx:" + catId));
    var spark = [];
    var v = level * 0.94;
    for (var i = 0; i < 24; i++) { v = v * (1 + (rng() - 0.47) * 0.012 + avgChg / 4000); spark.push(round(v, 2)); }
    spark[spark.length - 1] = level;
    return {
      id: catId,
      name: CAT_BY_ID[catId].name + " Index",
      color: CAT_BY_ID[catId].color,
      level: level,
      chg: round(avgChg, 2),
      opportunity: round(avgOpp, 1),
      members: members.map(function (t) { return t.ticker; }),
      spark: spark
    };
  }

  var INDICES = CATEGORIES.map(function (c) { return indexOf(c.id); });

  /* Heatmap: category x country, opportunity-style 0–100 with % change. */
  var HEAT = { rows: CATEGORIES.map(function (c) { return c.name; }), cols: MARKET_ABBR, markets: MARKETS, cells: [] };
  CATEGORIES.forEach(function (c, ri) {
    MARKETS.forEach(function (m, ci) {
      var rng = mulberry32(seedFrom("heat:" + c.id + ":" + m));
      var match = TICKERS.filter(function (t) { return t.category === c.id && t.market === m; })[0];
      var opp = match ? match.opportunity : round(35 + rng() * 50, 0);
      var chg = match ? match.chg : round((rng() - 0.45) * 10, 1);
      HEAT.cells.push({ r: ri, c: ci, category: c.id, categoryName: c.name, market: m, marketAbbr: MARKET_ABBR[m], opportunity: opp, chg: chg, ticker: match ? match.ticker : null });
    });
  });

  var NEWS = [
    { t: "09:41", tag: "DEMAND", title: "Search interest for pet fountains rises ahead of winter (example)", ticker: "PETFNT-UK" },
    { t: "09:12", tag: "PRICING", title: "Average mid-band price for US earbuds ticks up 3% in sample window", ticker: "EARBUDS-US" },
    { t: "08:55", tag: "SATURATION", title: "Phone-case listings remain crowded below $15 in the US sample", ticker: "PHONECASE-US" },
    { t: "08:20", tag: "INDEX", title: "Kitchen Index holds gains; air fryers still carry Q4 seasonality (example)", ticker: "AIRFRYER-US" },
    { t: "07:48", tag: "RATING", title: "Example desk lifts litter-box target range after supply gap note", ticker: "LITTERBOX-CA" },
    { t: "07:05", tag: "EVENT", title: "Calendar: Prime Day window marked 6 weeks out — demand impact is modelled, not live", ticker: null },
    { t: "06:40", tag: "RISK", title: "Desk lamps in Germany slip as listing density rises in the sample set", ticker: "DESKLAMP-DE" },
    { t: "06:11", tag: "SOCIAL", title: "Example sentiment: cat-tree reviews mention sturdiness more than price", ticker: "CATTREE-DE" }
  ];

  var EVENTS = [
    { date: "2026-11-27", name: "Black Friday", type: "Retail event", impact: 28, note: "Modelled demand lift for gadgets, beauty and home. Example only." },
    { date: "2026-11-30", name: "Cyber Monday", type: "Retail event", impact: 22, note: "Online-heavy categories in the sample typically follow Friday." },
    { date: "2026-12-25", name: "Christmas week", type: "Holiday", impact: 18, note: "Gift categories: tech accessories, kitchen, pet." },
    { date: "2027-02-14", name: "Valentine's Day", type: "Holiday", impact: 12, note: "Beauty and home fragrance often firm in the sample history." },
    { date: "2027-07-12", name: "Prime Day (indicative)", type: "Marketplace event", impact: 24, note: "Dates vary. This is a placeholder window, not an official date." },
    { date: "2026-11-11", name: "Singles' Day", type: "Marketplace event", impact: 16, note: "Supply-side movement on AliExpress-style categories in the example set." },
    { date: "2027-01-29", name: "Lunar New Year", type: "Holiday", impact: 10, note: "Logistics and supply pauses — modelled, not a forecast." },
    { date: "2027-08-15", name: "Back to school", type: "Season", impact: 14, note: "Desk, tech accessories and some fitness categories." },
    { date: "2027-01-08", name: "New Year fitness", type: "Season", impact: 15, note: "Yoga and resistance-band demand often rises in January samples." },
    { date: "2026-12-12", name: "Q4 peak shipping", type: "Season", impact: 9, note: "Cutoff for holiday delivery — watch lead times, not prices only." }
  ];

  var EARNINGS = [
    { period: "Q3 2026", category: "kitchen", headline: "Kitchen niche ‘earnings’ — example", revenue: 128, yoy: 9.4, beat: true, note: "Modelled category revenue index, not company filings. Air fryers and skillets led the sample." },
    { period: "Q3 2026", category: "pet", headline: "Pet niche ‘earnings’ — example", revenue: 96, yoy: 14.1, beat: true, note: "Fountains and litter boxes outpaced the Pet Index in this illustrative window." },
    { period: "Q3 2026", category: "beauty", headline: "Beauty niche ‘earnings’ — example", revenue: 88, yoy: 3.2, beat: false, note: "Serums lagged as saturation stayed high in the sample." },
    { period: "Q3 2026", category: "fitness", headline: "Fitness niche ‘earnings’ — example", revenue: 74, yoy: 6.8, beat: true, note: "Bands and blocks offset softer mats in Germany." },
    { period: "Q3 2026", category: "home", headline: "Home niche ‘earnings’ — example", revenue: 69, yoy: -1.5, beat: false, note: "Desk lamps weighed on the index; diffusers were mixed." },
    { period: "Q3 2026", category: "tech", headline: "Tech Accessories ‘earnings’ — example", revenue: 112, yoy: 1.1, beat: false, note: "Earbuds held up; cables and cases diluted the print." },
    { period: "Q2 2026", category: "kitchen", headline: "Kitchen Q2 — example", revenue: 117, yoy: 7.1, beat: true, note: "Seasonal lull versus Q4, still above the prior-year sample." },
    { period: "Q2 2026", category: "pet", headline: "Pet Q2 — example", revenue: 84, yoy: 11.0, beat: true, note: "Steady adoption of auto litter boxes in the example set." }
  ];

  function movers() {
    var sorted = TICKERS.slice().sort(function (a, b) { return b.chg - a.chg; });
    return {
      gainers: sorted.slice(0, 5),
      losers: sorted.slice(-5).reverse(),
      active: TICKERS.slice().sort(function (a, b) { return b.volume - a.volume; }).slice(0, 5)
    };
  }

  function consensus(t) {
    var r = t.rating, total = r.buy + r.hold + r.sell;
    return { buy: r.buy, hold: r.hold, sell: r.sell, total: total, buyPct: round(r.buy / total * 100, 0), holdPct: round(r.hold / total * 100, 0), sellPct: round(r.sell / total * 100, 0) };
  }

  /* Backtest: buy 6 months ago at first 6M close, hold to now, vs category index. */
  function backtest(ticker) {
    var t = BY_TICKER[ticker];
    if (!t) return null;
    var px = history(ticker, "6M", "price").values;
    var idx = indexOf(t.category).spark;
    /* resample index spark (24) to 26 */
    var idx26 = [];
    for (var i = 0; i < px.length; i++) {
      var p = i / (px.length - 1) * (idx.length - 1);
      var a = Math.floor(p), b = Math.min(idx.length - 1, a + 1), f = p - a;
      idx26.push(idx[a] * (1 - f) + idx[b] * f);
    }
    var entry = px[0], last = px[px.length - 1];
    var eq = px.map(function (v) { return round((v / entry) * 100, 2); });
    var ix = idx26.map(function (v) { return round((v / idx26[0]) * 100, 2); });
    var ret = round((last / entry - 1) * 100, 2);
    var idxRet = round((idx26[idx26.length - 1] / idx26[0] - 1) * 100, 2);
    var peak = eq[0], maxDd = 0;
    eq.forEach(function (v) { if (v > peak) peak = v; maxDd = Math.min(maxDd, (v - peak) / peak); });
    return {
      ticker: ticker, entry: entry, last: last, ret: ret, indexRet: round(idxRet, 2),
      alpha: round(ret - idxRet, 2), maxDrawdown: round(maxDd * 100, 2),
      equity: eq, index: ix, labels: history(ticker, "6M", "price").labels,
      note: "EXAMPLE backtest: buy the first close in a modelled 6-month series, hold to the last close. Not tradable, not a live track record."
    };
  }

  g.MSData = {
    EXAMPLE: true,
    disclaimer: "EXAMPLE DATA — illustrative figures for the MarketScope desk, not live market measurements.",
    markets: MARKETS,
    marketAbbr: MARKET_ABBR,
    categories: CATEGORIES,
    tickers: TICKERS,
    byTicker: BY_TICKER,
    indices: INDICES,
    heat: HEAT,
    news: NEWS,
    events: EVENTS,
    earnings: EARNINGS,
    timeframes: TF,
    history: history,
    labelsFor: labelsFor,
    seriesFor: seriesFor,
    movers: movers,
    consensus: consensus,
    backtest: backtest,
    indexOf: indexOf,
    get: function (ticker) { return BY_TICKER[ticker] || null; }
  };
})(window);
