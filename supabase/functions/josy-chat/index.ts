/**
 * MarketScope `josy-chat` Edge Function — Josy Market v1 (organic marketing).
 * ---------------------------------------------------------------------------
 * A conversational marketing assistant. Runs a Gemini function-calling loop
 * server-side, stores every turn, and returns the reply plus any plan ids.
 *
 * Secrets (Edge Function secrets, never returned or logged):
 *   GEMINI_API_KEY                         Google AI Studio key
 *   DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD  live search data (check_demand)
 *   JOSY_MODEL (optional)                   override the Gemini model id
 *
 * Usage limits: one Josy message per request, per-plan daily allowance enforced
 * by public.josy_take_message (SECURITY DEFINER, service role only).
 * Live search data: 1 MarketScope credit per successful check_demand call,
 * charged with the same spend_credits_for_user RPC the analyze function uses.
 *
 * Body (POST JSON):
 *   { action: "status" }                         → usage + credits, no charge
 *   { message, conversation_id?, market?, lang? } → chat turn
 *   { conversation_id, regenerate: true }        → re-answer the last user turn
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const DFS_BASE = "https://api.dataforseo.com";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-4-hydrogen", "gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash"];
const MAX_TOOL_ROUNDS = 6;
const MAX_DEMAND_CALLS_PER_TURN = 2;
const DEMAND_COST = 1;
const HISTORY_LIMIT = 24;
const MAX_MESSAGE_CHARS = 4000;

const ALLOWED_ORIGINS = new Set([
  "https://marketscope.space",
  "https://www.marketscope.space",
  "https://ofirfr246-lab.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
]);

type MarketInfo = { country: string; name: string; location_code: number; language_code: string; currency: string };
const MARKETS: Record<string, MarketInfo> = {
  US: { country: "US", name: "United States", location_code: 2840, language_code: "en", currency: "USD" },
  GB: { country: "GB", name: "United Kingdom", location_code: 2826, language_code: "en", currency: "GBP" },
  DE: { country: "DE", name: "Germany", location_code: 2276, language_code: "de", currency: "EUR" },
  FR: { country: "FR", name: "France", location_code: 2250, language_code: "fr", currency: "EUR" },
  IT: { country: "IT", name: "Italy", location_code: 2380, language_code: "it", currency: "EUR" },
  ES: { country: "ES", name: "Spain", location_code: 2724, language_code: "es", currency: "EUR" },
  NL: { country: "NL", name: "Netherlands", location_code: 2528, language_code: "nl", currency: "EUR" },
  CA: { country: "CA", name: "Canada", location_code: 2124, language_code: "en", currency: "CAD" },
  AU: { country: "AU", name: "Australia", location_code: 2036, language_code: "en", currency: "AUD" },
  IL: { country: "IL", name: "Israel", location_code: 2376, language_code: "he", currency: "ILS" },
};
function resolveMarket(raw: unknown): MarketInfo {
  const k = String(raw || "").trim().toUpperCase();
  if (k === "UK") return MARKETS.GB;
  return MARKETS[k] || MARKETS.US;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://marketscope.space",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
function json(req: Request, status: number, body: Json): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}
function env(name: string): string {
  return (Deno.env.get(name) || "").trim();
}
function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verifyUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const header = req.headers.get("Authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email };
}

/* ------------------------------------------------------------------ */
/* DataForSEO: live Google search demand                               */
/* ------------------------------------------------------------------ */
type Monthly = { year: number; month: number; search_volume: number | null };
type KeywordDemand = {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
  competition: string | null;
  competition_index: number | null;
  trend_12m_pct: number | null;
  monthly: Monthly[];
};
type DemandResult = {
  ok: boolean;
  market: string;
  market_name: string;
  language: string;
  fetched_at: string;
  source: string;
  keywords: KeywordDemand[];
  related: { keyword: string; search_volume: number | null; cpc: number | null }[];
  error?: string;
  error_code?: string;
};

async function dfs(path: string, auth: string, body: unknown): Promise<Json> {
  const res = await fetch(DFS_BASE + path, {
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new Error("Data provider returned a non-JSON response (" + res.status + ")");
  }
}
function firstTask(envl: Json): Json | null {
  const t = envl.tasks;
  return Array.isArray(t) && t[0] ? (t[0] as Json) : null;
}
function parseMonthly(raw: unknown): Monthly[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({ year: asNum((r as Json).year) || 0, month: asNum((r as Json).month) || 0, search_volume: asNum((r as Json).search_volume) }))
    .filter((m) => m.year && m.month)
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))
    .slice(-12);
}
function trendPct(m: Monthly[]): number | null {
  const vals = m.map((x) => x.search_volume).filter((v): v is number => typeof v === "number");
  if (vals.length < 6) return null;
  const first = vals.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const last = vals.slice(-3).reduce((a, b) => a + b, 0) / 3;
  if (!first) return null;
  return Math.round(((last - first) / first) * 100);
}

async function checkDemand(keywordsRaw: unknown, marketRaw: unknown): Promise<DemandResult> {
  const market = resolveMarket(marketRaw);
  const keywords = (Array.isArray(keywordsRaw) ? keywordsRaw : [keywordsRaw])
    .map((k) => String(k || "").trim().replace(/\s+/g, " ").slice(0, 80))
    .filter(Boolean)
    .filter((k, i, a) => a.findIndex((x) => x.toLowerCase() === k.toLowerCase()) === i)
    .slice(0, 10);
  const hebrew = keywords.some((k) => /[\u0590-\u05FF]/.test(k));
  const language = market.country === "IL" ? (hebrew ? "he" : "en") : market.language_code;
  const base: DemandResult = {
    ok: false,
    market: market.country,
    market_name: market.name,
    language,
    fetched_at: new Date().toISOString(),
    source: "Google search data · DataForSEO via MarketScope",
    keywords: [],
    related: [],
  };
  if (!keywords.length) return { ...base, error: "No keywords given.", error_code: "invalid_input" };
  const login = env("DATAFORSEO_LOGIN");
  const password = env("DATAFORSEO_PASSWORD");
  if (!login || !password) return { ...base, error: "Live search data is not configured right now.", error_code: "provider_not_configured" };
  const auth = btoa(login + ":" + password);

  try {
    const [vol, rel] = await Promise.all([
      dfs("/v3/keywords_data/google_ads/search_volume/live", auth, [{ keywords, location_code: market.location_code, language_code: language }]),
      dfs("/v3/dataforseo_labs/google/related_keywords/live", auth, [{ keyword: keywords[0], location_code: market.location_code, language_code: language, depth: 1, limit: 10 }]).catch(() => ({} as Json)),
    ]);
    const vt = firstTask(vol);
    const vcode = asNum(vt?.status_code) ?? asNum(vol.status_code);
    if (!vt || (vcode != null && vcode >= 40000)) {
      console.log("josy dfs search_volume failed", vcode, String(vt?.status_message || vol.status_message || "").slice(0, 200));
      if (vcode === 40200 || vcode === 40201 || /payment|balance|insufficient/i.test(String(vt?.status_message || ""))) {
        return { ...base, error: "Live search data is temporarily unavailable on MarketScope's side (data provider account). No credit was charged.", error_code: "provider_unavailable" };
      }
      return { ...base, error: "The live data provider did not return search volumes. No credit was charged.", error_code: "provider_failed" };
    }
    const rows = Array.isArray(vt.result) ? (vt.result as Json[]) : [];
    const byKw = new Map(rows.map((r) => [String(r.keyword || "").toLowerCase(), r]));
    base.keywords = keywords.map((kw) => {
      const r = byKw.get(kw.toLowerCase()) || ({} as Json);
      const monthly = parseMonthly(r.monthly_searches);
      return {
        keyword: kw,
        search_volume: asNum(r.search_volume),
        cpc: asNum(r.cpc),
        competition: r.competition != null ? String(r.competition) : null,
        competition_index: asNum(r.competition_index),
        trend_12m_pct: trendPct(monthly),
        monthly,
      };
    });
    const rt = firstTask(rel);
    const rres = rt && Array.isArray(rt.result) ? (rt.result[0] as Json) : null;
    const items = rres && Array.isArray(rres.items) ? (rres.items as Json[]) : [];
    base.related = items
      .map((it) => {
        const d = (it.keyword_data as Json) || it;
        const info = (d.keyword_info as Json) || d;
        return { keyword: String(d.keyword || ""), search_volume: asNum(info.search_volume), cpc: asNum(info.cpc) };
      })
      .filter((r) => r.keyword && !keywords.some((k) => k.toLowerCase() === r.keyword.toLowerCase()))
      .slice(0, 10);
    base.ok = base.keywords.some((k) => k.search_volume != null) || base.related.length > 0;
    if (!base.ok) base.error = "No search volume is available for these keywords in this market.";
    return base;
  } catch (e) {
    return { ...base, error: "The live data provider could not be reached: " + String((e as Error).message || e).slice(0, 160), error_code: "provider_failed" };
  }
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */
const itemSchema = {
  type: "object",
  properties: {
    day: { type: "integer", description: "Day number in the plan, starting at 1." },
    channel: { type: "string", description: "Organic channel, e.g. Instagram, TikTok, YouTube, Facebook, LinkedIn, Pinterest, Blog/SEO, Email, X." },
    format: { type: "string", description: "Format, e.g. Reel, Short video, Carousel, Post, Story, Article, Newsletter, Thread." },
    title: { type: "string", description: "Short title / hook." },
    body: { type: "string", description: "The full ready-to-use copy: caption, script outline, or article brief, with hashtags/CTA if relevant." },
  },
  required: ["title", "body"],
};

const TOOL_DECLARATIONS = [
  {
    name: "check_demand",
    description:
      "Fetch LIVE Google search demand from MarketScope's data provider for 1-10 keywords in one market: monthly search volume, 12-month trend %, CPC, competition, plus related keywords. Costs the user 1 MarketScope credit per call. Use it whenever the user asks about demand, niches, keywords, or before recommending SEO topics. Never state demand numbers that did not come from this tool.",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" }, description: "1-10 search keywords, in the language people search in that market." },
        market: { type: "string", enum: Object.keys(MARKETS), description: "Two-letter market code." },
      },
      required: ["keywords", "market"],
    },
  },
  {
    name: "save_plan",
    description: "Save an organic marketing plan to the user's 'My plans' page. Use when the user asks to save, or after you produce a complete plan they want to keep.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        goal: { type: "string", description: "The business goal in one or two sentences." },
        summary: { type: "string", description: "Markdown summary: audience, positioning, channels, key messages, KPIs to track." },
        channels: { type: "array", items: { type: "string" } },
        items: { type: "array", items: itemSchema, description: "Concrete action items / content pieces (max 60)." },
      },
      required: ["title", "summary"],
    },
  },
  {
    name: "create_content_calendar",
    description: "Create and save a dated organic content calendar (posts, videos, articles) to 'My plans'. Write full ready-to-post copy for each item.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        goal: { type: "string" },
        start_date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
        weeks: { type: "integer", description: "1-8 weeks." },
        channels: { type: "array", items: { type: "string" } },
        items: { type: "array", items: itemSchema, description: "Calendar entries, each with a day number (max 60)." },
      },
      required: ["title", "items"],
    },
  },
  {
    name: "list_plans",
    description: "List the user's saved plans and calendars (most recent first).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_plan",
    description: "Read one saved plan with its items, by id (from list_plans).",
    parameters: { type: "object", properties: { plan_id: { type: "string" } }, required: ["plan_id"] },
  },
  {
    name: "get_my_research",
    description: "Read the user's own stored MarketScope live research snapshots (latest per product and market, with scores, verdict, median Shopping price, monthly searches and capture date). Free — no credits. Use before recommending which of their researched products to focus on.",
    parameters: { type: "object", properties: { product: { type: "string", description: "Optional product name filter (substring)." } } },
  },
  {
    name: "add_to_watchlist",
    description: "Add a product to the user's Live Terminal watchlist. Only call when the user explicitly asks you to add or follow a product.",
    parameters: {
      type: "object",
      properties: {
        product: { type: "string", description: "Product name as the user wrote it." },
        market: { type: "string", description: "2-letter market code (US, GB, DE, FR, IT, ES, NL, CA, AU, IL). Defaults to the conversation market." },
        note: { type: "string", description: "Optional short note." },
      },
      required: ["product"],
    },
  },
  {
    name: "get_workspace",
    description: "Read the user's workspace: product portfolio (their own costs, prices and unit estimates), supplier quotes, tracked competitors and watchlist. Free — no credits. Use for pricing, margin, supplier or portfolio questions.",
    parameters: { type: "object", properties: {} },
  },
];

type TurnState = {
  userId: string;
  conversationId: string;
  defaultMarket: string;
  demandCalls: number;
  credits: number;
  creditsCharged: number;
  demand: DemandResult[];
  planIds: string[];
  toolsUsed: string[];
  notes?: string[];
};

function unescapeNl(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\t/g, " ");
}

function cleanItems(raw: unknown, startDate: string | null): Json[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).map((it, i) => {
    const o = (it || {}) as Json;
    const day = Math.min(366, Math.max(1, Math.round(asNum(o.day) || i + 1)));
    let scheduled: string | null = null;
    if (startDate) {
      const d = new Date(startDate + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + day - 1);
      scheduled = d.toISOString().slice(0, 10);
    }
    return {
      position: i,
      day,
      scheduled_date: scheduled,
      channel: str(o.channel, 60) || null,
      format: str(o.format, 60) || null,
      title: str(o.title, 300) || "Untitled",
      body: unescapeNl(str(o.body, 6000)) || null,
    };
  });
}

async function savePlan(admin: SupabaseClient, st: TurnState, args: Json, kind: "marketing_plan" | "content_calendar"): Promise<Json> {
  let startDate: string | null = null;
  if (kind === "content_calendar") {
    const s = str(args.start_date, 10);
    startDate = /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : new Date().toISOString().slice(0, 10);
  }
  const items = cleanItems(args.items, startDate);
  const channels = (Array.isArray(args.channels) ? args.channels : [])
    .map((c) => str(c, 40)).filter(Boolean).slice(0, 12);
  for (const it of items) if (it.channel && !channels.includes(String(it.channel))) channels.push(String(it.channel));
  const weeks = asNum(args.weeks);
  const ins = await admin.from("josy_plans").insert({
    user_id: st.userId,
    conversation_id: st.conversationId,
    kind,
    title: str(args.title, 160) || (kind === "content_calendar" ? "Content calendar" : "Marketing plan"),
    goal: str(args.goal, 1000) || null,
    summary: unescapeNl(str(args.summary, 8000)) || null,
    channels: channels.slice(0, 12),
    start_date: startDate,
    data: { weeks: weeks ? Math.min(8, Math.max(1, Math.round(weeks))) : null, created_by: "josy" },
  }).select("id").single();
  if (ins.error || !ins.data) return { ok: false, error: "Could not save the plan." };
  const planId = String(ins.data.id);
  if (items.length) {
    const r = await admin.from("josy_plan_items").insert(items.map((it) => ({ ...it, plan_id: planId, user_id: st.userId })));
    if (r.error) {
      await admin.from("josy_plans").delete().eq("id", planId);
      return { ok: false, error: "Could not save the plan items." };
    }
  }
  st.planIds.push(planId);
  return { ok: true, plan_id: planId, kind, items_saved: items.length, start_date: startDate, view_url: "josy-plans.html#plan=" + planId };
}

async function runTool(admin: SupabaseClient, st: TurnState, name: string, args: Json): Promise<Json> {
  st.toolsUsed.push(name);
  if (name === "check_demand") {
    if (st.demandCalls >= MAX_DEMAND_CALLS_PER_TURN) {
      return { ok: false, error: "Live data limit for this message reached (max " + MAX_DEMAND_CALLS_PER_TURN + " checks per message). Ask the user to continue in the next message." };
    }
    if (st.credits < DEMAND_COST) {
      return { ok: false, error_code: "insufficient_credits", error: "The user has no MarketScope credits left, so live demand data cannot be fetched. Tell them, and offer to continue without numbers or to top up on the pricing page." };
    }
    st.demandCalls++;
    const res = await checkDemand(args.keywords, args.market || st.defaultMarket);
    if (res.ok) {
      const spent = await admin.rpc("spend_credits_for_user", { p_user_id: st.userId, p_cost: DEMAND_COST });
      if (!spent.error) {
        st.creditsCharged += DEMAND_COST;
        st.credits = typeof spent.data === "number" ? spent.data : st.credits - DEMAND_COST;
      }
      st.demand.push(res);
    }
    return { ...res, credits_charged: res.ok ? DEMAND_COST : 0, credits_left: st.credits };
  }
  if (name === "save_plan") return await savePlan(admin, st, args, "marketing_plan");
  if (name === "create_content_calendar") return await savePlan(admin, st, args, "content_calendar");
  if (name === "list_plans") {
    const r = await admin.from("josy_plans").select("id, kind, title, goal, channels, start_date, created_at, josy_plan_items(count)")
      .eq("user_id", st.userId).order("created_at", { ascending: false }).limit(30);
    if (r.error) return { ok: false, error: "Could not load plans." };
    return { ok: true, plans: (r.data || []).map((p: Json) => ({ ...p, items: (p.josy_plan_items as Json[])?.[0]?.count ?? 0, josy_plan_items: undefined })) };
  }
  if (name === "get_plan") {
    const id = str(args.plan_id, 40);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Invalid plan id." };
    const r = await admin.from("josy_plans").select("id, kind, title, goal, summary, channels, start_date, created_at, josy_plan_items(day, scheduled_date, channel, format, title, body, status)")
      .eq("user_id", st.userId).eq("id", id).maybeSingle();
    if (r.error || !r.data) return { ok: false, error: "Plan not found." };
    return { ok: true, plan: r.data };
  }
  if (name === "get_my_research") {
    const r = await admin.from("product_snapshots")
      .select("product, product_key, market, verdict, confidence, opportunity, demand, competition, saturation, price_median, currency, search_volume, trend_slope, captured_at")
      .eq("user_id", st.userId).order("captured_at", { ascending: false }).limit(300);
    if (r.error) return { ok: false, error: "Could not load research." };
    const filter = str(args.product, 120).toLowerCase();
    const seen = new Map<string, Json & { snapshots: number }>();
    for (const row of (r.data || []) as Json[]) {
      const k = String(row.product_key) + "|" + String(row.market);
      if (filter && !String(row.product_key).includes(filter)) continue;
      const cur = seen.get(k);
      if (cur) cur.snapshots++;
      else seen.set(k, { ...row, product_key: undefined, snapshots: 1 });
    }
    const products = Array.from(seen.values()).slice(0, 40);
    (st.notes ||= []).push("get_my_research: " + products.map((p) => p.product + " " + p.market + " " + (p.verdict ?? "") + " opp " + (p.opportunity ?? "n/a") + " on " + String(p.captured_at).slice(0, 10)).join("; "));
    return { ok: true, count: products.length, products, note: products.length ? "Stored snapshots from the user's own live reports; cite the capture date — they are not today's data unless captured today." : "The user has no live research reports yet. Suggest running one on the dashboard (app.html)." };
  }
  if (name === "add_to_watchlist") {
    const product = str(args.product, 200).trim();
    if (!product) return { ok: false, error: "Product name is required." };
    const market = resolveMarket(args.market || st.defaultMarket);
    const key = product.toLowerCase().replace(/\s+/g, " ").slice(0, 200);
    const r = await admin.from("research_watchlist").upsert({
      user_id: st.userId, product, product_key: key, market: market.name, note: str(args.note, 1000) || null, added_by: "josy",
    }, { onConflict: "user_id,product_key,market", ignoreDuplicates: true });
    if (r.error) return { ok: false, error: "Could not add to the watchlist." };
    (st.notes ||= []).push("added to watchlist: " + product + " (" + market.name + ")");
    return { ok: true, product, market: market.name, page: "my-terminal.html" };
  }
  if (name === "get_workspace") {
    const [pf, sup, comp, wl] = await Promise.all([
      admin.from("product_portfolio").select("product, market, status, unit_cost, shipping_cost, sell_price, fees_pct, ad_cost_per_unit, monthly_units, currency").eq("user_id", st.userId).limit(100),
      admin.from("suppliers").select("name, product, unit_cost, shipping_cost, currency, shipping_days_min, shipping_days_max, moq, quality, reliability, target_sell_price").eq("user_id", st.userId).limit(100),
      admin.from("competitors").select("name, platform, category, url").eq("user_id", st.userId).limit(100),
      admin.from("research_watchlist").select("product, market").eq("user_id", st.userId).limit(100),
    ]);
    const n = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v));
    const portfolio = ((pf.data || []) as Json[]).map((r) => {
      const price = n(r.sell_price), cost = n(r.unit_cost);
      const profit = price != null && cost != null ? price - cost - (n(r.shipping_cost) || 0) - price * (n(r.fees_pct) || 0) / 100 - (n(r.ad_cost_per_unit) || 0) : null;
      return { ...r, profit_per_unit: profit != null ? Math.round(profit * 100) / 100 : null, margin_pct: profit != null && price ? Math.round(profit / price * 1000) / 10 : null };
    });
    return { ok: true, portfolio, suppliers: sup.data || [], competitors: comp.data || [], watchlist: wl.data || [],
      note: "All values were entered by the user (estimates, not measured results). Never present unit estimates as real sales." };
  }
  return { ok: false, error: "Unknown tool." };
}

/* ------------------------------------------------------------------ */
/* Gemini                                                              */
/* ------------------------------------------------------------------ */
let workingModel: string | null = null;

class AiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const noThinkingCfg = new Set<string>();
const failedAt = new Map<string, number>();

async function callModel(model: string, key: string, body: Json, timeoutMs: number): Promise<{ status: number; data: Json; text: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(GEMINI_BASE + encodeURIComponent(model) + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let data: Json = {};
    try { data = JSON.parse(text) as Json; } catch { /* keep empty */ }
    console.log("josy gemini", model, res.status, Date.now() - t0 + "ms");
    return { status: res.status, data, text };
  } catch (e) {
    console.log("josy gemini", model, "timeout/network", Date.now() - t0 + "ms");
    return { status: 504, data: {}, text: "timeout: " + String((e as Error).message || e).slice(0, 100) };
  }
}

async function gemini(key: string, baseBody: Json, deadline: number): Promise<{ data: Json; model: string }> {
  const override = env("JOSY_MODEL");
  const list = override ? [override, ...DEFAULT_MODELS] : DEFAULT_MODELS;
  const now = Date.now();
  let candidates = list.filter((m) => !(failedAt.get(m) && now - (failedAt.get(m) || 0) < 180_000));
  if (!candidates.length) candidates = list;
  let lastErr = "";
  for (const model of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 4000) throw new AiError("ai_timeout", "Josy took too long to answer. Please try again.");
      const body: Json = { ...baseBody };
      if (!noThinkingCfg.has(model)) {
        body.generationConfig = { ...(baseBody.generationConfig as Json), thinkingConfig: { thinkingLevel: "low" } };
      }
      const t0 = Date.now();
      const r = await callModel(model, key, body, Math.min(model.includes("lite") ? 45_000 : 30_000, remaining - 2000));
      if (r.status >= 200 && r.status < 300) {
        workingModel = model;
        failedAt.delete(model);
        return { data: r.data, model };
      }
      const err = (r.data.error as Json) || {};
      const msg = String(err.message || r.text).slice(0, 300);
      const status = String(err.status || "");
      if (r.status === 400 && /thinking/i.test(msg) && !noThinkingCfg.has(model)) {
        noThinkingCfg.add(model);
        attempt--; // retry same model without the thinking config
        continue;
      }
      if (/API key not valid|API_KEY_INVALID|unregistered callers/i.test(msg + status)) {
        throw new AiError("ai_key_invalid", "Josy AI could not authenticate with its AI provider. Please try again later.");
      }
      lastErr = model + " (" + r.status + "): " + msg;
      if (r.status === 404 || /not found|not supported|is not available|no longer available|limited to existing users/i.test(msg)) break;
      if (r.status === 429 || r.status >= 500) {
        if (workingModel === model) workingModel = null;
        failedAt.set(model, Date.now());
        if (attempt === 0 && r.status !== 504 && Date.now() - t0 < 5000) { await new Promise((res) => setTimeout(res, 800)); continue; }
        break; // try the next model
      }
      throw new AiError("ai_failed", "Josy AI error: " + lastErr.replace(/gemini[\w.-]*/gi, "model"));
    }
  }
  if (/429/.test(lastErr)) throw new AiError("ai_rate_limited", "Josy's AI is busy right now (rate limit). Try again in a minute.");
  throw new AiError("ai_unavailable", "Josy's AI is temporarily unavailable. Please try again in a moment.");
}

function systemPrompt(opts: { plan: string; credits: number; market: string; lang: string; today: string }): string {
  return `You are Josy AI, the AI marketing assistant inside MarketScope (marketscope.space), a product and market research platform for e-commerce sellers.

IDENTITY: Your name is Josy AI, made by MarketScope. If asked what model, AI or company powers you, say you are Josy AI by MarketScope — do not name any underlying model or AI provider. Never claim to be human; if asked, say you are an AI assistant.

LANGUAGE: Always reply in the language of the user's latest message (Hebrew → natural modern Hebrew; English → English; any other language → that language). The UI language hint is "${opts.lang}". Keep brand names, platform names and hashtags as people actually write them. In Hebrew, address the user in gender-neutral phrasing (or plural) unless they reveal their gender.

YOUR JOB (v1 = ORGANIC marketing only): help the user grow with organic channels and do the work yourself:
- Validate demand for products, niches and keywords with the check_demand tool (live Google search data).
- Write ready-to-post social posts, captions, hooks, short-video scripts and video ideas for Instagram, TikTok, YouTube Shorts, Facebook, LinkedIn, Pinterest, X.
- SEO: topic clusters, article briefs, titles, meta descriptions, product-page copy — prioritised by real demand from check_demand when possible.
- Build organic marketing plans (save_plan) and dated content calendars (create_content_calendar); read saved ones with list_plans / get_plan.
MarketScope has a Campaign manager (josy-campaigns.html) where the user works by hand: an organic planner (josy-organic.html) to compose posts per platform, schedule them on a calendar and mark them published themselves, and paid campaign drafts (josy-paid.html, new draft at josy-campaign-new.html) for Meta, TikTok and Google with objective, budget, schedule, audience, placements, bidding, ad sets / ad groups and ads. You can point users there and help them fill drafts (suggest copy within character limits, audiences, structure). You cannot see, create or edit their campaigns or posts yourself. Publishing to ad accounts or social networks is NOT available yet ("coming soon", requires platform approval) — never claim to publish, launch, run or pause ads or posts, and never invent reach, impressions, CPC, CTR, conversions or other performance numbers for campaigns.

MARKETSCOPE WORKSPACE (you can read it with tools): the user's stored live research snapshots (get_my_research), their product portfolio, supplier quotes, competitors and watchlist (get_workspace). Pages: Live Terminal (my-terminal.html: history, movers, category heatmap, alerts), Competitor Intelligence (competitors.html), Supplier Intelligence (suppliers.html), Product Portfolio (product-portfolio.html), Backtesting (backtesting.html), MarketScope Exchange (exchange.html — a SIMULATION with virtual credits only; never suggest real-money trading, investing or that credits have value) and the roadmap (roadmap.html). You may add a product to the watchlist with add_to_watchlist only when the user asks. Use workspace data for pricing, margin, supplier and "what should I focus on" advice; always say research figures come from their report on a given date, and that portfolio/supplier numbers are their own entries. MarketScope scores: Opportunity 0–100 with ratings STRONG BUY, BUY, HOLD, UNDERPERFORM, AVOID (formulas on methodology.html). Never invent a score — scores only come from live reports.

DATA HONESTY — HARD RULES:
1. Never invent statistics, search volumes, trends, CPCs, follower counts, conversion rates, market sizes, prices, case studies, quotes or testimonials.
2. Every demand number you mention must come from a check_demand result in this conversation. When you cite one, say it is from MarketScope live search data and name the market and that volumes are monthly Google searches.
3. If check_demand fails, returns no volume, or the user has no credits, say so plainly (no credit was charged) and continue with advice clearly labelled as a recommendation, not data. In that case do NOT describe the demand level at all — no words like "huge", "massive", "high", "growing", "steady" or "popular" about search demand, and no guessed numbers. Suggest trying the check again later.
4. General marketing best practices are fine, but phrase them as guidance ("usually", "a good starting point"), never as measured facts.
5. You have no access to the user's social accounts, analytics, website traffic, or competitors' private data. Don't claim otherwise.

COST AWARENESS: each check_demand call costs the user 1 MarketScope credit (they have ${opts.credits} credits; plan: ${opts.plan}). Batch up to 10 related keywords into ONE call. Don't call it for chit-chat or when data from earlier in the conversation already answers the question. Max ${MAX_DEMAND_CALLS_PER_TURN} calls per message.

DEFAULT MARKET: ${opts.market} unless the user names another market. For Israel (IL) use Hebrew keywords when the audience searches in Hebrew.

SAVING: When you create a full plan or calendar, save it with the matching tool and tell the user it's on their "My plans" page. Ask before saving only if it is unclear they want it kept. For calendars, give each item a day number and complete copy (not placeholders).

STYLE: warm, direct, expert — like a senior growth marketer. Use Markdown: short headings, bullet lists, numbered steps, tables for keyword comparisons. Keep answers focused; offer a clear next step at the end (one short line). Today's date: ${opts.today}.`;
}

type GPart = Json;
type GContent = { role: "user" | "model"; parts: GPart[] };

function historyToContents(rows: { role: string; content: string; meta: Json | null }[]): GContent[] {
  const out: GContent[] = [];
  for (const r of rows) {
    const role = r.role === "assistant" ? "model" : "user";
    let text = r.content || "";
    if (role === "model" && r.meta && typeof r.meta.tool_context === "string" && r.meta.tool_context) {
      text = "[Tool results I used for this reply: " + r.meta.tool_context + "]\n\n" + text;
    }
    if (!text.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push({ text });
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

function toolContext(st: TurnState): string {
  const parts: string[] = [];
  for (const d of st.demand) {
    parts.push("check_demand " + d.market + ": " + d.keywords.map((k) => k.keyword + "=" + (k.search_volume ?? "n/a") + "/mo" + (k.trend_12m_pct != null ? " (" + k.trend_12m_pct + "% 12m)" : "")).join(", ") +
      (d.related.length ? "; related: " + d.related.slice(0, 6).map((r) => r.keyword + "=" + (r.search_volume ?? "n/a")).join(", ") : ""));
  }
  if (st.planIds.length) parts.push("saved plan ids: " + st.planIds.join(", "));
  for (const n of st.notes || []) parts.push(n);
  return parts.join(" | ").slice(0, 3000);
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Use POST.", code: "method_not_allowed" });

  const user = await verifyUser(req).catch(() => null);
  if (!user) return json(req, 401, { error: "Please log in again.", code: "unauthorized" });

  let body: Json = {};
  try { body = (await req.json()) as Json; } catch { return json(req, 400, { error: "Body must be JSON.", code: "invalid_json" }); }

  const admin = adminClient();
  const prof = await admin.from("profiles").select("plan, credits").eq("id", user.id).maybeSingle();
  const plan = String(prof.data?.plan || "free");
  let credits = Number(prof.data?.credits || 0);

  if (body.action === "status") {
    const s = await admin.rpc("josy_usage_status", { p_user: user.id });
    const row = Array.isArray(s.data) ? (s.data[0] as Json) : null;
    return json(req, 200, {
      usage: { used: Number(row?.used || 0), limit: Number(row?.daily_limit || 10), plan },
      credits,
      ai_configured: !!env("GEMINI_API_KEY"),
      data_configured: !!(env("DATAFORSEO_LOGIN") && env("DATAFORSEO_PASSWORD")),
    });
  }

  const key = env("GEMINI_API_KEY");
  if (!key) return json(req, 503, { error: "Josy AI is not configured yet. Please try again later.", code: "ai_not_configured" });

  const regenerate = body.regenerate === true;
  let message = str(body.message, MAX_MESSAGE_CHARS + 1);
  if (!regenerate) {
    if (!message) return json(req, 400, { error: "Write a message first.", code: "empty_message" });
    if (message.length > MAX_MESSAGE_CHARS) return json(req, 400, { error: "Messages are limited to " + MAX_MESSAGE_CHARS + " characters.", code: "message_too_long" });
  }
  const market = resolveMarket(body.market).country;
  const lang = str(body.lang, 8) || "auto";

  // Conversation: load (must be owned) or create.
  let conversationId = str(body.conversation_id, 40);
  let isNew = false;
  if (conversationId) {
    const c = await admin.from("josy_conversations").select("id").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
    if (c.error || !c.data) return json(req, 404, { error: "Conversation not found.", code: "conversation_not_found" });
  } else {
    if (regenerate) return json(req, 400, { error: "Nothing to regenerate.", code: "nothing_to_regenerate" });
    const title = message.replace(/\s+/g, " ").slice(0, 60) + (message.length > 60 ? "…" : "");
    const c = await admin.from("josy_conversations").insert({ user_id: user.id, title: title || "New chat" }).select("id").single();
    if (c.error || !c.data) return json(req, 500, { error: "Could not start a conversation.", code: "conversation_create_failed" });
    conversationId = String(c.data.id);
    isNew = true;
  }

  // Regenerate: drop the last assistant reply and answer the last user turn again.
  if (regenerate) {
    const last = await admin.from("josy_messages").select("id, role, content").eq("conversation_id", conversationId)
      .order("id", { ascending: false }).limit(2);
    const rows = last.data || [];
    const lastUser = rows.find((r) => r.role === "user");
    if (!lastUser) return json(req, 400, { error: "Nothing to regenerate.", code: "nothing_to_regenerate" });
    message = String(lastUser.content);
  }

  // Usage allowance (atomic).
  const take = await admin.rpc("josy_take_message", { p_user: user.id });
  const t = Array.isArray(take.data) ? (take.data[0] as Json) : null;
  if (take.error || !t) {
    if (isNew) await admin.from("josy_conversations").delete().eq("id", conversationId);
    return json(req, 500, { error: "Could not check your Josy allowance.", code: "usage_check_failed" });
  }
  const usage = { used: Number(t.used), limit: Number(t.daily_limit), plan: String(t.plan) };
  if (!t.allowed) {
    if (isNew) await admin.from("josy_conversations").delete().eq("id", conversationId);
    return json(req, 429, { error: "You've used all " + usage.limit + " Josy messages for today on the " + usage.plan + " plan. It resets at 00:00 UTC — or upgrade for more.", code: "daily_limit", usage });
  }

  let userMessageId: number | null = null;
  let regenAssistantId: number | null = null;
  if (regenerate) {
    const last = await admin.from("josy_messages").select("id, role").eq("conversation_id", conversationId).order("id", { ascending: false }).limit(1).maybeSingle();
    if (last.data && last.data.role === "assistant") regenAssistantId = Number(last.data.id);
  } else {
    const um = await admin.from("josy_messages").insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: message }).select("id").single();
    if (um.data) userMessageId = Number(um.data.id);
    if (um.error) {
      await admin.rpc("josy_refund_message", { p_user: user.id });
      return json(req, 500, { error: "Could not save your message.", code: "message_save_failed" });
    }
  }

  const hist = await admin.from("josy_messages").select("id, role, content, meta").eq("conversation_id", conversationId)
    .order("id", { ascending: false }).limit(HISTORY_LIMIT + 1);
  const histRows = ((hist.data || []) as { id: number; role: string; content: string; meta: Json }[])
    .filter((r) => r.id !== regenAssistantId).slice(0, HISTORY_LIMIT).reverse();
  const contents = historyToContents(histRows);
  if (!contents.length) contents.push({ role: "user", parts: [{ text: message }] });

  const st: TurnState = {
    userId: user.id, conversationId, defaultMarket: market, demandCalls: 0, credits,
    creditsCharged: 0, demand: [], planIds: [], toolsUsed: [],
  };
  const sys = systemPrompt({ plan, credits, market, lang, today: new Date().toISOString().slice(0, 10) });

  let reply = "";
  let model = "";
  const deadline = Date.now() + 140_000;
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const forceText = round === MAX_TOOL_ROUNDS;
      const { data, model: m } = await gemini(key, {
        systemInstruction: { parts: [{ text: sys }] },
        contents,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: forceText ? "NONE" : "AUTO" } },
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
      }, deadline);
      model = m;
      const cand = Array.isArray(data.candidates) ? (data.candidates[0] as Json) : null;
      const content = (cand?.content as Json) || {};
      const parts = (Array.isArray(content.parts) ? content.parts : []) as GPart[];
      const calls = parts.filter((p) => p.functionCall);
      if (!calls.length) {
        reply = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => String(p.text)).join("").trim();
        if (!reply) {
          const reason = String(cand?.finishReason || (data.promptFeedback as Json)?.blockReason || "");
          reply = /SAFETY|BLOCK|PROHIBITED/i.test(reason)
            ? "I can't help with that request. Let's get back to your marketing — what are you selling?"
            : "Sorry — I couldn't produce an answer this time. Please try again.";
        }
        break;
      }
      contents.push({ role: "model", parts });
      const responses: GPart[] = [];
      for (const p of calls) {
        const fc = p.functionCall as Json;
        const name = String(fc.name || "");
        const args = (fc.args as Json) || {};
        let result: Json;
        try { result = await runTool(admin, st, name, args); } catch (e) { result = { ok: false, error: "Tool failed: " + String((e as Error).message || e).slice(0, 120) }; }
        console.log("josy tool", name, result.ok ? "ok" : "fail", String(result.error_code || result.error || "").slice(0, 120));
        responses.push({ functionResponse: { name, response: result } });
      }
      contents.push({ role: "user", parts: responses });
    }
  } catch (e) {
    await admin.rpc("josy_refund_message", { p_user: user.id });
    // Remove the unanswered user turn (the UI puts the text back in the composer).
    if (userMessageId != null && !st.planIds.length) await admin.from("josy_messages").delete().eq("id", userMessageId);
    if (isNew && !st.planIds.length) await admin.from("josy_conversations").delete().eq("id", conversationId);
    const code = e instanceof AiError ? e.code : "ai_failed";
    const msg = e instanceof AiError ? e.message : "Josy could not answer right now.";
    return json(req, 502, { error: msg, code, conversation_id: isNew ? null : conversationId, credits: st.credits });
  }

  const sources: Json[] = [{ id: "josy_ai", label: "Josy AI" }];
  for (const d of st.demand) sources.push({ id: "dataforseo", label: d.source, market: d.market, market_name: d.market_name, fetched_at: d.fetched_at });
  const meta: Json = {
    model, // internal only (not shown in the UI)
    sources,
    demand: st.demand,
    plan_ids: st.planIds,
    tools: st.toolsUsed,
    credits_charged: st.creditsCharged,
    tool_context: toolContext(st),
    market,
  };
  if (regenAssistantId != null) await admin.from("josy_messages").delete().eq("id", regenAssistantId);
  const am = await admin.from("josy_messages").insert({ conversation_id: conversationId, user_id: user.id, role: "assistant", content: reply.slice(0, 40000), meta })
    .select("id, created_at").single();
  await admin.from("josy_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  return json(req, 200, {
    conversation_id: conversationId,
    message_id: am.data?.id ?? null,
    reply,
    plan_ids: st.planIds,
    demand: st.demand,
    sources,
    tools: st.toolsUsed,
    credits: st.credits,
    credits_charged: st.creditsCharged,
    usage,
  });
});
