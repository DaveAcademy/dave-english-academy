-- Ranking Model V3, Defect B: get_class_leaderboard/get_weekly_class_leaderboard/
-- get_monthly_class_leaderboard (migration 0139) currently sum every
-- point_transactions row attached to a class_session_id, regardless of
-- category_key. That means a Bonus/Penalty (or any other category) recorded
-- while a session happens to be open inflates the Class/Weekly/Monthly
-- Class Score totals -- reproduced live: A1 student Alijon received a +3
-- Bonus with no Class Score recorded, and the Weekly Total showed 3 instead
-- of "--".
--
-- Final ranking model (confirmed): the only thing that may contribute to
-- Class/Weekly/Monthly ranking totals is a category_key = 'class_score' row.
-- Bonus/penalty/achievement/exam/baseline/homework/prep transactions are
-- untouched (no delete, no reversal) -- they simply stop being summed by
-- these three read-only RPCs. Every other clause (level scoping, Active-only
-- roster, week_bounds/month_bounds, rank() tie handling, grant/revoke) is
-- unchanged from 0139.

create or replace function public.get_class_leaderboard(p_class_session_id bigint)
returns table(
  student_id bigint,
  real_name text,
  points numeric,
  rank integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_level text;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  select cg.level into v_level
  from public.class_session cs
  join public.class_group cg on cg.id = cs.class_group_id
  where cs.id = p_class_session_id;

  if v_level is null then
    raise exception 'Class session not found.';
  end if;

  return query
  with totals as (
    select s.id as sid, s.real_name as rname,
           coalesce(sum(pt.points), 0) as pts
    from public.students s
    left join public.point_transactions pt
      on pt.student_id = s.id and pt.class_session_id = p_class_session_id
      and pt.category_key = 'class_score'
    where s.level = v_level and s.status = 'Active'
    group by s.id, s.real_name
  )
  select sid, rname, pts, (rank() over (order by pts desc))::integer
  from totals
  order by 4, rname;
end;
$function$;

create or replace function public.get_weekly_class_leaderboard(p_class_group_id bigint, p_week_start date default null)
returns table(
  student_id bigint,
  real_name text,
  session_id bigint,
  session_date date,
  session_points numeric,
  week_total numeric,
  week_rank integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_level text;
  v_start date;
  v_end date;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  select cg.level into v_level from public.class_group cg where cg.id = p_class_group_id;
  if v_level is null then
    raise exception 'Class group not found.';
  end if;

  select wb.period_start, wb.period_end into v_start, v_end
    from public.week_bounds(coalesce(p_week_start, (now() at time zone 'Asia/Tashkent')::date)) wb;

  return query
  with sessions as (
    select cs.id, cs.session_date
    from public.class_session cs
    where cs.class_group_id = p_class_group_id
      and cs.session_date between v_start and v_end
  ),
  roster as (
    select s.id as sid, s.real_name as rname
    from public.students s
    where s.level = v_level and s.status = 'Active'
  ),
  grid as (
    select r.sid, r.rname, sess.id as sess_id, sess.session_date as sess_date,
           coalesce(sum(pt.points), 0) as sess_points
    from roster r
    cross join sessions sess
    left join public.point_transactions pt
      on pt.student_id = r.sid and pt.class_session_id = sess.id
      and pt.category_key = 'class_score'
    group by r.sid, r.rname, sess.id, sess.session_date
  ),
  totals as (
    select sid, sum(sess_points) as total
    from grid
    group by sid
  ),
  ranked as (
    select sid, total, (rank() over (order by total desc))::integer as rnk
    from totals
  )
  select g.sid, g.rname, g.sess_id, g.sess_date, g.sess_points, t.total, t.rnk
  from grid g
  join ranked t on t.sid = g.sid
  order by t.rnk, g.rname, g.sess_date;
end;
$function$;

create or replace function public.get_monthly_class_leaderboard(p_class_group_id bigint, p_month_start date default null)
returns table(
  student_id bigint,
  real_name text,
  session_id bigint,
  session_date date,
  session_points numeric,
  month_total numeric,
  month_rank integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_level text;
  v_start date;
  v_end date;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  select cg.level into v_level from public.class_group cg where cg.id = p_class_group_id;
  if v_level is null then
    raise exception 'Class group not found.';
  end if;

  select mb.period_start, mb.period_end into v_start, v_end
    from public.month_bounds(coalesce(p_month_start, (now() at time zone 'Asia/Tashkent')::date)) mb;

  return query
  with sessions as (
    select cs.id, cs.session_date
    from public.class_session cs
    where cs.class_group_id = p_class_group_id
      and cs.session_date between v_start and v_end
  ),
  roster as (
    select s.id as sid, s.real_name as rname
    from public.students s
    where s.level = v_level and s.status = 'Active'
  ),
  grid as (
    select r.sid, r.rname, sess.id as sess_id, sess.session_date as sess_date,
           coalesce(sum(pt.points), 0) as sess_points
    from roster r
    cross join sessions sess
    left join public.point_transactions pt
      on pt.student_id = r.sid and pt.class_session_id = sess.id
      and pt.category_key = 'class_score'
    group by r.sid, r.rname, sess.id, sess.session_date
  ),
  totals as (
    select sid, sum(sess_points) as total
    from grid
    group by sid
  ),
  ranked as (
    select sid, total, (rank() over (order by total desc))::integer as rnk
    from totals
  )
  select g.sid, g.rname, g.sess_id, g.sess_date, g.sess_points, t.total, t.rnk
  from grid g
  join ranked t on t.sid = g.sid
  order by t.rnk, g.rname, g.sess_date;
end;
$function$;
