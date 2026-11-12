/* MarketScope Store Intelligence — directory built from the live snapshot.
   Only sellers that appear in Google Shopping listings in live-snapshot.json
   are listed. We do not invent traffic, ads, theme, apps, or catalog size. */
(function (g) {
  "use strict";

  function hostOf(raw) {
    try {
      var u = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : "https://" + raw);
      return u.hostname.replace(/^www\./, "").toLowerCase();
    } catch (e) { return ""; }
  }
  function detectPlatform(raw) {
    var s = String(raw || "").toLowerCase();
    var host = hostOf(raw);
    if (/myshopify\.com/.test(host) || /shopifycdn|cdn\.shopify/.test(s) || /\/(products|collections)\//.test(s)) {
      return { id: "shopify", name: "Shopify", guessed: !/myshopify\.com/.test(host) };
    }
    if (/woocommerce|wp-content|\/product\//.test(s) || /\/\?post_type=product/.test(s)) {
      return { id: "woocommerce", name: "WooCommerce", guessed: true };
    }
    if (/bigcommerce/.test(host) || /bigcommerce\.com/.test(s)) return { id: "bigcommerce", name: "BigCommerce", guessed: false };
    if (/\.squarespace\.com|squarespace-cdn/.test(s)) return { id: "squarespace", name: "Squarespace", guessed: false };
    if (/\.wixsite\.com|wix\.com/.test(s)) return { id: "wix", name: "Wix", guessed: false };
    if (/shop\.tiktok\.com/.test(host)) return { id: "tiktok", name: "TikTok Shop", guessed: false };
    if (/ebay\./.test(host)) return { id: "ebay", name: "eBay store", guessed: false };
    if (/etsy\.com/.test(host)) return { id: "etsy", name: "Etsy shop", guessed: false };
    if (/amazon\./.test(host)) return { id: "amazon", name: "Amazon seller storefront", guessed: false };
    if (/walmart\./.test(host)) return { id: "walmart", name: "Walmart", guessed: false };
    if (/target\./.test(host)) return { id: "target", name: "Target", guessed: false };
    if (/homedepot\.|home-depot/.test(host)) return { id: "homedepot", name: "Home Depot", guessed: false };
    if (/bestbuy\./.test(host)) return { id: "bestbuy", name: "Best Buy", guessed: false };
    return { id: "unknown", name: "Google Shopping seller", guessed: true };
  }
  function slugify(s) {
    return String(s || "store").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "store";
  }
  function money(n) {
    if (n == null || !isFinite(Number(n))) return null;
    return Math.round(Number(n) * 100) / 100;
  }

  function listingsForSeller(products, name, domain) {
    var out = [];
    var key = String(name || "").toLowerCase();
    var host = (domain || "").toLowerCase().replace(/^www\./, "");
    (products || []).forEach(function (p) {
      (p.listings || []).forEach(function (L) {
        var sn = String(L.seller || "").toLowerCase();
        var dh = String(L.domain || "").toLowerCase().replace(/^www\./, "");
        if ((key && sn === key) || (host && dh === host)) {
          out.push({
            title: L.title,
            price: L.price,
            currency: L.currency,
            rating: L.rating,
            reviews_count: L.reviews_count,
            ticker: p.ticker,
            product: p.product,
            domain: L.domain
          });
        }
      });
    });
    return out;
  }

  function priceDistribution(prices) {
    var bands = [
      { band: "$0–25", lo: 0, hi: 25, n: 0 },
      { band: "$25–50", lo: 25, hi: 50, n: 0 },
      { band: "$50–100", lo: 50, hi: 100, n: 0 },
      { band: "$100+", lo: 100, hi: Infinity, n: 0 }
    ];
    prices.forEach(function (v) {
      for (var i = 0; i < bands.length; i++) {
        if (v >= bands[i].lo && v < bands[i].hi) { bands[i].n += 1; break; }
      }
    });
    return bands.filter(function (b) { return b.n > 0; });
  }

  function toProfile(row, snap) {
    var domain = row.domain || "";
    var url = domain ? ("https://" + domain.replace(/^https?:\/\//, "").replace(/^www\./, "")) : "";
    var plat = detectPlatform(url || row.name);
    var products = (snap && snap.products) || [];
    var theirs = listingsForSeller(products, row.name, domain);
    var prices = theirs.map(function (L) { return Number(L.price); }).filter(function (n) { return isFinite(n); });
    var best = theirs.slice().sort(function (a, b) {
      return (Number(b.reviews_count) || 0) - (Number(a.reviews_count) || 0);
    }).slice(0, 8).map(function (L) {
      var share = row.listings ? (1 / Math.max(row.listings, 1)) : null;
      return { name: L.title || L.product, price: L.price, share: L.product || "", ticker: L.ticker };
    });
    var ratings = theirs.map(function (L) { return Number(L.rating); }).filter(function (n) { return isFinite(n); });
    var avgR = ratings.length ? Math.round((ratings.reduce(function (a, b) { return a + b; }, 0) / ratings.length) * 100) / 100 : null;
    return {
      slug: slugify(domain || row.name),
      name: row.name,
      url: url,
      domain: domain,
      platform: plat.name,
      platformId: plat.id,
      platformGuessed: !domain,
      theme: null,
      apps: [],
      catalog: row.listings,
      catalogLabel: "Visible Google Shopping listings in this basket",
      category: "Google Shopping (this basket)",
      bestsellers: best,
      priceDistribution: priceDistribution(prices),
      timeline: [],
      trafficBand: null,
      topCountries: ["United States"],
      ads: [],
      sentiment: avgR,
      reviews: avgR,
      listings: row.listings,
      share: row.share,
      products: row.products || [],
      median_price: row.median_price,
      inSnapshot: true,
      banner: (snap && snap.label) || "Live data snapshot · Google Shopping & Search · US · Nov 12, 2026"
    };
  }

  function placeholderFromUrl(raw) {
    var host = hostOf(raw);
    if (!host) return null;
    var plat = detectPlatform(raw);
    var name = host.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    return {
      slug: slugify(host),
      name: name || host,
      url: /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : "https://" + raw,
      domain: host,
      platform: plat.name,
      platformId: plat.id,
      platformGuessed: plat.guessed,
      theme: null,
      apps: [],
      catalog: null,
      category: "",
      bestsellers: [],
      priceDistribution: [],
      timeline: [],
      trafficBand: null,
      topCountries: [],
      ads: [],
      sentiment: null,
      reviews: null,
      listings: null,
      share: null,
      products: [],
      inSnapshot: false,
      banner: "This seller is not in the Nov 12, 2026 Google Shopping snapshot. We only show a platform guess from the URL. Traffic, ads, catalog size and reviews are Coming soon — we will not invent them."
    };
  }

  var STORES = [];
  var BY_SLUG = {};
  var BY_HOST = {};

  function install(list) {
    STORES = list;
    BY_SLUG = {};
    BY_HOST = {};
    STORES.forEach(function (s) {
      BY_SLUG[s.slug] = s;
      if (s.domain) BY_HOST[s.domain.replace(/^www\./, "").toLowerCase()] = s;
    });
    g.MSStores.all = STORES;
    g.MSStores.get = function (slug) { return BY_SLUG[slug] || null; };
    document.dispatchEvent(new CustomEvent("ms:stores-ready"));
    return g.MSStores;
  }

  function fromSnap(snap) {
    var rows = ((snap && snap.stores) || []).slice();
    rows.sort(function (a, b) { return (b.listings || 0) - (a.listings || 0); });
    return install(rows.map(function (r) { return toProfile(r, snap); }));
  }

  function load() {
    if (g.MS_SNAPSHOT) return Promise.resolve(fromSnap(g.MS_SNAPSHOT));
    if (g.MSData && g.MSData.ready) {
      return g.MSData.ready.then(function () { return fromSnap(g.MS_SNAPSHOT); });
    }
    return fetch("assets/data/live-snapshot.json", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("Could not load the live snapshot.");
      return r.json();
    }).then(function (snap) {
      g.MS_SNAPSHOT = snap;
      return fromSnap(snap);
    });
  }

  var ready = load();
  g.MSStores = {
    EXAMPLE: false,
    ready: ready,
    disclaimer: "Directory of Google Shopping sellers that appeared in the Nov 12, 2026 US basket. Listing share is their share of visible listings in this snapshot, not website traffic.",
    all: STORES,
    get: function (slug) { return BY_SLUG[slug] || null; },
    detectPlatform: detectPlatform,
    fromUrl: function (raw) {
      var host = hostOf(raw);
      if (host && BY_HOST[host]) return BY_HOST[host];
      var known = STORES.filter(function (s) { return hostOf(s.url) === host; })[0];
      if (known) return known;
      return placeholderFromUrl(raw);
    },
    hostOf: hostOf
  };
})(window);
