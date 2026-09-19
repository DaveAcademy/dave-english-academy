-- get_student_ranking_summary()'s week_points/month_points scalar
-- subqueries sum point_transactions by student_id + lesson_date only, with
-- no level filter - unlike this same function's week_rank/month_rank CTEs
-- (and get_group_leaderboard()'s week/month branches), which already join
-- on pt.level = v_level. A student who transfers levels would see a
-- weekly/monthly point total that silently includes points earned under
-- their old level. No production student is currently affected (already
-- verified this session: zero students have point_transactions rows
-- spanning more than one level), so this is a forward-safety fix, not a
-- correction of any currently-displayed number - same category of fix as
-- 0029's all_time correction.
--
-- lifetime_points is deliberately left as-is (still the true cross-level
-- students.points cache) - that was an explicit decision when 0029 was
-- written, not an oversight, and stays unchanged here.
--
-- Function-only migration: no table, trigger, or RLS policy is touched.

create or replace function public.get_student_ranking_summary(p_student_id bigint)
returns table(
  level text,
  lifetime_points numeric,
  week_points numeric,
  month_points numeric,
  level_rank_all_time integer,
  level_rank_week integer,
  level_rank_month integer
)
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
           ), 0) desc) as rnk
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id and pt.level = v_level
    where s.level = v_level and s.status = 'Active'
    group by s.id
  )
  select
    v_level,
    (select s.points from public.students s where s.id = p_student_id),
    (select coalesce(sum(points), 0) from public.point_transactions
       where student_id = p_student_id and level = v_level
         and lesson_date between v_week_start and v_week_end and not is_baseline),
    (select coalesce(sum(points), 0) from public.point_transactions
       where student_id = p_student_id and level = v_level
         and lesson_date between v_month_start and v_month_end and not is_baseline),
    (select rnk::integer from all_time_rank where id = p_student_id),
    (select rnk::integer from week_rank where id = p_student_id),
    (select rnk::integer from month_rank where id = p_student_id);
end;
$$;

revoke execute on function public.get_student_ranking_summary(bigint) from public;
grant execute on function public.get_student_ranking_summary(bigint) to authenticated;
