-- Ranking redesign, step 5 of 7: one baseline transaction per student,
-- preserving their exact current total - including students sitting at 0
-- points, so every student has a defined ledger starting point rather
-- than only the ones who happened to have a nonzero total.
--
-- is_baseline = true is what keeps this honest: every weekly/monthly
-- aggregation query in 0023 explicitly excludes is_baseline rows, so this
-- one-time catch-up amount is never attributed to any particular week or
-- month that it wasn't actually earned in. It only ever counts toward the
-- lifetime total (students.points, via the 0020 trigger).
--
-- Guarded by "where not exists a prior baseline row for this student" so
-- this migration is safe to re-run without duplicating the baseline.
insert into public.point_transactions
  (student_id, level, group_name, category_key, points, reason, lesson_date, awarded_by, is_baseline)
select s.id, s.level, s.group_name, 'baseline_migration', s.points,
       'Migrated baseline from legacy points total', ((now() at time zone 'Asia/Tashkent')::date), null, true
from public.students s
where not exists (
  select 1 from public.point_transactions pt where pt.student_id = s.id and pt.is_baseline
);
