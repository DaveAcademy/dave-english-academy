-- Fixes a bug in the 'attachments' bucket read policy, found while live-
-- testing 0032_lesson_pdf_resources.sql: querying storage.objects as ANY
-- role (student, teacher, even admin) failed with "permission denied for
-- table students", making the entire attachments_read policy non-
-- functional - not just the new lesson-pdfs branch.
--
-- Root cause is the same bug class migration 0024 already fixed for
-- payments/attendance/lesson_attendance/exam_scores/homework_status/
-- certificates: migration 0016 revoked direct SELECT on public.students
-- from authenticated down to just the id column. Postgres checks column
-- privileges for every RLS policy branch referenced in a rewritten query,
-- not just the branch relevant to the current caller, so ANY branch that
-- raw-references students.profile_id fails the check for every caller
-- regardless of role. attachments_read (0014) already had this bug in
-- its exam-answers branch, unrelated to and predating this task's lesson-
-- pdfs work - confirmed live before this fix: a teacher role querying
-- storage.objects for the 'attachments' bucket already failed the same
-- way. Since the whole policy is one WHERE expression, the lesson-pdfs
-- branch added in 0032 could not work without also fixing this - leaving
-- exam-answers broken would leave the entire bucket, and therefore this
-- task's own deliverable, non-functional.
--
-- Fix: apply the exact pattern 0024 already established - a SECURITY
-- DEFINER helper function runs with its owner's privileges, bypassing
-- the caller's own (deliberately narrow) grant on students, and only
-- ever returns a boolean. No behavior changes for any existing caller:
-- the same rows are readable by the same people as originally intended
-- by 0009/0014, this only fixes the mechanism that 0016 silently broke.
-- Exam scoring/answers logic itself (exams table, exam_scores table,
-- Exams.jsx, MyExams.jsx) is untouched.

create or replace function public.is_own_exam_answer(p_answer_file_url text)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.exam_scores es
    join public.students s on s.id = es.student_id
    where s.profile_id = auth.uid()
      and es.answer_file_url = p_answer_file_url
  );
$$;

revoke execute on function public.is_own_exam_answer(text) from public;
grant execute on function public.is_own_exam_answer(text) to authenticated;

-- Same fix for the lesson-pdfs branch added in 0032 - moves the
-- students.level / students.profile_id join into a SECURITY DEFINER
-- helper instead of referencing those columns directly inside the RLS
-- policy body.
create or replace function public.can_read_lesson_pdf(p_lesson_id bigint)
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

revoke execute on function public.can_read_lesson_pdf(bigint) from public;
grant execute on function public.can_read_lesson_pdf(bigint) to authenticated;

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
      )
      or public.is_own_exam_answer(name)
      or (
        public.storage_lesson_id(name) is not null
        and public.can_read_lesson_pdf(public.storage_lesson_id(name))
      )
    )
  );
