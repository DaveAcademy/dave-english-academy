-- Lesson Hub: scope a "Quiz" card to the exams belonging to a lesson.
-- Mirrors homework.lesson_id exactly (see 0041_homework_submission_files_
-- and_lesson_link.sql) - nullable, on delete set null, so an exam detached
-- from a deleted lesson stays valid as a standalone exam. No RLS change
-- needed: exams RLS is keyed on level/ownership, not lesson_id.
alter table public.exams add column if not exists lesson_id bigint references public.lessons(id) on delete set null;
