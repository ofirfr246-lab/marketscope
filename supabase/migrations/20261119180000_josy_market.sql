-- Josy Market v1: conversational AI marketing assistant (organic only).
-- Tables are owner-only via RLS. Writes to conversations/messages/usage are
-- done server-side by the josy-chat Edge Function (service role); users can
-- read their own rows, rename/delete conversations, and edit/delete plans.

create table if not exists public.josy_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New chat' check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists josy_conversations_user_updated_idx on public.josy_conversations (user_id, updated_at desc);

create table if not exists public.josy_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.josy_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 40000),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists josy_messages_conv_idx on public.josy_messages (conversation_id, id);
create index if not exists josy_messages_user_idx on public.josy_messages (user_id);

create table if not exists public.josy_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversation_id uuid references public.josy_conversations(id) on delete set null,
  kind text not null default 'marketing_plan' check (kind in ('marketing_plan', 'content_calendar')),
  title text not null check (char_length(title) between 1 and 160),
  goal text check (char_length(goal) <= 1000),
  summary text check (char_length(summary) <= 8000),
  channels text[] not null default '{}',
  data jsonb not null default '{}'::jsonb,
  start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists josy_plans_user_created_idx on public.josy_plans (user_id, created_at desc);
create index if not exists josy_plans_conversation_idx on public.josy_plans (conversation_id);

create table if not exists public.josy_plan_items (
  id bigint generated always as identity primary key,
  plan_id uuid not null references public.josy_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position int not null default 0,
  day int check (day between 1 and 366),
  scheduled_date date,
  channel text check (char_length(channel) <= 60),
  format text check (char_length(format) <= 60),
  title text not null check (char_length(title) between 1 and 300),
  body text check (char_length(body) <= 6000),
  status text not null default 'idea' check (status in ('idea', 'scheduled', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists josy_plan_items_plan_idx on public.josy_plan_items (plan_id, position);
create index if not exists josy_plan_items_user_idx on public.josy_plan_items (user_id);

create table if not exists public.josy_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  messages int not null default 0 check (messages >= 0),
  primary key (user_id, day)
);

alter table public.josy_conversations enable row level security;
alter table public.josy_messages enable row level security;
alter table public.josy_plans enable row level security;
alter table public.josy_plan_items enable row level security;
alter table public.josy_usage enable row level security;

-- Least privilege for API roles (service_role keeps full access).
revoke all on public.josy_conversations, public.josy_messages, public.josy_plans,
  public.josy_plan_items, public.josy_usage from anon, authenticated;
grant select, delete on public.josy_conversations to authenticated;
grant update (title) on public.josy_conversations to authenticated;
grant select on public.josy_messages to authenticated;
grant select, delete on public.josy_plans to authenticated;
grant update (title, goal, summary) on public.josy_plans to authenticated;
grant select, delete on public.josy_plan_items to authenticated;
grant update (status, title, body) on public.josy_plan_items to authenticated;
grant select on public.josy_usage to authenticated;

create policy "josy_conversations owner select" on public.josy_conversations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "josy_conversations owner update" on public.josy_conversations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "josy_conversations owner delete" on public.josy_conversations
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "josy_messages owner select" on public.josy_messages
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "josy_plans owner select" on public.josy_plans
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "josy_plans owner update" on public.josy_plans
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "josy_plans owner delete" on public.josy_plans
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "josy_plan_items owner select" on public.josy_plan_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "josy_plan_items owner update" on public.josy_plan_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "josy_plan_items owner delete" on public.josy_plan_items
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "josy_usage owner select" on public.josy_usage
  for select to authenticated using ((select auth.uid()) = user_id);

-- Daily Josy message allowance per plan (UTC day). Single source of truth.
create or replace function public.josy_daily_limit(p_plan text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_plan, 'free')
    when 'pro' then 400
    when 'plus' then 150
    when 'starter' then 50
    else 10
  end;
$$;

-- Atomically consume one Josy message for a user. Returns the result row;
-- allowed=false when today's allowance is used up. Service role only.
create or replace function public.josy_take_message(p_user uuid)
returns table (allowed boolean, used int, daily_limit int, plan text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_limit int;
  v_used int;
begin
  select coalesce(p.plan, 'free') into v_plan from public.profiles p where p.id = p_user;
  if v_plan is null then
    v_plan := 'free';
  end if;
  v_limit := public.josy_daily_limit(v_plan);

  insert into public.josy_usage as u (user_id, day, messages)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set messages = u.messages + 1
    where u.messages < v_limit
  returning u.messages into v_used;

  if v_used is null then
    select u.messages into v_used from public.josy_usage u
     where u.user_id = p_user and u.day = (now() at time zone 'utc')::date;
    return query select false, coalesce(v_used, v_limit), v_limit, v_plan;
  else
    return query select true, v_used, v_limit, v_plan;
  end if;
end;
$$;

-- Give back one message (used when the AI call fails). Service role only.
create or replace function public.josy_refund_message(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.josy_usage
     set messages = greatest(messages - 1, 0)
   where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

-- Read today's usage without consuming. Service role only.
create or replace function public.josy_usage_status(p_user uuid)
returns table (used int, daily_limit int, plan text)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.messages from public.josy_usage u
                    where u.user_id = p_user and u.day = (now() at time zone 'utc')::date), 0),
         public.josy_daily_limit(coalesce(p.plan, 'free')),
         coalesce(p.plan, 'free')
    from (select 1) one
    left join public.profiles p on p.id = p_user;
$$;

revoke all on function public.josy_take_message(uuid) from public, anon, authenticated;
revoke all on function public.josy_refund_message(uuid) from public, anon, authenticated;
revoke all on function public.josy_usage_status(uuid) from public, anon, authenticated;
grant execute on function public.josy_take_message(uuid) to service_role;
grant execute on function public.josy_refund_message(uuid) to service_role;
grant execute on function public.josy_usage_status(uuid) to service_role;
grant execute on function public.josy_daily_limit(text) to authenticated, service_role;
