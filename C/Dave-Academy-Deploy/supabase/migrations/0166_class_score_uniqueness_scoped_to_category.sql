-- Fixes 0164: that unique index had no category_key filter, so it blocked
-- ANY second point_transactions row attached to a student's class_session -
-- including legitimate Add Points/Bonus/Penalty corrections, not just a
-- second Class Score. The intended invariant was always narrower: one
-- 'class_score' row per (student, class_session), never "one row of any
-- kind." Re-scoping to category_key = 'class_score' preserves that
-- invariant exactly while letting bonus/penalty/correction transactions
-- keep attaching to the same session as before this feature existed.
-- Read-only reconciliation (2026-08-18) found zero point_transactions rows
-- with class_session_id set at all (any category), so this is a pure
-- schema correction - no historical data can violate either version of
-- the constraint.
DROP INDEX IF EXISTS point_transactions_one_score_per_student_session;

CREATE UNIQUE INDEX IF NOT EXISTS point_transactions_one_class_score_per_student_session
  ON point_transactions (student_id, class_session_id)
  WHERE class_session_id IS NOT NULL AND category_key = 'class_score';
