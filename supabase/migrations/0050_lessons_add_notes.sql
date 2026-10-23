-- Lesson Hub: teacher-written notes/summary for a lesson, shown alongside
-- PDF/Homework/Vocabulary/Quiz on the single-page Lesson Hub view.
-- No RLS change needed - lessons_read_all (0005) already allows any
-- authenticated user to read every lesson column, and lessons_teacher_all/
-- lessons_admin_all (0005) already allow teacher/admin writes.
alter table public.lessons add column if not exists notes text;
