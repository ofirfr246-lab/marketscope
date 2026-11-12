// MarketScope — Paddle webhook (STUB, not deployed).
//
// Paid plan credits (Starter / Plus / Pro monthly allowances and credit
// packs) will be granted later from this Edge Function, which must run
// server-side with the Supabase service role key. Never put that key, or
// the Paddle webhook secret, in the static GitHub Pages site.
//
// Deploy later with:  supabase functions deploy paddle-webhook
// Set secrets:        PADDLE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY
// Point Paddle's notification destination at the function URL.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // TODO: verify the Paddle-Signature (or ts + h1 HMAC) against
  // PADDLE_WEBHOOK_SECRET before trusting the body.
  // See https://developer.paddle.com/webhooks/signature-verification
  const signature = req.headers.get("Paddle-Signature") ?? "";
  if (!signature) {
    return new Response("Missing Paddle-Signature", { status: 400 });
  }

  // TODO after signature verification:
  //  1. Parse the event (subscription.created / subscription.activated,
  //     subscription.updated, subscription.canceled, transaction.completed).
  //  2. Look up the MarketScope user (custom_data.user_id or customer email).
  //  3. With the service role client, update public.profiles:
  //       - set plan to starter | plus | pro
  //       - add the plan's monthly credits (or a top-up pack amount)
  //  4. On cancellation, set plan back to 'free' without silently wiping
  //     remaining credits unless that is the published refund policy.
  //  5. Return 200 only after a successful, idempotent write.

  return new Response(
    JSON.stringify({ ok: false, reason: "not deployed" }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  );
});
