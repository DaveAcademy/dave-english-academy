-- Ranking V2: class_session-backed leaderboard RPCs.
--
-- Three new, additive RPCs only. get_group_leaderboard() and
-- get_student_ranking_summary() are NOT touched -- they stay exactly as
-- they are today for their existing consumers (Recognition.jsx,
-- MyRanking.jsx, MyProgress.jsx, PortalHomeV3.jsx, and the All Time /
-- Week / Month totals in Rankings.jsx's Level Leaderboard).
--
-- Every result here is scoped to point_transactions.class_session_id
-- IS NOT NULL by construction: each query joins point_transactions to a
-- specific class_session (or set of class_sessions belonging to one
-- class_group), so a transaction with no session attached simply never
-- matches the join and is excluded -- no explicit "is not null" filter
-- is needed, and none is added, to avoid a redundant condition that
-- could silently drift from the real scoping logic.
--
-- Tie handling matches get_group_leaderboard()/get_student_ranking_summary()
-- exactly: rank() over (order by points desc), never row_number() or
-- dense_rank() -- verified against both live function bodies before
-- writing this, not approximated.
--
-- Authorization matches get_group_leaderboard()'s existing convention:
-- any signed-in user (auth.uid() is not null), no teacher/admin/self
-- gate. That function is already the open, read-only, level-wide
-- leaderboard every role sees; these three are the same kind of view at
-- finer grain, so they inherit the same boundary rather than inventing
-- a stricter one that would make this the only inconsistent leaderboard
-- endpoint in the app.
--
-- Population rule is the same one every existing ranking function uses:
-- students.level = <the group's level> and students.status = 'Active'.
-- A promoted student's Class/Week/Month view therefore only ever shows
-- their CURRENT level's group sessions -- old-level sessions belong to
-- a different class_group_id and never enter these queries, so
-- promotion cannot retroactively move old session points into the new
-- group. This is a deliberate difference from Overall/lifetime points,
-- which still carry across levels via get_group_leaderboard/
-- get_student_ranking_summary (0129) -- unchanged by this migration.

-- Every ranking RPC since 0023 revokes the default PUBLIC execute grant
-- before granting explicitly to authenticated -- these three do the
-- same, so an anonymous caller is blocked at the grant layer, not only
-- by the auth.uid() check inside the function body.

-- ---------------------------------------------------------------------
-- 1. get_class_leaderboard: one specific class_session, ranked.
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
    where s.level = v_level and s.status = 'Active'
    group by s.id, s.real_name
  )
  select sid, rname, pts, (rank() over (order by pts desc))::integer
  from totals
  order by 4, rname;
end;
$function$;

revoke execute on function public.get_class_leaderboard(bigint) from public;
grant execute on function public.get_class_leaderboard(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 2. get_weekly_class_leaderboard: every session actually opened for a
-- group within a week window, long-format (one row per student per
-- session) so the client pivots into columns exactly like the retired
-- lesson_date breakdown used to -- except every column here is a real,
-- explicitly-opened class_session, not an inferred date. A week with no
-- sessions opened yet returns zero rows, on purpose: nothing is
-- fabricated to fill a column that doesn't exist yet.
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

revoke execute on function public.get_weekly_class_leaderboard(bigint, date) from public;
grant execute on function public.get_weekly_class_leaderboard(bigint, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3. get_monthly_class_leaderboard: same shape as weekly, month grain.
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

revoke execute on function public.get_monthly_class_leaderboard(bigint, date) from public;
grant execute on function public.get_monthly_class_leaderboard(bigint, date) to authenticated;
