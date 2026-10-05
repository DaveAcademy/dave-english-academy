-- Fixes the same bug class as 0033: lesson_vocabulary_student_read (0048)
-- and the vocabulary-images branch of attachments_read joined
-- public.students directly inside an RLS policy body. Migration 0016
-- revoked direct SELECT on public.students from authenticated (down to
-- just the id column), and Postgres checks table/column privileges for
-- every RLS policy branch referenced in a rewritten query - not just the
-- branch relevant to the current caller - so ANY query against
-- lesson_vocabulary (by student, teacher, or admin) failed with
-- "permission denied for table students", confirmed live:
--   ERROR: 42501: permission denied for table students
--   HINT: Grant the required privileges to the current role with:
--   GRANT SELECT ON public.students TO authenticated;
--
-- Fix: move the lessons/students join into a SECURITY DEFINER helper,
-- exactly mirroring can_read_lesson_pdf (0033) - kept as its own
-- function (same body) rather than reused, so future changes to
-- vocabulary access can diverge from PDF access without coupling them.

create or replace function public.can_read_lesson_vocabulary(p_lesson_id bigint)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.lessons l
    join public.students s on s.profile_id = auth.uid()
    where l.id = p_lesson_id
      and (l.level is null or l.level = s.level)
  );
$$;

revoke execute on function public.can_read_lesson_vocabulary(bigint) from public;
grant execute on function public.can_read_lesson_vocabulary(bigint) to authenticated;

drop policy if exists lesson_vocabulary_student_read on public.lesson_vocabulary;
create policy lesson_vocabulary_student_read on public.lesson_vocabulary for select
  using (
    is_active
    and public.can_read_lesson_vocabulary(lesson_id)
  );

drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select
  using (
    bucket_id = 'attachments'
    and auth.uid() is not null
    and (
      is_admin()
      or is_teacher()
      or (
        (storage.foldername(name))[1] is distinct from 'exam-answers'
        and (storage.foldername(name))[1] is distinct from 'lesson-pdfs'
        and (storage.foldername(name))[1] is distinct from 'vocabulary-images'
      )
      or public.is_own_exam_answer(name)
      or (
        public.storage_lesson_id(name) is not null
        and public.can_read_lesson_pdf(public.storage_lesson_id(name))
      )
      or (
        public.storage_vocabulary_lesson_id(name) is not null
        and public.can_read_lesson_vocabulary(public.storage_vocabulary_lesson_id(name))
      )
    )
  );
