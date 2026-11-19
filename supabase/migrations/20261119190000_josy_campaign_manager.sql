-- Josy Campaign Manager: manual organic posts and paid campaign drafts.
-- Owner-only RLS. Nothing is published to ad platforms from here (no API access yet).

create table if not exists public.josy_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  platform text not null check (platform in ('meta', 'tiktok', 'google')),
  name text not null check (char_length(name) between 1 and 120),
  objective text not null default 'traffic' check (objective in ('awareness', 'traffic', 'engagement', 'leads', 'app_installs', 'sales')),
  status text not null default 'draft' check (status in ('draft', 'ready', 'paused', 'archived')),
  budget_type text not null default 'daily' check (budget_type in ('daily', 'lifetime')),
  budget_amount numeric(12,2) check (budget_amount is null or (budget_amount >= 0 and budget_amount <= 10000000)),
  currency text not null default 'USD' check (currency in ('USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD')),
  start_date date,
  end_date date,
  bidding text check (char_length(bidding) <= 60),
  bid_amount numeric(12,2) check (bid_amount is null or bid_amount >= 0),
  audience jsonb not null default '{}'::jsonb,
  placements text[] not null default '{}',
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint josy_campaigns_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists josy_campaigns_user_updated_idx on public.josy_campaigns (user_id, updated_at desc);

create table if not exists public.josy_ad_groups (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.josy_campaigns(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position int not null default 0,
  name text not null check (char_length(name) between 1 and 120),
  optimization text check (char_length(optimization) <= 60),
  audience_notes text check (char_length(audience_notes) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists josy_ad_groups_campaign_idx on public.josy_ad_groups (campaign_id, position);
create index if not exists josy_ad_groups_user_idx on public.josy_ad_groups (user_id);

create table if not exists public.josy_ads (
  id uuid primary key default gen_random_uuid(),
  ad_group_id uuid not null references public.josy_ad_groups(id) on delete cascade,
  campaign_id uuid not null references public.josy_campaigns(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position int not null default 0,
  name text not null check (char_length(name) between 1 and 120),
  format text check (char_length(format) <= 60),
  primary_text text check (char_length(primary_text) <= 3000),
  headline text check (char_length(headline) <= 300),
  description text check (char_length(description) <= 1000),
  cta text check (char_length(cta) <= 40),
  destination_url text check (char_length(destination_url) <= 2000),
  media_url text check (char_length(media_url) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists josy_ads_group_idx on public.josy_ads (ad_group_id, position);
create index if not exists josy_ads_campaign_idx on public.josy_ads (campaign_id);
create index if not exists josy_ads_user_idx on public.josy_ads (user_id);

create table if not exists public.josy_organic_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text check (char_length(title) <= 160),
  platforms text[] not null default '{}' check (platforms <@ array['instagram', 'facebook', 'tiktok', 'linkedin', 'x']::text[]),
  content text not null default '' check (char_length(content) <= 10000),
  hashtags text[] not null default '{}',
  media_url text check (char_length(media_url) <= 2000),
  media_notes text check (char_length(media_notes) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  scheduled_at timestamptz,
  published_at timestamptz,
  plan_item_id bigint references public.josy_plan_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists josy_organic_posts_user_sched_idx on public.josy_organic_posts (user_id, scheduled_at);
create index if not exists josy_organic_posts_plan_item_idx on public.josy_organic_posts (plan_item_id);

alter table public.josy_campaigns enable row level security;
alter table public.josy_ad_groups enable row level security;
alter table public.josy_ads enable row level security;
alter table public.josy_organic_posts enable row level security;

revoke all on public.josy_campaigns, public.josy_ad_groups, public.josy_ads, public.josy_organic_posts from anon;
grant select, insert, update, delete on public.josy_campaigns, public.josy_ad_groups, public.josy_ads, public.josy_organic_posts to authenticated;

-- Campaigns & posts: owner-only.
create policy "josy_campaigns owner all" on public.josy_campaigns for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "josy_organic_posts owner all" on public.josy_organic_posts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Children: owner-only, and the parent must belong to the same user.
create policy "josy_ad_groups owner all" on public.josy_ad_groups for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.josy_campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "josy_ads owner all" on public.josy_ads for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
    and exists (select 1 from public.josy_campaigns c where c.id = campaign_id and c.user_id = (select auth.uid()))
    and exists (select 1 from public.josy_ad_groups g where g.id = ad_group_id and g.campaign_id = josy_ads.campaign_id and g.user_id = (select auth.uid())));

-- Plan item links must point at the user's own plan items.
create policy "josy_organic_posts plan item owner ins" on public.josy_organic_posts as restrictive for insert to authenticated
  with check (plan_item_id is null or exists (select 1 from public.josy_plan_items i where i.id = plan_item_id and i.user_id = (select auth.uid())));
create policy "josy_organic_posts plan item owner upd" on public.josy_organic_posts as restrictive for update to authenticated
  using (true)
  with check (plan_item_id is null or exists (select 1 from public.josy_plan_items i where i.id = plan_item_id and i.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Plan limits (per account): saved campaigns and organic posts.
-- Generous caps that stop abuse; ad sets/ads are capped per campaign.
-- ---------------------------------------------------------------------------
create or replace function public.josy_cm_limit(p_plan text, p_kind text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'campaigns' then case coalesce(p_plan, 'free') when 'pro' then 1000 when 'plus' then 250 when 'starter' then 50 else 5 end
    when 'posts' then case coalesce(p_plan, 'free') when 'pro' then 10000 when 'plus' then 3000 when 'starter' then 600 else 60 end
    when 'ad_groups' then 20
    when 'ads' then 50
    else 0
  end;
$$;
grant execute on function public.josy_cm_limit(text, text) to authenticated, service_role;

create or replace function private.josy_cm_enforce_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_count int;
  v_limit int;
begin
  select coalesce(p.plan, 'free') into v_plan from public.profiles p where p.id = new.user_id;
  if tg_table_name = 'josy_campaigns' then
    select count(*) into v_count from public.josy_campaigns where user_id = new.user_id;
    v_limit := public.josy_cm_limit(v_plan, 'campaigns');
  elsif tg_table_name = 'josy_organic_posts' then
    select count(*) into v_count from public.josy_organic_posts where user_id = new.user_id;
    v_limit := public.josy_cm_limit(v_plan, 'posts');
  elsif tg_table_name = 'josy_ad_groups' then
    select count(*) into v_count from public.josy_ad_groups where campaign_id = new.campaign_id;
    v_limit := public.josy_cm_limit(v_plan, 'ad_groups');
  elsif tg_table_name = 'josy_ads' then
    select count(*) into v_count from public.josy_ads where ad_group_id = new.ad_group_id;
    v_limit := public.josy_cm_limit(v_plan, 'ads');
  else
    return new;
  end if;
  if v_count >= v_limit then
    raise exception 'JOSY_LIMIT: % limit reached (% on the % plan)', tg_table_name, v_limit, coalesce(v_plan, 'free')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.josy_cm_enforce_limits() from public, anon, authenticated;

create or replace function private.josy_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.josy_touch_updated_at() from public, anon, authenticated;

create trigger josy_campaigns_limit before insert on public.josy_campaigns for each row execute function private.josy_cm_enforce_limits();
create trigger josy_organic_posts_limit before insert on public.josy_organic_posts for each row execute function private.josy_cm_enforce_limits();
create trigger josy_ad_groups_limit before insert on public.josy_ad_groups for each row execute function private.josy_cm_enforce_limits();
create trigger josy_ads_limit before insert on public.josy_ads for each row execute function private.josy_cm_enforce_limits();
create trigger josy_campaigns_touch before update on public.josy_campaigns for each row execute function private.josy_touch_updated_at();
create trigger josy_organic_posts_touch before update on public.josy_organic_posts for each row execute function private.josy_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Atomic save of a full campaign tree (campaign + ad sets/groups + ads).
-- SECURITY INVOKER on purpose: runs as the signed-in user, so RLS applies.
-- ---------------------------------------------------------------------------
create or replace function public.josy_save_campaign(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_group jsonb;
  v_ad jsonb;
  v_gid uuid;
  gi int := 0;
  ai int;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  v_id := nullif(p->>'id', '')::uuid;

  if v_id is null then
    insert into public.josy_campaigns (user_id, platform, name, objective, status, budget_type, budget_amount, currency,
      start_date, end_date, bidding, bid_amount, audience, placements, notes)
    values (v_uid, p->>'platform', p->>'name', coalesce(p->>'objective', 'traffic'), coalesce(p->>'status', 'draft'),
      coalesce(p->>'budget_type', 'daily'), nullif(p->>'budget_amount', '')::numeric, coalesce(p->>'currency', 'USD'),
      nullif(p->>'start_date', '')::date, nullif(p->>'end_date', '')::date, nullif(p->>'bidding', ''),
      nullif(p->>'bid_amount', '')::numeric, coalesce(p->'audience', '{}'::jsonb),
      coalesce(array(select jsonb_array_elements_text(coalesce(p->'placements', '[]'::jsonb))), '{}'), nullif(p->>'notes', ''))
    returning id into v_id;
  else
    update public.josy_campaigns set
      platform = p->>'platform', name = p->>'name', objective = coalesce(p->>'objective', 'traffic'),
      status = coalesce(p->>'status', status), budget_type = coalesce(p->>'budget_type', 'daily'),
      budget_amount = nullif(p->>'budget_amount', '')::numeric, currency = coalesce(p->>'currency', 'USD'),
      start_date = nullif(p->>'start_date', '')::date, end_date = nullif(p->>'end_date', '')::date,
      bidding = nullif(p->>'bidding', ''), bid_amount = nullif(p->>'bid_amount', '')::numeric,
      audience = coalesce(p->'audience', '{}'::jsonb),
      placements = coalesce(array(select jsonb_array_elements_text(coalesce(p->'placements', '[]'::jsonb))), '{}'),
      notes = nullif(p->>'notes', '')
    where id = v_id and user_id = v_uid;
    if not found then
      raise exception 'Campaign not found' using errcode = 'P0002';
    end if;
    delete from public.josy_ad_groups where campaign_id = v_id and user_id = v_uid;
  end if;

  for v_group in select * from jsonb_array_elements(coalesce(p->'ad_groups', '[]'::jsonb)) loop
    insert into public.josy_ad_groups (campaign_id, user_id, position, name, optimization, audience_notes)
    values (v_id, v_uid, gi, coalesce(nullif(v_group->>'name', ''), 'Ad set ' || (gi + 1)),
      nullif(v_group->>'optimization', ''), nullif(v_group->>'audience_notes', ''))
    returning id into v_gid;
    ai := 0;
    for v_ad in select * from jsonb_array_elements(coalesce(v_group->'ads', '[]'::jsonb)) loop
      insert into public.josy_ads (ad_group_id, campaign_id, user_id, position, name, format, primary_text, headline,
        description, cta, destination_url, media_url)
      values (v_gid, v_id, v_uid, ai, coalesce(nullif(v_ad->>'name', ''), 'Ad ' || (ai + 1)), nullif(v_ad->>'format', ''),
        nullif(v_ad->>'primary_text', ''), nullif(v_ad->>'headline', ''), nullif(v_ad->>'description', ''),
        nullif(v_ad->>'cta', ''), nullif(v_ad->>'destination_url', ''), nullif(v_ad->>'media_url', ''));
      ai := ai + 1;
    end loop;
    gi := gi + 1;
  end loop;

  update public.josy_campaigns set updated_at = now() where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.josy_save_campaign(jsonb) from public, anon;
grant execute on function public.josy_save_campaign(jsonb) to authenticated;

-- Duplicate a campaign tree as a new draft (SECURITY INVOKER, RLS applies).
create or replace function public.josy_duplicate_campaign(p_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_new uuid;
  g record;
  v_gid uuid;
begin
  insert into public.josy_campaigns (user_id, platform, name, objective, status, budget_type, budget_amount, currency,
    start_date, end_date, bidding, bid_amount, audience, placements, notes)
  select v_uid, platform, left(name || ' (copy)', 120), objective, 'draft', budget_type, budget_amount, currency,
    start_date, end_date, bidding, bid_amount, audience, placements, notes
  from public.josy_campaigns where id = p_id and user_id = v_uid
  returning id into v_new;
  if v_new is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  for g in select * from public.josy_ad_groups where campaign_id = p_id and user_id = v_uid order by position loop
    insert into public.josy_ad_groups (campaign_id, user_id, position, name, optimization, audience_notes)
    values (v_new, v_uid, g.position, g.name, g.optimization, g.audience_notes) returning id into v_gid;
    insert into public.josy_ads (ad_group_id, campaign_id, user_id, position, name, format, primary_text, headline,
      description, cta, destination_url, media_url)
    select v_gid, v_new, v_uid, a.position, a.name, a.format, a.primary_text, a.headline, a.description, a.cta,
      a.destination_url, a.media_url
    from public.josy_ads a where a.ad_group_id = g.id and a.user_id = v_uid order by a.position;
  end loop;
  return v_new;
end;
$$;
revoke all on function public.josy_duplicate_campaign(uuid) from public, anon;
grant execute on function public.josy_duplicate_campaign(uuid) to authenticated;
