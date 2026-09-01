-- Requires a session for the profiles_select_teachers RLS policy (added in
-- 0009_chat_exam_homework_uploads.sql: using (role = 'teacher'), no session
-- check). Every other policy added by that migration (can_send_message,
-- can_read_message, certificate_template_read, the attachments storage
-- policies) gates on auth.uid() being non-null; this one didn't, so an
-- unauthenticated PostgREST request could read every teacher's
-- id/full_name/email via the profiles table with no session at all.
--
-- Expressed as its own migration rather than editing 0009 directly, since
-- 0009 is already merged and applied - idempotent like every other
-- migration in this repo (drop policy if exists, then create).

drop policy if exists profiles_select_teachers on public.profiles;
create policy profiles_select_teachers on public.profiles for select
  using (auth.uid() is not null and role = 'teacher');
