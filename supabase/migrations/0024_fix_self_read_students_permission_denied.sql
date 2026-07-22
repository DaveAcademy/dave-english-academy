-- Fixes a production-affecting bug found during ranking-session smoke
-- testing (2026-07-21), unrelated to the ranking/recognition redesign
-- itself: listAttendance/listPayments/listCertificates/listExamScores/
-- listHomeworkStatus/listLessonAttendance in storageBridge.js all fail
-- with "permission denied for table students" for EVERY role, including
-- administrator.
--
-- Root cause: migration 0016 revoked direct SELECT on public.students
-- from authenticated/anon down to just the id column, to close a
-- monthly_fee leak. attendance_self_read, payments_self_read,
-- lesson_attendance_self_read, exam_scores_self_read,
-- homework_status_self_read, and certificates_self_read (0003 and 0005)
-- each contain a raw `exists (select ... from students where
-- profile_id = auth.uid())` subquery. Postgres checks column privileges
-- for every RLS policy branch referenced in a rewritten query - not just
-- the branch relevant to the current caller/role - so the self-read
-- branch's reference to students.profile_id fails the privilege check
-- for every query against these six tables, regardless of who's asking
-- or which policy branch would actually have granted them access.
--
-- Same bug class, same fix already established and staging-validated for
-- point_transactions in migration 0019: a SECURITY DEFINER helper runs
-- with the function owner's privileges, bypassing the caller's own
-- (deliberately narrow) grant on students, without re-exposing any
-- column 0016 restricted (the function only ever returns a boolean).
-- create or replace here is intentionally idempotent so this migration
-- is safe whether or not 0019 already defined is_own_student() on this
-- database (e.g. release/dashboard-redesign branch vs. production).
create or replace function public.is_own_student(p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (select 1 from public.students s where s.id = p_student_id and s.profile_id = auth.uid());
$$;

revoke execute on function public.is_own_student(bigint) from public;
grant execute on function public.is_own_student(bigint) to authenticated;

drop policy if exists payments_self_read on public.payments;
create policy payments_self_read on public.payments
  for select using (public.is_own_student(payments.student_id));

drop policy if exists attendance_self_read on public.attendance;
create policy attendance_self_read on public.attendance
  for select using (public.is_own_student(attendance.student_id));

drop policy if exists lesson_attendance_self_read on public.lesson_attendance;
create policy lesson_attendance_self_read on public.lesson_attendance for select
  using (public.is_own_student(lesson_attendance.student_id));

drop policy if exists exam_scores_self_read on public.exam_scores;
create policy exam_scores_self_read on public.exam_scores for select
  using (public.is_own_student(exam_scores.student_id));

drop policy if exists homework_status_self_read on public.homework_status;
create policy homework_status_self_read on public.homework_status for select
  using (public.is_own_student(homework_status.student_id));

drop policy if exists certificates_self_read on public.certificates;
create policy certificates_self_read on public.certificates for select
  using (public.is_own_student(certificates.student_id));
