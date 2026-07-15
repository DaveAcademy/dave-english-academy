-- Restricts the payments table to administrators (plus each student's own
-- rows), removing teacher read access at the RLS layer. Idempotent, like
-- every other migration here.
--
-- payments_teacher_read (migration 0003) currently grants every teacher
-- full SELECT on every student's payment history - not just what the UI
-- happens to render, but the raw table via the Supabase REST/JS client,
-- visible to anyone inspecting network requests regardless of which page
-- they're on. That's the same class of gap already closed for
-- students.monthly_fee by students_view (migration 0012): a DB-level
-- policy is the only place this can actually be enforced, since every
-- signed-in role authenticates as the same Postgres role
-- ('authenticated') and the app-level role check happens per-row via
-- is_admin()/is_teacher(), not via a distinct grant.
--
-- payments_admin_all (full CRUD for administrators) and payments_self_read
-- (a student reading their own payment rows) are untouched - only the
-- teacher policy is dropped. No row is modified or deleted.

drop policy if exists payments_teacher_read on public.payments;
