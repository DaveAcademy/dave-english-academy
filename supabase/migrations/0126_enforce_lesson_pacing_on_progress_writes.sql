-- Close the gap where a student could insert/update student_lesson_progress
-- (including marking a lesson "completed") for a lesson they have not yet
-- unlocked, by reusing the same unlock logic already trusted in production
-- to gate PDF access (can_read_lesson_pdf). Tightens existing self
-- insert/update policies only; admin/teacher ALL policies, SELECT, and
-- DELETE policies are untouched. No data is modified.

drop policy if exists student_lesson_progress_self_insert on public.student_lesson_progress;
create policy student_lesson_progress_self_insert
  on public.student_lesson_progress
  for insert
  with check (
    is_own_active_student(student_id)
    and can_read_lesson_pdf(lesson_id)
  );

drop policy if exists student_lesson_progress_self_update on public.student_lesson_progress;
create policy student_lesson_progress_self_update
  on public.student_lesson_progress
  for update
  using (is_own_active_student(student_id))
  with check (
    is_own_active_student(student_id)
    and can_read_lesson_pdf(lesson_id)
  );
