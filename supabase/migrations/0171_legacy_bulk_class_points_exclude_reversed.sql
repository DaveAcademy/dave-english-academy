-- Fix Monthly Ranking counting reversed legacy bulk-award rows (Ranking V3
-- Phase 8, Defect B).
--
-- get_monthly_class_leaderboard's legacy CTE (0168) matches purely on
-- reason = 'Bulk class points via Rankings', with no awareness of
-- is_reversal/reversed_transaction_id. Two confirmed live cases where a
-- legacy row was correctly corrected via a reversal (worded differently,
-- by design, to preserve the audit trail) but the RPC kept counting the
-- original anyway:
--   - A1 student Shirina - Hanna: txn 1442 (+66, legacy reason) reversed by
--     txn 1726 ("Reversal: redundant manual Level A -> A1 point transfer
--     removed...") -- +66 phantom points still counted.
--   - Level B, 9 duplicate bulk-award rows (txns 996-1004, +447 total,
--     legacy reason) reversed by txns 1013-1021 ("Reversal of duplicate
--     bulk award (Level B, 2026-08-08)") -- +447 phantom points still
--     counted.
-- Level C has no matching reversal and is unaffected.
--
-- Fix: the legacy CTE now also excludes (a) legacy rows that are
-- themselves is_reversal = true, and (b) legacy rows that a later
-- transaction's reversed_transaction_id points back to (i.e. rows that
-- have since been reversed). No point_transactions rows are inserted,
-- updated, deleted, or reversed by this migration -- the original 265
-- August rows and their existing reversals are untouched; only the
-- ranking calculation that reads them changes. class_score logic, grant
-- pattern, and every other clause are unchanged from 0168.
--
-- Same signature as 0168 (student_id, real_name, session_id, session_date,
-- session_points, legacy_points, month_total, month_rank) -- create or
-- replace is safe here, no drop needed.

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
  legacy as (
    select r.sid,
           coalesce(sum(pt.points), 0) as legacy_pts
    from roster r
    left join public.point_transactions pt
      on pt.student_id = r.sid
      and pt.reason = 'Bulk class points via Rankings'
      and pt.lesson_date between v_start and v_end
      and pt.is_reversal = false
      and not exists (
        select 1 from public.point_transactions rv
        where rv.reversed_transaction_id = pt.id
      )
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
