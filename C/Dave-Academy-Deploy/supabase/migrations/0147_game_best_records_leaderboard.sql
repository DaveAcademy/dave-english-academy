-- Leaderboard / Best Records, single batched RPC.
--
-- Architecture (see session notes): game_sessions is already the
-- complete historical record for all 9 games (uniform student_id,
-- game_type, score, played_at columns since 0111). submit_game_round()
-- already computes personal-best per submission. No new table is
-- needed - a "best record" is just max(score) per (student, game_type),
-- and a "leaderboard" is that ranked within the caller's level, which is
-- the app's one existing competitive-scope boundary (matches
-- get_group_leaderboard/get_class_leaderboard/class_group - group_name
-- is explicitly documented, 0032, as display-only and never used for
-- access/competitive scoping).
--
-- Batched by design (all 9 games in one call, not one RPC per game_type)
-- so GameCenter.jsx's current 9-separate-query bestScores loop collapses
-- to a single round trip.
--
-- Determinism: each student's best is picked via row_number() ordered
-- by score desc, played_at asc (earliest achievement of their max score
-- wins the tie against their own later repeats of the same score) -
-- avoids nesting max() inside a FILTER clause, which isn't valid at a
-- single aggregation level. Group ranking then uses rank() over
-- (partition by game_type order by best_score desc), the same tie
-- convention (equal scores share a rank) every existing ranking RPC in
-- this codebase already uses.
--
-- Read-only: does not touch submit_game_round, game grading, or any
-- existing ranking/points RPC.
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
declare
  v_level text;
begin
  select level into v_level from public.students where profile_id = auth.uid();
  if v_level is null then
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
    where s.level = v_level and s.status = 'Active'
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

revoke execute on function public.get_game_best_records() from public;
grant execute on function public.get_game_best_records() to authenticated;
