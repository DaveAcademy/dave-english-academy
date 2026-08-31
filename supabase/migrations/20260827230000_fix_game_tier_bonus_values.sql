-- Fix: game_tier_bonus() still returns the OLD small values (0,2,5,8,12)
-- from migration 0152. Migration 0196 changed submit_game_round to use
-- game_type_difficulty() for tier selection but forgot to update
-- game_tier_bonus() to return the new point values.
--
-- New point values (spec section 6/18):
--   very_easy:   5 pts (Picture Quiz)
--   easy:       10 pts (Hangman, Vocabulary Quiz)
--   medium:     20 pts (Word Match, Word Scramble)
--   medium_hard: 30 pts (Sentence Scramble, Word Builder)
--   hard:       40 pts (Word Detective, Speed Challenge)
--   very_hard:  50 pts (Grammar Battle)

create or replace function public.game_tier_bonus(p_tier text)
returns integer
language sql
immutable
set search_path = 'public'
as $$
  select case p_tier
    when 'very_easy'  then 5
    when 'easy'       then 10
    when 'medium'     then 20
    when 'medium_hard' then 30
    when 'hard'       then 40
    when 'very_hard'  then 50
    else 5
  end
$$;
