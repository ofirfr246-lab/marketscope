-- MarketScope Exchange (simulation): server-side price alerts.
-- An instrument's "price" is the Opportunity index value of the user's newest product snapshot
-- (public.product_snapshots.opportunity). Snapshots are written server-side (reports -> ms_snapshot_from_report),
-- so alerts are evaluated by a trigger on snapshot insert. No pg_cron is installed or needed.
-- Virtual only: no email or push is sent. The UI shows a toast and a bell badge.

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_key text not null check (char_length(product_key) between 1 and 200),
  market text not null check (char_length(market) between 1 and 20),
  product text check (product is null or char_length(product) <= 200),
  direction text not null check (direction in ('above', 'below')),
  target numeric not null check (target >= 0.01 and target <= 1000),
  note text check (note is null or char_length(note) <= 80),
  triggered_at timestamptz,
  triggered_value numeric,
  seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists price_alerts_user_idx on public.price_alerts (user_id, created_at desc);
create index if not exists price_alerts_armed_idx on public.price_alerts (user_id, product_key, market) where triggered_at is null;

alter table public.price_alerts enable row level security;
drop policy if exists price_alerts_select_own on public.price_alerts;
drop policy if exists price_alerts_insert_own on public.price_alerts;
drop policy if exists price_alerts_update_own on public.price_alerts;
drop policy if exists price_alerts_delete_own on public.price_alerts;
create policy price_alerts_select_own on public.price_alerts for select to authenticated using ((select auth.uid()) = user_id);
create policy price_alerts_insert_own on public.price_alerts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy price_alerts_update_own on public.price_alerts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy price_alerts_delete_own on public.price_alerts for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.price_alerts from anon, authenticated;
grant select, delete on table public.price_alerts to authenticated;
grant insert (product_key, market, product, direction, target, note) on table public.price_alerts to authenticated;
grant update (direction, target, note, triggered_at, triggered_value, seen_at) on table public.price_alerts to authenticated;

-- Per-user limit: at most 20 armed alerts. Triggered alerts are history: only the newest 50 are kept.
create or replace function private.ms_price_alerts_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if new.triggered_at is null then
    select count(*) into n from public.price_alerts
      where user_id = new.user_id and triggered_at is null and id is distinct from new.id;
    if n >= 20 then
      raise exception 'You can have up to 20 active price alerts. Delete one to add another.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.ms_price_alerts_limit() from public, anon, authenticated;
drop trigger if exists price_alerts_limit on public.price_alerts;
create trigger price_alerts_limit before insert or update of triggered_at on public.price_alerts
  for each row execute function private.ms_price_alerts_limit();

-- Evaluate armed alerts whenever a new snapshot (a new index value) is stored.
-- Never blocks the snapshot insert: any error here is logged as a warning only.
create or replace function private.ms_price_alerts_on_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a record; v numeric := new.opportunity;
begin
  if v is null then return null; end if;
  begin
    for a in
      select id, direction, target from public.price_alerts
      where user_id = new.user_id and product_key = new.product_key and market = new.market and triggered_at is null
    loop
      if (a.direction = 'above' and v >= a.target) or (a.direction = 'below' and v <= a.target) then
        update public.price_alerts set triggered_at = now(), triggered_value = v where id = a.id and triggered_at is null;
        insert into public.alert_events (user_id, kind, product_key, market, message, value, snapshot_id)
        values (new.user_id, 'exchange', new.product_key, new.market,
          left('Price alert: ' || new.product || ' (' || new.market || ') index value is ' || v::text || ', ' || a.direction || ' your target of ' || a.target::text || ' (simulation)', 400),
          v, new.id);
      end if;
    end loop;
    delete from public.price_alerts
      where user_id = new.user_id and triggered_at is not null
        and id not in (select id from public.price_alerts where user_id = new.user_id and triggered_at is not null order by triggered_at desc limit 50);
  exception when others then
    raise warning 'ms_price_alerts_on_snapshot: %', sqlerrm;
  end;
  return null;
end; $$;
revoke all on function private.ms_price_alerts_on_snapshot() from public, anon, authenticated;
drop trigger if exists product_snapshots_price_alerts on public.product_snapshots;
create trigger product_snapshots_price_alerts after insert on public.product_snapshots
  for each row execute function private.ms_price_alerts_on_snapshot();
