/* MarketScope — Store Intelligence EXAMPLE directory.
   Profiles are illustrative. Nothing here is a live crawl or ad-library pull. */
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
    return { id: "unknown", name: "Storefront (undetected)", guessed: true };
  }

  var STORES = [
    {
      slug: "hearth-copper",
      name: "Hearth & Copper",
      url: "https://hearth-and-copper.example",
      platform: "Shopify",
      theme: "Dawn-style theme (pattern guess)",
      apps: ["Email / CRM app (example)", "Reviews app (example)", "Subscription box app (example)"],
      catalog: 86,
      category: "Kitchen",
      bestsellers: [
        { name: "Cast iron skillet, 10\"", price: 49, share: "18%" },
        { name: "Enameled Dutch oven", price: 129, share: "14%" },
        { name: "Beechwood utensil set", price: 28, share: "9%" }
      ],
      priceDistribution: [
        { band: "$0–25", n: 18 }, { band: "$25–50", n: 27 }, { band: "$50–100", n: 24 }, { band: "$100+", n: 17 }
      ],
      timeline: [
        { date: "2026-11-02", type: "new_product", text: "New: carbon-steel wok (example listing)" },
        { date: "2026-10-21", type: "price_change", text: "Dutch oven $139 → $129 (example)" },
        { date: "2026-10-08", type: "new_product", text: "New: linen oven mitts, 2-pack (example)" },
        { date: "2026-09-19", type: "price_change", text: "Skillet promo ended, back to $49 (example)" }
      ],
      trafficBand: "50k–100k visits / month (modelled band)",
      topCountries: ["United States", "Canada", "United Kingdom"],
      ads: [
        { network: "Meta Ad Library", status: "Active (example)", creative: "‘Weeknight skillet’ — US/CA, 30 days" },
        { network: "TikTok Creative Center", status: "None found in this sample", creative: "—" }
      ],
      sentiment: 76, reviews: 4.6
    },
    {
      slug: "northwind-outdoors",
      name: "Northwind Outdoors",
      url: "https://northwind-outdoors.example",
      platform: "Shopify",
      theme: "Enterprise-style theme (pattern guess)",
      apps: ["Loyalty app (example)", "Returns portal (example)"],
      catalog: 142,
      category: "Fitness",
      bestsellers: [
        { name: "Insulated hike bottle, 32 oz", price: 34, share: "12%" },
        { name: "Trail daypack, 20 L", price: 79, share: "11%" },
        { name: "Merino liner socks, 3-pack", price: 22, share: "8%" }
      ],
      priceDistribution: [
        { band: "$0–25", n: 40 }, { band: "$25–50", n: 48 }, { band: "$50–100", n: 36 }, { band: "$100+", n: 18 }
      ],
      timeline: [
        { date: "2026-11-06", type: "new_ad", text: "New Meta creative: ‘First frost kit’ (example, public library)" },
        { date: "2026-10-28", type: "new_product", text: "New: packable rain shell (example)" },
        { date: "2026-10-12", type: "price_change", text: "Daypack $89 → $79 (example)" }
      ],
      trafficBand: "100k–250k visits / month (modelled band)",
      topCountries: ["United States", "United Kingdom", "Germany"],
      ads: [
        { network: "Meta Ad Library", status: "Active (example)", creative: "‘First frost kit’ — US, 14 days" },
        { network: "Google Ads Transparency", status: "Active (example)", creative: "Search: trail daypack" }
      ],
      sentiment: 71, reviews: 4.4
    },
    {
      slug: "paws-porcelain",
      name: "Paws & Porcelain",
      url: "https://pawsandporcelain.example",
      platform: "WooCommerce",
      theme: "Block theme (example guess)",
      apps: ["Woo subscriptions (example)", "Review plugin (example)"],
      catalog: 54,
      category: "Pet",
      bestsellers: [
        { name: "Ceramic pet fountain", price: 39, share: "22%" },
        { name: "Slow-feed bowl, stoneware", price: 24, share: "13%" },
        { name: "Walnut food stand", price: 58, share: "10%" }
      ],
      priceDistribution: [
        { band: "$0–25", n: 16 }, { band: "$25–50", n: 22 }, { band: "$50–100", n: 12 }, { band: "$100+", n: 4 }
      ],
      timeline: [
        { date: "2026-11-04", type: "new_product", text: "New: stainless fountain filter 3-pack (example)" },
        { date: "2026-10-18", type: "price_change", text: "Fountain $36 → $39 (example)" },
        { date: "2026-09-30", type: "new_ad", text: "Example ad set paused in the sample window" }
      ],
      trafficBand: "20k–50k visits / month (modelled band)",
      topCountries: ["United Kingdom", "United States", "Ireland"],
      ads: [
        { network: "Meta Ad Library", status: "Inactive in this sample", creative: "Last seen: ‘Quiet fountain’ — UK" }
      ],
      sentiment: 82, reviews: 4.7
    },
    {
      slug: "velvet-routine",
      name: "Velvet Routine",
      url: "https://velvetroutine.example",
      platform: "Shopify",
      theme: "Custom beauty theme (example guess)",
      apps: ["Quiz / routine builder (example)", "SMS app (example)", "Subscriptions (example)"],
      catalog: 37,
      category: "Beauty",
      bestsellers: [
        { name: "Vitamin C serum, 30 ml", price: 28, share: "24%" },
        { name: "Overnight hair mask", price: 22, share: "16%" },
        { name: "Mineral SPF stick", price: 19, share: "11%" }
      ],
      priceDistribution: [
        { band: "$0–25", n: 21 }, { band: "$25–50", n: 12 }, { band: "$50–100", n: 4 }, { band: "$100+", n: 0 }
      ],
      timeline: [
        { date: "2026-11-08", type: "new_ad", text: "New Meta creative in the public library (example)" },
        { date: "2026-10-25", type: "new_product", text: "New: travel serum set (example)" },
        { date: "2026-10-03", type: "price_change", text: "Hair mask $24 → $22 (example)" }
      ],
      trafficBand: "75k–150k visits / month (modelled band)",
      topCountries: ["United States", "Australia", "United Kingdom"],
      ads: [
        { network: "Meta Ad Library", status: "Active (example)", creative: "‘Glass-skin morning’ — US/AU" },
        { network: "TikTok Creative Center", status: "Active (example)", creative: "UGC-style serum routine" }
      ],
      sentiment: 68, reviews: 4.3
    },
    {
      slug: "cable-case-co",
      name: "Cable & Case Co.",
      url: "https://cableandcase.example",
      platform: "WooCommerce",
      theme: "Catalog theme (example guess)",
      apps: ["Wholesale plugin (example)"],
      catalog: 210,
      category: "Tech Accessories",
      bestsellers: [
        { name: "USB-C braided cable, 2 m", price: 12, share: "15%" },
        { name: "Clear case, latest flagship", price: 18, share: "11%" },
        { name: "GaN 30 W charger", price: 27, share: "9%" }
      ],
      priceDistribution: [
        { band: "$0–25", n: 148 }, { band: "$25–50", n: 46 }, { band: "$50–100", n: 14 }, { band: "$100+", n: 2 }
      ],
      timeline: [
        { date: "2026-11-09", type: "new_product", text: "New: USB-C to Lightning short lead (example)" },
        { date: "2026-10-30", type: "price_change", text: "Cable 3-pack $29 → $24 (example)" },
        { date: "2026-10-14", type: "price_change", text: "Case restock, price unchanged (example)" }
      ],
      trafficBand: "150k–300k visits / month (modelled band)",
      topCountries: ["United States", "Germany", "Canada"],
      ads: [
        { network: "Google Ads Transparency", status: "Active (example)", creative: "Shopping: braided cable" }
      ],
      sentiment: 51, reviews: 3.9
    }
  ];

  var BY_SLUG = {};
  STORES.forEach(function (s) {
    s.example = true;
    s.banner = "EXAMPLE PROFILE — Early access. This is labelled sample output, not a live crawl of the store or its ads.";
    BY_SLUG[s.slug] = s;
  });

  function slugifyHost(host) {
    return String(host || "store").replace(/\./g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 48) || "store";
  }

  function fromUrl(raw) {
    var host = hostOf(raw);
    if (!host) return null;
    var known = STORES.filter(function (s) { return hostOf(s.url) === host; })[0];
    if (known) return known;
    var plat = detectPlatform(raw);
    var rng = mulberry32(seedFrom(host));
    var catalog = 24 + Math.round(rng() * 200);
    function band(a, b) { return a + Math.round(rng() * (b - a)); }
    var slug = slugifyHost(host);
    var name = host.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    return {
      slug: slug,
      name: name || host,
      url: /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : "https://" + raw,
      platform: plat.name,
      platformId: plat.id,
      platformGuessed: plat.guessed,
      theme: "Not extracted yet (live detection is not connected)",
      apps: ["Apps and theme are not read from the live storefront in this early-access preview"],
      catalog: catalog,
      category: "Unclassified",
      bestsellers: [
        { name: "Top listing (example placeholder)", price: band(12, 80), share: "—" },
        { name: "Second listing (example placeholder)", price: band(12, 80), share: "—" },
        { name: "Third listing (example placeholder)", price: band(12, 80), share: "—" }
      ],
      priceDistribution: [
        { band: "$0–25", n: Math.round(catalog * 0.3) },
        { band: "$25–50", n: Math.round(catalog * 0.35) },
        { band: "$50–100", n: Math.round(catalog * 0.25) },
        { band: "$100+", n: Math.round(catalog * 0.1) }
      ],
      timeline: [
        { date: "—", type: "new_product", text: "A new-product timeline will appear here once public catalog collection is connected." },
        { date: "—", type: "price_change", text: "Price-change events will appear here once public collection is connected." }
      ],
      trafficBand: "Not estimated yet (modelled bands are shown only for directory examples)",
      topCountries: ["Not detected from the URL"],
      ads: [
        { network: "Public ad libraries", status: "Not queried yet", creative: "Live ad-library lookups are not connected in this preview." }
      ],
      sentiment: null,
      reviews: null,
      synthetic: true,
      example: true,
      banner: "EXAMPLE / EARLY ACCESS — we only detected a platform guess from the URL. We did not fetch this store, its catalog, traffic or ads. Figures below are placeholders so you can see the profile layout."
    };
  }

  g.MSStores = {
    EXAMPLE: true,
    disclaimer: "Store Intelligence uses only publicly available information in future live mode. Profiles shown today are labelled examples. We do not collect personal data, and we do not bypass logins or access controls.",
    all: STORES,
    get: function (slug) { return BY_SLUG[slug] || null; },
    detectPlatform: detectPlatform,
    fromUrl: fromUrl,
    hostOf: hostOf
  };
})(window);
