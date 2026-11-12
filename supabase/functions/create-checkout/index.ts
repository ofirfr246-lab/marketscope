/* MarketScope — create a Stripe Checkout Session for a signed-in user.
   STRIPE_SECRET_KEY must be set as an Edge Function secret (restricted key
   recommended). Never put that key in the static site. */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@19.1.0";

const ALLOWED_ORIGINS = new Set([
  "https://marketscope.space",
  "https://www.marketscope.space",
  "https://ofirfr246-lab.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
]);

const SUCCESS_URL = "https://marketscope.space/dashboard.html?checkout=success";
const CANCEL_URL = "https://marketscope.space/pricing.html";

/** Live prices created on the Growege Stripe account. Public IDs, not secrets. */
const PRICES: Record<string, { id: string; kind: "subscription" | "topup"; plan: string | null; credits: number }> = {
  starter_monthly: { id: "price_1Ub2a3KGd933k3yPs0SBUQh2", kind: "subscription", plan: "starter", credits: 30 },
  starter_yearly: { id: "price_1Ub2a4KGd933k3yPcESrI9ln", kind: "subscription", plan: "starter", credits: 30 },
  plus_monthly: { id: "price_1Ub2a5KGd933k3yPLuQlRSSk", kind: "subscription", plan: "plus", credits: 100 },
  plus_yearly: { id: "price_1Ub2a5KGd933k3yPnJnSfDup", kind: "subscription", plan: "plus", credits: 100 },
  pro_monthly: { id: "price_1Ub2a6KGd933k3yPFA3dokgq", kind: "subscription", plan: "pro", credits: 200 },
  pro_yearly: { id: "price_1Ub2a6KGd933k3yP58jlDYey", kind: "subscription", plan: "pro", credits: 200 },
  topup_10: { id: "price_1Ub2a7KGd933k3yPBF5yC9LA", kind: "topup", plan: null, credits: 10 },
  topup_50: { id: "price_1Ub2a7KGd933k3yPKx7xO48e", kind: "topup", plan: null, credits: 50 },
  topup_150: { id: "price_1Ub2a8KGd933k3yP2a08sT4X", kind: "topup", plan: null, credits: 150 },
};

const BY_ID: Record<string, (typeof PRICES)[string] & { lookup: string }> = {};
for (const [lookup, p] of Object.entries(PRICES)) BY_ID[p.id] = { ...p, lookup };

type Json = Record<string, unknown>;

function env(name: string): string {
  return (Deno.env.get(name) || "").trim();
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://marketscope.space";
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

function randSuffix(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
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

function resolvePrice(body: Json): ((typeof PRICES)[string] & { lookup: string }) | null {
  const lookup = typeof body.lookup_key === "string" ? body.lookup_key.trim() : "";
  const priceId = typeof body.price_id === "string" ? body.price_id.trim() : "";
  if (lookup && PRICES[lookup]) return { ...PRICES[lookup], lookup };
  if (priceId && BY_ID[priceId]) return BY_ID[priceId];
  if (typeof body.plan === "string" && body.plan) {
    const interval = body.interval === "year" || body.interval === "yearly" ? "yearly" : "monthly";
    const key = body.plan + "_" + interval;
    if (PRICES[key]) return { ...PRICES[key], lookup: key };
  }
  if (body.kind === "topup" && body.credits != null) {
    const key = "topup_" + String(body.credits);
    if (PRICES[key]) return { ...PRICES[key], lookup: key };
  }
  return null;
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

  const secret = env("STRIPE_SECRET_KEY");
  if (!secret) {
    return json(req, 503, { error: "Payments not configured", code: "payments_not_configured" });
  }

  let body: Json = {};
  try {
    body = (await req.json()) as Json;
  } catch {
    body = {};
  }

  const price = resolvePrice(body);
  if (!price) {
    return json(req, 400, { error: "Choose a valid plan or credit pack.", code: "invalid_price" });
  }

  const url = env("SUPABASE_URL");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) {
    return json(req, 500, { error: "Auth is not configured.", code: "auth_not_configured" });
  }
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, email, stripe_customer_id, stripe_subscription_id, plan")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) {
    return json(req, 500, { error: "Could not load your profile.", code: "profile_error" });
  }

  if (price.kind === "subscription" && profile?.stripe_subscription_id) {
    return json(req, 409, {
      error: "You already have a subscription. Use Manage billing on the dashboard to change or cancel your plan.",
      code: "already_subscribed",
    });
  }

  const stripe = new Stripe(secret, { apiVersion: "2025-08-27.basil" });
  const email = user.email || profile?.email || undefined;
  const meta: Record<string, string> = {
    user_id: user.id,
    kind: price.kind,
    credits: String(price.credits),
    lookup_key: price.lookup,
  };
  if (price.plan) meta.plan = price.plan;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: price.kind === "subscription" ? "subscription" : "payment",
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: user.id,
    success_url: SUCCESS_URL,
    cancel_url: CANCEL_URL,
    metadata: meta,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    integration_identifier: "marketscope-" + randSuffix(),
  };
  if (profile?.stripe_customer_id) {
    params.customer = profile.stripe_customer_id;
    params.customer_update = { name: "auto", address: "auto" };
  } else if (email) {
    params.customer_email = email;
  }
  if (price.kind === "subscription") {
    params.subscription_data = { metadata: meta };
  } else {
    params.payment_intent_data = { metadata: meta };
  }

  try {
    const session = await stripe.checkout.sessions.create(params);
    if (!session.url) {
      return json(req, 502, { error: "Checkout could not be started.", code: "checkout_failed" });
    }
    return json(req, 200, { url: session.url, id: session.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout could not be started.";
    console.error("create-checkout", message);
    return json(req, 502, { error: "Checkout could not be started.", code: "checkout_failed" });
  }
});
