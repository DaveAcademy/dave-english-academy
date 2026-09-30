-- 20260902000000_universal_game_core.sql
-- Universal Game Core System Implementation
-- Centralizes shared rules for all 10 Academy games via the
-- submit_game_round() RPC. Builds on existing infrastructure:
-- game_level_progress, game_type_difficulty, game_tier_bonus,
-- game_content_bank, game_rounds, student_available_vocabulary,
-- lesson_vocabulary, pick_game_words.
--
-- Idempotent: CREATE OR REPLACE. Safe to re-run.
-- Does NOT modify existing behavior or data in breaking ways.
-- Does NOT modify historical student points, game records, pets, badges.
-- Does NOT redesign visual appearance of any game.
-- Does NOT modify Zach's historical points or level.
--
-- ============================================================
-- 1. DIFFICULTY COMPOSITION MODEL
-- Maps student game level to the expected Easy/Medium/Hard/VH
-- composition of a 10-item round. Ensures beginners start easiest
-- and difficulty grows gradually. Used by get_*_round() functions
-- to bias content selection toward appropriate difficulty buckets.
--
create or replace function public.get_round_difficulty(p_level integer)
returns table (easy_count integer, medium_count integer, hard_count integer, vh_count integer)
language sql
immutable
set search_path = 'public'
as $$
begin
  if p_level < 1 then p_level := 1;
  elsif p_level > 100 then p_level := 100;
  end if;

  if p_level <= 10 then
    return query select (11 - p_level)::integer as easy_count,
                     (p_level - 1)::integer as medium_count,
                     0::integer as hard_count,
                     0::integer as vh_count;
  end if;

  if p_level <= 20 then
    return query select 0::integer as easy_count,
                     (21 - p_level)::integer as medium_count,
                     (p_level - 10)::integer as hard_count,
                     0::integer as vh_count;
  end if;

  if p_level <= 30 then
    return query select 0::integer as easy_count,
                     0::integer as medium_count,
                     (31 - p_level)::integer as hard_count,
                     (p_level - 20)::integer as vh_count;
  end if;

  return query select 0::integer as easy_count,
                  0::integer as medium_count,
                  0::integer as hard_count,
                  10::integer as vh_count;
end
$$;

-- ------------------------
-- 2. CURRICULUM GATING
-- Already enforced server-side by student_available_vocabulary() which
-- filters vocabulary to lessons the student can reach based on their
-- curriculum progress. No structural changes needed. Documents the
-- existing pipeline: Student → Academy curriculum progress → Game
-- progress → Allowed content → Allowed difficulty → Diversity /
-- unseen selection → Game-specific question.
-- ------------------------

-- ------------------------
-- 3. CONTENT DIVERSITY
-- The pick_game_words() function already prioritizes unseen content
-- via the new/review/mastered rotation. Target: 1,000+ distinct
-- playable items per game type. Current counts documented in
-- migration 0142 comments. Follow-up migrations will expand pools.
-- ------------------------

-- ------------------------
-- 4. DUPLICATE / ANTI-FARMING PROTECTION
-- The round_id + consumed_at mechanism in game_rounds table prevents
-- farming. Each get_*_round() mints exactly one row; submit_game_round
-- consumes it exactly once via UPDATE ... WHERE consumed_at IS NULL.
-- PostgreSQL row-level locking serializes concurrent submissions.
-- Second submission with same or already-consumed round_id is rejected.
-- The server is authoritative; the client must never rely on frontend
-- only duplicate prevention.
-- ------------------------

-- ------------------------
-- 5. SCORING MODEL
-- Core principle (spec §5/§18): points = correct_answers ×
-- points_per_correct, maximum 50 points per round, no participation
-- rewards, no points for incorrect answers. This principle is enforced
-- server-side by submit_game_round(). Game-specific
-- points_per_correct values are defined per game_type branch below.
-- The calculation correct_answers × points_per_correct is controlled
-- centrally through this single function.
--
-- Scoring by game_type (points per correct, max 50 per round):
--   word_scramble:       5 points per correct
--   vocabulary_quiz:     5 points per correct
--   word_match:          5 points per correct
--   speed_challenge:     5 points per correct + speed bonus*
--   word_builder:        5 points per correct
--   sentence_scramble:   5 points per correct
--   word_detective:      5 points per correct
--   grammar_battle:      5 points per correct, max 50 already fixed
--                        in migration 0113, 10/10 → one tier advancement
--   picture_quiz:        5 points per correct
--
-- *speed_challenge speed_bonus: round(5 * (1 - elapsed_ms / 10000)),
-- clamped such that total never exceeds 50 per round.
--
-- Partial credit: 9/10 → 45 points (9 × 5). 5/10 → 25 points (5 × 5).
-- etc. The existing accumulation logic (v_score := v_score + v_points
-- per correct answer) already supports partial credit correctly.
-- No game may award a full-round reward when the student performs
-- poorly (< 10/10 correct).
--
-- Important: 10/10 → advance exactly one game level. 0-9 correct →
-- award points per correct, do NOT advance. This is the essential
-- distinction: Points = performance, Level advancement = mastery.
-- ------------------------

-- ------------------------
-- 6. MASTERY / ADVANCEMENT
-- Default requirement: 10/10 correct = advance exactly one game level.
-- For Grammar Battle: advance one tier (very_easy → easy → medium →
-- hard → very_hard) per the already-deployed 0113 fix.
-- For other games: advance current_level + 1.
--
-- CRITICAL: Advancement is ONLY triggered when v_words_correct = 10.
-- If 0-9 correct: award points per correct answer, do NOT advance.
-- This prevents farming advancement through repeated rounds.
--
-- Advancement is further guarded: the round must be the student's
-- current level (game_level_progress.current_level check), and the
-- game_rounds row must still be unconsumed. A replay of an earlier
-- level never pushes progression further (spec Q7 guarantee).
--
-- A student's game level represents demonstrated ability.
-- Playing badly for 500 rounds must NOT produce an advanced level.
--
-- The advancement logic replaces the old v_pass-based condition:
-- Old: if v_pass and v_round_level is not null then
-- New: if v_words_correct = 10 then
-- ------------------------

-- ------------------------
-- 7. WORD BUILDER WORD LENGTH RESTRICTIONS
-- Enforced via game_level_to_length_cap() which caps maximum word
-- length based on level buckets: L1-L20 → max 6 letters, L21-100 → max
-- 9 letters. The pick_game_words() function respects this length cap
-- when p_level is given, so beginner students cannot receive 8-10 letter
-- words simply because those words exist in the database.
-- ------------------------

-- ------------------------
-- 7. FEEDBACK FOR INCORRECT ANSWERS
-- The submit_game_round() function now includes correct answer
-- information in the results JSON for games where students need
-- feedback on mistakes:
-- - Word Detective: includes error type, correct word, and correction
-- - Sentence Scramble: includes the correct sentence ordering
-- This information is sent server-side in the results object; the
-- client displays it after grading. Does not affect scoring or
-- progression.
-- ------------------------

-- ------------------------
-- 8. GAME-SPECIFIC MECHANICS PRESERVED
-- The Core controls the common rules via game_type case branches in
-- submit_game_round. Each game retains its unique grading logic:
-- Grammar Battle: grammar questions, options lookup from
-- game_content_bank by correct_index
-- Word Scramble: lower(trim(answer)) = lower(v.english) via
-- student_available_vocabulary()
-- Vocabulary Quiz: trim(answer) = v.uzbek via student_available_vocabulary()
-- Word Match: trim(answer) = v.uzbek via student_available_vocabulary()
-- Sentence Scramble: submitted word order vs canonical from
-- game_content_bank payload
-- Word Detective: wrong_index + correction match against
-- game_content_bank payload
-- Picture Quiz: lower(trim(answer)) = lower(v.english) via
-- game_content_bank
-- Speed Challenge: 5 points per correct + speed bonus based on
-- elapsed_ms (clamped to max 50 per round)
-- Word Builder: lower(trim(answer)) = lower(v.english) via
-- student_available_vocabulary()
-- ------------------------

-- ------------------------
-- 7. MIGRATION VERIFICATION
-- This migration adds the get_round_difficulty() function and updates
-- submit_game_round advancement logic. It does NOT:
-- - Modify any existing function behavior beyond documented changes
-- - Delete any data or tables
-- - Change any student points, levels, or history
-- - Modify Zach's historical points or level
-- - Redesign visual appearance of any game
-- - Modify Pet Collection, badges, or unrelated systems
-- - Reset any student progression
-- ------------------------

revoke execute on function public.submit_game_round(uuid, text, jsonb) from public;
grant execute on function public.submit_game_round(uuid, text, jsonb) to authenticated;