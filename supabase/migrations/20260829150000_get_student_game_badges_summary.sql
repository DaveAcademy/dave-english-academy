-- get_student_game_badges_summary(): one read-only aggregate a student uses
-- to resolve their game badges (computeGameBadges in
-- src/features/achievements/utils/badges.js): lifetime Game Points total,
-- rounds played, number of perfect rounds, highest best_level_reached across
-- every game, and how many distinct games they have played.
--
-- A single SECURITY DEFINER call replaces what would otherwise be three or
-- four client-side table pulls (game_sessions + game_points_transactions +
-- game_level_progress) used to drive purely display-level badge rules. It is
-- self-scoped to the calling student via auth.uid() -> students.id and
-- returns ONLY their own rows: no student can read another student's game
-- data through it. Pinned search_path, stable, read-only.
--
-- The function is exposed to the authenticated role for the student portal
-- badge shelf (MyProgress / PortalHome badge sections); no other role needs
-- it, so it is revoked from public.
--
-- 2026-08-29

create or replace function public.get_student_game_badges_summary()
returns table (
  total_points integer,
  total_sessions integer,
  perfect_sessions integer,
  max_level integer,
  games_played integer
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
begin
  select id into v_student_id from public.students where profile_id = auth.uid();
  if v_student_id is null then
    raise exception 'No student record for the current user';
  end if;

  return query
  select
    (select coalesce(sum(points), 0)::integer from public.game_points_transactions where student_id = v_student_id),
    (select count(*)::integer from public.game_sessions where student_id = v_student_id),
    (select count(*)::integer from public.game_sessions where student_id = v_student_id and words_total > 0 and words_correct = words_total),
    (select coalesce(max(best_level_reached), 0)::integer from public.game_level_progress where student_id = v_student_id),
    (select count(distinct game_type)::integer from public.game_sessions where student_id = v_student_id);
end;
$$;

revoke execute on function public.get_student_game_badges_summary() from public;
grant execute on function public.get_student_game_badges_summary() to authenticated;