-- curriculum_progress: the teacher's per-level pace ("how far the class has
-- reached") for Lesson Hub V2.
--
-- One row per level (A/B/C). current_lesson_number is the whole-class
-- coverage the teacher sets on the admin Lessons page ("A is on lesson N").
-- It is the storage-RLS floor in can_read_lesson_pdf() (see 0094): a student
-- may open any lesson up to this number, then one more per lesson they have
-- completed. Setting it to 100 unlocks every released lesson.
--
-- This table was created ad hoc in production (dashboard SQL editor) and
-- never had a migration, so a fresh deployment could not build it - and
-- 0094 (renumbered from 0093) defines can_read_lesson_pdf() with a LANGUAGE
-- sql body that validates its relations at creation time, so that migration
-- CANNOT run before this table exists. This migration therefore must run
-- before 0094; that is why it is numbered 0093 and the student-progress
-- migration follows as 0094.
--
-- Seeded to match production exactly (2026-08-07): all three levels at 100,
-- i.e. every one of the 100 released curriculum lessons is open to
-- students. This is the sensible default for the full 100-lesson
-- curriculum; lower it per level to pace a class more tightly. New rows
-- default to current_lesson_number = 0 (nothing released yet).
--
-- Grants mirror the live table, which was created via the dashboard and so
-- carries its default everything-to-everyone grants. RLS is the real
-- boundary: the SELECT policy is open (true), writes are admin/teacher only
-- (UPDATE policy). There are deliberately no INSERT/DELETE policies, so
-- those operations are denied for every non-owner role regardless of the
-- grants.

create table if not exists public.curriculum_progress (
  level text not null primary key,
  current_lesson_number integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

alter table public.curriculum_progress enable row level security;

drop policy if exists curriculum_progress_read on public.curriculum_progress;
create policy curriculum_progress_read on public.curriculum_progress for select
  using (true);

drop policy if exists curriculum_progress_update on public.curriculum_progress;
create policy curriculum_progress_update on public.curriculum_progress for update
  using (is_admin() or is_teacher())
  with check (is_admin() or is_teacher());

grant all on table public.curriculum_progress to anon, authenticated, service_role;

insert into public.curriculum_progress (level, current_lesson_number, updated_at)
values
  ('A', 100, now()),
  ('B', 100, now()),
  ('C', 100, now())
on conflict (level) do nothing;
