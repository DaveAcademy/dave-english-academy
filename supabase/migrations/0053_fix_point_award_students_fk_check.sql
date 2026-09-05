-- Fixes "permission denied for table students" on every attempt to award
-- points (Rankings.jsx > Add Points / Award Class Points), for admin and
-- teacher alike. Root cause: point_transactions.student_id references
-- students(id) via a foreign key (0019); Postgres's internal FK-existence
-- check on INSERT requires the inserting role to hold SELECT privilege on
-- students - and authenticated has only ever held column-level SELECT on
-- `id` (0016), which the FK check does not treat as sufficient on its own.
--
-- Migration 0028 ("harden_self_read_permissions") revoked an "ad hoc"
-- `grant select (profile_id) on students to authenticated` it found
-- already present in production, believing it unnecessary now that
-- students_self_read uses is_own_student() (a SECURITY DEFINER helper,
-- correctly insulated from RLS-policy-column-privilege issues). That
-- revoke was correct for the RLS-policy concern 0028 was fixing, but it
-- had an unintended side effect on this separate mechanism (the FK
-- check), which nobody end-to-end tested afterward - awarding points has
-- been broken since.
--
-- Confirmed by direct testing (rolled-back transactions, no data
-- written): RLS policies on point_transactions and students are clean
-- (pt_admin_insert/pt_teacher_insert don't reference students at all;
-- students_self_read already uses is_own_student()); both point_transactions
-- triggers are unaffected (reproduced with both disabled - still failed);
-- granting SELECT on every students column except monthly_fee resolves it
-- and lets the insert proceed to the trigger's real business logic.
--
-- monthly_fee is deliberately excluded - students_view already masks it
-- (CASE WHEN is_admin() THEN monthly_fee ELSE NULL END, migration 0012),
-- and granting it here would let any authenticated user query it directly
-- from the base table, bypassing that masking entirely. No other RLS
-- policy, trigger, or the ledger itself is touched by this migration.

grant select (
  id, profile_id, real_name, english_name, level, phone, parent_phone,
  join_date, payment_deadline, status, notes, group_name, points, created_at
) on public.students to authenticated;
