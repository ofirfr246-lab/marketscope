-- Watchlist for products the user researched live (separate from the Nov-12 snapshot desk watchlist).
create table if not exists public.research_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product text not null check (char_length(product) between 1 and 200),
  product_key text not null check (char_length(product_key) between 1 and 200),
  market text not null default 'United States' check (char_length(market) <= 60),
  note text check (note is null or char_length(note) <= 1000),
  added_by text not null default 'user' check (added_by in ('user','josy')),
  created_at timestamptz not null default now(),
  unique (user_id, product_key, market)
);
alter table public.research_watchlist enable row level security;
drop policy if exists research_watchlist_all_own on public.research_watchlist;
create policy research_watchlist_all_own on public.research_watchlist for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on table public.research_watchlist from anon;
grant select, insert, update, delete on table public.research_watchlist to authenticated;
