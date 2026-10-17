-- curriculum_progress.max_available_lesson: a hard, per-level ceiling on how
-- far a class can advance in the released curriculum, independent of the
-- teacher's pace.
--
-- A student can never open a lesson whose curriculum number exceeds this cap
-- for their level (A: 20, B: 40, C: 50), no matter what current_lesson_number
-- says or how many lessons they have completed. This is the server-side half of
-- the lock described in src/lib/lessonLogic.js (lessonCapFor) - the storage RLS
-- policy on lesson-pdfs reads this same column through can_read_lesson_pdf().
-- Admins/teachers are exempt inside the storage policy (is_admin()/is_teacher()),
-- so the cap only ever constrains students.
--
-- The UPDATE leaves any non-null value untouched, so this migration can be
-- re-run safely and an operator can raise/lower a cap later via SQL.

alter table public.curriculum_progress
  add column if not exists max_available_lesson integer;

update public.curriculum_progress set max_available_lesson = 20 where level = 'A' and max_available_lesson is null;
update public.curriculum_progress set max_available_lesson = 40 where level = 'B' and max_available_lesson is null;
update public.curriculum_progress set max_available_lesson = 50 where level = 'C' and max_available_lesson is null;

-- ---------- can_read_lesson_pdf: add the per-level ceiling ----------
--
-- The ceiling is an AND gate over every other unlock rule: legacy lessons
-- (no curriculum link) keep the level-only gate, and curriculum lessons must
-- satisfy both the old OR-group and number <= the level's cap. A missing
-- cap (coalesce to 100000) keeps the pre-migration behaviour.
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
        or exists (
          select 1
          from public.student_lesson_progress slp
          join public.lessons prev on prev.id = slp.lesson_id
          join public.curriculum_lessons pcl on pcl.id = prev.curriculum_lesson_id
          where slp.student_id = s.id
            and slp.status = 'completed'
            and pcl.lesson_number = cl.lesson_number - 1
        )
      )
  );
$$;

revoke execute on function public.can_read_lesson_pdf(bigint) from public;
grant execute on function public.can_read_lesson_pdf(bigint) to authenticated;