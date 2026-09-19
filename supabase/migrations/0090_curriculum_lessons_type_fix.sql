-- Revises curriculum_lessons.lesson_type per 0089: exams stay a single
-- curriculum lesson row (e.g. "Lesson 10: Month 1 Test", type 'test')
-- rather than separate writing_exam/oral_exam rows - writing/oral are exam
-- *components*, handled later by the exams table's own type, not by
-- inventing extra curriculum lesson numbers. This keeps the roadmap at
-- exactly 120 rows instead of 140+.
alter table public.curriculum_lessons drop constraint curriculum_lessons_lesson_type_check;
alter table public.curriculum_lessons add constraint curriculum_lessons_lesson_type_check
  check (lesson_type in ('normal', 'review', 'test', 'activity', 'final_exam'));
