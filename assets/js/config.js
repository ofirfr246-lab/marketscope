/* =====================================================================
   MarketScope site config — EDIT PRICES & PLANS HERE (single source).
   Prices set from pricing research (Nov 2026). Change them here only.
   Used by: home pricing cards, pricing.html cards, comparison table,
   credit top-ups, sign-up plan picker, app preview wallet.
   Framing: Starter answers “Is there demand?”, Plus “How is it being
   sold?”, Pro “How much will I make?”.
   Data sources: Free & Starter = Google Shopping + Google Search
   (Live) + Amazon (Coming soon). Plus adds Meta Ad Library + TikTok
   (Coming soon). Pro adds AliExpress and Shopify competitor stores
   (Coming soon).
   Only Google Shopping and Google Search are live today.
   ===================================================================== */
window.MS_CONFIG = {
  currency: "$",
  annualMonthsFree: 2, // yearly billing = pay 10 months, get 12
  plans: [
    { id: "free", name: "Free", price: 0, credits: 5, creditsLabel: "5 credits (one-time)",
      blurb: "Try MarketScope on a real idea.",
      question: "See how a report works.",
      cta: "Start free",
      sources: ["Google Shopping", "Google Search", "Amazon"],
      features: [
        "5 one-time credits",
        "Google Shopping &amp; Search <span class=\"chip live\">Live</span> · Amazon <span class=\"chip soon\">Coming soon</span>",
        "Demand, Competition, Saturation & Opportunity scores",
        "Verdict (STRONG BUY → AVOID)",
        "AI Advisor summary",
        "Paste & Analyze from a product URL (early access)",
        "1 Watchlist slot",
        "Terminal desk (example tape, movers, 7-day charts)"
      ] },
    { id: "starter", name: "Starter", price: 39, credits: 30, creditsLabel: "30 credits / month",
      blurb: "For founders validating their first products.",
      question: "Answers “Is there demand?”",
      cta: "Choose Starter",
      sources: ["Google Shopping", "Google Search", "Amazon"],
      features: [
        "30 credits every month",
        "Everything in Free, plus:",
        "Amazon BSR &amp; review velocity <span class=\"chip soon\">Coming soon</span>",
        "Price-band recommendation",
        "Competitor Intelligence & 1 tracked store",
        "PDF / CSV export & saved reports",
        "Email alerts (5) · compare 2 names",
        "Indices, calendar, ratings & 30-day history"
      ] },
    { id: "plus", name: "Plus", price: 149, credits: 100, creditsLabel: "100 credits / month", popular: true,
      blurb: "For active sellers testing multiple markets.",
      question: "Answers “How is it being sold?”",
      cta: "Choose Plus",
      sources: ["Google Shopping", "Google Search", "Amazon", "Meta Ad Library", "TikTok"],
      features: [
        "100 credits every month",
        "Everything in Starter, plus:",
        "Meta Ad Library &amp; TikTok ads / Creative Center <span class=\"chip soon\">Coming soon</span>",
        "Ad longevity, advertiser count &amp; creative angles <span class=\"chip soon\">Coming soon</span>",
        "TikTok trend velocity &amp; hashtag views <span class=\"chip soon\">Coming soon</span>",
        "Screener, heatmap, backtest, sentiment & compare up to 4",
        "20 email alerts · 10 tracked stores · 12-month history",
        "AI Advisor summaries & priority email support"
      ] },
    { id: "pro", name: "Pro", price: 349, credits: 200, creditsLabel: "200 credits / month",
      blurb: "For brands and teams making big bets.",
      question: "Answers “How much will I make?”",
      cta: "Choose Pro",
      sources: ["Google Shopping", "Google Search", "Amazon", "Meta Ad Library", "TikTok", "AliExpress", "Shopify"],
      features: [
        "200 credits every month",
        "Everything in Plus, plus:",
        "AliExpress supplier finder with landed cost <span class=\"chip soon\">Coming soon</span>",
        "Shopify competitor stores — store count, price bands, top stores and newest launches <span class=\"chip soon\">Coming soon</span>",
        "Margin / ROAS breakeven &amp; profit simulator <span class=\"chip soon\">Coming soon</span>",
        "Unlimited tracked stores, watch slots & 24-month history",
        "Portfolio desk & white-label PDF reports (early access)",
        "API access (early access) · 3 team seats",
        "Priority support & onboarding call"
      ] }
  ],
  // Pay-per-use credit packs for the Credit Wallet
  topups: [
    { credits: 10, price: 19 },
    { credits: 50, price: 85, tag: "Save 10%" },
    { credits: 150, price: 225, tag: "Best value · save 21%" }
  ],
  // Full comparison matrix: [label, free, starter, plus, pro]; true/false or text
  matrix: [
    ["Credits", "5 one-time", "30 / mo", "100 / mo", "200 / mo"],
    { group: "Data sources" },
    ["Google Shopping", "Live", "Live", "Live", "Live"],
    ["Google Search", "Live", "Live", "Live", "Live"],
    ["Amazon (listings & pricing)", "Coming soon", "Coming soon", "Coming soon", "Coming soon"],
    ["Amazon BSR & review velocity", false, "Coming soon", "Coming soon", "Coming soon"],
    ["Meta Ad Library", false, false, "Coming soon", "Coming soon"],
    ["TikTok ads & Creative Center", false, false, "Coming soon", "Coming soon"],
    ["AliExpress (supplier cost, orders, margin)", false, false, false, "Coming soon"],
    ["Shopify (competitor stores, price bands, launches)", false, false, false, "Coming soon"],
    { group: "Analysis & scores" },
    ["Demand / Competition / Saturation / Opportunity scores", true, true, true, true],
    ["Verdict (STRONG BUY → AVOID)", true, true, true, true],
    ["Paste & Analyze from a product URL", "Early access", "Early access", "Early access", "Early access"],
    ["Price-band recommendation", false, true, true, true],
    ["AI Advisor", "Summary", "Full", "Full + summaries", "Full + follow-ups"],
    ["Competitor Intelligence", "Top 3", true, true, true],
    ["Ad longevity, advertiser count & creative angles", false, false, "Coming soon", "Coming soon"],
    ["TikTok trend velocity & hashtag views", false, false, "Coming soon", "Coming soon"],
    ["AliExpress supplier finder & landed cost", false, false, false, "Coming soon"],
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
