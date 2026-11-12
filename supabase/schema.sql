-- MarketScope schema for Supabase
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query → Run).
-- Safe to re-run: objects are created with IF NOT EXISTS / OR REPLACE where possible.
--
-- After running this:
--   • New sign-ups get a profiles row (plan = 'free', credits = 5) via a trigger.
--   • Users can only read/update their own rows (Row Level Security).
--   • Users cannot change credits or plan directly. Use spend_credits(cost)
--     to deduct, and grant paid credits later from a Paddle webhook
--     (server-side, e.g. supabase/functions/paddle-webhook — not deployed yet).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  plan text not null default 'free',
  credits integer not null default 5,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  constraint profiles_credits_nonneg check (credits >= 0),
  constraint profiles_plan_ok check (plan in ('free', 'starter', 'plus', 'pro'))
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No direct inserts/deletes from the browser. The signup trigger inserts.

-- Block authenticated users from changing credits or plan themselves.
-- SECURITY DEFINER functions (spend_credits, future webhook) run as the
-- function owner, so current_user is not 'authenticated' and the change is allowed.
create or replace function public.prevent_profile_privilege_tamper()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.credits is distinct from old.credits then
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
$$;

drop trigger if exists trg_prevent_profile_privilege_tamper on public.profiles;
create trigger trg_prevent_profile_privilege_tamper
  before update on public.profiles
  for each row
  execute function public.prevent_profile_privilege_tamper();

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product text not null,
  market text not null,
  cost integer not null default 1,
  source text,
  source_url text,
  verdict text,
  scores jsonb,
  content jsonb,
  created_at timestamptz not null default now(),
  constraint reports_cost_positive check (cost > 0)
);

create index if not exists reports_user_created_idx
  on public.reports (user_id, created_at desc);

-- Columns for Paste & Analyze (safe if the table already existed without them)
alter table public.reports add column if not exists source text;
alter table public.reports add column if not exists source_url text;

-- Live reports (analyze edge function)
alter table public.reports add column if not exists result jsonb;
alter table public.reports add column if not exists is_example boolean not null default false;
alter table public.reports add column if not exists status text not null default 'complete';


alter table public.reports enable row level security;

drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own"
  on public.reports for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Create a profile when a user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, plan, credits)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    'free',
    5
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Keep profiles.email in sync when the auth email changes
create or replace function public.handle_user_email_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  execute function public.handle_user_email_updated();

-- ---------------------------------------------------------------------------
-- spend_credits(cost int)
-- Atomically checks the balance and deducts `cost` credits for the
-- signed-in user. Returns the remaining balance.
-- Raises an exception if the user is not signed in or has too few credits.
-- ---------------------------------------------------------------------------
create or replace function public.spend_credits(cost integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
     set credits = credits - cost
   where id = auth.uid()
     and credits >= cost
  returning credits into remaining;

  if remaining is null then
    raise exception 'Insufficient credits';
  end if;

  return remaining;
end;
$$;

revoke all on function public.spend_credits(integer) from public, anon, authenticated;
grant execute on function public.spend_credits(integer) to service_role;

-- Server-side charge used by supabase/functions/analyze (service_role only).
create or replace function public.spend_credits_for_user(p_user_id uuid, p_cost integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
     set credits = credits - p_cost
   where id = p_user_id
     and credits >= p_cost
  returning credits into remaining;

  if remaining is null then
    raise exception 'Insufficient credits';
  end if;

  return remaining;
end;
$$;

revoke all on function public.spend_credits_for_user(uuid, integer) from public, anon, authenticated;
grant execute on function public.spend_credits_for_user(uuid, integer) to service_role;

-- Grants (Supabase usually has these already; repeated here for a fresh project)
grant usage on schema public to authenticated, anon;
grant select, update on table public.profiles to authenticated;
grant select on table public.reports to authenticated;
-- inserts are performed by the analyze function (service_role).


-- ---------------------------------------------------------------------------
-- watchlist & portfolio (Terminal desk)
-- Persist per user when Auth is configured. The static site falls back
-- to localStorage until keys are set or the user is signed out.
-- ---------------------------------------------------------------------------
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  product text,
  market text,
  alerts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, ticker)
);

alter table public.watchlist enable row level security;

drop policy if exists "watchlist_select_own" on public.watchlist;
create policy "watchlist_select_own" on public.watchlist for select to authenticated using (auth.uid() = user_id);
drop policy if exists "watchlist_insert_own" on public.watchlist;
create policy "watchlist_insert_own" on public.watchlist for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "watchlist_update_own" on public.watchlist;
create policy "watchlist_update_own" on public.watchlist for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "watchlist_delete_own" on public.watchlist;
create policy "watchlist_delete_own" on public.watchlist for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.portfolio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  product text,
  market text,
  allocation numeric,
  units numeric,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, ticker)
);

alter table public.portfolio enable row level security;

drop policy if exists "portfolio_select_own" on public.portfolio;
create policy "portfolio_select_own" on public.portfolio for select to authenticated using (auth.uid() = user_id);
drop policy if exists "portfolio_insert_own" on public.portfolio;
create policy "portfolio_insert_own" on public.portfolio for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "portfolio_update_own" on public.portfolio;
create policy "portfolio_update_own" on public.portfolio for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "portfolio_delete_own" on public.portfolio;
create policy "portfolio_delete_own" on public.portfolio for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on table public.watchlist to authenticated;
grant select, insert, update, delete on table public.portfolio to authenticated;


-- ---------------------------------------------------------------------------
-- tracked_stores (Store Intelligence)
-- Persist competitor storefronts the user chose to follow, plus alert rules.
-- The static site falls back to localStorage until Auth keys are set.
-- ---------------------------------------------------------------------------
create table if not exists public.tracked_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  name text,
  url text,
  platform text,
  alerts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

alter table public.tracked_stores enable row level security;

drop policy if exists "tracked_stores_select_own" on public.tracked_stores;
create policy "tracked_stores_select_own" on public.tracked_stores for select to authenticated using (auth.uid() = user_id);
drop policy if exists "tracked_stores_insert_own" on public.tracked_stores;
create policy "tracked_stores_insert_own" on public.tracked_stores for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "tracked_stores_update_own" on public.tracked_stores;
create policy "tracked_stores_update_own" on public.tracked_stores for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "tracked_stores_delete_own" on public.tracked_stores;
create policy "tracked_stores_delete_own" on public.tracked_stores for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on table public.tracked_stores to authenticated;
