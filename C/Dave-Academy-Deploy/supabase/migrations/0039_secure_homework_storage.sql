-- Homework Phase H1 security fix (audit findings, 2026-07-26):
--
-- Every prior storage-hardening migration (0014, 0032, 0036) explicitly
-- scoped only 'exams'/'exam-answers'/'lesson-pdfs'/'certificate-template'
-- and left 'homework'/'homework-answers' in the original 0009 "any
-- authenticated user can read/write" branch, each time as a deliberate,
-- documented scope decision - never a follow-up. Confirmed live via
-- rolled-back role-impersonation before writing this migration:
--   - any signed-in user (including another student) can read ANY
--     homework-answers/* file, not just their own submission
--   - any signed-in user can write/overwrite ANY homework-answers/* path
--   - any signed-in user can write/overwrite the 'homework' folder
--     itself - i.e. a student could overwrite the TEACHER's own
--     assignment file, not just a student answer
-- Production currently has 0 rows in homework and homework_status (per
-- the audit), so there is no real submission data affected by this fix -
-- this is the cleanest possible time to close it.
--
-- This migration applies the exact same pattern Phase 1 already
-- established and proved for exams:
--   - can_read_homework_file: matches a stored path against
--     homework.file_url (paths are flat, no embedded id - teacher
--     uploads happen before the row exists, same as exams) and checks
--     the requesting student's level against the homework's level (null
--     level = open to all, same convention as everywhere else in this
--     schema).
--   - is_own_homework_answer: matches a stored path against
--     homework_status.answer_file_url, scoped to the caller's own
--     student via is_own_student() - identical shape to
--     is_own_exam_answer (0033).
--   - storage_homework_answer_student_id / can_write_homework_answer:
--     new upload path convention 'homework-answers/{student_id}/...',
--     identical shape to storage_exam_answer_student_id /
--     can_write_exam_answer (0036). The matching frontend change
--     (MyHomework.jsx) uploads to `homework-answers/${me.id}` instead of
--     the bare 'homework-answers' folder - old flat-path objects don't
--     exist yet (0 submissions), so there is nothing to migrate.
--
-- Nothing else changes: exams/exam-answers/lesson-pdfs/certificate-
-- template policies and helper functions are untouched and unreferenced
-- here. is_admin()/is_teacher() keep unrestricted access to every folder
-- in this bucket, matching the existing authorization model (teacher-
-- level CRUD scoping remains a separate, not-yet-approved decision, same
-- as it is for exams).

create or replace function public.can_read_homework_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.homework h
    join public.students s on s.profile_id = auth.uid()
    where h.file_url = p_name
      and (h.level is null or h.level = s.level)
  );
$$;

revoke execute on function public.can_read_homework_file(text) from public;
grant execute on function public.can_read_homework_file(text) to authenticated;

create or replace function public.is_own_homework_answer(p_answer_file_url text)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.homework_status hs
    where public.is_own_student(hs.student_id)
      and hs.answer_file_url = p_answer_file_url
  );
$$;

revoke execute on function public.is_own_homework_answer(text) from public;
grant execute on function public.is_own_homework_answer(text) to authenticated;

create or replace function public.storage_homework_answer_student_id(p_name text)
returns bigint
language sql
immutable
set search_path = 'public'
as $$
  select case
    when (storage.foldername(p_name))[1] = 'homework-answers'
     and (storage.foldername(p_name))[2] ~ '^[0-9]+$'
    then ((storage.foldername(p_name))[2])::bigint
    else null
  end;
$$;

-- Not security definer, same reasoning as can_write_exam_answer: it only
-- calls storage_homework_answer_student_id (plain path parsing) and
-- is_own_student (already security definer, already granted to
-- authenticated) - it never touches public.students directly itself.
create or replace function public.can_write_homework_answer(p_name text)
returns boolean
language sql
stable
set search_path = 'public'
as $$
  select public.storage_homework_answer_student_id(p_name) is not null
     and public.is_own_student(public.storage_homework_answer_student_id(p_name));
$$;

drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select
  using (
    bucket_id = 'attachments'
    and auth.uid() is not null
    and (
      is_admin()
      or is_teacher()
      -- Every folder except exam-answers/lesson-pdfs/exams/homework/
      -- homework-answers keeps the original bucket-wide "any signed-in
      -- user can read" rule - unchanged from 0036.
      or (
        (storage.foldername(name))[1] is distinct from 'exam-answers'
        and (storage.foldername(name))[1] is distinct from 'lesson-pdfs'
        and (storage.foldername(name))[1] is distinct from 'exams'
        and (storage.foldername(name))[1] is distinct from 'homework'
        and (storage.foldername(name))[1] is distinct from 'homework-answers'
      )
      -- exam-answers / lesson-pdfs / exams branches: verbatim from 0036,
      -- untouched.
      or public.is_own_exam_answer(name)
      or (
        public.storage_lesson_id(name) is not null
        and public.can_read_lesson_pdf(public.storage_lesson_id(name))
      )
      or public.can_read_exam_file(name)
      -- homework / homework-answers: new level- and ownership-scoped
      -- branches.
      or public.can_read_homework_file(name)
      or public.is_own_homework_answer(name)
    )
  );

drop policy if exists attachments_insert on storage.objects;
create policy attachments_insert on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and auth.uid() is not null
    and (
      case (storage.foldername(name))[1]
        when 'exams' then is_admin() or is_teacher()
        when 'certificate-template' then is_admin()
        when 'lesson-pdfs' then is_admin() or is_teacher()
        when 'exam-answers' then is_admin() or is_teacher() or public.can_write_exam_answer(name)
        when 'homework' then is_admin() or is_teacher()
        when 'homework-answers' then is_admin() or is_teacher() or public.can_write_homework_answer(name)
        else true
      end
    )
  );

drop policy if exists attachments_update on storage.objects;
create policy attachments_update on storage.objects for update
  using (
    bucket_id = 'attachments'
    and auth.uid() is not null
    and (
      case (storage.foldername(name))[1]
        when 'exams' then is_admin() or is_teacher()
        when 'certificate-template' then is_admin()
        when 'lesson-pdfs' then is_admin() or is_teacher()
        when 'exam-answers' then is_admin() or is_teacher() or public.can_write_exam_answer(name)
        when 'homework' then is_admin() or is_teacher()
        when 'homework-answers' then is_admin() or is_teacher() or public.can_write_homework_answer(name)
        else true
      end
    )
  );

-- attachments_delete_admin (admin-only delete, from 0009) is untouched.
