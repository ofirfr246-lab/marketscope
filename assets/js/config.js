/* =====================================================================
   MarketScope site config — EDIT PRICES & PLANS HERE (single source).
   Prices set from pricing research (Nov 2026). Change them here only.
   Used by: home pricing cards, pricing.html cards, comparison table,
   credit top-ups, sign-up plan picker, app preview wallet.
   ===================================================================== */
window.MS_CONFIG = {
  currency: "$",
  annualMonthsFree: 2, // yearly billing = pay 10 months, get 12
  plans: [
    { id: "free", name: "Free", price: 0, credits: 5, creditsLabel: "5 credits (one-time)",
      blurb: "Try MarketScope on a real idea.", cta: "Start free",
      sources: ["Google Shopping", "Google Search"],
      features: ["5 free credits", "Google Shopping + Google Search", "Market Reports & scores", "AI Advisor summary", "1 Watchlist slot", "Terminal desk (example tape, movers, 7-day charts)"] },
    { id: "starter", name: "Starter", price: 39, credits: 30, creditsLabel: "30 credits / month",
      blurb: "For founders validating their first products.", cta: "Choose Starter",
      sources: ["Google Shopping", "Google Search"],
      features: ["30 credits every month", "Google Shopping + Google Search", "Full AI Advisor analysis", "Competitor Intelligence", "5 Watchlist slots + alert rules", "Category indices, events calendar, compare 2 names", "1 tracked competitor store", "Analyst ratings & target range", "30-day Terminal history"] },
    { id: "plus", name: "Plus", price: 149, credits: 100, creditsLabel: "100 credits / month", popular: true,
      blurb: "For active sellers testing multiple markets.", cta: "Choose Plus",
      sources: ["Google Shopping", "Google Search", "Meta Ad Library", "TikTok analysis"],
      features: ["100 credits every month", "Everything in Starter", "Meta Ad Library", "TikTok analysis", "Screener, heatmap, backtest & sentiment", "Niche ‘earnings’ + compare up to 4", "Store Intelligence (10 tracked stores)", "20 Watchlist slots", "12-month Terminal history"] },
    { id: "pro", name: "Pro", price: 349, credits: 200, creditsLabel: "200 credits / month",
      blurb: "For brands and teams making big bets.", cta: "Choose Pro",
      sources: ["Google Shopping", "Google Search", "Meta Ad Library", "TikTok analysis", "AliExpress", "Amazon"],
      features: ["200 credits every month", "Everything in Plus", "AliExpress data", "Amazon data", "Portfolio (allocation, risk, diversification)", "Unlimited tracked stores", "Unlimited Watchlist", "24-month Terminal history", "Priority support"] }
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
    ["Google Shopping", true, true, true, true],
    ["Google Search", true, true, true, true],
    ["Meta Ad Library", false, false, true, true],
    ["TikTok analysis", false, false, true, true],
    ["AliExpress", false, false, false, true],
    ["Amazon", false, false, false, true],
    { group: "Analysis" },
    ["Demand / Competition / Saturation / Opportunity scores", true, true, true, true],
    ["Verdict (STRONG BUY → AVOID)", true, true, true, true],
    ["AI Advisor", "Summary", "Full", "Full", "Full + follow-ups"],
    ["Competitor Intelligence", "Top 3", true, true, true],
    ["Market Terminal history", "7 days", "30 days", "12 months", "24 months"],
    ["Ticker tape, movers & desk feed", true, true, true, true],
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
    ["Store Intelligence (directory)", true, true, true, true],
    ["Tracked stores", "—", "1", "10", "Unlimited"],
    { group: "Workflow" },
    ["Dashboard", true, true, true, true],
    ["Watchlist slots", "1", "5", "20", "Unlimited"],
    ["Watchlist alert rules", false, true, true, true],
    ["Export reports (PDF / CSV)", false, true, true, true],
    ["Credit top-ups", true, true, true, true],
    ["Support", "Community", "Email", "Email", "Priority"]
  ]
};
