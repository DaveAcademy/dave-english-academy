-- Ranking Model V3: enforce "one student + one class session = one final
-- Class Score" at the database level. Reconciliation (2026-08-18, read-only)
-- found zero point_transactions rows with class_session_id set at all, so
-- this constraint applies against an empty set - no historical data is at
-- risk of violating it. Rows with class_session_id IS NULL (legacy/
-- unattached ledger entries, e.g. lesson-level awards not tied to a
-- session) are intentionally excluded via the partial WHERE clause; they
-- predate session-based scoring and are not "Class Scores" under this
-- constraint.
CREATE UNIQUE INDEX IF NOT EXISTS point_transactions_one_score_per_student_session
  ON point_transactions (student_id, class_session_id)
  WHERE class_session_id IS NOT NULL;
