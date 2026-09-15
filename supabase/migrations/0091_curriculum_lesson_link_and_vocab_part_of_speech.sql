-- Connects the master curriculum_lessons plan (0089/0090) to the existing
-- teaching-instance lessons table, and extends the existing
-- lesson_vocabulary table (see 20260727160227_lesson_vocabulary) rather
-- than creating a second vocabulary system.
--
-- No filename/PDF-name column added here deliberately: a vocabulary row's
-- source PDF is already derivable via lesson_vocabulary.lesson_id ->
-- lessons.pdf_name, so storing it again would just be a second place for
-- that fact to drift out of sync (same reasoning already applied to
-- points/attendance elsewhere in this schema).

alter table public.lessons
  add column if not exists curriculum_lesson_id bigint references public.curriculum_lessons(id) on delete set null;

alter table public.lesson_vocabulary
  add column if not exists part_of_speech text;
