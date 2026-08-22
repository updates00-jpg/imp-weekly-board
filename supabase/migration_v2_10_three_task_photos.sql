-- v2.10: allow up to three photo paths per task while preserving existing single-photo data.
alter table public.tasks
  add column if not exists image_paths text[] not null default '{}'::text[];

update public.tasks
set image_paths = array[image_path]
where image_path is not null
  and coalesce(array_length(image_paths, 1), 0) = 0;

-- Keep legacy image_path for backward compatibility during rollout.
