-- Phase 1 of the Exam Management rebuild: add an exam_type field so exams
-- can be categorized (Written/Oral/Vocabulary/Grammar/Reading/Listening/
-- Final/Mock) instead of being treated as a single undifferentiated list.
-- Oral exams are not a separate feature/table - they're just exams with
-- exam_type = 'Oral', graded and stored exactly like every other exam.
--
-- Nullable, default 'Written' so every existing row (and any insert that
-- doesn't set it, e.g. LessonHub.jsx's Quiz creation) keeps working
-- unchanged. Same "new column inherits existing grants, no RLS change
-- needed" reasoning as 0037/0051 - exams_read_all/exams_admin_all/
-- exams_teacher_all (0005) are row-level policies, not column-scoped.
alter table public.exams
  add column if not exists exam_type text
  check (exam_type in ('Written', 'Oral', 'Vocabulary', 'Grammar', 'Reading', 'Listening', 'Final', 'Mock'))
  default 'Written';

update public.exams set exam_type = 'Written' where exam_type is null;
