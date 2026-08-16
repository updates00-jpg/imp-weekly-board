-- v2.8: allow every active IMP user to delete Duty / Stand By shifts.
-- Run once in Supabase SQL Editor before deploying v2.8.

drop policy if exists "Admins delete shifts" on public.shifts;
drop policy if exists "Active users delete shifts" on public.shifts;
create policy "Active users delete shifts"
on public.shifts for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true
  )
);
