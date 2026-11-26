-- MarketScope vision modules: research snapshots, terminal alerts, competitor &
-- supplier intelligence, product portfolio, backtest runs, Exchange SIMULATION.
-- Every row is per-user (RLS). Snapshots are written ONLY by a trigger on real
-- (non-example, complete) reports produced by the analyze edge function.
-- Exchange uses virtual credits only: no deposits, no payments, no cash-out.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function private.ms_jnum(j jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric else null end
$$;
create or replace function private.ms_product_key(p text)
returns text language sql immutable set search_path = '' as $$
  select left(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), 200)
$$;
revoke all on function private.ms_jnum(jsonb) from public, anon;
revoke all on function private.ms_product_key(text) from public, anon;
grant execute on function private.ms_product_key(text) to authenticated;

create or replace function private.ms_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
revoke all on function private.ms_touch_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------- product_snapshots
create table if not exists public.product_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  report_id uuid unique references public.reports (id) on delete set null,
  product text not null,
  product_key text not null,
  market text not null,
  category text check (category is null or char_length(category) <= 60),
  opportunity smallint, demand smallint, competition smallint, saturation smallint,
  verdict text,
  confidence text,
  price_median numeric, price_min numeric, price_max numeric, currency text,
  search_volume bigint, trend_slope numeric, cpc numeric,
  listing_count integer, seller_count integer,
  monthly_searches jsonb,
  sources jsonb,
  captured_at timestamptz not null default now()
);
comment on table public.product_snapshots is 'One row per real live research report (written by trigger on public.reports). Never sample data.';
create index if not exists product_snapshots_user_key_idx on public.product_snapshots (user_id, product_key, market, captured_at desc);
alter table public.product_snapshots enable row level security;
drop policy if exists product_snapshots_select_own on public.product_snapshots;
create policy product_snapshots_select_own on public.product_snapshots for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists product_snapshots_update_own on public.product_snapshots;
create policy product_snapshots_update_own on public.product_snapshots for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists product_snapshots_delete_own on public.product_snapshots;
create policy product_snapshots_delete_own on public.product_snapshots for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.product_snapshots from anon, authenticated;
grant select, delete on table public.product_snapshots to authenticated;
grant update (category) on table public.product_snapshots to authenticated;

-- ---------------------------------------------------------------- alerts
create table if not exists public.market_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_key text not null check (char_length(product_key) between 1 and 200),
  product text,
  market text not null,
  metric text not null check (metric in ('opportunity','demand','competition','saturation','price_median','search_volume')),
  op text not null check (op in ('above','below')),
  threshold numeric not null,
  active boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists market_alerts_user_idx on public.market_alerts (user_id, product_key, market);
alter table public.market_alerts enable row level security;
drop policy if exists market_alerts_all_own on public.market_alerts;
create policy market_alerts_all_own on public.market_alerts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on table public.market_alerts from anon;
grant select, insert, update, delete on table public.market_alerts to authenticated;

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  alert_id uuid references public.market_alerts (id) on delete set null,
  kind text not null check (kind in ('market','competitor','exchange')),
  product_key text,
  market text,
  message text not null,
  value numeric,
  snapshot_id uuid references public.product_snapshots (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists alert_events_user_idx on public.alert_events (user_id, created_at desc);
alter table public.alert_events enable row level security;
drop policy if exists alert_events_select_own on public.alert_events;
create policy alert_events_select_own on public.alert_events for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists alert_events_update_own on public.alert_events;
create policy alert_events_update_own on public.alert_events for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists alert_events_delete_own on public.alert_events;
create policy alert_events_delete_own on public.alert_events for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.alert_events from anon, authenticated;
grant select, delete on table public.alert_events to authenticated;
grant update (read_at) on table public.alert_events to authenticated;

-- ---------------------------------------------------------------- competitors
create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  url text check (url is null or char_length(url) <= 500),
  platform text check (platform is null or char_length(platform) <= 40),
  category text check (category is null or char_length(category) <= 60),
  notes text check (notes is null or char_length(notes) <= 4000),
  price_alert_below numeric check (price_alert_below is null or price_alert_below >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists competitors_user_idx on public.competitors (user_id, created_at desc);
alter table public.competitors enable row level security;
drop policy if exists competitors_all_own on public.competitors;
create policy competitors_all_own on public.competitors for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on table public.competitors from anon;
grant select, insert, update, delete on table public.competitors to authenticated;
drop trigger if exists competitors_touch on public.competitors;
create trigger competitors_touch before update on public.competitors for each row execute function private.ms_touch_updated_at();

create table if not exists public.competitor_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  kind text not null default 'price' check (kind in ('price','new_product','promotion','ad','note')),
  product text check (product is null or char_length(product) <= 200),
  price numeric check (price is null or price >= 0),
  currency text check (currency is null or char_length(currency) <= 8),
  observed_on date not null default current_date,
  note text check (note is null or char_length(note) <= 2000),
  source_url text check (source_url is null or char_length(source_url) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists competitor_obs_idx on public.competitor_observations (user_id, competitor_id, observed_on desc);
alter table public.competitor_observations enable row level security;
drop policy if exists competitor_obs_select_own on public.competitor_observations;
create policy competitor_obs_select_own on public.competitor_observations for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists competitor_obs_insert_own on public.competitor_observations;
create policy competitor_obs_insert_own on public.competitor_observations for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (select 1 from public.competitors c where c.id = competitor_id and c.user_id = (select auth.uid())));
drop policy if exists competitor_obs_update_own on public.competitor_observations;
create policy competitor_obs_update_own on public.competitor_observations for update to authenticated using ((select auth.uid()) = user_id) with check (
  (select auth.uid()) = user_id and exists (select 1 from public.competitors c where c.id = competitor_id and c.user_id = (select auth.uid())));
drop policy if exists competitor_obs_delete_own on public.competitor_observations;
create policy competitor_obs_delete_own on public.competitor_observations for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.competitor_observations from anon;
grant select, insert, update, delete on table public.competitor_observations to authenticated;

create or replace function private.ms_competitor_alert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if new.kind <> 'price' or new.price is null then return null; end if;
  select id, name, price_alert_below into c from public.competitors where id = new.competitor_id and user_id = new.user_id;
  if c.id is not null and c.price_alert_below is not null and new.price < c.price_alert_below then
    insert into public.alert_events (user_id, kind, product_key, message, value)
    values (new.user_id, 'competitor', private.ms_product_key(new.product),
      left(c.name || ': ' || coalesce(new.product, 'price') || ' logged at ' || new.price::text || coalesce(' ' || new.currency, '') ||
           ' (below your alert of ' || c.price_alert_below::text || ')', 400), new.price);
  end if;
  return null;
end; $$;
revoke all on function private.ms_competitor_alert() from public, anon, authenticated;
drop trigger if exists competitor_obs_alert on public.competitor_observations;
create trigger competitor_obs_alert after insert on public.competitor_observations for each row execute function private.ms_competitor_alert();

-- ---------------------------------------------------------------- suppliers
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  url text check (url is null or char_length(url) <= 500),
  platform text check (platform is null or char_length(platform) <= 40),
  product text check (product is null or char_length(product) <= 200),
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  shipping_cost numeric check (shipping_cost is null or shipping_cost >= 0),
  currency text not null default 'USD' check (char_length(currency) <= 8),
  shipping_days_min integer check (shipping_days_min is null or shipping_days_min between 0 and 365),
  shipping_days_max integer check (shipping_days_max is null or shipping_days_max between 0 and 365),
  moq integer check (moq is null or moq >= 0),
  quality smallint check (quality is null or quality between 1 and 5),
  reliability smallint check (reliability is null or reliability between 1 and 5),
  target_sell_price numeric check (target_sell_price is null or target_sell_price >= 0),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suppliers_user_idx on public.suppliers (user_id, created_at desc);
alter table public.suppliers enable row level security;
drop policy if exists suppliers_all_own on public.suppliers;
create policy suppliers_all_own on public.suppliers for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on table public.suppliers from anon;
grant select, insert, update, delete on table public.suppliers to authenticated;
drop trigger if exists suppliers_touch on public.suppliers;
create trigger suppliers_touch before update on public.suppliers for each row execute function private.ms_touch_updated_at();

-- ---------------------------------------------------------------- product portfolio
create table if not exists public.product_portfolio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product text not null check (char_length(product) between 1 and 200),
  product_key text not null,
  market text not null default 'United States',
  status text not null default 'idea' check (status in ('idea','testing','active','paused','dropped')),
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  shipping_cost numeric check (shipping_cost is null or shipping_cost >= 0),
  sell_price numeric check (sell_price is null or sell_price >= 0),
  fees_pct numeric check (fees_pct is null or (fees_pct >= 0 and fees_pct <= 100)),
  ad_cost_per_unit numeric check (ad_cost_per_unit is null or ad_cost_per_unit >= 0),
  monthly_units integer check (monthly_units is null or monthly_units >= 0),
  currency text not null default 'USD' check (char_length(currency) <= 8),
  supplier_id uuid references public.suppliers (id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_portfolio_user_idx on public.product_portfolio (user_id, created_at desc);
alter table public.product_portfolio enable row level security;
drop policy if exists product_portfolio_all_own on public.product_portfolio;
create policy product_portfolio_all_own on public.product_portfolio for all to authenticated using ((select auth.uid()) = user_id) with check (
  (select auth.uid()) = user_id and (supplier_id is null or exists (select 1 from public.suppliers s where s.id = supplier_id and s.user_id = (select auth.uid()))));
revoke all on table public.product_portfolio from anon;
grant select, insert, update, delete on table public.product_portfolio to authenticated;
drop trigger if exists product_portfolio_touch on public.product_portfolio;
create trigger product_portfolio_touch before update on public.product_portfolio for each row execute function private.ms_touch_updated_at();

-- ---------------------------------------------------------------- backtest runs
create table if not exists public.backtest_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  params jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists backtest_runs_user_idx on public.backtest_runs (user_id, created_at desc);
alter table public.backtest_runs enable row level security;
drop policy if exists backtest_runs_select_own on public.backtest_runs;
create policy backtest_runs_select_own on public.backtest_runs for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists backtest_runs_insert_own on public.backtest_runs;
create policy backtest_runs_insert_own on public.backtest_runs for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists backtest_runs_delete_own on public.backtest_runs;
create policy backtest_runs_delete_own on public.backtest_runs for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.backtest_runs from anon, authenticated;
grant select, insert, delete on table public.backtest_runs to authenticated;

-- ---------------------------------------------------------------- Exchange SIMULATION (virtual credits only)
create table if not exists public.exchange_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance numeric not null default 100000 check (balance >= 0),
  resets integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.exchange_accounts is 'MarketScope Exchange SIMULATION. balance is virtual credits (VC) with no monetary value. No deposits, payments or cash-out exist.';
create table if not exists public.exchange_positions (
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  qty numeric not null default 0 check (qty >= 0),
  avg_cost numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
create table if not exists public.exchange_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  product text,
  side text not null check (side in ('buy','sell')),
  order_type text not null check (order_type in ('market','limit')),
  qty numeric not null check (qty > 0),
  limit_price numeric check (limit_price is null or limit_price > 0),
  reserved numeric not null default 0,
  status text not null default 'open' check (status in ('open','filled','cancelled')),
  fill_price numeric,
  fee numeric,
  filled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists exchange_orders_user_idx on public.exchange_orders (user_id, created_at desc);
create index if not exists exchange_orders_open_idx on public.exchange_orders (user_id, symbol) where status = 'open';
alter table public.exchange_accounts enable row level security;
alter table public.exchange_positions enable row level security;
alter table public.exchange_orders enable row level security;
drop policy if exists exchange_accounts_select_own on public.exchange_accounts;
create policy exchange_accounts_select_own on public.exchange_accounts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists exchange_positions_select_own on public.exchange_positions;
create policy exchange_positions_select_own on public.exchange_positions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists exchange_orders_select_own on public.exchange_orders;
create policy exchange_orders_select_own on public.exchange_orders for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.exchange_accounts, public.exchange_positions, public.exchange_orders from anon, authenticated;
grant select on table public.exchange_accounts, public.exchange_positions, public.exchange_orders to authenticated;

-- Symbol = product_key || '|' || market. Last price = Opportunity score (0-100) of the
-- newest real snapshot for that symbol owned by the same user.
create or replace function private.ms_x_last_price(p_user uuid, p_symbol text)
returns numeric language sql stable security definer set search_path = '' as $$
  select s.opportunity::numeric from public.product_snapshots s
  where s.user_id = p_user and s.product_key || '|' || s.market = p_symbol and s.opportunity is not null
  order by s.captured_at desc limit 1
$$;
revoke all on function private.ms_x_last_price(uuid, text) from public, anon, authenticated;

create or replace function private.ms_x_fill(p_order_id uuid, p_price numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.exchange_orders; v_notional numeric; v_fee numeric;
begin
  select * into o from public.exchange_orders where id = p_order_id and status = 'open' for update;
  if o.id is null then return; end if;
  v_notional := round(o.qty * p_price, 4);
  v_fee := round(v_notional * 0.001, 4); -- simulated 0.1% fee
  if o.side = 'buy' then
    if o.order_type = 'market' then
      update public.exchange_accounts set balance = balance - v_notional - v_fee, updated_at = now() where user_id = o.user_id and balance >= v_notional + v_fee;
      if not found then raise exception 'Not enough virtual credits'; end if;
    else
      -- reserved = qty*limit*1.001 was taken at placement; refund the difference
      update public.exchange_accounts set balance = balance + o.reserved - v_notional - v_fee, updated_at = now() where user_id = o.user_id;
    end if;
    insert into public.exchange_positions (user_id, symbol, qty, avg_cost) values (o.user_id, o.symbol, o.qty, p_price)
    on conflict (user_id, symbol) do update set
      avg_cost = case when public.exchange_positions.qty + excluded.qty > 0
        then (public.exchange_positions.qty * public.exchange_positions.avg_cost + excluded.qty * excluded.avg_cost) / (public.exchange_positions.qty + excluded.qty) else 0 end,
      qty = public.exchange_positions.qty + excluded.qty, updated_at = now();
  else
    if o.order_type = 'market' then
      update public.exchange_positions set qty = qty - o.qty, updated_at = now() where user_id = o.user_id and symbol = o.symbol and qty >= o.qty;
      if not found then raise exception 'Not enough units to sell'; end if;
    end if; -- limit sells reserved units at placement
    update public.exchange_accounts set balance = balance + v_notional - v_fee, updated_at = now() where user_id = o.user_id;
  end if;
  update public.exchange_orders set status = 'filled', fill_price = p_price, fee = v_fee, filled_at = now(), reserved = 0 where id = o.id;
end; $$;
revoke all on function private.ms_x_fill(uuid, numeric) from public, anon, authenticated;

create or replace function private.ms_x_place_order(p_symbol text, p_side text, p_type text, p_qty numeric, p_limit numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_last numeric; v_oid uuid; reserve numeric := 0; prod text; 
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if p_side not in ('buy','sell') or p_type not in ('market','limit') then raise exception 'Invalid order'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 1000000 then raise exception 'Quantity must be between 0 and 1,000,000'; end if;
  if p_type = 'limit' and (p_limit is null or p_limit <= 0 or p_limit > 1000) then raise exception 'Limit price must be between 0 and 1000'; end if;
  insert into public.exchange_accounts (user_id) values (uid) on conflict (user_id) do nothing;
  v_last := private.ms_x_last_price(uid, p_symbol);
  if v_last is null then raise exception 'No real snapshot with a score exists for this symbol yet. Run a live report first.'; end if;
  select product into prod from public.product_snapshots where user_id = uid and product_key || '|' || market = p_symbol order by captured_at desc limit 1;
  if p_side = 'buy' and p_type = 'limit' then
    reserve := round(p_qty * p_limit * 1.001, 4);
    update public.exchange_accounts set balance = balance - reserve, updated_at = now() where user_id = uid and balance >= reserve;
    if not found then raise exception 'Not enough virtual credits'; end if;
  elsif p_side = 'sell' and p_type = 'limit' then
    update public.exchange_positions set qty = qty - p_qty, updated_at = now() where user_id = uid and symbol = p_symbol and qty >= p_qty;
    if not found then raise exception 'Not enough units to sell'; end if;
    reserve := p_qty;
  end if;
  insert into public.exchange_orders (user_id, symbol, product, side, order_type, qty, limit_price, reserved)
  values (uid, p_symbol, prod, p_side, p_type, p_qty, case when p_type = 'limit' then p_limit end, reserve) returning id into v_oid;
  if p_type = 'market' or (p_side = 'buy' and v_last <= p_limit) or (p_side = 'sell' and v_last >= p_limit) then
    perform private.ms_x_fill(v_oid, v_last);
  end if;
  return (select jsonb_build_object('id', id, 'status', status, 'fill_price', fill_price, 'last', v_last) from public.exchange_orders where id = v_oid);
end; $$;

create or replace function private.ms_x_cancel_order(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); o public.exchange_orders;
begin
  select * into o from public.exchange_orders where id = p_id and user_id = uid and status = 'open' for update;
  if o.id is null then raise exception 'Open order not found'; end if;
  if o.side = 'buy' then
    update public.exchange_accounts set balance = balance + o.reserved, updated_at = now() where user_id = uid;
  else
    update public.exchange_positions set qty = qty + o.reserved, updated_at = now() where user_id = uid and symbol = o.symbol;
  end if;
  update public.exchange_orders set status = 'cancelled', reserved = 0 where id = o.id;
  return jsonb_build_object('id', o.id, 'status', 'cancelled');
end; $$;

create or replace function private.ms_x_reset()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required'; end if;
  delete from public.exchange_orders where user_id = uid;
  delete from public.exchange_positions where user_id = uid;
  insert into public.exchange_accounts (user_id) values (uid)
  on conflict (user_id) do update set balance = 100000, resets = public.exchange_accounts.resets + 1, updated_at = now();
  return jsonb_build_object('balance', 100000);
end; $$;

create or replace function private.ms_x_open_account()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required'; end if;
  insert into public.exchange_accounts (user_id) values (uid) on conflict (user_id) do nothing;
  return (select jsonb_build_object('balance', balance) from public.exchange_accounts where user_id = uid);
end; $$;

revoke all on function private.ms_x_place_order(text, text, text, numeric, numeric) from public, anon;
revoke all on function private.ms_x_cancel_order(uuid) from public, anon;
revoke all on function private.ms_x_reset() from public, anon;
revoke all on function private.ms_x_open_account() from public, anon;
grant execute on function private.ms_x_place_order(text, text, text, numeric, numeric) to authenticated;
grant execute on function private.ms_x_cancel_order(uuid) to authenticated;
grant execute on function private.ms_x_reset() to authenticated;
grant execute on function private.ms_x_open_account() to authenticated;

create or replace function public.exchange_place_order(p_symbol text, p_side text, p_type text, p_qty numeric, p_limit numeric default null)
returns jsonb language sql security invoker set search_path = '' as $$ select private.ms_x_place_order(p_symbol, p_side, p_type, p_qty, p_limit) $$;
create or replace function public.exchange_cancel_order(p_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select private.ms_x_cancel_order(p_id) $$;
create or replace function public.exchange_reset()
returns jsonb language sql security invoker set search_path = '' as $$ select private.ms_x_reset() $$;
create or replace function public.exchange_open_account()
returns jsonb language sql security invoker set search_path = '' as $$ select private.ms_x_open_account() $$;
revoke all on function public.exchange_place_order(text, text, text, numeric, numeric) from public, anon;
revoke all on function public.exchange_cancel_order(uuid) from public, anon;
revoke all on function public.exchange_reset() from public, anon;
revoke all on function public.exchange_open_account() from public, anon;
grant execute on function public.exchange_place_order(text, text, text, numeric, numeric) to authenticated;
grant execute on function public.exchange_cancel_order(uuid) to authenticated;
grant execute on function public.exchange_reset() to authenticated;
grant execute on function public.exchange_open_account() to authenticated;

-- ---------------------------------------------------------------- snapshot pipeline
create or replace function private.ms_on_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a record; v numeric; hit boolean; o record; sym text := new.product_key || '|' || new.market;
begin
  for a in select * from public.market_alerts where user_id = new.user_id and active and product_key = new.product_key and market = new.market loop
    v := case a.metric when 'opportunity' then new.opportunity when 'demand' then new.demand when 'competition' then new.competition
      when 'saturation' then new.saturation when 'price_median' then new.price_median when 'search_volume' then new.search_volume end;
    if v is null then continue; end if;
    hit := (a.op = 'above' and v > a.threshold) or (a.op = 'below' and v < a.threshold);
    if hit then
      insert into public.alert_events (user_id, alert_id, kind, product_key, market, message, value, snapshot_id)
      values (new.user_id, a.id, 'market', new.product_key, new.market,
        left(new.product || ' (' || new.market || '): ' || replace(a.metric, '_', ' ') || ' is ' || v::text || ', ' || a.op || ' your alert of ' || a.threshold::text, 400), v, new.id);
      update public.market_alerts set last_triggered_at = now() where id = a.id;
    end if;
  end loop;
  if new.opportunity is not null then
    for o in select id, side, limit_price from public.exchange_orders where user_id = new.user_id and symbol = sym and status = 'open' and order_type = 'limit' loop
      if (o.side = 'buy' and new.opportunity <= o.limit_price) or (o.side = 'sell' and new.opportunity >= o.limit_price) then
        perform private.ms_x_fill(o.id, new.opportunity::numeric);
        insert into public.alert_events (user_id, kind, product_key, market, message, value, snapshot_id)
        values (new.user_id, 'exchange', new.product_key, new.market, left('Simulated ' || o.side || ' order filled for ' || new.product || ' at ' || new.opportunity::text || ' (virtual credits)', 400), new.opportunity, new.id);
      end if;
    end loop;
  end if;
  return null;
end; $$;
revoke all on function private.ms_on_snapshot() from public, anon, authenticated;
drop trigger if exists product_snapshots_after_insert on public.product_snapshots;
create trigger product_snapshots_after_insert after insert on public.product_snapshots for each row execute function private.ms_on_snapshot();

create or replace function private.ms_snapshot_from_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r jsonb := coalesce(new.result, new.content); sc jsonb := coalesce(new.scores, r -> 'scores');
begin
  if coalesce(new.is_example, false) or coalesce(new.status, 'complete') <> 'complete' or r is null or sc is null
     or coalesce((r ->> 'sample')::boolean, false) or coalesce((r ->> 'is_example')::boolean, false) then
    return null;
  end if;
  insert into public.product_snapshots (user_id, report_id, product, product_key, market, opportunity, demand, competition, saturation,
    verdict, confidence, price_median, price_min, price_max, currency, search_volume, trend_slope, cpc, listing_count, seller_count,
    monthly_searches, sources, captured_at)
  values (new.user_id, new.id, new.product, private.ms_product_key(new.product), new.market,
    round(private.ms_jnum(sc -> 'opportunity')), round(private.ms_jnum(sc -> 'demand')), round(private.ms_jnum(sc -> 'competition')), round(private.ms_jnum(sc -> 'saturation')),
    coalesce(new.verdict, r ->> 'verdict'), r ->> 'confidence',
    private.ms_jnum(r #> '{prices,median}'), private.ms_jnum(r #> '{prices,min}'), private.ms_jnum(r #> '{prices,max}'), r #>> '{prices,currency}',
    round(private.ms_jnum(r #> '{demand_detail,search_volume}')), private.ms_jnum(r #> '{demand_detail,trend_slope}'), private.ms_jnum(r #> '{demand_detail,cpc}'),
    round(private.ms_jnum(r #> '{prices,listing_count}')), round(private.ms_jnum(r #> '{prices,seller_count}')),
    case when jsonb_typeof(r #> '{demand_detail,monthly_searches}') = 'array' then r #> '{demand_detail,monthly_searches}' end,
    r -> 'sources', coalesce(new.created_at, now()))
  on conflict (report_id) do nothing;
  return null;
exception when others then
  -- Never block a paid report from saving because of the snapshot pipeline.
  raise warning 'product snapshot skipped: %', sqlerrm;
  return null;
end; $$;
revoke all on function private.ms_snapshot_from_report() from public, anon, authenticated;
drop trigger if exists reports_to_snapshot on public.reports;
create trigger reports_to_snapshot after insert on public.reports for each row execute function private.ms_snapshot_from_report();

-- Backfill from any existing real reports (example/sample reports are skipped).
insert into public.product_snapshots (user_id, report_id, product, product_key, market, opportunity, demand, competition, saturation,
  verdict, confidence, price_median, price_min, price_max, currency, search_volume, trend_slope, cpc, listing_count, seller_count,
  monthly_searches, sources, captured_at)
select r.user_id, r.id, r.product, private.ms_product_key(r.product), r.market,
  round(private.ms_jnum(coalesce(r.scores, x -> 'scores') -> 'opportunity')), round(private.ms_jnum(coalesce(r.scores, x -> 'scores') -> 'demand')),
  round(private.ms_jnum(coalesce(r.scores, x -> 'scores') -> 'competition')), round(private.ms_jnum(coalesce(r.scores, x -> 'scores') -> 'saturation')),
  coalesce(r.verdict, x ->> 'verdict'), x ->> 'confidence',
  private.ms_jnum(x #> '{prices,median}'), private.ms_jnum(x #> '{prices,min}'), private.ms_jnum(x #> '{prices,max}'), x #>> '{prices,currency}',
  round(private.ms_jnum(x #> '{demand_detail,search_volume}')), private.ms_jnum(x #> '{demand_detail,trend_slope}'), private.ms_jnum(x #> '{demand_detail,cpc}'),
  round(private.ms_jnum(x #> '{prices,listing_count}')), round(private.ms_jnum(x #> '{prices,seller_count}')),
  case when jsonb_typeof(x #> '{demand_detail,monthly_searches}') = 'array' then x #> '{demand_detail,monthly_searches}' end,
  x -> 'sources', r.created_at
from public.reports r cross join lateral (select coalesce(r.result, r.content) as x) j
where not coalesce(r.is_example, false) and coalesce(r.status, 'complete') = 'complete' and x is not null
  and coalesce(r.scores, x -> 'scores') is not null
  and not coalesce((x ->> 'sample')::boolean, false) and not coalesce((x ->> 'is_example')::boolean, false)
on conflict (report_id) do nothing;
