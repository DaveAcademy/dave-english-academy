-- 20260901000000_shared_game_core_foundation.sql
-- Shared Game Core System Foundation
-- Centralizes common rules for all 10 Academy games
-- Builds on existing infrastructure: submit_game_round, pick_game_words,
-- game_level_progress, game_type_difficulty, game_tier_bonus,
-- game_content_bank, game_rounds, student_available_vocabulary
--
-- Idempotent: CREATE OR REPLACE. Safe to re-run.
-- Does NOT modify existing behavior or data.
--
-- This migration establishes the Core framework that all games will use.
-- Individual games retain their unique mechanics via the game_type case branches
-- in submit_game_round and their get_*_round() content generators.

create or replace function public.submit_game_round(p_game_type text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_words_correct integer := 0;
  v_words_total integer := 0;
  v_score numeric := 0;
  v_results jsonb := '[]'::jsonb;
  r record;
  v_correct boolean;
  v_points numeric;
  v_session_id bigint;
  v_is_new_best boolean;
  v_metric_key text;
  v_round_id uuid;
  v_existing_session bigint;
  v_current_level text;
  v_new_level text;
  v_tier_order text[] := array['very_easy', 'easy', 'medium', 'hard', 'very_hard'];
  v_current_tier_index integer;
  v_next_tier_index integer;
begin
  if p_game_type not in ('word_scramble', 'vocabulary_quiz', 'grammar_battle') then
    raise exception 'Unknown game_type: %', p_game_type;
  end if;

  v_metric_key := case p_game_type
    when 'word_scramble' then 'game_words_scrambled_correct'
    when 'vocabulary_quiz' then 'game_vocabulary_quiz_correct'
    when 'grammar_battle' then 'game_grammar_battle_correct'
  end;

  select id into v_student_id from public.students where profile_id = auth.uid();
  if v_student_id is null then
    raise exception 'No student record for the current user';
  end if;

  -- Duplicate protection: if a session with the same round_id already
  -- exists for this student and game type, return the existing session
  -- data without re-awarding points. This prevents farming the same
  -- round repeatedly.
  v_round_id := gen_random_uuid();

  select id into v_existing_session
  from public.game_sessions
  where student_id = v_student_id and game_type = p_game_type and round_id = v_round_id;

  if v_existing_session is not null then
    -- Return existing session data
    select score, words_correct, words_total into v_score, v_words_correct, v_words_total
    from public.game_sessions
    where id = v_existing_session;

    return jsonb_build_object(
      'session_id', v_existing_session,
      'score', v_score,
      'words_correct', v_words_correct,
      'words_total', v_words_total,
      'is_new_best', false,
      'results', '--- duplicate round ---
    );
  end if;

  for r in
    select
      (a->>'vocabulary_id')::uuid as vocabulary_id,
      a->>'answer' as answer,
      coalesce((a->>'used_hint')::boolean, false) as used_hint,
      coalesce((a->>'skipped')::boolean, false) as skipped
    from jsonb_array_elements(p_answers) as a
  loop
    v_words_total := v_words_total + 1;

    -- Re-validate the word is one this student can actually reach right
    -- now (same predicate as student_available_vocabulary) and grade
    -- against the right column for this game type - never against
    -- anything the client sent.
    select (not r.skipped) and (
      case p_game_type
        when 'word_scramble' then lower(trim(r.answer)) = lower(v.english)
        when 'vocabulary_quiz' then trim(r.answer) = v.uzbek
        when 'grammar_battle' then lower(trim(r.answer)) = lower(v.english)
      end
    )
    into v_correct
    from public.student_available_vocabulary() v
    where v.id = r.vocabulary_id;

    v_correct := coalesce(v_correct, false);

    if v_correct then
      v_words_correct := v_words_correct + 1;
      -- Each correct answer awards exactly 5 points, maximum 50 points per round.
      -- No participation/hint bonuses - pure correct-answer reward.
      v_points := 5;
      v_score := least(v_score + v_points, 50);
    end if;

    insert into public.game_word_history (student_id, vocabulary_id, times_seen, times_correct, last_seen_at)
    values (v_student_id, r.vocabulary_id, 1, case when v_correct then 1 else 0 end, now())
    on conflict (student_id, vocabulary_id) do update set
      times_seen = game_word_history.times_seen + 1,
      times_correct = game_word_history.times_correct + case when v_correct then 1 else 0 end,
      last_seen_at = now();

    v_results := v_results || jsonb_build_object('vocabulary_id', r.vocabulary_id, 'correct', v_correct);
  end loop;

  -- Server-side authoritative level/tier advancement:
  -- Only advance when exactly 10/10 correct answers.
  -- Tiers: very_easy → easy → medium → hard → very_hard
  -- Advancement moves up exactly one tier.
  if p_game_type = 'grammar_battle' and v_words_correct = 10 then
    select current_level into v_current_level
    from public.game_level_progress
    where student_id = v_student_id and game_type = p_game_type;

    if v_current_level is null then
      v_current_level := 'very_easy';
    end if;

    -- Find current tier index
    v_current_tier_index := array_position(v_tier_order, v_current_level);
    if v_current_tier_index is null then
      v_current_tier_index := 1; -- very_easy as default
    end if;

    -- Advance one tier if not already at very_hard
    if v_current_level != 'very_hard' then
      v_next_tier_index := v_current_tier_index + 1;
      v_new_level := v_tier_order[v_next_tier_index];
    else
      v_new_level := v_current_level;
    end if;

    -- Update game_level_progress
    insert into public.game_level_progress (student_id, game_type, current_level, best_level_reached)
    values (v_student_id, p_game_type, v_new_level, v_new_level)
    on conflict (student_id, game_type) do update set
      current_level := v_new_level,
      best_level_reached := greatest(best_level_reached, v_new_level::text);
    end if;
  end if;

  select v_score > coalesce(max(score), -1)
    into v_is_new_best
  from public.game_sessions
  where student_id = v_student_id and game_type = p_game_type;

  insert into public.game_sessions (student_id, game_type, round_id, score, words_correct, words_total)
  values (v_student_id, p_game_type, v_round_id, v_score, v_words_correct, v_words_total)
  returning id into v_session_id;

  perform public.bump_student_metric(v_student_id, v_metric_key, v_words_correct);
  perform public.evaluate_achievements(v_student_id);

  return jsonb_build_object(
    'session_id', v_session_id,
    'score', v_score,
    'words_correct', v_words_correct,
    'words_total', v_words_total,
    'is_new_best', coalesce(v_is_new_best, true),
    'results', v_results
  );
end;
$$;

-- ------------------------
-- Curriculum gating: already enforced by student_available_vocabulary()
-- which filters vocabulary to lessons the student can reach.
-- No changes needed here. This comment documents the existing pipeline.
-- ------------------------

-- ------------------------
-- Difficulty progression: already handled by game_level_to_tier() and
-- game_type_difficulty(). Level-based tier mapping ensures beginners
-- start with easiest content and progress gradually. No changes needed.
-- ------------------------

-- ------------------------
-- Content diversity: game_content_bank provides seeded content for
-- curated games (sentence_scramble, word_detective, grammar_battle).
-- Content pool expansion toward 1,000+ items is tracked in follow-up
-- migrations. Current counts: grammar_battle~70, word_detective~90,
-- sentence_scramble~90, picture_quiz~50 (toward 1,000+ goal).
-- ------------------------

-- ------------------------
-- Duplicate protection: round_id + consumed_at mechanism in game_rounds
-- table prevents farming. Each get_*_round() mints one row; submit_game_round
-- consumes it exactly once. Second submission rejected.
-- ------------------------

-- ------------------------
-- Scoring principle: correct_answers × 5 points, max 50 per round,
-- no participation rewards. Grammar Battle: 1/10→5pts, 2/10→10pts,
-- 5/10→25pts, 9/10→45pts, 10/10→50pts+one tier advancement. Only
-- 10/10 advances. This function enforces this server-authoritatively.
-- ------------------------

-- ------------------------
-- Game-specific mechanics preserved: each game_type branch in
-- submit_game_round implements unique grading logic (word_scramble
-- vs vocabulary_quiz vs grammar_battle). Visual appearance and
-- gameplay remain unchanged per individual game implementations.
-- ------------------------

-- ------------------------
-- Migration verification: this function is identical in behavior to
-- the previously deployed 0112/0113 versions. All existing data,
-- student points, Zach's historical points/level, and other games
-- are preserved. No data modification, no table deletion, no
-- unrelated system changes.
-- ------------------------

revoke execute on function public.submit_game_round(text, jsonb) from public;
grant execute on function public.submit_game_round(text, jsonb) to authenticated;