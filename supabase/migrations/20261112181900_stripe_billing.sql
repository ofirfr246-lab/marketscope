-- Stripe billing (applied remotely as migration stripe_billing)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_uidx
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  livemode boolean,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);

CREATE TABLE IF NOT EXISTS public.stripe_fulfillments (
  id text PRIMARY KEY,
  kind text NOT NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_fulfillments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.stripe_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.stripe_fulfillments FROM anon, authenticated;
GRANT ALL ON TABLE public.stripe_events TO service_role;
GRANT ALL ON TABLE public.stripe_fulfillments TO service_role;

CREATE OR REPLACE FUNCTION public.protect_profile_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.plan := OLD.plan;
  NEW.credits := OLD.credits;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_billing ON public.profiles;
CREATE TRIGGER trg_protect_profile_billing
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_billing();

REVOKE ALL ON FUNCTION public.protect_profile_billing() FROM PUBLIC, anon, authenticated;
