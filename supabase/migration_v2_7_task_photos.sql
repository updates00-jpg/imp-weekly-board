-- Run once in Supabase Dashboard -> SQL Editor before deploying v2.7.
-- Adds one optional private photo per task.

alter table public.tasks
  add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-images',
  'task-images',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Active users read task images" on storage.objects;
create policy "Active users read task images"
on storage.objects for select to authenticated
using (
  bucket_id = 'task-images'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
  )
);

drop policy if exists "Active users upload task images" on storage.objects;
create policy "Active users upload task images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'task-images'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
  )
);

drop policy if exists "Active users delete task images" on storage.objects;
create policy "Active users delete task images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'task-images'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true
  )
);
