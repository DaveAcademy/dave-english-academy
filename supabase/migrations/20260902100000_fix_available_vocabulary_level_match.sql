-- Fix: student_available_vocabulary() (0112) always returned zero rows in
-- production, which made both Word Scramble and Vocabulary Quiz appear to
-- "not start" - the round RPCs succeeded but always returned an empty
-- result, so the frontend correctly rendered its empty-vocabulary state,
-- which real students/testers experienced as "the game doesn't load".
--
-- Root cause: lessons.level is NULL for every row in production today (a
-- pre-existing data gap, not something this migration attempts to fix -
-- that's a separate curriculum-data question). 0112's unlocked_lessons CTE
-- joined `lessons l ... join me on l.level = me.level` - a strict equality
-- that can never match a null column, so unlocked_lessons was always
-- empty for every student regardless of level, excluding all vocabulary.
--
-- Every other place in this codebase that gates lesson-scoped content by
-- level already tolerates a null lessons.level as "visible regardless of
-- level" - see (l.level is null or l.level = s.level) in 0009, 0032, 0033,
-- 0044, 0045, and can_read_lesson_vocabulary (0048/0049) itself. This
-- migration brings student_available_vocabulary() in line with that same,
-- already-established precedent instead of inventing stricter behavior -
-- it is not "making every word available to hide the bug", it is matching
-- the level-gating rule every other student-facing lesson/vocabulary read
-- in this app already uses. The lesson_number-based pace/cap gating from
-- curriculum_progress (max_available_lesson, current_lesson_number,
-- previous-lesson-completed) is untouched and remains the real
-- progression control.
create or replace function public.student_available_vocabulary()
returns table (id uuid, english text, uzbek text, lesson_number integer)
language sql
stable
security definer
set search_path = 'public'
as $$
  with me as (
    select s.id as student_id, s.level from public.students s where s.profile_id = auth.uid()
  ),
  cp as (
    select cp.* from public.curriculum_progress cp, me where cp.level = me.level
  ),
  unlocked_lessons as (
    select l.id as lesson_id, cl.lesson_number
    from public.lessons l
    join public.curriculum_lessons cl on cl.id = l.curriculum_lesson_id
    join me on (l.level is null or l.level = me.level)
    left join cp on true
    where cl.lesson_number <= coalesce(cp.max_available_lesson, 100000)
      and (
        cl.lesson_number <= 1
        or cl.lesson_number <= coalesce(cp.current_lesson_number, 0)
        or exists (
          select 1
          from public.lessons l2
          join public.curriculum_lessons cl2 on cl2.id = l2.curriculum_lesson_id
          join public.student_lesson_progress slp
            on slp.lesson_id = l2.id and slp.student_id = me.student_id and slp.status = 'completed'
          where (l2.level is null or l2.level = l.level) and cl2.lesson_number = cl.lesson_number - 1
        )
      )
    union all
    select l.id, null::integer
    from public.lessons l
    join me on (l.level is null or l.level = me.level)
    where l.curriculum_lesson_id is null
  )
  select v.id, v.english, v.uzbek, ul.lesson_number
  from public.lesson_vocabulary v
  join unlocked_lessons ul on ul.lesson_id = v.lesson_id
  where v.is_active;
$$;

revoke execute on function public.student_available_vocabulary() from public;
grant execute on function public.student_available_vocabulary() to authenticated;
