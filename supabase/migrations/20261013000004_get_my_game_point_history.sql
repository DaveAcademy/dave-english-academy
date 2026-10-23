-- Game Points Log feed: student's own game activity, newest first.
--
-- Purpose: back the student-facing Game Points Log (Pet Collection → Pet
-- Ranking → below the ranking table). Game Points are a separate system
-- from Lesson/Class Points; this feed reads ONLY game_points_transactions,
-- so Lesson/Class rows (point_transactions class_score/bonus/homework/…)
-- can never appear here, just as game_activity never appears in
-- get_my_point_history().
--
-- Read-path only, zero data changes. Own-rows scoping via the caller's
-- students.profile_id (same convention as get_my_point_history and the
-- game ranking RPCs). Shape mirrors the lesson log (date, labels, signed
-- points, correction flag) so the UI renders both logs consistently.
-- Reversal rows are included and flagged (like lesson-log corrections),
-- never hidden: lifetime net remains derived on read elsewhere.
-- Grants follow the project standard (revoke public, authenticated only).

create or replace function public.get_my_game_point_history()
returns table(
  game_date timestamptz,
  game_type text,
  level integer,
  tier text,
  points integer,
  is_perfect boolean,
  is_correction boolean
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select gpt.created_at,
         gpt.game_type,
         gpt.level,
         gpt.tier,
         gpt.points,
         gpt.is_perfect,
         gpt.is_reversal
  from public.game_points_transactions gpt
  join public.students s on s.id = gpt.student_id
  where s.profile_id = auth.uid()
  order by gpt.created_at desc, gpt.id desc;
$$;

revoke execute on function public.get_my_game_point_history() from public;
grant execute on function public.get_my_game_point_history() to authenticated;
