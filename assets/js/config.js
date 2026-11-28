/* =====================================================================
   MarketScope site config — EDIT PRICES & PLANS HERE (single source).
   Prices set from pricing research (Nov 2026). Change them here only.
   Used by: home pricing cards, pricing.html cards, comparison table,
   credit top-ups, sign-up plan picker, app preview wallet.
   Framing: Starter answers “Is there demand?”, Plus “How is it being
   sold?”, Pro “How much will I make?”.
   Data sources by plan: Free and Starter get Google Shopping, Google Search
   and the Meta Ad Library (public ads). Plus adds TikTok and the supplier
   marketplaces (AliExpress, Alibaba, 1688, CJ Dropshipping, Temu, DHgate).
   Pro adds Shopify competitor stores and Amazon (via DataForSEO, Soon).
   The Meta ad-account connection (read-only, beta) is Plus and up.
   Ad publishing, TikTok Creative Center, connecting your own Shopify store,
   and the Exchange as real-money trading are not live.
   ===================================================================== */
/* Public base URL of the site (canonical/og/sitemap use the same value).
   Change it everywhere with: scripts/set-site-url.sh <new-url-with-trailing-slash>
   Page navigation is relative, so this is only for absolute links. */
window.MS_SITE_URL = "https://ofirfr246-lab.github.io/marketscope/";

window.MS_CONFIG = {
  currency: "$",
  annualMonthsFree: 2, // yearly billing = pay 10 months, get 12
  plans: [
    { id: "free", name: "Free", price: 0, credits: 5, creditsLabel: "5 credits (one-time)",
      blurb: "Try MarketScope on a real idea.",
      question: "See how a report works.",
      cta: "Start free",
      sources: ["Google Shopping", "Google Search", "Meta Ad Library"],
      features: [
        "5 one-time credits",
        "Google Shopping &amp; Search <span class=\"chip live\">Live</span>",
        "Meta Ad Library (public ads) <span class=\"chip live\">Live</span> in Supplier Intelligence",
        "Demand, Competition, Saturation & Opportunity scores",
        "Verdict (STRONG BUY → AVOID)",
        "AI Advisor summary",
        "Paste & Analyze from a product URL (early access)",
        "1 Watchlist slot",
        "Terminal desk (example tape, movers, 7-day charts)"
      ] },
    { id: "starter", name: "Starter", price: 19, credits: 30, creditsLabel: "30 credits / month",
      blurb: "For founders validating their first products.",
      question: "Answers “Is there demand?”",
      cta: "Choose Starter",
      sources: ["Google Shopping", "Google Search", "Meta Ad Library"],
      features: [
        "30 credits every month",
        "Everything in Free, plus:",
        "Price-band recommendation",
        "Competitor Intelligence & 1 tracked store",
        "PDF / CSV export & saved reports",
        "Email alerts (5) · compare 2 names",
        "Indices, calendar, ratings & 30-day history"
      ] },
    { id: "plus", name: "Plus", price: 49, credits: 100, creditsLabel: "100 credits / month", popular: true,
      blurb: "For active sellers testing multiple markets.",
      question: "Answers “How is it being sold?”",
      cta: "Choose Plus",
      sources: ["Google Shopping", "Google Search", "Meta Ad Library", "TikTok", "AliExpress"],
      features: [
        "100 credits every month",
        "Everything in Starter, plus:",
        "TikTok videos &amp; hashtag views <span class=\"chip live\">Live</span> in Supplier Intelligence (Creative Center not connected)",
        "AliExpress, Alibaba, 1688, CJ, Temu and DHgate supplier search with landed cost <span class=\"chip live\">Live</span> in Supplier Intelligence",
        "Meta ad-account connection (read-only) <span class=\"chip beta\">Beta</span>",
        "Screener, heatmap, backtest, sentiment & compare up to 4",
        "20 email alerts · 10 tracked stores · 12-month history",
        "AI Advisor summaries & priority email support"
      ] },
    { id: "pro", name: "Pro", price: 99, credits: 200, creditsLabel: "200 credits / month",
      blurb: "For brands and teams making big bets.",
      question: "Answers “How much will I make?”",
      cta: "Choose Pro",
      sources: ["Google Shopping", "Google Search", "Meta Ad Library", "TikTok", "AliExpress", "Shopify", "Amazon"],
      features: [
        "200 credits every month",
        "Everything in Plus, plus:",
        "Shopify competitor stores — store count, price bands, top stores and newest launches <span class=\"chip live\">Live</span> in Supplier Intelligence",
        "Amazon listings, pricing, BSR &amp; review velocity <span class=\"chip soon\">Soon · DataForSEO</span>",
        "Margin / ROAS breakeven &amp; profit simulator <span class=\"chip soon\">Coming soon</span>",
        "Unlimited tracked stores, watch slots & 24-month history",
        "Portfolio desk & white-label PDF reports (early access)",
        "API access (early access) · 3 team seats",
        "Priority support & onboarding call"
      ] }
  ],
  // Pay-per-use credit packs for the Credit Wallet
  topups: [
    { credits: 10, price: 9 },
    { credits: 50, price: 35, tag: "Save 22%" },
    { credits: 150, price: 89, tag: "Best value · save 34%" }
  ],
  // Full comparison matrix: [label, free, starter, plus, pro]; true/false or text
  matrix: [
    ["Credits", "5 one-time", "30 / mo", "100 / mo", "200 / mo"],
    { group: "Data sources" },
    ["Google Shopping", "Live", "Live", "Live", "Live"],
    ["Google Search", "Live", "Live", "Live", "Live"],
    ["Meta Ad Library (public ads, Supplier Intelligence)", "Live", "Live", "Live", "Live"],
    ["TikTok videos & hashtag views (Supplier Intelligence)", false, false, "Live", "Live"],
    ["TikTok Creative Center & ad publishing", false, false, false, false],
    ["AliExpress, Alibaba, 1688, CJ, Temu, DHgate (Supplier Intelligence)", false, false, "Live", "Live"],
    ["Shopify competitor stores (Supplier Intelligence)", false, false, false, "Live"],
    ["Amazon (listings & pricing, via DataForSEO)", false, false, false, "Soon"],
    ["Amazon BSR & review velocity (via DataForSEO)", false, false, false, "Soon"],
    ["Meta ad-account connection (read-only, beta)", false, false, "Beta", "Beta"],
    { group: "Analysis & scores" },
    ["Demand / Competition / Saturation / Opportunity scores", true, true, true, true],
    ["Verdict (STRONG BUY → AVOID)", true, true, true, true],
    ["Paste & Analyze from a product URL", "Early access", "Early access", "Early access", "Early access"],
    ["Price-band recommendation", false, true, true, true],
    ["AI Advisor", "Summary", "Full", "Full + summaries", "Full + follow-ups"],
    ["Competitor Intelligence", "Top 3", true, true, true],
    ["Ad longevity, advertiser count & creative angles", "Live", "Live", "Live", "Live"],
    ["TikTok trend velocity & hashtag views (Supplier Intelligence)", false, false, "Live", "Live"],
    ["Supplier finder & landed-cost estimate (Supplier Intelligence)", false, false, "Live", "Live"],
    ["Margin / ROAS breakeven calculator", false, false, false, "Coming soon"],
    ["Profit simulator", false, false, false, "Coming soon"],
    { group: "Market terminal" },
    ["Live snapshot tape, movers and desk feed", true, true, true, true],
    ["Market Terminal history", "7 days", "30 days", "12 months", "24 months"],
    ["Category indices", false, true, true, true],
    ["Events calendar", false, true, true, true],
    ["Analyst ratings & target range", false, true, true, true],
    ["Compare products", "—", "2 names", "Up to 4", "Up to 4"],
    ["Screener", false, false, true, true],
    ["Category heatmap", false, false, true, true],
    ["Backtest (6-month hold)", false, false, true, true],
    ["Sentiment gauge", false, false, true, true],
    ["Niche ‘earnings’ reports", false, false, true, true],
    ["Portfolio desk", false, false, false, true],
    { group: "Store intelligence" },
    ["Store Intelligence directory", true, true, true, true],
    ["Tracked stores", "—", "1", "10", "Unlimited"],
    ["Full store profile (catalog, ads, sentiment)", "—", "—", "When live", "When live"],
    { group: "Alerts & automation" },
    ["Watchlist slots", "1", "5", "20", "Unlimited"],
    ["Watchlist alert rules", false, true, true, true],
    ["Email alerts", "—", "5", "20", "Unlimited"],
    ["Saved reports", true, true, true, true],
    ["Credit top-ups", true, true, true, true],
    { group: "Export & collaboration" },
    ["Export reports (PDF / CSV)", false, true, true, true],
    ["White-label PDF reports", false, false, false, "Early access"],
    ["Team seats", "—", "—", "—", "3 (early access)"],
    ["API access", false, false, false, "Early access"],
    { group: "Support" },
    ["Support", "Community", "Email", "Priority email", "Priority + onboarding call"]
  ]
};
