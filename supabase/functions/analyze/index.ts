/**
 * MarketScope `analyze` Edge Function
 * -----------------------------------
 * Builds a live product-market report from DataForSEO, charges 1 credit
 * only after a successful fetch, and stores the row in public.reports.
 *
 * Auth: the caller must send a signed-in user's JWT in Authorization.
 * We verify it with supabase-js (anon key + user token). The service
 * role key is used only server-side for credit deduction and insert.
 *
 * DataForSEO credentials (Basic auth) come from Edge Function secrets:
 *   DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
 * Never hardcode or return them. If either is missing → 503 and no charge.
 *
 * Endpoints called and estimated cost (USD, DataForSEO public pricing):
 *   1. POST /v3/merchant/google/products/task_post
 *      then GET  /v3/merchant/google/products/task_get/advanced/:id
 *      Google Shopping has no live endpoint. We use the Priority queue
 *      (priority=2, depth=40, one SERP of up to 40 products) ≈ $0.002.
 *      Standard queue can take up to 45 minutes — unusable here.
 *   2. POST /v3/keywords_data/google_ads/search_volume/live
 *      Official Google Ads search volume + 12-month trend for the product
 *      keyword (up to 1000 keywords would be the same price) ≈ $0.09.
 *   3. POST /v3/dataforseo_labs/google/related_keywords/live
 *      Related keywords with volume/trend, depth=1, limit=20
 *      ≈ $0.012 + $0.00012 × items ≈ $0.014.
 *   4. POST /v3/serp/google/organic/live/advanced
 *      Organic SERP (depth=10) for competition / ad density / related
 *      searches ≈ $0.002 (live organic, one page of 10).
 *
 * Estimated total per report: ≈ $0.108 (comfortably under the $0.25 target).
 *
 * CORS: https://ofirfr246-lab.github.io (plus local preview origins).
 *
 * Plan source entitlements live in ./sources.ts (pluggable registry):
 *   Free/Starter = Google Shopping + Google Search + Amazon
 *   Plus         = those + Meta Ad Library + TikTok
 *   Pro          = those + AliExpress
 * Only implemented collectors run today (Google Shopping + Google Search).
 * Amazon / Meta / TikTok / AliExpress are stubbed for a later hook.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { describeSourceRuns, isPlan, willRun, type SourceStatus } from "./sources.ts";

const REPORT_COST = 1; // one credit per Starter-data report
const RATE_LIMIT_PER_HOUR = 10;
const SHOPPING_POLL_MS = 2500;
const SHOPPING_TIMEOUT_MS = 55_000;
const TITLE_FETCH_MS = 5000;
const DFS_BASE = "https://api.dataforseo.com";

const ALLOWED_ORIGINS = new Set([
  "https://ofirfr246-lab.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
]);

type MarketInfo = {
  country: string;
  name: string;
  location_code: number;
  language_code: string;
  currency: string;
};

const MARKETS: Record<string, MarketInfo> = {
  US: { country: "US", name: "United States", location_code: 2840, language_code: "en", currency: "USD" },
  GB: { country: "GB", name: "United Kingdom", location_code: 2826, language_code: "en", currency: "GBP" },
  UK: { country: "GB", name: "United Kingdom", location_code: 2826, language_code: "en", currency: "GBP" },
  DE: { country: "DE", name: "Germany", location_code: 2276, language_code: "de", currency: "EUR" },
  FR: { country: "FR", name: "France", location_code: 2250, language_code: "fr", currency: "EUR" },
  IT: { country: "IT", name: "Italy", location_code: 2380, language_code: "it", currency: "EUR" },
  ES: { country: "ES", name: "Spain", location_code: 2724, language_code: "es", currency: "EUR" },
  NL: { country: "NL", name: "Netherlands", location_code: 2528, language_code: "nl", currency: "EUR" },
  CA: { country: "CA", name: "Canada", location_code: 2124, language_code: "en", currency: "CAD" },
  AU: { country: "AU", name: "Australia", location_code: 2036, language_code: "en", currency: "AUD" },
  IL: { country: "IL", name: "Israel", location_code: 2376, language_code: "en", currency: "ILS" },
};

const NAME_TO_CODE: Record<string, string> = {
  "UNITED STATES": "US",
  "UNITED KINGDOM": "GB",
  "GREAT BRITAIN": "GB",
  GERMANY: "DE",
  FRANCE: "FR",
  ITALY: "IT",
  SPAIN: "ES",
  NETHERLANDS: "NL",
  CANADA: "CA",
  AUSTRALIA: "AU",
  ISRAEL: "IL",
};

type Json = Record<string, unknown>;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://ofirfr246-lab.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req: Request, status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function env(name: string): string {
  return (Deno.env.get(name) || "").trim();
}

function resolveMarket(raw: string | undefined): MarketInfo | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (MARKETS[upper]) return MARKETS[upper];
  const fromName = NAME_TO_CODE[upper];
  if (fromName && MARKETS[fromName]) return MARKETS[fromName];
  return null;
}

function slugFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const skip = new Set(["dp", "gp", "product", "products", "p", "item", "itm", "shop", "s", "ip"]);
    for (let i = parts.length - 1; i >= 0; i--) {
      const seg = decodeURIComponent(parts[i] || "").replace(/\+/g, " ");
      if (!seg || skip.has(seg.toLowerCase())) continue;
      if (/^(b0[0-9a-z]{8,}|[0-9]{5,}|asin)$/i.test(seg)) continue;
      const words = seg.replace(/[-_]+/g, " ").replace(/\.(html?|php|aspx?)$/i, "").trim();
      if (words.length >= 3) return words.slice(0, 80);
    }
    return (u.hostname.replace(/^www\./, "") || "").slice(0, 80);
  } catch {
    return "";
  }
}

function titleFromHtml(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i);
  if (og && og[1]) return cleanTitle(og[1]);
  const t = html.match(/<title[^>]*>([^<]{3,200})<\/title>/i);
  if (t && t[1]) return cleanTitle(t[1]);
  return "";
}

function cleanTitle(s: string): string {
  let t = s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  t = t.split(/\s+[|\-–—]\s+/)[0] || t;
  return t.replace(/\s+/g, " ").slice(0, 80);
}

async function deriveProductFromUrl(url: string): Promise<string> {
  const fallback = slugFromUrl(url);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TITLE_FETCH_MS);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MarketScope/1.0; +https://ofirfr246-lab.github.io/ogir/)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return fallback;
    const html = (await res.text()).slice(0, 80_000);
    return titleFromHtml(html) || fallback;
  } catch {
    return fallback;
  }
}

type DfsTask = { cost?: number; status_code?: number; status_message?: string; result?: unknown; id?: string; data?: unknown };

type DfsEnvelope = {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: DfsTask[];
};

async function dfsFetch(
  path: string,
  auth: string,
  init: { method?: string; body?: unknown } = {},
): Promise<DfsEnvelope> {
  const res = await fetch(DFS_BASE + path, {
    method: init.method || "POST",
    headers: {
      Authorization: "Basic " + auth,
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let parsed: DfsEnvelope = {};
  try {
    parsed = JSON.parse(text) as DfsEnvelope;
  } catch {
    throw new Error("DataForSEO returned a non-JSON response (" + res.status + ")");
  }
  return parsed;
}

function firstTask(env: DfsEnvelope): DfsTask | null {
  return (env.tasks && env.tasks[0]) || null;
}

type Monthly = { year: number; month: number; search_volume: number | null };

type KeywordMetrics = {
  keyword: string;
  search_volume: number | null;
  competition: string | null;
  competition_index: number | null;
  cpc: number | null;
  monthly_searches: Monthly[];
};

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function parseMonthly(raw: unknown): Monthly[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as Json;
    return {
      year: asNum(r.year) || 0,
      month: asNum(r.month) || 0,
      search_volume: asNum(r.search_volume),
    };
  }).filter((m) => m.year && m.month);
}

function parseKeywordRow(row: Json, fallbackKw = ""): KeywordMetrics {
  const kd = (row.keyword_info as Json) || row;
  return {
    keyword: String(row.keyword || kd.keyword || fallbackKw),
    search_volume: asNum(kd.search_volume),
    competition: kd.competition != null ? String(kd.competition) : null,
    competition_index: asNum(kd.competition_index ?? kd.competition_level),
    cpc: asNum(kd.cpc),
    monthly_searches: parseMonthly(kd.monthly_searches),
  };
}

type ShoppingProduct = {
  title: string;
  seller: string;
  domain: string | null;
  price: number | null;
  currency: string | null;
  reviews_count: number | null;
  rating: number | null;
  url: string | null;
  sponsored: boolean;
};

function flattenShoppingItems(items: unknown[], acc: unknown[] = []): unknown[] {
  if (!Array.isArray(items)) return acc;
  for (const it of items) {
    acc.push(it);
    const nested = (it as Json).items;
    if (Array.isArray(nested)) flattenShoppingItems(nested, acc);
  }
  return acc;
}

function parseShoppingProducts(task: DfsTask | null): ShoppingProduct[] {
  const result = task && Array.isArray(task.result) ? (task.result[0] as Json) : null;
  const items = flattenShoppingItems((result && (result.items as unknown[])) || []);
  const out: ShoppingProduct[] = [];
  for (const raw of items) {
    const it = raw as Json;
    const type = String(it.type || "");
    const isProduct = /google_shopping_serp$|carousel_element|sponsored_carousel_element/.test(type);
    if (!isProduct) continue;
    const ratingObj = (it.product_rating as Json) || (it.rating as Json) || {};
    out.push({
      title: String(it.title || ""),
      seller: String(it.seller || it.shop || it.domain || "Unknown"),
      domain: it.domain ? String(it.domain) : null,
      price: asNum(it.price),
      currency: it.currency ? String(it.currency) : null,
      reviews_count: asNum(it.reviews_count ?? ratingObj.votes_count),
      rating: asNum(ratingObj.value),
      url: it.url ? String(it.url) : null,
      sponsored: /sponsored|paid/.test(type),
    });
  }
  return out;
}

type SerpSummary = {
  organic: number;
  paid: number;
  shopping: number;
  total: number;
  ad_density: number;
  related: string[];
  top_domains: { domain: string; count: number }[];
};

function parseSerp(task: DfsTask | null): SerpSummary {
  const result = task && Array.isArray(task.result) ? (task.result[0] as Json) : null;
  const items = (result && Array.isArray(result.items) ? result.items : []) as Json[];
  let organic = 0, paid = 0, shopping = 0;
  const related: string[] = [];
  const domainCount: Record<string, number> = {};
  for (const it of items) {
    const type = String(it.type || "");
    if (type === "organic") {
      organic++;
      const d = String(it.domain || "").replace(/^www\./, "");
      if (d) domainCount[d] = (domainCount[d] || 0) + 1;
    } else if (type === "paid" || type === "paid_ad" || type === "shopping_paid") {
      paid++;
    } else if (type.includes("shopping") || type === "popular_products") {
      shopping++;
    } else if (type === "related_searches" && Array.isArray(it.items)) {
      for (const x of it.items as unknown[]) {
        if (typeof x === "string") related.push(x);
        else if (x && typeof x === "object" && (x as Json).title) related.push(String((x as Json).title));
      }
    }
  }
  const total = items.length || 1;
  const top_domains = Object.entries(domainCount)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return {
    organic,
    paid,
    shopping,
    total,
    ad_density: Math.round(((paid + shopping) / total) * 1000) / 1000,
    related: related.slice(0, 12),
    top_domains,
  };
}

function median(sorted: number[]): number | null {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function clamp(n: number, a = 0, b = 100): number {
  return Math.max(a, Math.min(b, Math.round(n)));
}

function trendSlope(months: Monthly[]): number {
  const series = months
    .filter((m) => m.search_volume != null)
    .slice()
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-12);
  if (series.length < 4) return 0;
  const vals = series.map((m) => m.search_volume as number);
  const recent = vals.slice(-3).reduce((s, x) => s + x, 0) / 3;
  const prior = vals.slice(-6, -3).reduce((s, x) => s + x, 0) / 3;
  if (prior <= 0) return recent > 0 ? 1 : 0;
  return (recent - prior) / prior; // e.g. 0.2 = +20%
}

function demandScore(volume: number | null, slope: number): number {
  let base = 35;
  if (volume != null) {
    // log scale: 0→8, 100→~32, 1k→~50, 10k→~68, 100k→~85, 1M→~95
    base = 8 + Math.log10(volume + 1) * 16.5;
  }
  const trendAdj = Math.max(-18, Math.min(18, slope * 40));
  return clamp(base + trendAdj);
}

function competitionScore(opts: {
  sellers: number;
  listings: number;
  reviewSum: number;
  adDensity: number;
  adsCompetitionIndex: number | null;
}): number {
  const sellerPart = Math.min(50, Math.log10(opts.sellers + 1) * 28);
  const reviewPart = Math.min(25, Math.log10(opts.reviewSum + 1) * 6);
  const adPart = Math.min(20, opts.adDensity * 40);
  const adsPart = opts.adsCompetitionIndex != null ? opts.adsCompetitionIndex * 0.15 : 0;
  return clamp(sellerPart + reviewPart + adPart + adsPart);
}

function saturationScore(opts: {
  sellers: number;
  volume: number | null;
  prices: number[];
}): number {
  const vol = Math.max(opts.volume || 1, 1);
  const sellersVsDemand = Math.min(55, (opts.sellers / Math.log10(vol + 10)) * 8);
  let cluster = 25;
  if (opts.prices.length >= 4) {
    const med = median(opts.prices.slice().sort((a, b) => a - b)) || 0;
    if (med > 0) {
      const near = opts.prices.filter((p) => Math.abs(p - med) / med <= 0.12).length;
      cluster = (near / opts.prices.length) * 50; // tight cluster → more saturated
    }
  }
  return clamp(sellersVsDemand + cluster);
}

function opportunityScore(demand: number, competition: number, saturation: number, priceGap: number): number {
  return clamp(0.4 * demand + 0.25 * (100 - competition) + 0.25 * (100 - saturation) + 0.1 * priceGap);
}

function priceGapScore(prices: number[], bandLow: number | null, bandHigh: number | null): number {
  if (!prices.length || bandLow == null || bandHigh == null) return 50;
  const mid = (bandLow + bandHigh) / 2;
  const crowded = prices.filter((p) => p >= bandLow && p <= bandHigh).length / prices.length;
  // A recommended band with few listings in it is a better gap.
  return clamp(70 - crowded * 50 + (mid > 0 ? 10 : 0));
}

function verdictFrom(demand: number, competition: number, saturation: number, opportunity: number): {
  verdict: string;
  rule: string;
} {
  if (demand >= 80 && competition <= 40 && saturation <= 40) {
    return { verdict: "STRONG BUY", rule: "Override: demand ≥ 80, competition ≤ 40 and saturation ≤ 40." };
  }
  if (demand < 20 && competition >= 70) {
    return { verdict: "AVOID", rule: "Override: demand < 20 and competition ≥ 70." };
  }
  if (opportunity >= 80 && demand >= 70 && saturation <= 50) {
    return { verdict: "STRONG BUY", rule: "Opportunity ≥ 80, demand ≥ 70 and saturation ≤ 50." };
  }
  if (opportunity >= 65 && demand >= 50 && saturation <= 65) {
    return { verdict: "BUY", rule: "Opportunity ≥ 65, demand ≥ 50 and saturation ≤ 65." };
  }
  if (opportunity >= 50 || (demand >= 45 && competition <= 70)) {
    return { verdict: "HOLD", rule: "Opportunity ≥ 50, or demand ≥ 45 with competition ≤ 70." };
  }
  if (opportunity >= 35) {
    return { verdict: "UNDERPERFORM", rule: "Opportunity ≥ 35 but below the HOLD bar." };
  }
  return { verdict: "AVOID", rule: "Opportunity < 35 and no supporting demand/competition exception." };
}

function money(n: number | null, currency: string): string {
  if (n == null || !Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
  } catch {
    return currency + " " + (Math.round(n * 100) / 100);
  }
}

function advisorSummary(input: {
  product: string;
  marketName: string;
  demand: number;
  competition: number;
  saturation: number;
  opportunity: number;
  verdict: string;
  rule: string;
  volume: number | null;
  slope: number;
  sellers: number;
  listings: number;
  priceMin: number | null;
  priceMax: number | null;
  priceMedian: number | null;
  bandLow: number | null;
  bandHigh: number | null;
  currency: string;
  topShare: number | null;
  topSeller: string | null;
  adDensity: number;
}): string {
  const trend = input.slope > 0.08 ? "rising" : input.slope < -0.08 ? "softening" : "stable";
  const vol = input.volume != null ? Math.round(input.volume).toLocaleString("en-US") + " monthly searches" : "an unreported search volume";
  const band = input.bandLow != null && input.bandHigh != null
    ? "A reasonable selling band is " + money(input.bandLow, input.currency) + "–" + money(input.bandHigh, input.currency) +
      " (the 30th–50th percentile of visible Google Shopping prices, just below the median of " + money(input.priceMedian, input.currency) + ")."
    : "There were not enough priced listings to recommend a selling band.";
  const conc = input.topSeller && input.topShare != null
    ? " The leading visible seller is " + input.topSeller + " with about " + Math.round(input.topShare * 100) + "% of listings."
    : "";
  const ads = input.adDensity >= 0.2
    ? " Paid and shopping units are fairly dense on the Google results page, so customer-acquisition costs may be material."
    : " Organic results still dominate the first page of Google, which is a slightly easier paid-acquisition backdrop.";
  return (
    "For “" + input.product + "” in " + input.marketName + ", MarketScope measures about " + vol +
    ", with a " + trend + " 12-month trend. Demand scores " + input.demand +
    "/100, competition " + input.competition + "/100 and saturation " + input.saturation +
    "/100, producing an Opportunity score of " + input.opportunity + "/100 and a verdict of " + input.verdict +
    " (" + input.rule + ") " +
    "We counted " + input.listings + " Google Shopping listings from " + input.sellers + " sellers" +
    (input.priceMin != null ? ", priced from " + money(input.priceMin, input.currency) + " to " + money(input.priceMax, input.currency) : "") +
    ". " + band + conc + ads +
    " This summary is generated from the scores and listing stats above — not from a language model."
  );
}

async function postShoppingTask(auth: string, keyword: string, market: MarketInfo): Promise<{ id: string; cost: number }> {
  const env = await dfsFetch("/v3/merchant/google/products/task_post", auth, {
    body: [{
      keyword,
      location_code: market.location_code,
      language_code: market.language_code,
      priority: 2, // high / Priority queue — ~$0.002 per 40 products, up to ~1 minute
      depth: 40,
    }],
  });
  const task = firstTask(env);
  if (!task || !task.id || (task.status_code && task.status_code >= 40000)) {
    throw new Error((task && task.status_message) || env.status_message || "Could not create the Google Shopping task.");
  }
  return { id: task.id, cost: asNum(task.cost) || asNum(env.cost) || 0.002 };
}

async function pollShopping(auth: string, id: string): Promise<{ task: DfsTask | null; timedOut: boolean; cost: number }> {
  const started = Date.now();
  while (Date.now() - started < SHOPPING_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, SHOPPING_POLL_MS));
    const env = await dfsFetch("/v3/merchant/google/products/task_get/advanced/" + id, auth, { method: "GET" });
    const task = firstTask(env);
    const code = task && task.status_code;
    if (code === 20000) return { task, timedOut: false, cost: asNum(task && task.cost) || asNum(env.cost) || 0 };
    if (code && code >= 40000) {
      throw new Error((task && task.status_message) || "Google Shopping task failed.");
    }
    // 40601 / 40602 typically mean "Task In Queue" / "Task Handed Over"
  }
  return { task: null, timedOut: true, cost: 0 };
}

async function fetchSearchVolume(auth: string, keyword: string, market: MarketInfo): Promise<{ metrics: KeywordMetrics | null; cost: number; error?: string }> {
  const env = await dfsFetch("/v3/keywords_data/google_ads/search_volume/live", auth, {
    body: [{
      keywords: [keyword],
      location_code: market.location_code,
      language_code: market.language_code,
    }],
  });
  const task = firstTask(env);
  if (!task || (task.status_code && task.status_code >= 40000)) {
    return { metrics: null, cost: asNum(env.cost) || 0, error: (task && task.status_message) || env.status_message || "search volume failed" };
  }
  const rows = Array.isArray(task.result) ? task.result as Json[] : [];
  const row = rows[0] || null;
  return {
    metrics: row ? parseKeywordRow(row, keyword) : null,
    cost: asNum(task.cost) || asNum(env.cost) || 0.09,
  };
}

async function fetchRelated(auth: string, keyword: string, market: MarketInfo): Promise<{ items: KeywordMetrics[]; cost: number; error?: string }> {
  const env = await dfsFetch("/v3/dataforseo_labs/google/related_keywords/live", auth, {
    body: [{
      keyword,
      location_code: market.location_code,
      language_code: market.language_code,
      depth: 1,
      limit: 20,
    }],
  });
  const task = firstTask(env);
  if (!task || (task.status_code && task.status_code >= 40000)) {
    return { items: [], cost: asNum(env.cost) || 0, error: (task && task.status_message) || env.status_message || "related keywords failed" };
  }
  const result = Array.isArray(task.result) ? (task.result[0] as Json) : null;
  const items = (result && Array.isArray(result.items) ? result.items : []) as Json[];
  const parsed: KeywordMetrics[] = [];
  for (const it of items) {
    const data = (it.keyword_data as Json) || it;
    const kw = String(data.keyword || it.keyword_data && (it.keyword_data as Json).keyword || "");
    parsed.push(parseKeywordRow(data, kw));
  }
  return {
    items: parsed.filter((k) => k.keyword).slice(0, 20),
    cost: asNum(task.cost) || asNum(env.cost) || 0.014,
  };
}

async function fetchSerp(auth: string, keyword: string, market: MarketInfo): Promise<{ summary: SerpSummary; cost: number; error?: string }> {
  const env = await dfsFetch("/v3/serp/google/organic/live/advanced", auth, {
    body: [{
      keyword,
      location_code: market.location_code,
      language_code: market.language_code,
      depth: 10,
    }],
  });
  const task = firstTask(env);
  if (!task || (task.status_code && task.status_code >= 40000)) {
    return {
      summary: { organic: 0, paid: 0, shopping: 0, total: 0, ad_density: 0, related: [], top_domains: [] },
      cost: asNum(env.cost) || 0,
      error: (task && task.status_message) || env.status_message || "SERP failed",
    };
  }
  return {
    summary: parseSerp(task),
    cost: asNum(task.cost) || asNum(env.cost) || 0.002,
  };
}

function adminClient(): SupabaseClient {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service role is not configured on this function.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function verifyUser(req: Request): Promise<{ id: string; email?: string } | { error: Response }> {
  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const header = req.headers.get("Authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!url || !anon) {
    return { error: json(req, 500, { error: "Auth is not configured.", code: "auth_not_configured" }) };
  }
  if (!token) {
    return { error: json(req, 401, { error: "Unauthorized", code: "unauthorized" }) };
  }
  const userClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) {
    return { error: json(req, 401, { error: "Unauthorized", code: "unauthorized" }) };
  }
  return { id: data.user.id, email: data.user.email };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { error: "Method not allowed. Use POST.", code: "method_not_allowed" });
  }

  const user = await verifyUser(req);
  if ("error" in user) return user.error;

  const login = env("DATAFORSEO_LOGIN");
  const password = env("DATAFORSEO_PASSWORD");
  if (!login || !password) {
    return json(req, 503, { error: "Data provider not configured", code: "provider_not_configured" });
  }
  const dfsAuth = btoa(login + ":" + password);

  let body: Json = {};
  try {
    body = (await req.json()) as Json;
  } catch {
    return json(req, 400, { error: "Request body must be JSON.", code: "invalid_json" });
  }

  const sourceUrl = typeof body.source_url === "string" ? body.source_url.trim() : "";
  const source = typeof body.source === "string" ? body.source.trim().slice(0, 80) : (sourceUrl ? "url" : null);
  let product = typeof body.product === "string" ? body.product.trim() : "";
  const market = resolveMarket(typeof body.market === "string" ? body.market : "");
  if (!market) {
    return json(req, 400, { error: "Choose a supported market (e.g. US, GB, DE, IL, CA, AU).", code: "invalid_market" });
  }
  if (!product && sourceUrl) {
    product = await deriveProductFromUrl(sourceUrl);
  }
  if (!product) {
    return json(req, 400, { error: "Enter a product, or paste a product URL.", code: "invalid_product" });
  }
  product = product.slice(0, 120);

  const admin = adminClient();

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", hourAgo);
  if (recent.error) {
    return json(req, 500, { error: "Could not check rate limits.", code: "rate_limit_check_failed" });
  }
  if ((recent.count || 0) >= RATE_LIMIT_PER_HOUR) {
    return json(req, 429, { error: "You can run at most " + RATE_LIMIT_PER_HOUR + " reports per hour. Try again later.", code: "rate_limited" });
  }

  const profileRes = await admin.from("profiles").select("id, plan, credits").eq("id", user.id).maybeSingle();
  if (profileRes.error || !profileRes.data) {
    return json(req, 400, { error: "Your profile could not be loaded.", code: "profile_missing" });
  }
  const plan = String(profileRes.data.plan || "free");
  const credits = Number(profileRes.data.credits || 0);
  if (!isPlan(plan)) {
    return json(req, 403, { error: "Your plan cannot run this report.", code: "plan_forbidden" });
  }
  if (credits < REPORT_COST) {
    return json(req, 402, { error: "You need at least " + REPORT_COST + " credit to run a report.", code: "insufficient_credits" });
  }

  const keyword = product;
  const runShopping = willRun(plan, "google_shopping");
  const runSearch = willRun(plan, "google_search");

  let shoppingId: string | null = null;
  let shoppingPostCost = 0;
  let shoppingError: string | undefined;
  if (runShopping) {
    try {
      const posted = await postShoppingTask(dfsAuth, keyword, market);
      shoppingId = posted.id;
      shoppingPostCost = posted.cost;
    } catch (e) {
      shoppingError = e instanceof Error ? e.message : "Shopping task failed to start.";
    }
  }

  const [volumeRes, relatedRes, serpRes, shoppingPoll] = await Promise.all([
    runSearch ? fetchSearchVolume(dfsAuth, keyword, market) : Promise.resolve({ metrics: null, cost: 0, error: undefined as string | undefined }),
    runSearch ? fetchRelated(dfsAuth, keyword, market) : Promise.resolve({ items: [] as KeywordMetrics[], cost: 0, error: undefined as string | undefined }),
    runSearch ? fetchSerp(dfsAuth, keyword, market) : Promise.resolve({ summary: { organic: 0, paid: 0, shopping: 0, total: 0, ad_density: 0, related: [] as string[], top_domains: [] as { domain: string; count: number }[] }, cost: 0, error: undefined as string | undefined }),
    shoppingId ? pollShopping(dfsAuth, shoppingId) : Promise.resolve({ task: null, timedOut: false, cost: 0 }),
  ]);

  const products = parseShoppingProducts(shoppingPoll.task);
  const shoppingStatus: SourceStatus = !runShopping
    ? "skipped"
    : shoppingError
    ? "error"
    : shoppingPoll.timedOut
    ? "timeout"
    : products.length
    ? "ok"
    : shoppingId
    ? "empty"
    : "skipped";

  const searchStatus: SourceStatus = !runSearch
    ? "skipped"
    : (volumeRes.metrics || relatedRes.items.length || serpRes.summary.total)
    ? "ok"
    : (volumeRes.error && relatedRes.error && serpRes.error)
    ? "error"
    : "empty";

  const sourceRuns = describeSourceRuns(plan, {
    google_shopping: shoppingStatus,
    google_search: searchStatus,
  });

  const sourcesOk = [
    volumeRes.metrics ? "search_volume" : null,
    relatedRes.items.length ? "related_keywords" : null,
    serpRes.summary.total ? "serp" : null,
    shoppingStatus === "ok" ? "shopping" : null,
  ].filter(Boolean);
  if (!sourcesOk.length) {
    return json(req, 502, {
      error: "Live data could not be retrieved. No credits were charged.",
      code: "provider_failed",
      details: {
        search_volume: volumeRes.error || null,
        related_keywords: relatedRes.error || null,
        serp: serpRes.error || null,
        shopping: shoppingError || (shoppingPoll.timedOut ? "timeout" : null),
      },
    });
  }

  const prices = products.map((p) => p.price).filter((p): p is number => p != null && p > 0).sort((a, b) => a - b);
  const priceMin = prices.length ? prices[0] : null;
  const priceMax = prices.length ? prices[prices.length - 1] : null;
  const priceMedian = median(prices);
  const bandLow = percentile(prices, 0.3);
  const bandHigh = percentile(prices, 0.5);
  const currency = (products.find((p) => p.currency)?.currency) || market.currency;

  const sellerMap: Record<string, { name: string; domain: string | null; count: number; prices: number[]; reviews: number }> = {};
  for (const p of products) {
    const key = (p.seller || p.domain || "Unknown").toLowerCase();
    if (!sellerMap[key]) sellerMap[key] = { name: p.seller || "Unknown", domain: p.domain, count: 0, prices: [], reviews: 0 };
    sellerMap[key].count += 1;
    if (p.price != null) sellerMap[key].prices.push(p.price);
    if (p.reviews_count) sellerMap[key].reviews += p.reviews_count;
  }
  const listings = products.length;
  const sellers = Object.keys(sellerMap).length;
  const competitors = Object.values(sellerMap)
    .map((s) => ({
      seller: s.name,
      domain: s.domain,
      listings: s.count,
      share: listings ? Math.round((s.count / listings) * 1000) / 1000 : 0,
      min_price: s.prices.length ? Math.min(...s.prices) : null,
      median_price: median(s.prices.slice().sort((a, b) => a - b)),
      reviews: s.reviews || null,
    }))
    .sort((a, b) => b.listings - a.listings)
    .slice(0, 10);

  const volume = volumeRes.metrics && volumeRes.metrics.search_volume != null
    ? volumeRes.metrics.search_volume
    : (relatedRes.items[0] && relatedRes.items[0].search_volume);
  const months = (volumeRes.metrics && volumeRes.metrics.monthly_searches.length)
    ? volumeRes.metrics.monthly_searches
    : (relatedRes.items[0] && relatedRes.items[0].monthly_searches) || [];
  const slope = trendSlope(months);
  const reviewSum = products.reduce((s, p) => s + (p.reviews_count || 0), 0);
  const adsIdx = volumeRes.metrics && volumeRes.metrics.competition_index;

  const demand = demandScore(volume ?? null, slope);
  const competition = competitionScore({
    sellers,
    listings,
    reviewSum,
    adDensity: serpRes.summary.ad_density,
    adsCompetitionIndex: adsIdx ?? null,
  });
  const saturation = saturationScore({ sellers, volume: volume ?? null, prices });
  const gap = priceGapScore(prices, bandLow, bandHigh);
  const opportunity = opportunityScore(demand, competition, saturation, gap);
  const scored = { demand, competition, saturation, opportunity };
  const { verdict, rule } = verdictFrom(demand, competition, saturation, opportunity);

  const top = competitors[0] || null;
  const advisor = advisorSummary({
    product,
    marketName: market.name,
    demand,
    competition,
    saturation,
    opportunity,
    verdict,
    rule,
    volume: volume ?? null,
    slope,
    sellers,
    listings,
    priceMin,
    priceMax,
    priceMedian,
    bandLow,
    bandHigh,
    currency,
    topShare: top ? top.share : null,
    topSeller: top ? top.seller : null,
    adDensity: serpRes.summary.ad_density,
  });

  const providerCost =
    shoppingPostCost +
    (shoppingPoll.cost || 0) +
    (volumeRes.cost || 0) +
    (relatedRes.cost || 0) +
    (serpRes.cost || 0);

  const content = {
    sample: false,
    is_example: false,
    banner: "Live data via Google Shopping & Search",
    product,
    market: market.name,
    market_code: market.country,
    generated_at: new Date().toISOString(),
    sources_note: "Live collectors used for this plan: Google Shopping (priority queue) and Google Search (Ads search volume, related keywords, organic SERP). Amazon is entitled on Free/Starter+ but not wired yet; Plus adds Meta Ad Library and TikTok, Pro adds AliExpress — those collectors are stubbed.",
    plan: plan,
    sources: {
      plan: sourceRuns,
      search_volume: !runSearch ? "skipped" : (volumeRes.metrics ? "ok" : (volumeRes.error || "empty")),
      related_keywords: !runSearch ? "skipped" : (relatedRes.items.length ? "ok" : (relatedRes.error || "empty")),
      serp: !runSearch ? "skipped" : (serpRes.summary.total ? "ok" : (serpRes.error || "empty")),
      shopping: shoppingStatus,
    },
    estimated_provider_cost_usd: Math.round(providerCost * 10000) / 10000,
    scores: scored,
    verdict,
    verdict_rule: rule,
    confidence: shoppingStatus === "ok" && volumeRes.metrics ? "Live" : "Live (partial)",
    source: source,
    source_url: sourceUrl || null,
    advisor,
    llm_hook: {
      enabled: false,
      provider: null,
      notes: "Advisor text is deterministic from the scores and listing stats. To swap in an LLM later, send scores, price stats and competitors to a model and replace `advisor`.",
    },
    prices: {
      currency,
      min: priceMin,
      median: priceMedian,
      max: priceMax,
      recommended_band: bandLow != null && bandHigh != null ? { low: bandLow, high: bandHigh } : null,
      recommended_rule: "30th–50th percentile of visible Google Shopping prices (a band at or just below the median).",
      listing_count: listings,
      seller_count: sellers,
    },
    demand_detail: {
      search_volume: volume ?? null,
      trend_slope: Math.round(slope * 1000) / 1000,
      monthly_searches: months.slice(-12),
      competition: volumeRes.metrics && volumeRes.metrics.competition,
      competition_index: adsIdx ?? null,
      cpc: volumeRes.metrics && volumeRes.metrics.cpc,
    },
    related_keywords: relatedRes.items.slice(0, 12).map((k) => ({
      keyword: k.keyword,
      search_volume: k.search_volume,
      competition_index: k.competition_index,
      cpc: k.cpc,
    })),
    serp: serpRes.summary,
    competitors,
    listings: products.slice(0, 24).map((p) => ({
      title: p.title,
      seller: p.seller,
      price: p.price,
      currency: p.currency || currency,
      reviews_count: p.reviews_count,
      rating: p.rating,
      sponsored: p.sponsored,
      url: p.url,
    })),
    opportunities: [
      bandLow != null ? "Recommended selling band: " + money(bandLow, currency) + "–" + money(bandHigh, currency) + "." : "Collect more priced listings before setting a sell price.",
      slope > 0.08 ? "Search interest has been rising over the last three months versus the prior three." : (slope < -0.08 ? "Search interest has softened recently — treat demand as less durable." : "Search interest looks stable over the last two quarters."),
      top && top.share >= 0.25 ? "Listings are concentrated — a new offer needs a clear price or positioning gap versus " + top.seller + "." : "No single seller dominates the visible listing set.",
    ],
    risks: [
      competition >= 70 ? "Competition is high: many sellers and/or heavy review moats." : "Competition is moderate or lower on the current snapshot.",
      serpRes.summary.ad_density >= 0.2 ? "Noticeable ad density on the Google results page may lift acquisition costs." : "Ad density on the first Google page is relatively contained.",
      shoppingStatus !== "ok" ? "Google Shopping data was " + shoppingStatus + " — price and seller stats may be incomplete." : "Price and seller stats are from the current Google Shopping snapshot (up to 40 listings).",
    ],
  };

  const spent = await admin.rpc("spend_credits_for_user", { p_user_id: user.id, p_cost: REPORT_COST });
  if (spent.error) {
    const msg = spent.error.message || "Could not charge credits.";
    const insufficient = /insufficient/i.test(msg);
    return json(req, insufficient ? 402 : 500, {
      error: insufficient ? "You need at least " + REPORT_COST + " credit to run a report." : msg,
      code: insufficient ? "insufficient_credits" : "charge_failed",
    });
  }
  const remaining = typeof spent.data === "number" ? spent.data : credits - REPORT_COST;

  const ins = await admin.from("reports").insert({
    user_id: user.id,
    product,
    market: market.name,
    cost: REPORT_COST,
    source: source,
    source_url: sourceUrl || null,
    verdict,
    scores: scored,
    content,
    result: content,
    is_example: false,
    status: "complete",
  }).select("id,user_id,product,market,cost,source,source_url,verdict,scores,content,result,is_example,status,created_at").single();

  if (ins.error) {
    // Credit already deducted. Return the payload anyway so the user is not empty-handed,
    // and flag the persist failure so support can restore consistency.
    return json(req, 207, {
      error: "The report was generated and the credit was charged, but saving it failed: " + ins.error.message,
      code: "persist_failed",
      report: {
        id: null,
        product,
        market: market.name,
        cost: REPORT_COST,
        source,
        source_url: sourceUrl || null,
        verdict,
        scores: scored,
        content,
        result: content,
        is_example: false,
        status: "complete",
        created_at: new Date().toISOString(),
      },
      credits: remaining,
    });
  }

  return json(req, 200, { report: ins.data, credits: remaining });
});
