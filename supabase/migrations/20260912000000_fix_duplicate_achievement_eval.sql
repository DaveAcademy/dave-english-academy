-- Fix: remove redundant achievement evaluation from unified rewards trigger
-- submit_game_round already does perform evaluate_achievements(v_student_id) transactionally
-- Trigger also did it, causing duplicate evaluation (idempotent but wasteful, and could mask the authoritative path)
-- Keep submit_game_round as single source, trigger only handles XP/missions/pet/streak

create or replace function public.on_game_session_create_unified_rewards()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event_id bigint;
  v_xp integer;
  v_today date;
begin
  if coalesce(NEW.words_total,0) = 0 then return NEW; end if;
  v_event_id := public.create_learning_event(NEW.student_id, 'GAME_ROUND', NEW.id::text, jsonb_build_object('game_type', NEW.game_type, 'score', NEW.score, 'words_correct', NEW.words_correct, 'words_total', NEW.words_total, 'level', NEW.level));
  v_xp := public.award_xp_for_event(NEW.student_id, v_event_id, 'GAME_ROUND', NEW.id::text, NEW.score::int);
  if v_xp > 0 then
    perform public.bump_student_metric(NEW.student_id, 'game_rounds_completed', 1);
    perform public.bump_student_metric(NEW.student_id, 'game_' || NEW.game_type || '_completed', 1);
  end if;
  -- Achievement evaluation is already done in submit_game_round transactionally — do not duplicate here
  -- Keeping it would be redundant and could hide which path is authoritative
  if v_xp > 0 then
    perform public.bump_student_metric(NEW.student_id, 'pet_xp_earned', 10);
  end if;
  if v_xp > 0 then
    v_today := (now() at time zone 'Asia/Tashkent')::date;
    insert into public.student_learning_days (student_id, date, activity_type) values (NEW.student_id, v_today, 'game') on conflict (student_id, date) do nothing;
  end if;
  return NEW;
end;
$$;
comment on function public.on_game_session_create_unified_rewards() is 'Unified rewards trigger: GAME_ROUND → EVENT → XP → MISSIONS → PET XP → STREAK (achievements via submit_game_round only, not duplicate).';
