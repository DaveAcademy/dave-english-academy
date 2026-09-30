-- Raise Level A's permanent curriculum ceiling (max_available_lesson) from
-- 15 to 20, per Dave's target boundaries (2026-08-28): Level A unlocks
-- Lessons 1-20.
--
-- Lesson unlocking is controlled by curriculum_progress:
--   * max_available_lesson  = hard per-level ceiling (server RLS via
--     can_read_lesson_pdf(), games via student_unlocked_lesson_number(),
--     client UI via lessonCapFor() in src/lib/lessonLogic.js)
--   * current_lesson_number = teacher's day-to-day schedule pace (AND gate)
-- Both gates must pass; effective unlock = min(cap, pace), with lesson 1
-- always open.
--
-- Verified previous production state (before this migration):
--   A1: cap 10, pace 10  -> unlocks 1-10  (matches target)
--   A : cap 15, pace 20  -> unlocks 1-15  (target is 1-20 -> this change)
--   B : cap 40, pace 41  -> unlocks 1-40  (matches target)
--   C : cap 50, pace 51  -> unlocks 1-50  (matches target)
--
-- Safety: raising a ceiling only ever ADDS access (previously-unlocked
-- 1-15 stays unlocked; permanently), and never auto-unlocks beyond 20.
-- No lesson content, student progress, points, or schedule pace is touched.
--
-- Idempotent: only updates Level A when its cap is not already 20.

update public.curriculum_progress
set max_available_lesson = 20
where level = 'A'
  and max_available_lesson is distinct from 20;
