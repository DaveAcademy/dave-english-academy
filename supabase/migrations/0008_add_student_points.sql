-- Switches ranking from an automatic formula (lesson attendance + exam
-- scores + homework, computed in src/utils/points.js / get_leaderboard())
-- to a single, directly-editable points total per student. The school
-- wants to be able to add or subtract points by hand at any time, and the
-- old formula depended on the Lessons/Exams/Homework features, which see
-- little real use - so points were showing as flat 0 for almost everyone.
--
-- This does not touch or remove any existing data in lessons,
-- lesson_attendance, exams, exam_scores, homework, or homework_status -
-- those tables and the pages built on them (Lessons/Exams/Homework) are
-- untouched and keep working exactly as before. Only what "ranking" is
-- based on changes.

alter table public.students add column if not exists points numeric not null default 0;

-- CREATE OR REPLACE, not a fresh function: keeps the same name/signature/
-- return shape (student_id, real_name, points) so PortalHome.jsx and
-- MyRanking.jsx need no changes. Also keeps the "auth.uid() is not null"
-- check (added in migration 0007) regardless of whether that migration
-- has been applied yet on this branch - this definition is self-contained
-- and safe either way.
create or replace function public.get_leaderboard()
returns table(student_id bigint, real_name text, points numeric)
language sql
stable security definer
set search_path = 'public'
as $$
  select s.id, s.real_name, s.points
  from public.students s
  where s.status = 'Active'
    and auth.uid() is not null;
$$;
