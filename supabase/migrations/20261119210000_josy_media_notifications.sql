-- Josy: media library (private Storage bucket + per-plan quota) and notifications.
-- Applied remotely as migration josy_media_notifications.

-- ---------------------------------------------------------------- bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('josy-media', 'josy-media', false, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- limits
-- Per-plan storage quota in bytes. Must match JOSY_MEDIA in assets/js/josy-media.js.
create or replace function public.josy_media_quota(p_plan text)
returns bigint language sql immutable set search_path = '' as $$
  select case coalesce(p_plan, 'free')
    when 'pro' then 50::bigint * 1024 * 1024 * 1024
    when 'plus' then 10::bigint * 1024 * 1024 * 1024
    when 'starter' then 2::bigint * 1024 * 1024 * 1024
    else 200::bigint * 1024 * 1024 end;
$$;
-- Per-file limit: images 10 MB, videos 50 MB (bucket hard limit is 50 MB).
create or replace function public.josy_media_max_file(p_mime text)
returns bigint language sql immutable set search_path = '' as $$
  select case when p_mime like 'video/%' then 50::bigint * 1024 * 1024 else 10::bigint * 1024 * 1024 end;
$$;
grant execute on function public.josy_media_quota(text) to authenticated, service_role;
grant execute on function public.josy_media_max_file(text) to authenticated, service_role;

-- ---------------------------------------------------------------- media table
create table if not exists public.josy_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null unique,
  file_name text check (char_length(file_name) <= 200),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm')),
  kind text generated always as (case when mime like 'video/%' then 'video' else 'image' end) stored,
  size_bytes bigint not null check (size_bytes > 0),
  status text not null default 'pending' check (status in ('pending', 'ready')),
  width int, height int,
  created_at timestamptz not null default now()
);
create index if not exists josy_media_user_idx on public.josy_media (user_id, created_at desc);
alter table public.josy_media enable row level security;
drop policy if exists "josy_media owner select" on public.josy_media;
create policy "josy_media owner select" on public.josy_media for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "josy_media owner delete" on public.josy_media;
create policy "josy_media owner delete" on public.josy_media for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.josy_media from anon, authenticated;
grant select, delete on public.josy_media to authenticated;
grant all on public.josy_media to service_role;

-- Reserve an upload slot. Checks type, per-file size and the plan quota using the ACTUAL bytes
-- already stored in the bucket plus pending reservations from the last hour.
create or replace function public.josy_media_reserve(p_file_name text, p_mime text, p_size bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_quota bigint;
  v_used bigint;
  v_pending bigint;
  v_ext text;
  v_id uuid := gen_random_uuid();
  v_path text;
begin
  if v_uid is null then raise exception 'JOSY_MEDIA: not signed in'; end if;
  if p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm') then
    raise exception 'JOSY_MEDIA: type % is not allowed', p_mime;
  end if;
  if p_size is null or p_size <= 0 then raise exception 'JOSY_MEDIA: empty file'; end if;
  if p_size > public.josy_media_max_file(p_mime) then raise exception 'JOSY_MEDIA: file too large'; end if;
  select coalesce(p.plan, 'free') into v_plan from public.profiles p where p.id = v_uid;
  v_quota := public.josy_media_quota(v_plan);
  select coalesce(sum((o.metadata->>'size')::bigint), 0) into v_used
    from storage.objects o where o.bucket_id = 'josy-media' and o.name like v_uid::text || '/%';
  select coalesce(sum(m.size_bytes), 0) into v_pending
    from public.josy_media m where m.user_id = v_uid and m.status = 'pending' and m.created_at > now() - interval '1 hour';
  if v_used + v_pending + p_size > v_quota then
    raise exception 'JOSY_MEDIA: quota exceeded (% of % bytes used on the % plan)', v_used, v_quota, coalesce(v_plan, 'free');
  end if;
  v_ext := case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/gif' then 'gif'
    when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' else 'webm' end;
  v_path := v_uid::text || '/' || v_id::text || '.' || v_ext;
  delete from public.josy_media m where m.user_id = v_uid and m.status = 'pending' and m.created_at < now() - interval '1 hour';
  insert into public.josy_media (id, user_id, path, file_name, mime, size_bytes)
    values (v_id, v_uid, v_path, left(coalesce(p_file_name, 'file'), 200), p_mime, p_size);
  return jsonb_build_object('id', v_id, 'path', v_path);
end;
$$;

-- Confirm after upload: the object must exist; the real stored size replaces the declared one.
create or replace function public.josy_media_confirm(p_id uuid, p_width int default null, p_height int default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.josy_media;
  v_size bigint;
begin
  select * into v_row from public.josy_media m where m.id = p_id and m.user_id = v_uid;
  if not found then raise exception 'JOSY_MEDIA: not found'; end if;
  select (o.metadata->>'size')::bigint into v_size from storage.objects o where o.bucket_id = 'josy-media' and o.name = v_row.path;
  if v_size is null then raise exception 'JOSY_MEDIA: upload not found'; end if;
  update public.josy_media set status = 'ready', size_bytes = greatest(v_size, 1),
    width = case when p_width between 1 and 20000 then p_width end, height = case when p_height between 1 and 20000 then p_height end
    where id = p_id;
  return jsonb_build_object('id', p_id, 'size_bytes', v_size);
end;
$$;

create or replace function public.josy_media_usage()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_used bigint;
begin
  if v_uid is null then return null; end if;
  select coalesce(p.plan, 'free') into v_plan from public.profiles p where p.id = v_uid;
  select coalesce(sum((o.metadata->>'size')::bigint), 0) into v_used
    from storage.objects o where o.bucket_id = 'josy-media' and o.name like v_uid::text || '/%';
  return jsonb_build_object('plan', coalesce(v_plan, 'free'), 'used', v_used, 'quota', public.josy_media_quota(v_plan));
end;
$$;
revoke all on function public.josy_media_reserve(text, text, bigint) from public, anon;
revoke all on function public.josy_media_confirm(uuid, int, int) from public, anon;
revoke all on function public.josy_media_usage() from public, anon;
grant execute on function public.josy_media_reserve(text, text, bigint) to authenticated;
grant execute on function public.josy_media_confirm(uuid, int, int) to authenticated;
grant execute on function public.josy_media_usage() to authenticated;

-- ---------------------------------------------------------------- storage policies
-- Path is "<auth.uid()>/<uuid>.<ext>". Uploads need a matching pending reservation (no overwrite/update).
drop policy if exists "josy-media owner read" on storage.objects;
create policy "josy-media owner read" on storage.objects for select to authenticated
  using (bucket_id = 'josy-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "josy-media reserved upload" on storage.objects;
create policy "josy-media reserved upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'josy-media' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.josy_media m where m.path = name and m.user_id = (select auth.uid()) and m.status = 'pending'));
drop policy if exists "josy-media owner delete" on storage.objects;
create policy "josy-media owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'josy-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------- link media to posts and ads
alter table public.josy_organic_posts add column if not exists media_id uuid references public.josy_media(id) on delete set null;
alter table public.josy_ads add column if not exists media_id uuid references public.josy_media(id) on delete set null;
create index if not exists josy_organic_posts_media_idx on public.josy_organic_posts (media_id) where media_id is not null;
create index if not exists josy_ads_media_idx on public.josy_ads (media_id) where media_id is not null;

drop policy if exists "josy_organic_posts media owner ins" on public.josy_organic_posts;
create policy "josy_organic_posts media owner ins" on public.josy_organic_posts as restrictive for insert to authenticated
  with check (media_id is null or exists (select 1 from public.josy_media m where m.id = media_id and m.user_id = (select auth.uid())));
drop policy if exists "josy_organic_posts media owner upd" on public.josy_organic_posts;
create policy "josy_organic_posts media owner upd" on public.josy_organic_posts as restrictive for update to authenticated
  using (true) with check (media_id is null or exists (select 1 from public.josy_media m where m.id = media_id and m.user_id = (select auth.uid())));
drop policy if exists "josy_ads media owner ins" on public.josy_ads;
create policy "josy_ads media owner ins" on public.josy_ads as restrictive for insert to authenticated
  with check (media_id is null or exists (select 1 from public.josy_media m where m.id = media_id and m.user_id = (select auth.uid())));
drop policy if exists "josy_ads media owner upd" on public.josy_ads;
create policy "josy_ads media owner upd" on public.josy_ads as restrictive for update to authenticated
  using (true) with check (media_id is null or exists (select 1 from public.josy_media m where m.id = media_id and m.user_id = (select auth.uid())));

-- ---------------------------------------------------------------- campaigns: "launched" (marked live by the user)
alter table public.josy_campaigns drop constraint if exists josy_campaigns_status_check;
alter table public.josy_campaigns add constraint josy_campaigns_status_check check (status in ('draft', 'ready', 'paused', 'archived', 'launched'));
alter table public.josy_campaigns add column if not exists launched_at timestamptz;

-- ---------------------------------------------------------------- notifications
create table if not exists public.josy_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('published')),
  source text not null default 'manual' check (source in ('manual', 'api')),
  entity_type text not null check (entity_type in ('post', 'campaign')),
  entity_id uuid,
  platforms text[] not null default '{}',
  title text not null check (char_length(title) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists josy_notifications_user_idx on public.josy_notifications (user_id, created_at desc);
alter table public.josy_notifications enable row level security;
drop policy if exists "josy_notifications owner select" on public.josy_notifications;
create policy "josy_notifications owner select" on public.josy_notifications for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "josy_notifications owner update" on public.josy_notifications;
create policy "josy_notifications owner update" on public.josy_notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "josy_notifications owner delete" on public.josy_notifications;
create policy "josy_notifications owner delete" on public.josy_notifications for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.josy_notifications from anon, authenticated;
grant select, delete on public.josy_notifications to authenticated;
grant update (read_at) on public.josy_notifications to authenticated;
grant all on public.josy_notifications to service_role;

-- Events are written only by triggers, and only on an actual status change to published / launched.
create or replace function private.josy_notify_published()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'josy_organic_posts' then
    if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
      insert into public.josy_notifications (user_id, kind, source, entity_type, entity_id, platforms, title)
      values (new.user_id, 'published', 'manual', 'post', new.id, new.platforms, left(coalesce(nullif(new.title, ''), nullif(left(new.content, 80), ''), 'Post'), 200));
    end if;
  elsif tg_table_name = 'josy_campaigns' then
    if new.status = 'launched' and (tg_op = 'INSERT' or old.status is distinct from 'launched') then
      insert into public.josy_notifications (user_id, kind, source, entity_type, entity_id, platforms, title)
      values (new.user_id, 'published', 'manual', 'campaign', new.id, array[new.platform], left(new.name, 200));
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.josy_notify_published() from public, anon, authenticated;
drop trigger if exists josy_organic_posts_notify on public.josy_organic_posts;
create trigger josy_organic_posts_notify after insert or update of status on public.josy_organic_posts
  for each row execute function private.josy_notify_published();
drop trigger if exists josy_campaigns_notify on public.josy_campaigns;
create trigger josy_campaigns_notify after insert or update of status on public.josy_campaigns
  for each row execute function private.josy_notify_published();

-- ---------------------------------------------------------------- save / duplicate now carry media_id
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
        description, cta, destination_url, media_url, media_id)
      values (v_gid, v_id, v_uid, ai, coalesce(nullif(v_ad->>'name', ''), 'Ad ' || (ai + 1)), nullif(v_ad->>'format', ''),
        nullif(v_ad->>'primary_text', ''), nullif(v_ad->>'headline', ''), nullif(v_ad->>'description', ''),
        nullif(v_ad->>'cta', ''), nullif(v_ad->>'destination_url', ''), nullif(v_ad->>'media_url', ''), nullif(v_ad->>'media_id', '')::uuid);
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
      description, cta, destination_url, media_url, media_id)
    select v_gid, v_new, v_uid, a.position, a.name, a.format, a.primary_text, a.headline, a.description, a.cta,
      a.destination_url, a.media_url, a.media_id
    from public.josy_ads a where a.ad_group_id = g.id and a.user_id = v_uid order by a.position;
  end loop;
  return v_new;
end;
$$;
revoke all on function public.josy_duplicate_campaign(uuid) from public, anon;
grant execute on function public.josy_duplicate_campaign(uuid) to authenticated;
