-- 2026-08-08: reverse the SECOND "Bulk class points via Rankings" submission
-- for Level B so a duplicated batch no longer doubles the day's points.
--
-- Context: the Award Class Points form was submitted twice ~40 s apart
-- (09:43:52 and 09:44:31 UTC), creating two identical ledger rows per Level-B
-- student for 2026-08-08. The display is faithful arithmetic over the ledger,
-- so the doubled value was caused by the duplicated rows, not by any
-- aggregation bug. This migration reverses the later batch so each student
-- ends up with the single intended value that the earlier batch already
-- wrote, netting to zero everywhere (leaderboard, per-class breakdown, portal
-- summary, students.points cache).
--
-- The reversal row is the correction mechanism the ledger was designed with
-- (see 0019): is_reversal = true, points = negated, reversed_transaction_id
-- points back at the duplicated row. Nothing is deleted or edited in place.
--
-- Second batch being reversed: ids 996-1004, created 09:44:31. The earlier
-- batch (987-995, 09:43:52) remains and represents the intended single award.
--
-- Re-running this is safe: the NOT EXISTS guard skips ids already reversed.

insert into public.point_transactions (
  student_id, level, category_id, category_key, points, reason, lesson_date,
  awarded_by, attendance_id, is_baseline, is_reversal, reversed_transaction_id
)
select
  pt.student_id,
  pt.level,
  pt.category_id,
  pt.category_key,
  - pt.points,
  'Reversal of duplicate bulk award (Level B, 2026-08-08)',
  pt.lesson_date,
  pt.awarded_by,
  pt.attendance_id,
  false,
  true,
  pt.id
from public.point_transactions pt
where pt.id in (996, 997, 998, 999, 1000, 1001, 1002, 1003, 1004)
  and not exists (
    select 1 from public.point_transactions rv
    where rv.is_reversal and rv.reversed_transaction_id = pt.id
  );

-- Sanity: each reversed student must now net to exactly the surviving batch
-- value (i.e. 09:43:52 row still represents the day for that student).
select
  s.id,
  s.real_name,
  sum(pt.points) filter (where pt.is_reversal) as reversal_net,
  sum(pt.points) filter (where not pt.is_reversal and not pt.is_baseline) as live_net
from public.students s
left join public.point_transactions pt on pt.student_id = s.id
where s.id in (9, 15, 16, 17, 18, 19, 24, 30, 34)
group by s.id, s.real_name
order by s.id;