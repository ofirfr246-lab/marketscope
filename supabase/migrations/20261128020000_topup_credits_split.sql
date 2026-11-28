-- MarketScope: keep purchased top-up credits across renewals and plan changes.
-- Additive. profiles.credits stays the single spendable balance everything already reads.
-- profiles.topup_credits is the part of that balance that came from top-up packs
-- (invariant: 0 <= topup_credits <= credits). Plan credits = credits - topup_credits.
--   * top-up purchase   : credits += n, topup_credits += n
--   * spending          : plan credits first, then top-up credits
--   * renewal/plan grant: credits = new_allowance + topup_credits (unused plan credits don't roll over)
--   * upgrade           : plan part is topped up to the new allowance, top-ups untouched
-- Existing rows get topup_credits = 0: no top-up purchase has ever been recorded.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS topup_credits integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_topup_credits_nonneg;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_topup_credits_nonneg CHECK (topup_credits >= 0);

-- Spending: plan credits are used first, then top-up credits.
CREATE OR REPLACE FUNCTION public.spend_credits(cost integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  remaining integer;
begin
  if cost is null or cost <= 0 then
    raise exception 'Cost must be a positive integer';
  end if;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
     set credits = credits - cost,
         topup_credits = least(coalesce(topup_credits, 0), credits - cost)
   where id = auth.uid()
     and credits >= cost
  returning credits into remaining;

  if remaining is null then
    raise exception 'Insufficient credits';
  end if;

  return remaining;
end;
$function$;

CREATE OR REPLACE FUNCTION public.spend_credits_for_user(p_user_id uuid, p_cost integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  remaining integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Forbidden';
  end if;
  if p_user_id is null then
    raise exception 'User id is required';
  end if;
  if p_cost is null or p_cost <= 0 then
    raise exception 'Cost must be a positive integer';
  end if;

  update public.profiles
     set credits = credits - p_cost,
         topup_credits = least(coalesce(topup_credits, 0), credits - p_cost)
   where id = p_user_id
     and credits >= p_cost
  returning credits into remaining;

  if remaining is null then
    raise exception 'Insufficient credits';
  end if;

  return remaining;
end;
$function$;

-- Webhook helpers: one atomic statement each (no read-modify-write races with spending).
-- Callable by service_role only.

-- Top-up pack purchased.
CREATE OR REPLACE FUNCTION public.grant_topup_credits(p_user_id uuid, p_amount integer, p_customer text DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_credits integer;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'Invalid top-up grant';
  end if;
  update public.profiles
     set credits = coalesce(credits, 0) + p_amount,
         topup_credits = coalesce(topup_credits, 0) + p_amount,
         stripe_customer_id = coalesce(p_customer, stripe_customer_id)
   where id = p_user_id
  returning credits into new_credits;
  return new_credits;
end;
$function$;

-- Plan purchase or renewal (checkout.session.completed, invoice.paid):
-- credits = new monthly allowance + top-up credits. Leftover plan credits do not roll over.
CREATE OR REPLACE FUNCTION public.grant_plan_credits(
  p_user_id uuid, p_plan text, p_allowance integer,
  p_customer text DEFAULT NULL, p_subscription text DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_credits integer;
begin
  if p_user_id is null or p_plan is null or p_allowance is null or p_allowance < 0 then
    raise exception 'Invalid plan grant';
  end if;
  update public.profiles
     set plan = p_plan,
         credits = p_allowance + coalesce(topup_credits, 0),
         subscription_status = 'active',
         cancel_at_period_end = false,
         stripe_customer_id = coalesce(p_customer, stripe_customer_id),
         stripe_subscription_id = coalesce(p_subscription, stripe_subscription_id)
   where id = p_user_id
  returning credits into new_credits;
  return new_credits;
end;
$function$;

-- Mid-cycle upgrade: top the plan part of the wallet up to the new allowance. Top-ups untouched.
-- Idempotent (safe if the webhook retries).
CREATE OR REPLACE FUNCTION public.upgrade_plan_credits(p_user_id uuid, p_allowance integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_credits integer;
begin
  if p_user_id is null or p_allowance is null or p_allowance < 0 then
    raise exception 'Invalid upgrade grant';
  end if;
  update public.profiles
     set credits = greatest(coalesce(credits, 0) - least(coalesce(topup_credits, 0), coalesce(credits, 0)), p_allowance)
                   + least(coalesce(topup_credits, 0), coalesce(credits, 0))
   where id = p_user_id
  returning credits into new_credits;
  return new_credits;
end;
$function$;

REVOKE ALL ON FUNCTION public.grant_topup_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_plan_credits(uuid, text, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upgrade_plan_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_topup_credits(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_plan_credits(uuid, text, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.upgrade_plan_credits(uuid, integer) TO service_role;

-- Pay-first-sign-up-later grants: same rules.
CREATE OR REPLACE FUNCTION private.claim_stripe_grants(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_email text;
  g record;
  n integer := 0;
BEGIN
  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = p_user AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user) THEN
    RETURN 0;
  END IF;

  FOR g IN
    SELECT * FROM public.stripe_pending_grants pg
    WHERE lower(pg.email) = lower(v_email)
      AND pg.claimed_at IS NULL AND pg.voided_at IS NULL
    ORDER BY pg.created_at
    FOR UPDATE
  LOOP
    IF g.kind = 'topup' THEN
      UPDATE public.profiles p
         SET credits = coalesce(p.credits, 0) + g.credits,
             topup_credits = coalesce(p.topup_credits, 0) + g.credits,
             stripe_customer_id = coalesce(p.stripe_customer_id, g.stripe_customer_id)
       WHERE p.id = p_user;
    ELSE
      UPDATE public.profiles p
         SET plan = coalesce(g.plan, p.plan),
             credits = greatest(coalesce(p.credits, 0) - least(coalesce(p.topup_credits, 0), coalesce(p.credits, 0)), g.credits)
                       + least(coalesce(p.topup_credits, 0), coalesce(p.credits, 0)),
             stripe_customer_id = coalesce(g.stripe_customer_id, p.stripe_customer_id),
             stripe_subscription_id = coalesce(g.stripe_subscription_id, p.stripe_subscription_id),
             subscription_status = coalesce(g.subscription_status, 'active'),
             cancel_at_period_end = false
       WHERE p.id = p_user;
    END IF;
    UPDATE public.stripe_pending_grants
       SET claimed_by = p_user, claimed_at = now()
     WHERE id = g.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

-- Clients may never edit the split.
CREATE OR REPLACE FUNCTION public.protect_profile_billing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role'
     OR current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  NEW.plan := OLD.plan;
  NEW.credits := OLD.credits;
  NEW.topup_credits := OLD.topup_credits;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  NEW.subscription_status := OLD.subscription_status;
  NEW.current_period_end := OLD.current_period_end;
  NEW.cancel_at_period_end := OLD.cancel_at_period_end;
  NEW.subscription_event_at := OLD.subscription_event_at;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_tamper()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if current_user in ('authenticated', 'anon') then
    if new.credits is distinct from old.credits then
      raise exception 'Credits cannot be updated directly';
    end if;
    if new.topup_credits is distinct from old.topup_credits then
      raise exception 'Credits cannot be updated directly';
    end if;
    if new.plan is distinct from old.plan then
      raise exception 'Plan cannot be updated directly';
    end if;
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$function$;
