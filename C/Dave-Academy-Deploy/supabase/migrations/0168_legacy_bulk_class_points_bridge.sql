-- August 2026 Monthly Ranking correction (Ranking V3 Phase 6).
--
-- Problem: get_monthly_class_leaderboard (0167) sums only category_key =
-- 'class_score' rows tied to a real class_session. Before the class_session/
-- class_score model existed, teachers awarded the equivalent points through
-- the old bulk "Award Class Points" UI (removed in commit 9149735) as
-- category_key IN ('bonus','penalty') rows with class_session_id = NULL and
-- reason = 'Bulk class points via Rankings' (~265 verified August 2026 rows;
-- confirmed zero overlap with class_score since none carry a
-- class_session_id). Without this fix, August Monthly totals/ranks ignore
-- points that were already legitimately awarded.
--
-- Fix: get_monthly_class_leaderboard now adds those exact-reason-matched
-- rows (bounded by the same v_start/v_end the RPC already computes for the
-- requested month) directly into month_total, and month_rank is computed
-- from the corrected total. Every other clause (level scoping, Active-only
-- roster, session/grid breakdown, class_score-only session_points) is
-- unchanged from 0167. get_class_leaderboard and get_weekly_class_leaderboard
-- are untouched.
--
-- Why this is self-limiting and not a permanent legacy mechanism: the
-- legacy rows all carry lesson_date in Jul/Aug 2026 (the old UI no longer
-- exists to create new ones with this reason string), so the added join
-- naturally contributes 0 for every month from September 2026 onward -- no
-- date-range special-casing needed.
--
-- Excluded: the 10 previously-flagged test-like/ambiguous rows are excluded
-- automatically -- they don't carry this exact reason string.
--
-- No point_transactions rows are inserted, updated, deleted, or reversed by
-- this migration.
--
-- The new legacy_points output column changes this function's return shape,
-- which create-or-replace cannot do for a table-returning function -- drop
-- and recreate (single transaction, so there is no window where the
-- function is missing) with the same signature and re-apply the existing
-- 0139 grant pattern (revoke from public, grant execute to authenticated).

drop function public.get_monthly_class_leaderboard(bigint, date);

create function public.get_monthly_class_leaderboard(p_class_group_id bigint, p_month_start date default null)
returns table(
  student_id bigint,
  real_name text,
  session_id bigint,
  session_date date,
  session_points numeric,
  legacy_points numeric,
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
  legacy as (
    select r.sid,
           coalesce(sum(pt.points), 0) as legacy_pts
    from roster r
    left join public.point_transactions pt
      on pt.student_id = r.sid
      and pt.reason = 'Bulk class points via Rankings'
      and pt.lesson_date between v_start and v_end
    group by r.sid
  ),
  totals as (
    select g.sid, sum(g.sess_points) + coalesce(l.legacy_pts, 0) as total
    from grid g
    left join legacy l on l.sid = g.sid
    group by g.sid, l.legacy_pts
  ),
  ranked as (
    select sid, total, (rank() over (order by total desc))::integer as rnk
    from totals
  )
  select g.sid, g.rname, g.sess_id, g.sess_date, g.sess_points,
         coalesce(l.legacy_pts, 0), t.total, t.rnk
  from grid g
  join ranked t on t.sid = g.sid
  left join legacy l on l.sid = g.sid
  order by t.rnk, g.rname, g.sess_date;
end;
$function$;

revoke execute on function public.get_monthly_class_leaderboard(bigint, date) from public;
grant execute on function public.get_monthly_class_leaderboard(bigint, date) to authenticated;
