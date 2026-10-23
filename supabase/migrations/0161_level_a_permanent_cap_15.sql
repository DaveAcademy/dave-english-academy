-- Lower Level A's permanent curriculum ceiling (max_available_lesson) from
-- 20 to 15, per Dave's target boundaries (2026-08-18). Level A1 (10), B (40),
-- and C (50) targets already match production exactly - no change needed
-- there.
--
-- Safety check performed before this migration (read-only, see session
-- report): no active Level A student has ever completed a lesson number
-- above 14, and the level's current teacher-set pace
-- (curriculum_progress.current_lesson_number) is 14. Lowering the ceiling
-- to 15 does not invalidate any legitimately-reached student progress.
-- Lessons 16-20 (previously inside the old cap) are unused headroom - no
-- group has ever been paced or completed into that range.
--
-- This does not touch current_lesson_number (schedule pace) - the two
-- fields are independent gates (see 0095/0160): max_available_lesson is
-- the permanent ceiling, current_lesson_number is the day-to-day teacher
-- pace, and can_read_lesson_pdf()/student_unlocked_lesson_number() require
-- both to pass (AND).

update public.curriculum_progress
set max_available_lesson = 15
where level = 'A';
