-- Inactive students could still write through RLS because the write
-- policies below all gate on is_own_student(), which only checks
-- profile_id = auth.uid() and never students.status. A student changed
-- to Inactive kept full write access (submit homework/exam answers,
-- lesson progress, lesson-work submissions, vocabulary favorites) via
-- direct Supabase calls, even though the frontend now blocks the portal.
--
-- Fix: add is_own_active_student(), identical to is_own_student() plus
-- s.status = 'Active', and swap it into every WRITE (INSERT/UPDATE/DELETE)
-- policy that currently uses is_own_student(). All SELECT/read policies on
-- is_own_student() are left untouched deliberately - students (active or
-- inactive) must still be able to read their own historical data, and the
-- inactive-only students_self_read policy is how the frontend recognizes
-- "this is my account, and it's inactive" in the first place.
--
-- Status changes take effect immediately with no session invalidation
-- needed: is_own_active_student() re-queries students on every request
-- (STABLE, not session-cached), exactly like is_own_student() already did.

create or replace function public.is_own_active_student(p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id and s.profile_id = auth.uid() and s.status = 'Active'
  );
$$;

alter policy exam_scores_student_submit on public.exam_scores
  with check (is_own_active_student(student_id) and score is null and feedback is null);

alter policy exam_scores_student_update_own on public.exam_scores
  using (is_own_active_student(student_id) and score is null)
  with check (is_own_active_student(student_id) and score is null and feedback is null);

alter policy homework_status_student_submit on public.homework_status
  with check (is_own_active_student(student_id) and status = any (array['Assigned','Submitted']) and score is null and feedback is null);

alter policy homework_status_student_update_own on public.homework_status
  using (is_own_active_student(student_id) and status <> 'Graded')
  with check (is_own_active_student(student_id) and status = any (array['Assigned','Submitted']) and score is null and feedback is null);

alter policy homework_submission_files_student_delete on public.homework_submission_files
  using (
    is_own_active_student(student_id)
    and not exists (
      select 1 from public.homework_status hs
      where hs.homework_id = homework_submission_files.homework_id
        and hs.student_id = homework_submission_files.student_id
        and hs.score is not null
    )
  );

alter policy lesson_work_submission_files_student_delete on public.lesson_work_submission_files
  using (
    is_own_active_student(student_id)
    and exists (
      select 1 from public.lesson_work_submissions s
      where s.id = lesson_work_submission_files.submission_id and s.status = 'submitted'
    )
  );

alter policy lesson_work_submissions_student_insert on public.lesson_work_submissions
  with check (is_own_active_student(student_id) and status = 'submitted');

alter policy student_lesson_progress_self_insert on public.student_lesson_progress
  with check (is_own_active_student(student_id));

alter policy student_lesson_progress_self_update on public.student_lesson_progress
  using (is_own_active_student(student_id))
  with check (is_own_active_student(student_id));

alter policy student_lesson_progress_self_delete on public.student_lesson_progress
  using (is_own_active_student(student_id));

alter policy student_vocabulary_favorites_self_insert on public.student_vocabulary_favorites
  with check (is_own_active_student(student_id));

alter policy student_vocabulary_favorites_self_delete on public.student_vocabulary_favorites
  using (is_own_active_student(student_id));
