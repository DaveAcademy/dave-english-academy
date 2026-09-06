-- Ensure game_type_difficulty() exists on production.
--
-- submit_game_round() (applied via 20260827223000) resolves the per-game
-- tier with game_type_difficulty(). That function is defined in
-- 0196_game_points_redesign.sql, but migration 0196 was never applied to
-- production (production is maintained via timestamped migrations), so the
-- dependency was missing. Without it, submit_game_round() raised a runtime
-- error whenever a level-up occurred (v_leveled_up=true), preventing Game
-- Point awards.
--
-- Idempotent: CREATE OR REPLACE. Safe to re-run.

create or replace function public.game_type_difficulty(p_game_type text)
returns text
language sql
immutable
set search_path = 'public'
as $$
  select case p_game_type
    when 'picture_quiz'       then 'very_easy'    -- 5 pts
    when 'hangman'            then 'easy'         -- 10 pts
    when 'vocabulary_quiz'    then 'easy'         -- 10 pts
    when 'word_match'         then 'medium'       -- 20 pts
    when 'word_scramble'      then 'medium'       -- 20 pts
    when 'sentence_scramble'  then 'medium_hard'  -- 30 pts
    when 'word_builder'       then 'medium_hard'  -- 30 pts
    when 'word_detective'     then 'hard'         -- 40 pts
    when 'speed_challenge'    then 'hard'         -- 40 pts
    when 'grammar_battle'     then 'very_hard'    -- 50 pts
    else 'easy'
  end
$$;
