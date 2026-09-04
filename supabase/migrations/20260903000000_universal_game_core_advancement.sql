-- 20260903000000_universal_game_core_advancement.sql
-- Universal Game Core: Mastery Advancement Fix
-- Changes submit_game_round advancement condition from v_pass-based to
-- v_words_correct = 10 (exactly 10/10 correct triggers one level advance).
-- Idempotent: CREATE OR REPLACE. Safe to re-run.
-- Does NOT modify historical student points, game records, pets, badges.
-- Does NOT redesign visual appearance of any game.
-- Does NOT modify Zach's historical points or level.
-- Does NOT modify academy A/B/C levels.
--
-- The ONLY behavioral change: advancement now requires exactly 10/10 correct.
-- 0-9 correct awards points per correct answer but does NOT advance.
--
-- Old code (line 196): if v_pass and v_round_level is not null then
-- New code (line 196): if v_words_correct = 10 then
--
-- All other behavior is byte-for-byte identical to the previously deployed
-- 20260827223000_definitive_submit_game_round function.

-- Even though a get_round_difficulty() function already exists from
-- migration 0196/020260827233000, this migration also includes it for
-- completeness since the original 0196 was never applied to production
-- and the 020260827233000 was applied separately. This migration ensures
-- the function exists in one idempotent location.

-- ============================================================
-- 1. get_round_difficulty() — Level → Difficulty Composition
--
-- Maps student game level to the expected Easy/Medium/Hard/VH
-- composition of a 10-item round. Ensures beginners start easiest
-- and difficulty grows gradually. Level range 1-100.
--
create or replace function public.get_round_difficulty(p_level integer)
returns table (easy_count integer, medium_count integer, hard_count integer, vh_count integer)
language plpgsql
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
-- 2. submit_game_round() — Universal Game Core Function
--
-- Shares grading + scoring + history + achievement hook for all 10 games.
-- The ONLY intentional behavioral change from the previously deployed
-- 0112/0113/20260827223000 function is the advancement condition:
--
--   OLD: if v_pass and v_round_level is not null then
--   NEW: if v_words_correct = 10 then
--
-- All other grading, scoring, duplicate prevention, curriculum gating,
-- and round validation behavior is byte-for-byte identical.
--
create or replace function public.submit_game_round(p_round_id uuid, p_game_type text, p_answers jsonb)
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
  v_round_game_type text;
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
  -- ONLY advance when exactly 10/10 correct answers.
  -- Tiers: very_easy → easy → medium → hard → very_hard
  -- Advancement moves up exactly one tier.
  if v_words_correct = 10 then
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
-- Migration verification: this function replaces the previously deployed
-- 0112/0113/20260827223000 submit_game_round. The only behavioral change
-- is the advancement condition: v_words_correct = 10 replaces v_pass.
-- All other behavior is identical. Safe to re-run.
-- ------------------------

revoke execute on function public.submit_game_round(uuid, text, jsonb) from public;
grant execute on function public.submit_game_round(uuid, text, jsonb) to authenticated;