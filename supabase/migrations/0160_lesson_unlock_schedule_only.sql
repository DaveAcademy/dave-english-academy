-- Scheduled class locking: close the "completing lesson N auto-unlocks N+1"
-- loophole in the two curriculum-gating primitives.
--
-- ---------------------------------------------------------------------
-- Investigation summary (read before touching this again)
-- ---------------------------------------------------------------------
-- Unlock is currently computed two places, both already reused by every
-- consumer (lesson PDFs, student_lesson_progress writes via 0126, and all
-- three curriculum-gated games via 0145/0146):
--   * can_read_lesson_pdf(lesson_id)        -- storage RLS + write gate
--   * student_unlocked_lesson_number()      -- games' round generators
-- Both apply the SAME three-way OR to decide if curriculum lesson N is open:
--   (a) N <= 1                              -- lesson 1 always open
--   (b) N <= curriculum_progress.current_lesson_number   -- "schedule"
--   (c) the student completed lesson N-1    -- <- the loophole
-- and both are already AND-gated by a hard per-level ceiling
-- (curriculum_progress.max_available_lesson).
--
-- Schedule data investigation: there is no per-group recurring schedule
-- table (no meeting-day-of-week / group-start-date / session-count model
-- anywhere in the schema - grepped every migration). class_group /
-- class_session (0137) record real class MEETINGS after the fact for
-- point-awarding, but carry no forward-looking calendar and are not
-- curriculum-linked. The only thing that already plays the role of "the
-- group's actual class schedule" is curriculum_progress.current_lesson_number
-- itself: per its own migration 0093 comment, it is "the whole-class
-- coverage the teacher sets on the admin Lessons page (A is on lesson N)"
-- - i.e. a teacher/admin manually advances it to track where the real,
-- in-person class has actually reached. There is exactly one class_group
-- per level today (0137 seed), so level-scoped current_lesson_number IS
-- group-scoped in the current data model; nothing here hardcodes "all
-- groups meet on the same days" - each level already has its own
-- independently-set pace. Because this mechanism has no calendar dates,
-- there is no day-boundary/timezone math to get wrong here (Tashkent
-- UTC+5 is a non-issue for this migration - noted for the record since
-- the task spec calls it out, but there are no date comparisons in either
-- function below to convert).
--
-- Real-data proof this loophole was actually exploited (not theoretical):
-- before this migration, 6 real students had a 'completed' row in
-- student_lesson_progress for a curriculum lesson number ABOVE their
-- level's current_lesson_number - only reachable via clause (c) chaining
-- past the teacher's actual pace:
--   student 19 (B): completed up to lesson 40, pace was 35
--   student 30 (B): completed up to lesson 37, pace was 35
--   student 1  (C): completed up to lesson 50, pace was 45
-- These are left untouched (no data deleted/reversed - out of scope, and
-- "previously completed lessons remain accessible" is a hard requirement
-- of this task); only the unlock RULE changes going forward.
--
-- Fix: drop clause (c) from both functions. Unlock is now purely:
--   N <= max_available_lesson (level boundary, unchanged)
--   AND (N <= 1 OR N <= current_lesson_number (schedule pace, unchanged))
-- Completing a lesson still records progress/points as before (0126,
-- untouched) - it just no longer moves the unlock boundary itself.
-- Previously-unlocked-and-completed lessons stay unlocked because they
-- are by definition <= current_lesson_number already (a teacher would
-- not report progress the class is already past, and does not reverse
-- pace once advanced).
--
-- NOT changed by this migration, deliberately: curriculum_progress.
-- max_available_lesson values (currently A=20, A1=10, B=40, C=50 in
-- production) are NOT altered here even though a differently-worded
-- external spec for this task named different boundaries (A=1-10,
-- A1=1-5). Applying those literal numbers would retroactively lock
-- students out of already-taught, already-completed lessons (e.g. Level
-- A's pace is already at 14, past a 10-lesson cap) - a production
-- regression, not a bug fix. Flagged for Dave's explicit decision rather
-- than silently applied; see session report.
--
-- NOT touched, deliberately: student_available_vocabulary() (0112/0113)
-- has the same completion-chaining clause and is a separately-flagged,
-- pre-existing known issue ("vocabulary unlock bug suspected") - out of
-- scope for this task per the standing note to fix it in its own session.
-- Teacher/admin access is untouched: both functions only ever resolve a
-- caller who has a students row (self, via profile_id = auth.uid()); the
-- storage policy and every table RLS policy already grant teachers/admins
-- an unconditional OR-branch ahead of these functions (e.g. attachments_read,
-- 0033), so this change cannot affect teacher/admin lesson access.

create or replace function public.can_read_lesson_pdf(p_lesson_id bigint)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.lessons l
    join public.students s on s.profile_id = auth.uid()
    left join public.curriculum_lessons cl on cl.id = l.curriculum_lesson_id
    left join public.curriculum_progress cp on cp.level = s.level
    where l.id = p_lesson_id
      and (l.level is null or l.level = s.level)
      and (cl.lesson_number is null or cl.lesson_number <= coalesce(cp.max_available_lesson, 100000))
      and (
        cl.lesson_number is null
        or cl.lesson_number <= 1
        or cl.lesson_number <= coalesce(cp.current_lesson_number, 0)
      )
  );
$$;

revoke execute on function public.can_read_lesson_pdf(bigint) from public;
grant execute on function public.can_read_lesson_pdf(bigint) to authenticated;

create or replace function public.student_unlocked_lesson_number()
returns integer
language sql
stable
security definer
set search_path = 'public'
as $$
  with me as (
    select s.id as student_id, s.level from public.students s where s.profile_id = auth.uid()
  ),
  cp as (
    select * from public.curriculum_progress cp, me where cp.level = me.level
  ),
  unlocked_lessons as (
    select cl.lesson_number
    from public.curriculum_lessons cl
    left join cp on true
    where cl.lesson_number <= coalesce(cp.max_available_lesson, 100000)
      and (
        cl.lesson_number <= 1
        or cl.lesson_number <= coalesce(cp.current_lesson_number, 0)
      )
  )
  select coalesce(max(lesson_number), 0) from unlocked_lessons;
$$;

revoke execute on function public.student_unlocked_lesson_number() from public;
grant execute on function public.student_unlocked_lesson_number() to authenticated;
