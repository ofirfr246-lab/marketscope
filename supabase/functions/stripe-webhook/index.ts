/* MarketScope — Stripe webhook.
   verify_jwt is off; authenticity comes from the Stripe signature
   checked against STRIPE_WEBHOOK_SECRET only. No Stripe secret key is required:
   plan/credits are read from event metadata (Payment Link / price / subscription). */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@19.1.0";

type Catalog = { plan: string | null; credits: number | null; kind: string | null };

const PRICE_CATALOG: Record<string, Catalog> = {
  price_1Ub2a3KGd933k3yPs0SBUQh2: { plan: "starter", credits: 30, kind: "subscription" },
  price_1Ub2a4KGd933k3yPcESrI9ln: { plan: "starter", credits: 30, kind: "subscription" },
  price_1Ub2a5KGd933k3yPLuQlRSSk: { plan: "plus", credits: 100, kind: "subscription" },
  price_1Ub2a5KGd933k3yPnJnSfDup: { plan: "plus", credits: 100, kind: "subscription" },
  price_1Ub2a6KGd933k3yPFA3dokgq: { plan: "pro", credits: 200, kind: "subscription" },
  price_1Ub2a6KGd933k3yP58jlDYey: { plan: "pro", credits: 200, kind: "subscription" },
  price_1Ub2a7KGd933k3yPBF5yC9LA: { plan: null, credits: 10, kind: "topup" },
  price_1Ub2a7KGd933k3yPKx7xO48e: { plan: null, credits: 50, kind: "topup" },
  price_1Ub2a8KGd933k3yP2a08sT4X: { plan: null, credits: 150, kind: "topup" },
};

const LINK_CATALOG: Record<string, Catalog> = {
  plink_1Ub3FNKGd933k3yPc7fnyFY3: { plan: "starter", credits: 30, kind: "subscription" },
  plink_1Ub3FOKGd933k3yPLgnBOICB: { plan: "starter", credits: 30, kind: "subscription" },
  plink_1Ub3FOKGd933k3yPIYkL2qki: { plan: "plus", credits: 100, kind: "subscription" },
  plink_1Ub3FRKGd933k3yPMh57yhFs: { plan: "plus", credits: 100, kind: "subscription" },
  plink_1Ub3FRKGd933k3yPmfUdeLSL: { plan: "pro", credits: 200, kind: "subscription" },
  plink_1Ub3FSKGd933k3yP6QOQppDv: { plan: "pro", credits: 200, kind: "subscription" },
  plink_1Ub3FSKGd933k3yPAXujZM0C: { plan: null, credits: 10, kind: "topup" },
  plink_1Ub3FTKGd933k3yP4rZFXI7D: { plan: null, credits: 50, kind: "topup" },
  plink_1Ub3FgKGd933k3yPpfAVymAs: { plan: null, credits: 150, kind: "topup" },
};

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

function asMeta(v: unknown): Stripe.Metadata | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Stripe.Metadata;
  return null;
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

function emptyCatalog(): Catalog {
  return { plan: null, credits: null, kind: null };
}

function mergeCatalog(...parts: Array<Catalog | null | undefined>): Catalog {
  const out = emptyCatalog();
  for (const p of parts) {
    if (!p) continue;
    if (!out.plan && p.plan) out.plan = p.plan;
    if (out.credits == null && p.credits != null) out.credits = p.credits;
    if (!out.kind && p.kind) out.kind = p.kind;
  }
  return out;
}

function catalogFromMeta(meta: Stripe.Metadata | null | undefined): Catalog {
  return {
    plan: metaStr(meta, "plan"),
    credits: metaNum(meta, "credits"),
    kind: metaStr(meta, "kind"),
  };
}

function idOf(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "id" in value && typeof (value as { id: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

function customerIdOf(obj: { customer?: unknown }): string | null {
  return idOf(obj.customer);
}

async function verifyStripeEvent(raw: string, signature: string, secret: string): Promise<Stripe.Event> {
  const staticHooks = (Stripe as unknown as { webhooks?: Stripe["webhooks"] }).webhooks;
  if (staticHooks && typeof staticHooks.constructEventAsync === "function") {
    return await staticHooks.constructEventAsync(raw, signature, secret);
  }
  // Fallback: a dummy key is only used to construct the SDK client. No Stripe API calls are made.
  const key = env("STRIPE_SECRET_KEY") || "sk_unused_webhook_verify_only";
  const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });
  return await stripe.webhooks.constructEventAsync(raw, signature, secret);
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

function catalogFromLines(lines: unknown): Catalog {
  const data = (lines as { data?: unknown[] } | undefined)?.data || [];
  let found = emptyCatalog();
  for (const raw of data) {
    const line = raw as Record<string, unknown>;
    const price = line.price;
    const priceObj = price && typeof price === "object" ? price as Record<string, unknown> : null;
    const priceId = idOf(price)
      || ((line.pricing as { price_details?: { price?: unknown } } | undefined)?.price_details?.price as string | undefined)
      || null;
    found = mergeCatalog(
      found,
      catalogFromMeta(asMeta(line.metadata)),
      catalogFromMeta(asMeta(priceObj?.metadata)),
      priceId ? PRICE_CATALOG[priceId] : null,
    );
  }
  return found;
}

function catalogFromSession(session: Stripe.Checkout.Session): Catalog {
  const paymentLinkId = idOf((session as unknown as { payment_link?: unknown }).payment_link);
  return mergeCatalog(
    catalogFromMeta(session.metadata),
    paymentLinkId ? LINK_CATALOG[paymentLinkId] : null,
    catalogFromLines((session as unknown as { line_items?: unknown }).line_items),
  );
}

function invoiceSubscription(invoice: Stripe.Invoice): { id: string | null; metadata: Stripe.Metadata | null } {
  const rec = invoice as unknown as {
    subscription?: unknown;
    parent?: { subscription_details?: { subscription?: unknown; metadata?: unknown } };
    subscription_details?: { metadata?: unknown };
  };
  const details = rec.parent?.subscription_details;
  return {
    id: idOf(details?.subscription) || idOf(rec.subscription),
    metadata: asMeta(details?.metadata) || asMeta(rec.subscription_details?.metadata),
  };
}

async function handleCheckoutSession(admin: SupabaseClient, session: Stripe.Checkout.Session): Promise<void> {
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

  const info = catalogFromSession(session);
  const customerId = customerIdOf(session);
  const subscriptionId = idOf(session.subscription);

  if (info.kind === "topup" && info.credits != null) {
    await addCredits(admin, userId, info.credits, customerId);
    return;
  }
  if ((info.kind === "subscription" || session.mode === "subscription") && info.plan && info.credits != null) {
    await setPlan(admin, userId, info.plan, info.credits, customerId, subscriptionId);
  }
}

async function handleInvoicePaid(admin: SupabaseClient, invoice: Stripe.Invoice): Promise<void> {
  const reason = invoice.billing_reason || "";
  // First invoice is also granted from checkout.session.completed; skip create to avoid a second write race.
  if (reason !== "subscription_cycle" && reason !== "subscription_update") return;

  const sub = invoiceSubscription(invoice);
  if (!sub.id) {
    console.error("invoice.paid: no subscription on", invoice.id);
    return;
  }

  const lineInfo = catalogFromLines(invoice.lines);
  const info = mergeCatalog(catalogFromMeta(sub.metadata), lineInfo, { plan: null, credits: null, kind: "subscription" });

  const userId = await findUserId(admin, {
    userId: metaStr(sub.metadata, "user_id"),
    customerId: customerIdOf(invoice),
    email: invoice.customer_email || null,
  });
  if (!userId) {
    console.error("invoice.paid: no user for", invoice.id);
    return;
  }
  if (!(await fulfillOnce(admin, invoice.id, "invoice.paid", userId))) return;
  if (!info.plan || info.credits == null) {
    console.error("invoice.paid: missing plan/credits on", invoice.id);
    return;
  }
  await setPlan(admin, userId, info.plan, info.credits, customerIdOf(invoice), sub.id);
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
  if (!secret) {
    return json(503, { error: "Payments not configured", code: "payments_not_configured" });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await verifyStripeEvent(raw, signature, secret);
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
        await handleCheckoutSession(admin, event.data.object as Stripe.Checkout.Session);
        break;
      case "invoice.paid":
        await handleInvoicePaid(admin, event.data.object as Stripe.Invoice);
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
    await admin.from("stripe_events").delete().eq("id", event.id);
    return json(500, { error: "Webhook handler failed" });
  }

  return json(200, { received: true });
});
