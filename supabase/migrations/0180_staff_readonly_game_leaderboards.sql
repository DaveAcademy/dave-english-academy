-- Staff read-only access to the four game leaderboard RPCs.
--
-- Context: teachers/admins must be able to VIEW student game results and
-- leaderboards, but must never PLAY games or submit rounds. Playing is
-- already impossible for staff and stays that way - submit_game_round
-- (0112, extended by later migrations) resolves the caller's students row
-- and raises 'No student record for the current user' otherwise; this
-- migration does not touch it, nor any RLS policy, nor any write path.
--
-- What blocked staff until now was purely the guard clause at the top of
-- each read-only leaderboard function: "raise if the caller has no
-- students row". Since 0174 these functions are academy-wide (no level
-- filter), so the query bodies are identical for students and staff -
-- only the guard changes. New guard:
--   * caller has a students row  -> proceed (student behavior unchanged)
--   * caller is admin or teacher -> proceed (read-only academy-wide view;
--     same data students already see academy-wide, no new columns exposed)
--   * anyone else                -> same exception as before
--
-- Role checks reuse the existing SECURITY DEFINER helpers is_admin()/
-- is_teacher() (0003) - the same predicates every RLS policy uses - so no
-- new role logic is introduced. Functions remain stable, read-only,
-- SECURITY DEFINER with pinned search_path. Grants unchanged (already
-- authenticated-only); revoke/grant pairs repeated per house convention.
--
-- Rollback: re-apply the previous definitions (0176 for
-- get_game_best_records, 0174 for get_game_level_leaderboard, 0177 for
-- the two points leaderboards) - each is a single create-or-replace.

-- ---------- get_game_best_records (body per 0176) ----------

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
  if exists (select 1 from public.students where profile_id = auth.uid()) then
    null; -- student caller: unchanged
  elsif public.is_admin() or public.is_teacher() then
    null; -- staff caller: read-only academy-wide view (0180)
  else
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

-- ---------- get_game_level_leaderboard (body per 0174) ----------

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
  if exists (select 1 from public.students where profile_id = auth.uid()) then
    null; -- student caller: unchanged
  elsif public.is_admin() or public.is_teacher() then
    null; -- staff caller: read-only academy-wide view (0180)
  else
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

revoke execute on function public.get_game_level_leaderboard() from public;
grant execute on function public.get_game_level_leaderboard() to authenticated;

-- ---------- get_game_points_leaderboard (body per 0177) ----------

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
  if exists (select 1 from public.students where profile_id = auth.uid()) then
    null; -- student caller: unchanged
  elsif public.is_admin() or public.is_teacher() then
    null; -- staff caller: read-only academy-wide view (0180)
  else
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

-- ---------- get_game_points_overall_leaderboard (body per 0177) ----------

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
  if exists (select 1 from public.students where profile_id = auth.uid()) then
    null; -- student caller: unchanged
  elsif public.is_admin() or public.is_teacher() then
    null; -- staff caller: read-only academy-wide view (0180)
  else
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
