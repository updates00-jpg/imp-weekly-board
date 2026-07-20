-- Run this entire file in Supabase Dashboard -> SQL Editor.
create extension if not exists pgcrypto;

create type public.user_role as enum ('member', 'admin');
create type public.task_status as enum ('scheduled', 'in_progress', 'completed', 'blocked', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^IMP-([1-9]|1[0-5])$'),
  role public.user_role not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title varchar(60) not null check (char_length(trim(title)) between 1 and 60),
  description varchar(300),
  task_date date not null,
  start_time time,
  end_time time,
  status public.task_status not null default 'scheduled',
  priority public.task_priority not null default 'normal',
  owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  constraint valid_task_time check (end_time is null or start_time is null or end_time > start_time)
);

create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (task_id, profile_id)
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  task_id uuid references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index tasks_task_date_idx on public.tasks(task_date);
create index tasks_owner_id_idx on public.tasks(owner_id);
create index task_assignees_profile_id_idx on public.task_assignees(profile_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create or replace function public.log_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log(task_id, actor_id, action, new_data)
    values (new.id, auth.uid(), 'created', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.activity_log(task_id, actor_id, action, old_data, new_data)
    values (new.id, auth.uid(), 'updated', to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.activity_log(task_id, actor_id, action, old_data)
    values (old.id, auth.uid(), 'deleted', to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

create trigger tasks_activity_log
after insert or update or delete on public.tasks
for each row execute function public.log_task_change();

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.activity_log enable row level security;

create policy "Authenticated users read active profiles"
on public.profiles for select
to authenticated
using (active = true or id = (select auth.uid()));

create policy "Users read own profile"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

create policy "Authenticated active users read tasks"
on public.tasks for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
  )
);

create policy "Authenticated active users create tasks"
on public.tasks for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
  )
);

create policy "Authenticated active users update tasks"
on public.tasks for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
  )
);

create policy "Admins permanently delete tasks"
on public.tasks for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true and p.role = 'admin'
  )
);

create policy "Authenticated active users read assignments"
on public.task_assignees for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
  )
);

create policy "Authenticated active users create assignments"
on public.task_assignees for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
  )
);

create policy "Authenticated active users delete assignments"
on public.task_assignees for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
  )
);

create policy "Authenticated users read activity"
on public.activity_log for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
  )
);

-- No client INSERT/UPDATE/DELETE policies for activity_log.
-- The trigger writes logs using SECURITY DEFINER.
