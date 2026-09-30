-- Bulk correction: remove failed-round grammar_battle awards for all
-- remaining affected students (same bug as student 10, migration 0193).

do $$
declare
  r record;
  v_removed bigint[];
  v_points int;
begin
  for r in
    select distinct g.student_id
      from public.game_points_transactions g
      join public.game_sessions gs on gs.id = g.game_session_id
      where g.game_type = 'grammar_battle'
        and gs.words_total > 0
        and (gs.words_correct::numeric / gs.words_total) < 0.70
        and g.student_id <> 10
  loop
    with doomed as (
      delete from public.game_points_transactions g2
      using public.game_sessions gs2
      where gs2.id = g2.game_session_id
        and g2.student_id = r.student_id
        and g2.game_type = 'grammar_battle'
        and gs2.words_total > 0
        and (gs2.words_correct::numeric / gs2.words_total) < 0.70
      returning g2.id, g2.points
    )
    select array_agg(id order by id), coalesce(sum(points), 0)
      into v_removed, v_points
    from doomed;

    if coalesce(array_length(v_removed, 1), 0) > 0 then
      insert into public.game_points_corrections
        (student_id, game_type, removed_transaction_ids, removed_points, reason)
      values
        (r.student_id, 'grammar_battle', v_removed, v_points,
         'Removed awards for failed (<70%) grammar_battle rounds; bug fixed in submit_game_round (0193)');

      update public.game_level_progress
         set current_level = 1, best_level_reached = 1, updated_at = now()
       where student_id = r.student_id and game_type = 'grammar_battle'
         and best_level_reached > 1;
    end if;
  end loop;
end $$;
