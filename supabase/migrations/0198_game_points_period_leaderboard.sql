-- Period-based Game Points leaderboard (migration 0198): extends 0177's
-- lifetime overall leaderboard with daily/weekly/monthly/all_time filtering.
-- The existing get_game_points_overall_leaderboard() (lifetime) is kept
-- untouched for the staff GameResults page.
create or replace function public.get_game_points_period_leaderboard(p_period text)
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
declare
  v_from timestamptz;
begin
  if not exists (select 1 from public.students where profile_id = auth.uid()) then
    raise exception 'No student record for the current user';
  end if;

  -- Strict validation: only four accepted values, no SQL injection risk.
  if p_period not in ('daily', 'weekly', 'monthly', 'all_time') then
    raise exception 'Invalid period: %. Must be daily, weekly, monthly, or all_time', p_period;
  end if;

  -- Compute the period start in server time. All_time gets no filter.
  if p_period = 'daily' then
    v_from := date_trunc('day', now());
  elsif p_period = 'weekly' then
    v_from := date_trunc('week', now());  -- Monday 00:00
  elsif p_period = 'monthly' then
    v_from := date_trunc('month', now()); -- 1st of month 00:00
  else
    v_from := null; -- all_time: no filter
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
      and (v_from is null or gpt.created_at >= v_from)
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

revoke execute on function public.get_game_points_period_leaderboard(text) from public;
grant execute on function public.get_game_points_period_leaderboard(text) to authenticated;
