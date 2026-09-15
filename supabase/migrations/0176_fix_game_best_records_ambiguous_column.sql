-- Bug fix: get_game_best_records() (0147, made academy-wide in 0174) has
-- always thrown "column reference student_id is ambiguous" when actually
-- called by an authenticated student - never caught before now because
-- every prior check of this function ran the query logic manually rather
-- than invoking the real RPC under auth.uid(). The function's own
-- RETURNS TABLE(... student_id bigint ...) creates an implicit PL/pgSQL
-- variable named student_id; the second CTE (best_per_student) then
-- selects a bare, unqualified student_id inherited from the first CTE,
-- which Postgres cannot resolve between the table column and that
-- variable. The frontend's catch-and-swallow on a failed leaderboard
-- fetch (by design - a failed leaderboard must not break the results
-- screen) made this invisible: no error surfaced, the leaderboard block
-- just silently rendered nothing for every game, for every student.
--
-- Fix: give every CTE column an explicit, non-colliding alias so nothing
-- in the query body can ever again be confused with an OUT parameter.
-- No behavior change otherwise - same academy-wide, no-level-filter
-- logic as 0174.
create or replace function public.get_game_best_records()
returns table(
  game_type text,
  rank integer,
  student_id bigint,
  real_name text,
  english_name text,
  best_score numeric,
  achieved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  if not exists (select 1 from public.students where profile_id = auth.uid()) then
    raise exception 'No student record for the current user';
  end if;

  return query
  with per_student_game as (
    select
      gs.student_id as psg_student_id,
      gs.game_type as psg_game_type,
      gs.score as psg_score,
      gs.played_at as psg_played_at,
      row_number() over (
        partition by gs.student_id, gs.game_type
        order by gs.score desc, gs.played_at asc
      ) as rn
    from public.game_sessions gs
    join public.students s on s.id = gs.student_id
    where s.status = 'Active'
  ),
  best_per_student as (
    select
      psg_student_id as bps_student_id,
      psg_game_type as bps_game_type,
      psg_score as bps_best_score,
      psg_played_at as bps_achieved_at
    from per_student_game
    where rn = 1
  )
  select
    b.bps_game_type,
    (rank() over (partition by b.bps_game_type order by b.bps_best_score desc))::integer as rank,
    b.bps_student_id,
    s.real_name,
    s.english_name,
    b.bps_best_score,
    b.bps_achieved_at
  from best_per_student b
  join public.students s on s.id = b.bps_student_id
  order by b.bps_game_type, rank, b.bps_achieved_at;
end;
$$;

revoke execute on function public.get_game_best_records() from public;
grant execute on function public.get_game_best_records() to authenticated;
