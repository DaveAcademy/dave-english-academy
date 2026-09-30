-- Stop blending legacy pre-Class-Score bulk-award points into the Monthly
-- leaderboard (Ranking V3 Phase 9, owner decision 2026-08-19).
--
-- Background: 0168/0171 had get_monthly_class_leaderboard add legacy
-- "Bulk class points via Rankings" rows (category_key in ('bonus','penalty'),
-- class_session_id = NULL, pre-dating the class_session/class_score model)
-- into month_total, so August totals wouldn't ignore points that were
-- legitimately awarded before Class Score existed.
--
-- Now that every real August class_session has a manually-entered,
-- owner-verified class_score row (all 4 levels, 8/8 sessions each, confirmed
-- 2026-08-19), the legacy blend is no longer wanted: owner wants Monthly
-- Total to equal the sum of actual Class Score entries only, matching the
-- per-date columns already shown in the grid. Keeping the legacy blend on
-- top of complete, correct Class Score data was producing a total roughly
-- double what the visible daily columns summed to.
--
-- Fix: get_monthly_class_leaderboard no longer adds legacy points to
-- month_total. The legacy CTE and legacy_points output column are kept
-- (same signature, so this is a plain create-or-replace, no drop needed) but
-- now always resolve to 0, so the frontend's existing
-- `row.legacyPoints !== 0` check naturally stops rendering the "Includes
-- historical August class points" asterisk without any frontend change.
-- class_score session grid logic, level scoping, Active-only roster, and
-- get_class_leaderboard / get_weekly_class_leaderboard are unchanged.
--
-- No point_transactions rows are inserted, updated, deleted, or reversed by
-- this migration -- the legacy rows and their history stay exactly as they
-- are; only the ranking calculation that reads them changes.

create or replace function public.get_monthly_class_leaderboard(p_class_group_id bigint, p_month_start date default null)
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
  totals as (
    select g.sid, sum(g.sess_points) as total
    from grid g
    group by g.sid
  ),
  ranked as (
    select sid, total, (rank() over (order by total desc))::integer as rnk
    from totals
  )
  select g.sid, g.rname, g.sess_id, g.sess_date, g.sess_points,
         0::numeric as legacy_points, t.total, t.rnk
  from grid g
  join ranked t on t.sid = g.sid
  order by t.rnk, g.rname, g.sess_date;
end;
$function$;
