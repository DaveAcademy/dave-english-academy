-- Database-enforced protection for financial information on students,
-- independent of and complementary to the UI-level fix in a separate PR.
--
-- Why not a column-level REVOKE: every signed-in person (administrator,
-- teacher, student) authenticates as the same Postgres role
-- ('authenticated') - app-level role is a column on profiles, checked via
-- is_admin()/is_teacher(), not a distinct Postgres role per person.
-- Column-level GRANT/REVOKE is scoped to Postgres roles, so it cannot
-- express "hide this column from teachers but not administrators" here -
-- it would have to apply to the whole 'authenticated' role at once,
-- blocking administrators too.
--
-- Fix: a security-invoker view that nulls monthly_fee per row via the
-- existing is_admin() helper (same function already used by every other
-- policy in this schema), instead of exposing the base table's column
-- unconditionally.
--
-- security_invoker = true is the critical detail, not a stylistic
-- choice: without it, a view runs with the privileges of whoever created
-- it (the migration-running role, which owns the table and therefore
-- bypasses its RLS by default) - meaning every row would be visible to
-- every caller regardless of students_admin_all / students_teacher_read
-- / students_self_read. With it, the view evaluates RLS as the actual
-- calling user, so those three existing policies keep governing exactly
-- which ROWS are visible, completely unchanged - this view only masks a
-- column's VALUE, never row visibility. No RLS policy is modified or
-- removed by this migration.
--
-- Writes are unaffected: createStudent/updateStudent/deleteStudent/
-- bulkCreateStudents (all in src/lib/storageBridge.js) continue to
-- target public.students directly, still gated by students_admin_all
-- exactly as before. Only the app's read path (listStudents) is
-- repointed at this view.

create or replace view public.students_view
with (security_invoker = true) as
select
  id,
  profile_id,
  real_name,
  english_name,
  level,
  phone,
  parent_phone,
  join_date,
  payment_deadline,
  case when is_admin() then monthly_fee else null end as monthly_fee,
  status,
  notes,
  group_name,
  points,
  created_at
from public.students;

grant select on public.students_view to authenticated;
