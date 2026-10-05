-- Game Points leaderboard: replaces the per-round best_score leaderboard
-- (get_game_best_records, capped at round_size * 10 - students were tying
-- 12-wide at the ceiling) with the lifetime, unbounded game_points_transactions
-- total (0152) as the ranking metric. Same academy-wide/no-level-filter shape
-- as 0174's get_game_best_records/get_game_level_leaderboard.
create or replace function public.get_game_points_leaderboard()
returns table(
  game_type text,
  rank integer,
  student_id bigint,
  real_name text,
  english_name text,
  total_points bigint,
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
  with totals as (
    select
      gpt.student_id,
      gpt.game_type,
      sum(gpt.points) as total_points,
      max(gpt.created_at) as achieved_at
    from public.game_points_transactions gpt
    join public.students s on s.id = gpt.student_id
    where s.status = 'Active'
    group by gpt.student_id, gpt.game_type
  )
  select
    t.game_type,
    (rank() over (partition by t.game_type order by t.total_points desc))::integer as rank,
    t.student_id,
    s.real_name,
    s.english_name,
    t.total_points,
    t.achieved_at
  from totals t
  join public.students s on s.id = t.student_id
  order by t.game_type, rank, t.achieved_at;
end;
$$;

revoke execute on function public.get_game_points_leaderboard() from public;
grant execute on function public.get_game_points_leaderboard() to authenticated;

-- Overall Game Points leaderboard: one combined ranking across every game
-- (Dave's request, 2026-08-19) - each student's points summed across all
-- game_types, so there is a single "best overall gamer" board alongside
-- each game's own board above.
create or replace function public.get_game_points_overall_leaderboard()
returns table(
  rank integer,
  student_id bigint,
  real_name text,
  english_name text,
  total_points bigint,
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
  with totals as (
    select
      gpt.student_id,
      sum(gpt.points) as total_points,
      max(gpt.created_at) as achieved_at
    from public.game_points_transactions gpt
    join public.students s on s.id = gpt.student_id
    where s.status = 'Active'
    group by gpt.student_id
  )
  select
    (rank() over (order by t.total_points desc))::integer as rank,
    t.student_id,
    s.real_name,
    s.english_name,
    t.total_points,
    t.achieved_at
  from totals t
  join public.students s on s.id = t.student_id
  order by rank, t.achieved_at;
end;
$$;

revoke execute on function public.get_game_points_overall_leaderboard() from public;
grant execute on function public.get_game_points_overall_leaderboard() to authenticated;
