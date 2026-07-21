-- Run once in Supabase Dashboard -> SQL Editor before deploying v2.6.
-- Duty and Stand By are now stored separately from tasks.

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  shift_type text not null check (shift_type in ('duty', 'standby')),
  start_date date not null,
  end_date date not null,
  start_time time not null default '07:30',
  end_time time not null default '07:30',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint shifts_end_next_day check (end_date = start_date + 1),
  constraint shifts_one_per_start_day unique (profile_id, start_date)
);

create index if not exists shifts_week_idx on public.shifts(start_date, end_date);
alter table public.shifts enable row level security;

drop policy if exists "Active users read shifts" on public.shifts;
create policy "Active users read shifts" on public.shifts for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true));

drop policy if exists "Active users create shifts" on public.shifts;
create policy "Active users create shifts" on public.shifts for insert to authenticated
with check (created_by = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true));

drop policy if exists "Active users update shifts" on public.shifts;
create policy "Active users update shifts" on public.shifts for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true));

drop policy if exists "Admins delete shifts" on public.shifts;
create policy "Admins delete shifts" on public.shifts for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true and p.role = 'admin'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shifts'
  ) then
    alter publication supabase_realtime add table public.shifts;
  end if;
end $$;
