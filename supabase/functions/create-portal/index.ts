/* MarketScope — Stripe Customer Portal session for a signed-in subscriber. */
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

const RETURN_URL = "https://marketscope.space/dashboard.html";

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

async function verifyUser(req: Request): Promise<{ id: string } | { error: Response }> {
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
  return { id: data.user.id };
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

  const url = env("SUPABASE_URL");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) {
    return json(req, 500, { error: "Auth is not configured.", code: "auth_not_configured" });
  }
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.stripe_customer_id) {
    return json(req, 400, { error: "No billing customer is on file yet. Subscribe or buy a credit pack first.", code: "no_customer" });
  }

  const stripe = new Stripe(secret, { apiVersion: "2025-08-27.basil" });
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: RETURN_URL,
    });
    return json(req, 200, { url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portal could not be opened.";
    console.error("create-portal", message);
    return json(req, 502, { error: "Billing portal could not be opened.", code: "portal_failed" });
  }
});
