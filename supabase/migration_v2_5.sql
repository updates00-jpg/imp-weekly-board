-- Run once in Supabase Dashboard -> SQL Editor before deploying v2.5.
-- Adds explicit entry types used by the compact Planning Board.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_kind') then
    create type public.task_kind as enum ('task', 'duty', 'standby');
  end if;
end $$;

alter table public.tasks
  add column if not exists task_kind public.task_kind not null default 'task';

create index if not exists tasks_task_kind_idx on public.tasks(task_kind);

-- Existing records remain regular tasks. Duty and Stand By must be selected
-- explicitly in the task form after this migration.
