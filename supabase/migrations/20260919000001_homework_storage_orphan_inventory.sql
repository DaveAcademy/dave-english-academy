-- 20260919000001_homework_storage_orphan_inventory.sql
-- Inventory for orphaned homework storage objects (issue #4)
-- No deletion performed — only provides audit view/function for manual review.

-- Helper view: homework storage objects that have no DB reference
-- Covers both homework/ (teacher files) and homework-answers/ (student evidence)
-- A) Teacher homework objects: storage.objects.name = homework.file_url
-- B) Student evidence: name = homework_status.answer_file_url OR homework_submission_files.file_url OR lesson_work_submission_files via homework-answers/ pattern

create or replace view public.homework_storage_orphan_candidates as
select
  o.name as storage_path,
  o.bucket_id,
  o.created_at,
  o.metadata,
  case
    when (storage.foldername(o.name))[1] = 'homework' then 'teacher_homework'
    when (storage.foldername(o.name))[1] = 'homework-answers' then 'student_evidence'
    else 'other'
  end as category,
  case
    when (storage.foldername(o.name))[1] = 'homework' then
      not exists (select 1 from public.homework h where h.file_url = o.name)
    when (storage.foldername(o.name))[1] = 'homework-answers' then
      not exists (select 1 from public.homework_status hs where hs.answer_file_url = o.name)
      and not exists (select 1 from public.homework_submission_files f where f.file_url = o.name)
    else false
  end as is_orphan
from storage.objects o
where o.bucket_id = 'attachments'
  and (storage.foldername(o.name))[1] in ('homework', 'homework-answers');

-- Function to count orphans (admin-only via RLS on underlying tables + storage.objects policy already admin-only for list)
create or replace function public.homework_orphan_counts()
returns table(category text, total bigint, orphan bigint)
language sql
stable
security definer
set search_path = 'public, storage'
as $$
  select category, count(*)::bigint as total, count(*) filter (where is_orphan)::bigint as orphan
  from public.homework_storage_orphan_candidates
  group by category;
$$;

revoke all on function public.homework_orphan_counts() from public;
grant execute on function public.homework_orphan_counts() to authenticated;

-- Ensure future deletes are auditable: add deleted_at audit column to homework_submission_files for soft inventory
-- If already exists, no-op
do $$ begin
  if not exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='homework_submission_files' and column_name='deleted_at'
  ) then
    alter table public.homework_submission_files add column deleted_at timestamptz;
  end if;
end $$;
