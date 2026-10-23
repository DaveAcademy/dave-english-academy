-- Fix student_unlocked_lesson_number() (0145): it joined lessons l on
-- l.level = me.level to restrict curriculum_lessons rows to the student's
-- level, but lessons.level is NULL on all 100 curriculum-linked rows in
-- production (confirmed via direct query: 100 rows have curriculum_lesson_id
-- set, 0 have level set). That join can never match, so the function always
-- returned 0 for every student regardless of level or progress - which in
-- turn made every min_lesson_number <= 0 filter in 0145's three round
-- generators match zero rows. Sentence Scramble, Word Detective, and
-- Grammar Battle returned empty rounds for all 35 active students from the
-- moment 0145 was applied until this migration.
--
-- Root cause: curriculum_lessons has no level column at all - it's a single
-- shared lesson_number 1-100 sequence used by every level. Per-level gating
-- comes entirely from curriculum_progress (current_lesson_number /
-- max_available_lesson), which is already keyed by level via the `me`/`cp`
-- CTEs. The lessons/level join was never load-bearing for level-scoping;
-- it was just broken. This migration drops it: iterate curriculum_lessons
-- directly (no lessons join needed for the base set), and for the
-- "previous lesson completed" clause, resolve the previous curriculum_lesson
-- row's lesson_number to its lessons.id via curriculum_lesson_id (1:1 in
-- this schema) and check student_lesson_progress against that - no level
-- filter needed since curriculum_lessons is already level-agnostic.
--
-- Scope: only student_unlocked_lesson_number() (0145, new, not yet used in
-- production by anything except the three round generators this session
-- deployed). student_available_vocabulary() (0112) has the identical
-- lessons.level join and is very likely affected the same way, but it
-- predates and is unrelated to this session's game-content work - flagged,
-- not touched here.
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
        or exists (
          select 1
          from public.curriculum_lessons cl2
          join public.lessons l2 on l2.curriculum_lesson_id = cl2.id
          join public.student_lesson_progress slp
            on slp.lesson_id = l2.id
            and slp.student_id = (select student_id from me)
            and slp.status = 'completed'
          where cl2.lesson_number = cl.lesson_number - 1
        )
      )
  )
  select coalesce(max(lesson_number), 0) from unlocked_lessons;
$$;
