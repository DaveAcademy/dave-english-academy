-- Data-integrity hardening: point_transactions.points had no CHECK constraint
-- limiting magnitude. Audited on 2026-08-17:
--   - non-baseline rows (exam/homework/bonus/penalty, manual+bulk Rankings
--     entries) range from -211 to 236
--   - one-time baseline_migration rows (is_baseline = true, legacy points
--     import, no new rows expected) range from 105 to 608
--   - exams.max_score is currently 100; homework award is a fixed +10
-- Full observed history fits in [-211, 608]. +-1000 gives headroom for
-- normal manual/bulk adjustments and exam regrades while still rejecting
-- obvious data-entry errors (extra digit, wrong field, etc).
alter table public.point_transactions
  add constraint point_transactions_points_magnitude_check
  check (points between -1000 and 1000);
