/* MarketScope — Stripe webhook.
   verify_jwt is off; authenticity comes from the Stripe signature
   checked against STRIPE_WEBHOOK_SECRET only. No Stripe secret key is required:
   plan/credits are read from the price / Payment Link / metadata on the event.

   Handles:
     checkout.session.completed / async_payment_succeeded -> plan or credits
     invoice.paid (renewals)                               -> reset monthly credits
     customer.subscription.updated                         -> plan changes, status, cancel flag
     customer.subscription.deleted                         -> back to free
     invoice.payment_failed                                -> status past_due
   Payments that match no account are kept in stripe_pending_grants and are
   claimed automatically (DB trigger) when an account with that confirmed email exists. */
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
    const email = opts.email.trim().toLowerCase();
    const { data } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .limit(5);
    for (const row of data || []) {
      const { data: u } = await admin.auth.admin.getUserById(row.id);
      const authEmail = (u?.user?.email || "").toLowerCase();
      if (authEmail === email && u?.user?.email_confirmed_at) return row.id;
    }
  }
  return null;
}

async function savePendingGrant(
  admin: SupabaseClient,
  row: {
    id: string;
    email: string;
    kind: string;
    plan: string | null;
    credits: number;
    customerId: string | null;
    subscriptionId: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("stripe_pending_grants").upsert({
    id: row.id,
    email: row.email.trim().toLowerCase(),
    kind: row.kind,
    plan: row.plan,
    credits: row.credits,
    stripe_customer_id: row.customerId,
    stripe_subscription_id: row.subscriptionId,
    subscription_status: row.kind === "subscription" ? "active" : null,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
}

async function setPlan(
  admin: SupabaseClient,
  userId: string,
  plan: string,
  credits: number,
  customerId?: string | null,
  subscriptionId?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    plan,
    credits,
    subscription_status: "active",
    cancel_at_period_end: false,
  };
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
      priceId ? PRICE_CATALOG[priceId] : null,
      catalogFromMeta(asMeta(priceObj?.metadata)),
      catalogFromMeta(asMeta(line.metadata)),
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

  const info = catalogFromSession(session);
  const customerId = customerIdOf(session);
  const subscriptionId = idOf(session.subscription);
  const email = session.customer_details?.email || session.customer_email || null;

  const userId = await findUserId(admin, {
    userId: session.client_reference_id || metaStr(session.metadata, "user_id"),
    customerId,
    email,
  });
  if (!userId) {
    // Paid before having an account (or with another email): keep it for later.
    const kind = info.kind || (session.mode === "subscription" ? "subscription" : null);
    if (email && kind && info.credits != null) {
      await savePendingGrant(admin, {
        id: session.id,
        email,
        kind,
        plan: info.plan,
        credits: info.credits,
        customerId,
        subscriptionId,
      });
      console.log("checkout.session: saved pending grant", session.id);
    } else {
      console.error("checkout.session: no user and no usable email for", session.id);
    }
    return;
  }
  if (!(await fulfillOnce(admin, session.id, "checkout.session", userId))) return;

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
  const info = mergeCatalog(lineInfo, catalogFromMeta(sub.metadata), { plan: null, credits: null, kind: "subscription" });

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

function subscriptionPriceId(subscription: Stripe.Subscription): string | null {
  const item = subscription.items?.data?.[0] as unknown as { price?: unknown } | undefined;
  return idOf(item?.price);
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription): string | null {
  const rec = subscription as unknown as {
    current_period_end?: number;
    items?: { data?: Array<{ current_period_end?: number }> };
  };
  const ts = rec.items?.data?.[0]?.current_period_end ?? rec.current_period_end;
  return typeof ts === "number" ? new Date(ts * 1000).toISOString() : null;
}

const ENDED = new Set(["canceled", "unpaid", "incomplete_expired"]);

async function handleSubscriptionUpdated(
  admin: SupabaseClient,
  subscription: Stripe.Subscription,
  eventCreated: number,
): Promise<void> {
  const customerId = customerIdOf(subscription);
  const priceId = subscriptionPriceId(subscription);
  const info = mergeCatalog(priceId ? PRICE_CATALOG[priceId] : null, catalogFromMeta(subscription.metadata));
  const status = subscription.status;

  const userId = await findUserId(admin, {
    userId: metaStr(subscription.metadata, "user_id"),
    customerId,
  });
  if (!userId) {
    // Not linked to an account yet: keep any pending grant in sync.
    const patch: Record<string, unknown> = { subscription_status: status };
    if (info.plan) patch.plan = info.plan;
    if (info.credits != null) patch.credits = info.credits;
    if (ENDED.has(status)) patch.voided_at = new Date().toISOString();
    await admin.from("stripe_pending_grants").update(patch)
      .eq("stripe_subscription_id", subscription.id).is("claimed_at", null);
    return;
  }

  const { data: profile, error } = await admin
    .from("profiles")
    .select("plan, credits, stripe_subscription_id, subscription_event_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return;

  const eventAt = new Date(eventCreated * 1000).toISOString();
  if (profile.subscription_event_at && new Date(profile.subscription_event_at) > new Date(eventAt)) {
    return; // older event arriving late
  }
  if (profile.stripe_subscription_id && profile.stripe_subscription_id !== subscription.id && !ENDED.has(status)) {
    // A different subscription than the one on file; only adopt it if active.
    if (status !== "active" && status !== "trialing") return;
  }
  if (profile.stripe_subscription_id && profile.stripe_subscription_id !== subscription.id && ENDED.has(status)) {
    return; // an old subscription ended; the current one is unaffected
  }

  const rec = subscription as unknown as { cancel_at?: number | null };
  const patch: Record<string, unknown> = {
    subscription_status: status,
    current_period_end: subscriptionPeriodEnd(subscription),
    cancel_at_period_end: !!subscription.cancel_at_period_end || !!rec.cancel_at,
    subscription_event_at: eventAt,
  };
  if (customerId) patch.stripe_customer_id = customerId;

  if (ENDED.has(status)) {
    patch.plan = "free";
    patch.stripe_subscription_id = null;
  } else if (status === "active" || status === "trialing" || status === "past_due") {
    patch.stripe_subscription_id = subscription.id;
    if (info.plan && info.plan !== profile.plan) {
      const oldCredits = (PLAN_CREDITS[profile.plan || ""] ?? 0);
      patch.plan = info.plan;
      // Upgrade: top the wallet up to the new plan's monthly credits now.
      // Downgrade: keep current credits until the next renewal resets them.
      if (info.credits != null && info.credits > oldCredits) {
        patch.credits = Math.max(profile.credits ?? 0, info.credits);
      }
    }
  }

  const { error: upErr } = await admin.from("profiles").update(patch).eq("id", userId);
  if (upErr) throw upErr;
}

const PLAN_CREDITS: Record<string, number> = { free: 0, starter: 30, plus: 100, pro: 200 };

async function handleInvoicePaymentFailed(admin: SupabaseClient, invoice: Stripe.Invoice): Promise<void> {
  const sub = invoiceSubscription(invoice);
  if (!sub.id) return; // one-time payments: nothing to change
  const userId = await findUserId(admin, {
    userId: metaStr(sub.metadata, "user_id"),
    customerId: customerIdOf(invoice),
  });
  if (!userId) return;
  const { error } = await admin
    .from("profiles")
    .update({ subscription_status: "past_due" })
    .eq("id", userId)
    .eq("stripe_subscription_id", sub.id);
  if (error) throw error;
}

async function handleSubscriptionDeleted(admin: SupabaseClient, subscription: Stripe.Subscription): Promise<void> {
  const userId = await findUserId(admin, {
    userId: metaStr(subscription.metadata, "user_id"),
    customerId: customerIdOf(subscription),
  });
  if (!userId) {
    await admin.from("stripe_pending_grants")
      .update({ voided_at: new Date().toISOString(), subscription_status: "canceled" })
      .eq("stripe_subscription_id", subscription.id).is("claimed_at", null);
    console.error("subscription.deleted: no user for", subscription.id);
    return;
  }
  if (!(await fulfillOnce(admin, subscription.id + ":deleted", "subscription.deleted", userId))) return;
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.stripe_subscription_id && profile.stripe_subscription_id !== subscription.id) {
    return; // an older subscription ended; keep the current plan
  }
  const { error } = await admin
    .from("profiles")
    .update({
      plan: "free",
      stripe_subscription_id: null,
      subscription_status: "canceled",
      cancel_at_period_end: false,
      current_period_end: null,
      subscription_event_at: new Date().toISOString(),
    })
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
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(admin, event.data.object as Stripe.Subscription, event.created);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(admin, event.data.object as Stripe.Invoice);
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
