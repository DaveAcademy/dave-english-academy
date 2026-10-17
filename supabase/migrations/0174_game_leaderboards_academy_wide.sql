-- Game leaderboards (score + level-progression) go academy-wide.
--
-- Context: unlike class-points ranking (get_group_leaderboard - competitive
-- scope is deliberately level-bound there, per 0032/MyRanking.jsx), gaming
-- has no such requirement - Dave wants all ~35 active students ranked
-- together per game, not split by level. Drops the `s.level = v_level`
-- filter from both 0147's get_game_best_records() and 0151's
-- get_game_level_leaderboard(); everything else (rank() with shared ties,
-- SECURITY DEFINER, status = 'Active') is unchanged.
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
      gs.student_id,
      gs.game_type,
      gs.score,
      gs.played_at,
      row_number() over (
        partition by gs.student_id, gs.game_type
        order by gs.score desc, gs.played_at asc
      ) as rn
    from public.game_sessions gs
    join public.students s on s.id = gs.student_id
    where s.status = 'Active'
  ),
  best_per_student as (
    select student_id, game_type, score as best_score, played_at as achieved_at
    from per_student_game
    where rn = 1
  )
  select
    b.game_type,
    (rank() over (partition by b.game_type order by b.best_score desc))::integer as rank,
    b.student_id,
    s.real_name,
    s.english_name,
    b.best_score,
    b.achieved_at
  from best_per_student b
  join public.students s on s.id = b.student_id
  order by b.game_type, rank, b.achieved_at;
end;
$$;

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
begin
  if not exists (select 1 from public.students where profile_id = auth.uid()) then
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
  where s.status = 'Active'
  order by glp.game_type, rank, glp.updated_at;
end;
$$;

revoke execute on function public.get_game_best_records() from public;
grant execute on function public.get_game_best_records() to authenticated;
revoke execute on function public.get_game_level_leaderboard() from public;
grant execute on function public.get_game_level_leaderboard() to authenticated;
