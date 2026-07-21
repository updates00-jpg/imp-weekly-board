-- Run once in Supabase Dashboard -> SQL Editor before deploying v2.4.

alter table public.tasks add column if not exists end_date date;
update public.tasks set end_date = task_date where end_date is null;
alter table public.tasks alter column end_date set not null;
alter table public.tasks alter column end_date set default current_date;

alter table public.tasks drop constraint if exists valid_task_time;
alter table public.tasks drop constraint if exists valid_task_date_range;
alter table public.tasks add constraint valid_task_date_range check (
  end_date > task_date
  or end_date = task_date and (
    end_time is null or start_time is null or end_time > start_time
  )
);
create index if not exists tasks_end_date_idx on public.tasks(end_date);

create type public.leave_type as enum ('annual', 'sick', 'training', 'other');

create table if not exists public.leave_periods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  leave_type public.leave_type not null default 'annual',
  start_date date not null,
  end_date date not null,
  note varchar(300),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint valid_leave_range check (end_date >= start_date)
);

create index if not exists leave_periods_dates_idx on public.leave_periods(start_date, end_date);
create index if not exists leave_periods_profile_idx on public.leave_periods(profile_id);

alter table public.leave_periods enable row level security;

create policy "Authenticated active users read leave"
on public.leave_periods for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active = true));

create policy "Authenticated active users create leave"
on public.leave_periods for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active = true)
);

create policy "Authenticated active users update leave"
on public.leave_periods for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active = true))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active = true));

create policy "Admins delete leave"
on public.leave_periods for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active = true and p.role = 'admin'));

alter publication supabase_realtime add table public.leave_periods;
