-- Fix get_game_best_records() (0147): "column reference student_id is
-- ambiguous" at runtime (caught via a direct authenticated RPC call
-- against production, not static review - the function shipped broken:
-- the RETURNS TABLE out-parameter student_id shadows the bare,
-- unqualified `student_id` column reference in the best_per_student CTE,
-- which PL/pgSQL cannot disambiguate between "the OUT variable" and
-- "the CTE column" even though only one table is in scope there. Fix:
-- qualify every reference with the source CTE's alias so no bare
-- identifier can collide with an OUT-parameter name anywhere in the
-- function body. Logic is otherwise byte-for-byte identical to 0147.
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
    select psg.student_id, psg.game_type, psg.score as best_score, psg.played_at as achieved_at
    from per_student_game psg
    where psg.rn = 1
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
