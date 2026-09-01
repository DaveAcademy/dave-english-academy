-- Closes a database-level privacy gap: students_teacher_read (migration
-- 0003) grants any teacher full-row SELECT on public.students, including
-- monthly_fee - completely bypassing students_view's masking (migration
-- 0012), because Postgres RLS is row-level only and students_view's
-- security_invoker=true meant it ran with the caller's own base-table
-- privileges rather than enforcing its own row/column logic independently.
-- A teacher (or anyone with an authenticated JWT) could retrieve real
-- monthly_fee values by querying /rest/v1/students directly instead of
-- /rest/v1/students_view, entirely outside the app's own code.
--
-- Fix: students_view is rebuilt with security_invoker=false, so it runs as
-- its owner (postgres, same as the students table's owner) and enforces
-- its own WHERE clause independently of the caller's privileges on the
-- base table. That WHERE clause replicates - verified line-by-line
-- against the live policies before this migration was written - the exact
-- OR-combination of students_admin_all / students_teacher_read /
-- students_self_read, so no legitimate reader loses access. Direct SELECT
-- on the base table is then revoked from authenticated and anon entirely,
-- closing the bypass. A narrow column-level SELECT on students.id only is
-- granted back to authenticated so admin-only write paths
-- (createStudent/updateStudent/deleteStudent) can still receive an id
-- back after INSERT/UPDATE/DELETE without needing monthly_fee or any
-- other column visibility on the base table.
--
-- Nothing here touches phone, parent_phone, or profiles.email - those are
-- a separate, undecided question, out of scope for this migration.

create or replace view public.students_view
with (security_invoker = false) as
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
from public.students
where is_admin() or is_teacher() or profile_id = auth.uid();

grant select on public.students_view to authenticated;

revoke select on public.students from authenticated, anon;

grant select (id) on public.students to authenticated;
