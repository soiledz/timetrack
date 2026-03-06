-- Включите в Supabase: Authentication -> Providers -> Anonymous -> Enable

create extension if not exists pgcrypto;

create table if not exists public.workday_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  telegram_user_id text not null,
  workday_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  total_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, telegram_user_id, workday_date)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.workday_sessions(id) on delete cascade,
  title text not null,
  elapsed_seconds integer not null default 0,
  is_running boolean not null default false,
  is_completed boolean not null default false,
  running_started_at timestamptz,
  completed_at timestamptz,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_session on public.tasks(session_id);
create index if not exists idx_tasks_user_session on public.tasks(user_id, session_id);

alter table public.workday_sessions enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "workday_sessions_owner_all" on public.workday_sessions;
create policy "workday_sessions_owner_all"
  on public.workday_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "tasks_owner_all" on public.tasks;
create policy "tasks_owner_all"
  on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
