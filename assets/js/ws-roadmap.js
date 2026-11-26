/* Vision & roadmap — static, honest status per stage. No metrics, no claims beyond what ships. */
import { $, esc } from "./ms-workspace.js";

var ST = { live: ["live", "LIVE"], prog: ["prog", "IN PROGRESS"], plan: ["plan", "PLANNED"], sim: ["sim", "SIMULATION"] };
var STEPS = [
  { t: "Reliable product research engine", s: "live", d: "Enter a product (or paste a URL) and get Demand, Competition, Saturation and Opportunity scores (0–100) with a STRONG BUY → AVOID rating, from live Google Shopping and Google Search data.",
    li: ["Live today: Google Shopping listings and prices, Google search volume, CPC and 12-month trend", "Transparent formulas on the methodology page", "No data → no score, and no credit charged", "Next: more sources (see the table below)"], a: ["app.html", "Run a report"] },
  { t: "Subscriptions and paying customers", s: "live", d: "Plans, credits and secure checkout with automatic plan and credit sync.", li: ["Stripe checkout and customer portal", "Credits per plan and credit packs", "Plan and pricing details are reviewed regularly"], a: ["pricing.html", "See plans"] },
  { t: "Market Terminal with real data", s: "prog", d: "A capital-markets-style desk for products.", li: ["Live: desk built on a real Google Shopping & Search snapshot", "Live: your private Live Terminal — score history, movers, category heatmap, country comparison, alerts", "Planned: automatic scheduled refresh of tracked products"], a: ["my-terminal.html", "Open Live Terminal"] },
  { t: "Josy AI — advanced business assistant", s: "prog", d: "An AI assistant that knows your workspace and can take authorised actions.", li: ["Live: marketing plans and content calendars, live demand checks", "Live: reads your research, portfolio and suppliers; adds products to your watchlist when you ask", "Planned: pricing advice and automated reports from your stored history"], a: ["josy.html", "Meet Josy AI"] },
  { t: "Advertising & campaign management", s: "prog", d: "Plan organic posts and build complete paid-campaign drafts in one place.", li: ["Live: organic planner and paid drafts for Meta, TikTok and Google Ads structures", "Planned connections: Google Shopping, YouTube, Shopify", "Direct publishing requires each platform's approval — not available yet"], a: ["josy-campaigns.html", "Campaign manager"] },
  { t: "Competitor & supplier intelligence", s: "prog", d: "Track competitor stores and compare supplier quotes.", li: ["Live: competitor tracking with your logged prices, launches, promotions and ads, plus price alerts", "Live: supplier comparison — landed cost, margin, shipping, MOQ, quality, reliability", "Planned: automated public-page monitoring"], a: ["competitors.html", "Competitors"] },
  { t: "Portfolio & backtesting", s: "prog", d: "Manage products like a portfolio and test rules on history before spending.", li: ["Live: product portfolio with unit economics linked to live research", "Live: backtests on your snapshots and on 12-month Google search history", "History grows as you re-run reports over time"], a: ["product-portfolio.html", "Portfolio"] },
  { t: "MarketScope Exchange", s: "sim", d: "Product and category indices, candles and an order ticket — as a virtual-credit simulation only.", li: ["Live: simulation with virtual credits, indices from your real snapshots, candlestick charts, limit orders", "No deposits, payments or cash-out", "Real-money trading is not offered and would require legal review and licensing"], a: ["exchange.html", "Open the simulation"] }
];
var SOURCES = [
  ["Google Shopping", "Listings, prices, sellers", "live"], ["Google Search (keyword data)", "Search volume, CPC, 12-month trend, related keywords", "live"],
  ["Google Trends", "Relative interest over time", "plan"], ["Amazon", "Marketplace competition and pricing", "plan"], ["AliExpress", "Supplier cost and order volume", "plan"],
  ["Shopify stores", "Competitor store counts and price bands", "plan"], ["Meta ad library", "Public ad presence and longevity", "plan"], ["TikTok ads", "Ad and creative trends", "plan"]
];
$("[data-steps]").innerHTML = STEPS.map(function (s, i) {
  var st = ST[s.s];
  return '<div class="ws-step"><div class="n">' + (i + 1) + "</div><div><h3>" + esc(s.t) + "</h3><p>" + esc(s.d) + "</p><ul>" + s.li.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>" +
    '<p style="margin-top:10px"><a class="amber" href="' + s.a[0] + '">' + esc(s.a[1]) + ' →</a></p></div><span class="st ' + st[0] + '">' + st[1] + "</span></div>";
}).join("");
$("[data-sources]").innerHTML = "<thead><tr><th>SOURCE</th><th>WHAT IT ADDS</th><th>STATUS</th></tr></thead><tbody>" + SOURCES.map(function (r) {
  return "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + '</td><td><span class="st ' + ST[r[2]][0] + '">' + ST[r[2]][1] + "</span></td></tr>";
}).join("") + "</tbody>";
