-- attachments_insert's CASE only special-cases a handful of folders
-- (exams, certificate-template, lesson-pdfs, vocabulary-images, lesson-work);
-- everything else - including exam-answers/<studentId>/... and
-- homework-answers/<studentId>/... (used by MyExams.jsx, MyHomework.jsx, and
-- LessonHub.jsx's student-facing upload paths) - fell through to
-- `ELSE true`, gated only by `auth.uid() IS NOT NULL`. Any authenticated
-- user, active or inactive, of any level, could upload into ANY student's
-- exam-answers/homework-answers folder. Found auditing the inactive-student
-- access-control work; the row-level fix (migration 0123) blocks attaching
-- such a file to a real exam_scores/homework_status row, but the file
-- itself still landed in storage unguarded.
--
-- Fix: two new folder-parsing helpers (same IMMUTABLE pattern as the
-- existing storage_lesson_id/storage_lesson_work_student_id), and two new
-- CASE branches requiring the uploader to be the file's own *active*
-- student. ELSE true is left as-is for every other folder (library/,
-- certificate uploads via other branches, etc.) - unrelated to student
-- identity and out of this fix's scope.
--
-- Also fixes can_access_lesson_work_file(), which gates the existing
-- 'lesson-work' branch: it still called is_own_student() rather than
-- is_own_active_student(), so lesson-work submission files had the same
-- inactive-student write gap migration 0123 closed for the
-- lesson_work_submission_files table itself. Same fix, same day, missed
-- there only because it's a named helper rather than an inline check.

create or replace function public.storage_exam_answer_student_id(p_name text)
returns bigint
language sql
immutable
set search_path = 'public'
as $$
  select case
    when (storage.foldername(p_name))[1] = 'exam-answers'
     and (storage.foldername(p_name))[2] ~ '^[0-9]+$'
    then ((storage.foldername(p_name))[2])::bigint
    else null
  end;
$$;

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

create or replace function public.can_access_lesson_work_file(p_name text)
returns boolean
language sql
stable
set search_path = 'public'
as $$
  select public.storage_lesson_work_student_id(p_name) is not null
     and public.is_own_active_student(public.storage_lesson_work_student_id(p_name));
$$;

alter policy attachments_insert on storage.objects
  with check (
    (bucket_id = 'attachments') and (auth.uid() is not null) and
    case (storage.foldername(name))[1]
      when 'exams' then (is_admin() or is_teacher())
      when 'certificate-template' then is_admin()
      when 'lesson-pdfs' then (is_admin() or is_teacher())
      when 'vocabulary-images' then (is_admin() or is_teacher())
      when 'lesson-work' then (is_admin() or is_teacher() or can_access_lesson_work_file(name))
      when 'exam-answers' then (
        is_admin() or is_teacher()
        or (storage_exam_answer_student_id(name) is not null
            and is_own_active_student(storage_exam_answer_student_id(name)))
      )
      when 'homework-answers' then (
        is_admin() or is_teacher()
        or (storage_homework_answer_student_id(name) is not null
            and is_own_active_student(storage_homework_answer_student_id(name)))
      )
      else true
    end
  );
