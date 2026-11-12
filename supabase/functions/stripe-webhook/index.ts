/* MarketScope — Stripe webhook.
   verify_jwt is off; authenticity comes from the Stripe signature
   checked against STRIPE_WEBHOOK_SECRET. */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@19.1.0";

function env(name: string): string {
  return (Deno.env.get(name) || "").trim();
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function adminClient(): SupabaseClient {
  const url = env("SUPABASE_URL");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) throw new Error("Supabase is not configured");
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

function metaNum(meta: Stripe.Metadata | null | undefined, key: string): number | null {
  const v = meta && meta[key];
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function metaStr(meta: Stripe.Metadata | null | undefined, key: string): string | null {
  const v = meta && meta[key];
  return v ? String(v) : null;
}

async function seenEvent(admin: SupabaseClient, event: Stripe.Event): Promise<boolean> {
  const { error } = await admin.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    payload: { type: event.type, created: event.created },
  });
  if (error) {
    if (error.code === "23505") return true;
    throw error;
  }
  return false;
}

async function fulfillOnce(admin: SupabaseClient, id: string, kind: string, userId: string | null): Promise<boolean> {
  const { error } = await admin.from("stripe_fulfillments").insert({
    id,
    kind,
    user_id: userId,
  });
  if (error) {
    if (error.code === "23505") return false;
    throw error;
  }
  return true;
}

async function findUserId(
  admin: SupabaseClient,
  opts: { userId?: string | null; customerId?: string | null; email?: string | null },
): Promise<string | null> {
  if (opts.userId) return opts.userId;
  if (opts.customerId) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", opts.customerId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (opts.email) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", opts.email)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

async function setPlan(
  admin: SupabaseClient,
  userId: string,
  plan: string,
  credits: number,
  customerId?: string | null,
  subscriptionId?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { plan, credits };
  if (customerId) patch.stripe_customer_id = customerId;
  if (subscriptionId) patch.stripe_subscription_id = subscriptionId;
  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
}

async function addCredits(
  admin: SupabaseClient,
  userId: string,
  amount: number,
  customerId?: string | null,
): Promise<void> {
  const { data, error } = await admin.from("profiles").select("credits").eq("id", userId).maybeSingle();
  if (error) throw error;
  const current = typeof data?.credits === "number" ? data.credits : 0;
  const patch: Record<string, unknown> = { credits: current + amount };
  if (customerId) patch.stripe_customer_id = customerId;
  const { error: upErr } = await admin.from("profiles").update(patch).eq("id", userId);
  if (upErr) throw upErr;
}

function customerIdOf(obj: { customer?: string | Stripe.Customer | Stripe.DeletedCustomer | null }): string | null {
  const c = obj.customer;
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

async function catalogFromPrice(
  stripe: Stripe,
  priceId: string | null | undefined,
  fallback: { plan: string | null; credits: number | null; kind: string | null },
): Promise<{ plan: string | null; credits: number | null; kind: string | null }> {
  if (!priceId) return fallback;
  const price = await stripe.prices.retrieve(priceId);
  return {
    plan: metaStr(price.metadata, "plan") || fallback.plan,
    credits: metaNum(price.metadata, "credits") ?? fallback.credits,
    kind: metaStr(price.metadata, "kind") || fallback.kind,
  };
}

async function handleCheckoutSession(admin: SupabaseClient, stripe: Stripe, session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;

  const userId = await findUserId(admin, {
    userId: session.client_reference_id || metaStr(session.metadata, "user_id"),
    customerId: customerIdOf(session),
    email: session.customer_email || session.customer_details?.email || null,
  });
  if (!userId) {
    console.error("checkout.session: no user for", session.id);
    return;
  }
  if (!(await fulfillOnce(admin, session.id, "checkout.session", userId))) return;

  let linePrice: string | null = null;
  try {
    const lines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    const price = lines.data[0]?.price;
    linePrice = price ? (typeof price === "string" ? price : price.id) : null;
  } catch (e) {
    console.error("listLineItems", e);
  }

  const info = await catalogFromPrice(stripe, linePrice, {
    plan: metaStr(session.metadata, "plan"),
    credits: metaNum(session.metadata, "credits"),
    kind: metaStr(session.metadata, "kind"),
  });
  const customerId = customerIdOf(session);
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id || null;

  if (info.kind === "topup" && info.credits != null) {
    await addCredits(admin, userId, info.credits, customerId);
    return;
  }
  if ((info.kind === "subscription" || session.mode === "subscription") && info.plan && info.credits != null) {
    await setPlan(admin, userId, info.plan, info.credits, customerId, subscriptionId);
  }
}

async function handleInvoicePaid(admin: SupabaseClient, stripe: Stripe, invoice: Stripe.Invoice): Promise<void> {
  const reason = invoice.billing_reason || "";
  // First invoice is also granted from checkout.session.completed; skip create to avoid a second write race.
  // Renewals and mid-cycle updates reset (or set) the monthly allotment.
  if (reason !== "subscription_cycle" && reason !== "subscription_update") return;

  const subscriptionRef = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
  const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id || null;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = await findUserId(admin, {
    userId: metaStr(subscription.metadata, "user_id"),
    customerId: customerIdOf(subscription),
  });
  if (!userId) {
    console.error("invoice.paid: no user for", invoice.id);
    return;
  }
  if (!(await fulfillOnce(admin, invoice.id, "invoice.paid", userId))) return;

  const itemPrice = subscription.items.data[0]?.price;
  const priceId = itemPrice ? (typeof itemPrice === "string" ? itemPrice : itemPrice.id) : null;
  const priceMeta = itemPrice && typeof itemPrice !== "string" ? itemPrice.metadata : undefined;
  const info = await catalogFromPrice(stripe, priceId, {
    plan: metaStr(subscription.metadata, "plan") || metaStr(priceMeta, "plan"),
    credits: metaNum(subscription.metadata, "credits") ?? metaNum(priceMeta, "credits"),
    kind: "subscription",
  });
  if (!info.plan || info.credits == null) {
    console.error("invoice.paid: missing plan/credits on", invoice.id);
    return;
  }
  await setPlan(admin, userId, info.plan, info.credits, customerIdOf(subscription), subscription.id);
}

async function handleSubscriptionDeleted(admin: SupabaseClient, subscription: Stripe.Subscription): Promise<void> {
  const userId = await findUserId(admin, {
    userId: metaStr(subscription.metadata, "user_id"),
    customerId: customerIdOf(subscription),
  });
  if (!userId) {
    console.error("subscription.deleted: no user for", subscription.id);
    return;
  }
  if (!(await fulfillOnce(admin, subscription.id + ":deleted", "subscription.deleted", userId))) return;
  const { error } = await admin
    .from("profiles")
    .update({ plan: "free", stripe_subscription_id: null })
    .eq("id", userId);
  if (error) throw error;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const signature = req.headers.get("stripe-signature") || req.headers.get("Stripe-Signature") || "";
  if (!signature) {
    return json(400, { error: "Missing Stripe-Signature", code: "unsigned" });
  }

  const secret = env("STRIPE_WEBHOOK_SECRET");
  const key = env("STRIPE_SECRET_KEY");
  if (!secret || !key) {
    return json(503, { error: "Payments not configured", code: "payments_not_configured" });
  }

  const raw = await req.text();
  const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch {
    return json(400, { error: "Invalid Stripe signature", code: "invalid_signature" });
  }

  const admin = adminClient();
  if (await seenEvent(admin, event)) {
    return json(200, { received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutSession(admin, stripe, event.data.object as Stripe.Checkout.Session);
        break;
      case "invoice.paid":
        await handleInvoicePaid(admin, stripe, event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "handler failed";
    console.error("stripe-webhook", event.type, event.id, message);
    // Drop the event row so Stripe can retry.
    await admin.from("stripe_events").delete().eq("id", event.id);
    return json(500, { error: "Webhook handler failed" });
  }

  return json(200, { received: true });
});
