-- 2026-08-08: accept the A1 group in get_group_leaderboard().
--
-- A1 was introduced as a real, active level (migration 0096 updated the
-- point_transactions level CHECK and seeded curriculum_progress), and the
-- UI surfaces now offer A1 as a filter everywhere. The ranking RPC,
-- however, still hard-whitelisted only ('A','B','C'), so an A1 student's
-- MyRanking board (getGroupLeaderboard(me.level, ...)) threw "Invalid
-- level: A1" and rendered empty, and any admin "Rankings A1" tab errored
-- the same way.
--
-- This re-creates the function with exactly one change: 'A1' added to the
-- level whitelist. The rest of the body (period bounds, point-transaction
-- sums, rank_change, attendance_rate, is_baseline handling) is unchanged.
-- Re-running is safe: CREATE OR REPLACE is idempotent.

create or replace function public.get_group_leaderboard(p_level text, p_period_type text, p_period_start date default null::date)
 returns table(student_id bigint, real_name text, points numeric, rank integer, prev_points numeric, prev_rank integer, rank_change integer, attendance_rate numeric)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_start date;
  v_end date;
  v_prev_start date;
  v_prev_end date;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;
  if p_level not in ('A', 'A1', 'B', 'C') then
    raise exception 'Invalid level: %', p_level;
  end if;

  if p_period_type = 'all_time' then
    return query
    with lifetime_totals as (
      select s.id as sid, s.real_name as rname,
             coalesce(sum(pt.points), 0) as pts
      from public.students s
      left join public.point_transactions pt on pt.student_id = s.id and pt.level = p_level
      where s.level = p_level and s.status = 'Active'
      group by s.id, s.real_name
    ),
    lifetime_attendance as (
      select a.student_id as sid,
             round(100.0 * count(*) filter (where a.status in ('Present', 'Late')) / nullif(count(*), 0), 1) as rate
      from public.attendance a
      join public.students s on s.id = a.student_id
      where s.level = p_level
      group by a.student_id
    ),
    lt_ranked as (
      select sid, rname, pts, rank() over (order by pts desc) as rnk from lifetime_totals
    )
    select lt.sid, lt.rname, lt.pts, lt.rnk::integer,
           null::numeric, null::integer, null::integer,
           la.rate
    from lt_ranked lt
    left join lifetime_attendance la on la.sid = lt.sid
    order by lt.rnk;
    return;
  end if;

  if p_period_type = 'week' then
    select wb.period_start, wb.period_end into v_start, v_end
      from public.week_bounds(coalesce(p_period_start, (now() at time zone 'Asia/Tashkent')::date)) wb;
    select wb.period_start, wb.period_end into v_prev_start, v_prev_end
      from public.week_bounds(v_start - 7) wb;
  elsif p_period_type = 'month' then
    select mb.period_start, mb.period_end into v_start, v_end
      from public.month_bounds(coalesce(p_period_start, (now() at time zone 'Asia/Tashkent')::date)) mb;
    select mb.period_start, mb.period_end into v_prev_start, v_prev_end
      from public.month_bounds((v_start - interval '1 day')::date) mb;
  else
    raise exception 'Invalid period type: %', p_period_type;
  end if;

  return query
  with current_totals as (
    select s.id as sid, s.real_name as rname,
           coalesce(sum(pt.points) filter (
             where pt.lesson_date between v_start and v_end and not pt.is_baseline
           ), 0) as pts
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id and pt.level = p_level
    where s.level = p_level and s.status = 'Active'
    group by s.id, s.real_name
  ),
  prev_totals as (
    select s.id as sid,
           coalesce(sum(pt.points) filter (
             where pt.lesson_date between v_prev_start and v_prev_end and not pt.is_baseline
           ), 0) as pts
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id and pt.level = p_level
    where s.level = p_level and s.status = 'Active'
    group by s.id
  ),
  attendance_rates as (
    select a.student_id as sid,
           round(100.0 * count(*) filter (where a.status in ('Present', 'Late')) / nullif(count(*), 0), 1) as rate
    from public.attendance a
    join public.students s on s.id = a.student_id
    where s.level = p_level and a.date between v_start and v_end
    group by a.student_id
  ),
  cur_ranked as (
    select sid, rname, pts, rank() over (order by pts desc) as rnk from current_totals
  ),
  prev_ranked as (
    select sid, pts, rank() over (order by pts desc) as rnk from prev_totals
  )
  select c.sid, c.rname, c.pts, c.rnk::integer,
         p.pts, p.rnk::integer,
         (p.rnk - c.rnk)::integer,
         ar.rate
  from cur_ranked c
  left join prev_ranked p on p.sid = c.sid
  left join attendance_rates ar on ar.sid = c.sid
  order by c.rnk;
end;
$function$;