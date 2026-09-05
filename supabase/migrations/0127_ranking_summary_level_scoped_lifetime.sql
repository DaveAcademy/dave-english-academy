-- get_student_ranking_summary() (0023) returned lifetime_points = s.points,
-- the student's global students.points cache (cumulative across every
-- level they've ever been in), while level_rank_all_time in the same row
-- was already computed from a pt.level = v_level -filtered CTE (points
-- earned at their CURRENT level only). point_transactions.level is an
-- immutable snapshot set at insert time (0019) and is never rewritten on
-- promotion, so for any student who has changed levels these two numbers
-- diverge - confirmed against real production data: 5 currently-active
-- promoted students, diffs from 52 up to 833 points (e.g. a student whose
-- students.points cache reads 805 but whose current-level ledger total is
-- only 365).
--
-- This matters because MyRanking.jsx renders both on the same page: the
-- "Total Points" summary tile shows lifetime_points, and the leaderboard
-- row directly below it (from get_group_leaderboard(), same v_level
-- population) shows the current-level total - so a promoted student sees
-- two different point counts on one screen. The other two summary tiles
-- on that same card (week_points, month_points) were ALREADY level-scoped
-- (pt.level = v_level) - lifetime_points was the only one of the three
-- reading from a different, unscoped source. Fix: compute lifetime_points
-- the same way as level_rank_all_time - sum of this student's own
-- point_transactions where level = their current level, with no date
-- filter (i.e. all-time within the current level, matching the
-- all_time_rank CTE's population exactly). This makes all three summary
-- numbers and the rank below them consistent with the single stated
-- population: "this student, at their current level". No column rename -
-- the displayed label is the generic "Total Points" (portal:totalPointsLabel),
-- not "Lifetime", so it reads correctly under either definition; only the
-- underlying value changes to match its neighbors.
--
-- students.points itself is untouched - still the correct global
-- lifetime cache, still what point_transactions_refresh_cache maintains,
-- still what a student's own real total is. This only changes what one
-- ranking-summary RPC surfaces for its "Total Points" tile.

create or replace function public.get_student_ranking_summary(p_student_id bigint)
returns table(level text, lifetime_points numeric, week_points numeric, month_points numeric, level_rank_all_time integer, level_rank_week integer, level_rank_month integer)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_level text;
  v_week_start date;
  v_week_end date;
  v_month_start date;
  v_month_end date;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  select s.level into v_level from public.students s where s.id = p_student_id;
  if v_level is null then
    raise exception 'Student not found.';
  end if;

  if not (
    is_admin()
    or (is_teacher() and exists (
      select 1 from public.teacher_group_assignments tga
      where tga.teacher_id = auth.uid() and tga.level = v_level
    ))
    or exists (select 1 from public.students s where s.id = p_student_id and s.profile_id = auth.uid())
  ) then
    raise exception 'Not authorized to view this student.';
  end if;

  select wb.period_start, wb.period_end into v_week_start, v_week_end
    from public.week_bounds((now() at time zone 'Asia/Tashkent')::date) wb;
  select mb.period_start, mb.period_end into v_month_start, v_month_end
    from public.month_bounds((now() at time zone 'Asia/Tashkent')::date) mb;

  return query
  with all_time_rank as (
    select s.id,
           rank() over (order by coalesce(sum(pt.points), 0) desc) as rnk
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id and pt.level = v_level
    where s.level = v_level and s.status = 'Active'
    group by s.id
  ),
  week_rank as (
    select s.id,
           rank() over (order by coalesce(sum(pt.points) filter (
             where pt.lesson_date between v_week_start and v_week_end and not pt.is_baseline
           ), 0) desc) as rnk
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id and pt.level = v_level
    where s.level = v_level and s.status = 'Active'
    group by s.id
  ),
  month_rank as (
    select s.id,
           rank() over (order by coalesce(sum(pt.points) filter (
             where pt.lesson_date between v_month_start and v_month_end and not pt.is_baseline
               and pt.category_key = 'bonus'
           ), 0) desc) as rnk
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id and pt.level = v_level
    where s.level = v_level and s.status = 'Active'
    group by s.id
  )
  select
    v_level,
    (select coalesce(sum(pt.points), 0) from public.point_transactions pt
       where pt.student_id = p_student_id and pt.level = v_level),
    (select coalesce(sum(pt.points), 0) from public.point_transactions pt
       where pt.student_id = p_student_id and pt.level = v_level
         and pt.lesson_date between v_week_start and v_week_end and not pt.is_baseline),
    (select coalesce(sum(pt.points), 0) from public.point_transactions pt
       where pt.student_id = p_student_id and pt.level = v_level
         and pt.lesson_date between v_month_start and v_month_end and not pt.is_baseline
         and pt.category_key = 'bonus'),
    (select rnk::integer from all_time_rank where id = p_student_id),
    (select rnk::integer from week_rank where id = p_student_id),
    (select rnk::integer from month_rank where id = p_student_id);
end;
$$;
