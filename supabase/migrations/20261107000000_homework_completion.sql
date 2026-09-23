-- 20261107000000_homework_completion.sql
-- Student dashboard "homework completed" count, derived server-side from
-- the authoritative completion states. No schema changes, no writes, no
-- points, no grading changes.
--
-- A homework assignment counts as completed for the student when EITHER:
-- (a) every visible stage is completed: a stage is visible when it has at
--     least one question or is required (coalesce(is_required, true)),
--     mirroring the student UI's own completion rule, and completed means
--     a homework_stage_progress row with status = 'completed' (written
--     only by the existing check_homework_stage_progress() path); the
--     homework must have at least one visible stage; OR
-- (b) the manual/photo flow recorded status Submitted/Graded on
--     homework_status (the pre-existing authoritative state for that
--     flow; preserves its dashboard behavior exactly).
-- Union is by homework_id, so duplicate submissions, multiple answers,
-- and per-question rows can never double-count an assignment. Opened,
-- started, locked, or abandoned work (no completed stages, no status
-- row) is never counted.
--
-- Read-only SECURITY DEFINER function; the student is resolved from
-- auth.uid() (no student_id parameter), RLS on underlying tables is
-- untouched, and nothing is written.

create or replace function public.get_my_homework_completion()
returns table (
  homework_id bigint,
  stages_total integer,
  stages_completed integer,
  completed boolean
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_level text;
begin
  select s.id, s.level into v_student_id, v_level
  from public.students s
  where s.profile_id = auth.uid();

  if v_student_id is null then
    return;
  end if;

  return query
  with vs as (
    select
      s.homework_id,
      s.id as stage_id,
      ((select count(*) from public.homework_questions q where q.stage_id = s.id) > 0
       or coalesce(s.is_required, true) <> false) as visible
    from public.homework_stages s
  ),
  agg as (
    select
      vs.homework_id,
      count(*) filter (where vs.visible)::int as stages_total,
      count(*) filter (where vs.visible and coalesce((
        select p.status from public.homework_stage_progress p
        where p.homework_id = vs.homework_id
          and p.student_id = v_student_id
          and p.stage_id = vs.stage_id
      ), '') = 'completed')::int as stages_completed
    from vs
    group by vs.homework_id
  )
  select
    h.id as homework_id,
    coalesce(a.stages_total, 0) as stages_total,
    coalesce(a.stages_completed, 0) as stages_completed,
    (
      (coalesce(a.stages_total, 0) > 0 and coalesce(a.stages_completed, 0) = a.stages_total)
      or exists (
        select 1 from public.homework_status hs
        where hs.homework_id = h.id
          and hs.student_id = v_student_id
          and hs.status in ('Submitted', 'Graded')
      )
    ) as completed
  from public.homework h
  left join agg a on a.homework_id = h.id
  where (h.level is null or h.level = v_level);
end;
$$;

revoke execute on function public.get_my_homework_completion() from anon;
revoke execute on function public.get_my_homework_completion() from public;
grant execute on function public.get_my_homework_completion() to authenticated;
