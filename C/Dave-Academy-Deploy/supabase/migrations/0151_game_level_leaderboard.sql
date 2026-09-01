-- New, additive "highest level reached" leaderboard - approved 2026-08-17
-- as the resolution to the ranking-conflict flag in the Level Progression
-- Specification (flat per-correct scoring doesn't reward difficulty, so
-- raw score alone stops representing progression depth once levels
-- exist). get_game_best_records() (0147/0148) is completely untouched -
-- this is a second, separate leaderboard dimension, not a replacement.
--
-- Same conventions as every other ranking RPC in this codebase: level-
-- scoped (students.level), rank() with shared ties, revoke-then-grant-to-
-- authenticated, SECURITY DEFINER self-resolving the caller's level from
-- auth.uid().
create or replace function public.get_game_level_leaderboard()
returns table(
  game_type text,
  rank integer,
  student_id bigint,
  real_name text,
  english_name text,
  best_level_reached integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_level text;
begin
  select level into v_level from public.students where profile_id = auth.uid();
  if v_level is null then
    raise exception 'No student record for the current user';
  end if;

  return query
  select
    glp.game_type,
    (rank() over (partition by glp.game_type order by glp.best_level_reached desc))::integer as rank,
    glp.student_id,
    s.real_name,
    s.english_name,
    glp.best_level_reached,
    glp.updated_at
  from public.game_level_progress glp
  join public.students s on s.id = glp.student_id
  where s.level = v_level and s.status = 'Active'
  order by glp.game_type, rank, glp.updated_at;
end;
$$;

revoke execute on function public.get_game_level_leaderboard() from public;
grant execute on function public.get_game_level_leaderboard() to authenticated;
