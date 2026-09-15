-- Fixes the actual root cause behind the income overview bug. Every
-- migration-backfilled payment_transactions row (source='migration', from
-- the 0057 backfill) has paid_at stamped to the day the backfill SCRIPT
-- ran (early July 2026) - it was never the real historical payment date.
-- covers_period_start correctly records which month each payment was for
-- (April through August), so it's the best available evidence of when
-- that payment actually happened - the old legacy system didn't retain
-- exact days, only month/paid-flag, so the 1st of the covered month is
-- the closest honest approximation available, not a fabricated precise
-- date.
--
-- This does not touch anything about coverage: covers_period_start/end
-- are untouched, and get_student_payment_status never reads paid_at for
-- its calculations (verified - it only uses covers_period_start for the
-- pre-join exclusion filter, migration 0062). This is purely correcting
-- the collection-date record so cash-flow reporting (migration 0077,
-- back to paid_at-based bucketing) reflects reality.

update public.payment_transactions
set paid_at = covers_period_start::timestamptz
where source = 'migration'
  and covers_period_start is not null;
