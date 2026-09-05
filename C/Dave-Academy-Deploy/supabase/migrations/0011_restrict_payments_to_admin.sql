-- Restricts the payments table to administrators only. Teachers
-- previously had read-only access via payments_teacher_read (added in
-- migration 0003, intentionally at the time - see that migration's
-- comment - and already live in production). That decision is being
-- reversed: financial data (collected/expected totals, per-student
-- payment records) should be visible only to administrators.
--
-- This does not touch or delete any payment data - it only removes who
-- can query the table. payments_admin_all (full CRUD for administrators)
-- is untouched and remains the only access path to this table.

drop policy if exists payments_teacher_read on public.payments;
