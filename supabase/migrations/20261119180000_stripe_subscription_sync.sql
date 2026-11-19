-- MarketScope: Stripe subscription sync + "pay first, sign up later" grants.
-- Applied remotely as migration stripe_subscription_sync.

-- 1) Subscription state on profiles (written only by the webhook / definer code)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_event_at timestamptz;

-- 2) Payments that could not be matched to an account yet (e.g. paid with an
--    email that has no MarketScope account). Claimed automatically when an
--    account with that confirmed email exists.
CREATE TABLE IF NOT EXISTS public.stripe_pending_grants (
  id text PRIMARY KEY,                 -- checkout session id
  email text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('subscription', 'topup')),
  plan text,
  credits integer NOT NULL DEFAULT 0,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  claimed_at timestamptz,
  voided_at timestamptz
);
CREATE INDEX IF NOT EXISTS stripe_pending_grants_open_email_idx
  ON public.stripe_pending_grants (lower(email))
  WHERE claimed_at IS NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS stripe_pending_grants_sub_idx
  ON public.stripe_pending_grants (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stripe_pending_grants_claimed_by_idx
  ON public.stripe_pending_grants (claimed_by);

ALTER TABLE public.stripe_pending_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_pending_grants FROM anon, authenticated;
GRANT ALL ON TABLE public.stripe_pending_grants TO service_role;
-- No policies: only service_role (webhook) and definer code can touch it.

-- 3) Billing columns stay read-only for clients. Runs as invoker so
--    trusted definer code (current_user = postgres) and service_role can write.
CREATE OR REPLACE FUNCTION public.protect_profile_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role'
     OR current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  NEW.plan := OLD.plan;
  NEW.credits := OLD.credits;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  NEW.subscription_status := OLD.subscription_status;
  NEW.current_period_end := OLD.current_period_end;
  NEW.cancel_at_period_end := OLD.cancel_at_period_end;
  NEW.subscription_event_at := OLD.subscription_event_at;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_profile_billing() FROM PUBLIC, anon, authenticated;

-- 4) Private schema for privileged helpers (not exposed through the Data API)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.claim_stripe_grants(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
             stripe_customer_id = coalesce(p.stripe_customer_id, g.stripe_customer_id)
       WHERE p.id = p_user;
    ELSE
      UPDATE public.profiles p
         SET plan = coalesce(g.plan, p.plan),
             credits = greatest(coalesce(p.credits, 0), g.credits),
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
$$;
REVOKE ALL ON FUNCTION private.claim_stripe_grants(uuid) FROM PUBLIC, anon, authenticated;

-- Claim when a profile is created (OAuth users are confirmed at signup)
CREATE OR REPLACE FUNCTION private.trg_profile_claim_grants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM private.claim_stripe_grants(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'claim_stripe_grants failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.trg_profile_claim_grants() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profile_claim_stripe_grants ON public.profiles;
CREATE TRIGGER trg_profile_claim_stripe_grants
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_profile_claim_grants();

-- Claim when an email gets confirmed later (email/password signups)
CREATE OR REPLACE FUNCTION private.trg_user_confirmed_claim_grants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (OLD.email_confirmed_at IS NULL OR NEW.email IS DISTINCT FROM OLD.email) THEN
    BEGIN
      PERFORM private.claim_stripe_grants(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'claim_stripe_grants failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.trg_user_confirmed_claim_grants() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_confirmed_claim_grants ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_claim_grants
  AFTER UPDATE OF email_confirmed_at, email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_user_confirmed_claim_grants();
