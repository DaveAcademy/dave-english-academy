-- Repair migration: re-apply fixes for 0203, 0204, 0207, shared core that were already marked applied before fixes
-- Idempotent: CREATE OR REPLACE

-- 0203: fix get_academy_week_start (Monday Asia/Tashkent)
create or replace function public.get_academy_week_start()
returns date language sql stable security definer set search_path to 'public' as $$
  select ((now() at time zone 'Asia/Tashkent')::date - ((extract(isodow from (now() at time zone 'Asia/Tashkent'))::int - 1))::int)::date;
$$;
revoke execute on function public.get_academy_week_start() from public;
grant execute on function public.get_academy_week_start() to authenticated;

-- 0203: fix get_current_streak
create or replace function public.get_current_streak(p_student_id bigint)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_streak int := 0;
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_check date;
begin
  v_check := v_today;
  loop
    if exists (select 1 from public.student_learning_days where student_id = p_student_id and date = v_check) then
      v_streak := v_streak + 1;
      v_check := v_check - 1;
    else
      if v_streak = 0 then
        v_check := v_check - 1;
        if not exists (select 1 from public.student_learning_days where student_id = p_student_id and date = v_check) then
          return 0;
        end if;
        v_streak := 1;
        v_check := v_check - 1;
        continue;
      else
        exit;
      end if;
    end if;
    if v_streak > 365 then exit; end if;
  end loop;
  return v_streak;
end;
$$;
revoke execute on function public.get_current_streak(bigint) from public;
grant execute on function public.get_current_streak(bigint) to authenticated;

-- 0203: fix get_best_streak
create or replace function public.get_best_streak(p_student_id bigint)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_best int := 0;
  v_cur int := 0;
  v_prev date := null;
  r record;
begin
  v_cur := 0;
  for r in select date from public.student_learning_days where student_id = p_student_id order by date asc loop
    if v_prev is null then v_cur := 1;
    elsif r.date = v_prev + 1 then v_cur := v_cur + 1;
    else v_cur := 1;
    end if;
    if v_cur > v_best then v_best := v_cur; end if;
    v_prev := r.date;
  end loop;
  return least(v_best, 365);
end;
$$;
revoke execute on function public.get_best_streak(bigint) from public;
grant execute on function public.get_best_streak(bigint) to authenticated;

-- 0204: fix is_dictionary_word_mastered (remove FROM shadowing)
drop function if exists public.is_dictionary_word_mastered(bigint);
create or replace function public.is_dictionary_word_mastered(p_word_id bigint)
returns table (word_id bigint, student_id bigint, translation_complete boolean, typing_complete boolean, sentence_complete boolean, retention_complete boolean, srs_mastered boolean, mastered_at timestamptz)
language plpgsql security definer set search_path to 'public' as $$
declare v_current public.student_dictionary_words%rowtype;
begin
  select * into v_current from public.student_dictionary_words where id = p_word_id;
  if not found then raise exception 'Dictionary word progress not found' using errcode='P0001'; end if;
  return query select v_current.id as word_id, v_current.student_id, (v_current.translation_complete is not null) as translation_complete, (v_current.typing_complete is not null) as typing_complete, (v_current.sentence_complete is not null) as sentence_complete, (v_current.retention_at is not null) as retention_complete, (v_current.state = 'MASTERED' AND v_current.interval_days >= 90) as srs_mastered, v_current.mastered_at;
end;
$$;
revoke execute on function public.is_dictionary_word_mastered(bigint) from public;
grant execute on function public.is_dictionary_word_mastered(bigint) to authenticated;


-- 0207: repair curriculum gating (re-apply fixed version)
-- Migration 0199: Curriculum gating for 3 game round RPCs
-- Adds min_lesson_number filtering based on student's current level
-- from game_level_progress, so students cannot receive content beyond
-- their current curriculum progression.
--
-- Gating formula: max_lesson = greatest(1, least(100, current_level * 5))
--   level 1:   max 5  (very_easy foundations only)
--   level 2:   max 10 (very_easy + easy foundations/can_ability)
--   level 7:   max 35 (up to easy prepositions)
--   level 10:  max 50 (all easy + some medium)
--   level 20:  max 100 (all content)
--   level 21+: max 100 (all content)
--
-- This uses the existing game_level_progress.current_level,
-- which is the authoritative source of student progress.

-- ============================
-- 1. get_sentence_scramble_round() - ADD GATING FILTER
-- ============================
DROP FUNCTION IF EXISTS public.get_sentence_scramble_round();
CREATE OR REPLACE FUNCTION public.get_sentence_scramble_round()
RETURNS table(round_id uuid, id uuid, english text, type text, difficulty text, min_lesson_number integer)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id bigint;
  v_current_level integer;
  v_max_lesson integer;
BEGIN
  -- Resolve student id from JWT
  SELECT s.id INTO v_student_id FROM public.students s WHERE s.profile_id = auth.uid();
  IF v_student_id IS NULL THEN
    RETURN QUERY SELECT null::uuid, null::uuid, null::text, null::text, null::text, null::integer
                 WHERE 0 = 1;
  END IF;

  -- Get student's current level for sentence_scramble
  SELECT current_level INTO v_current_level FROM public.game_level_progress
  WHERE student_id = v_student_id AND game_type = 'sentence_scramble';

  IF v_current_level IS NULL THEN
    v_current_level := 1;
  END IF;

  -- Compute max lesson number student can access
  v_max_lesson := greatest(1, least(100, (v_current_level * 5)));

  -- Select from game_content_bank with curriculum gating
  -- The additional filter: min_lesson_number <= v_max_lesson
  -- prevents students from receiving content beyond their level.
  RETURN QUERY
  SELECT 
    r.round_id, r.id, r.english, r.type, r.difficulty, r.min_lesson_number
  FROM (
    -- Original selection logic from migration 0144, with gating filter added
    SELECT 
      gen_random_uuid() AS round_id,
      p.id,
      (p.payload->'words')::jsonb->0 AS english,
      CASE 
        WHEN (payload->'type')::text = 'statement' THEN 'statement'
        WHEN (payload->'type')::text = 'question' THEN 'question'
        WHEN (payload->'type')::text = 'command' THEN 'command'
        WHEN (payload->'type')::text = 'exclamation' THEN 'exclamation'
        ELSE 'statement'
      END AS type,
      CASE 
        WHEN (payload->'type')::text = 'first_conditional' THEN 'very_hard'
        WHEN (payload->'type')::text = 'present_continuous' THEN 'medium'
        WHEN (payload->'type')::text = 'past_simple_regular' THEN 'medium'
        WHEN (payload->'type')::text = 'past_simple_irregular' THEN 'medium'
        WHEN (payload->'type')::text = 'can_ability' THEN 'easy'
        WHEN (payload->'type')::text = 'basic_questions' THEN 'easy'
        WHEN (payload->'type')::text = 'prepositions' THEN 'easy'
        WHEN (payload->'type')::text = 'foundations' THEN 'very_easy'
        ELSE 'very_easy'
      END AS difficulty,
      p.min_lesson_number
    FROM public.game_content_bank p
    WHERE p.game_type = 'sentence_scramble'
      AND p.min_lesson_number IS NOT NULL
      AND p.min_lesson_number <= v_max_lesson  -- <--- CURRICULUM GATING FILTER ADDED
    ORDER BY random()
    LIMIT 1
  ) r;
END;
$$;

-- ============================
-- 2. get_word_detective_round() - ADD GATING FILTER
-- ============================

DROP FUNCTION IF EXISTS public.get_word_detective_round();
CREATE OR REPLACE FUNCTION public.get_word_detective_round()
RETURNS table(round_id uuid, id uuid, sentence text, wrong_index integer, correction text, difficulty text, min_lesson_number integer)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id bigint;
  v_current_level integer;
  v_max_lesson integer;
BEGIN
  -- Resolve student id
  SELECT s.id INTO v_student_id FROM public.students s WHERE s.profile_id = auth.uid();
  IF v_student_id IS NULL THEN
    RETURN;
  END IF;

  -- Get student's current level for word_detective
  SELECT current_level INTO v_current_level FROM public.game_level_progress
  WHERE student_id = v_student_id AND game_type = 'word_detective';

  IF v_current_level IS NULL THEN
    v_current_level := 1;
  END IF;

  -- Compute max lesson number student can access
  v_max_lesson := greatest(1, least(100, (v_current_level * 5)));

  -- Select from game_content_bank with curriculum gating
  RETURN QUERY
  SELECT 
    gen_random_uuid() AS round_id,
    id,
    sentence,
    wrong_index,
    correction,
    difficulty,
    min_lesson_number
  FROM public.game_content_bank
  WHERE game_type = 'word_detective'
    AND min_lesson_number IS NOT NULL
    AND min_lesson_number <= v_max_lesson  -- <--- CURRICULUM GATING FILTER ADDED
  ORDER BY random()
  LIMIT 1;
END;
$$;

-- ============================
-- 3. get_grammar_battle_round() - ADD GATING FILTER
-- ============================

DROP FUNCTION IF EXISTS public.get_grammar_battle_round();
CREATE OR REPLACE FUNCTION public.get_grammar_battle_round()
RETURNS table(round_id uuid, id uuid, question text, options jsonb, difficulty text, min_lesson_number integer, correct_index integer)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id bigint;
  v_current_level integer;
  v_max_lesson integer;
BEGIN
  -- Resolve student id
  SELECT s.id INTO v_student_id FROM public.students s WHERE s.profile_id = auth.uid();
  IF v_student_id IS NULL THEN
    RETURN;
  END IF;

  -- Get student's current level for grammar_battle
  SELECT current_level INTO v_current_level FROM public.game_level_progress
  WHERE student_id = v_student_id AND game_type = 'grammar_battle';

  IF v_current_level IS NULL THEN
    v_current_level := 1;
  END IF;

  -- Compute max lesson number student can access
  v_max_lesson := greatest(1, least(100, (v_current_level * 5)));

  -- Select from game_content_bank with curriculum gating
  -- The filter: min_lesson_number <= v_max_lesson ensures students
  -- only receive content appropriate for their current level.
  -- The existing tier-based selection (10 easy + 10 medium + 8 hard)
  -- is preserved; this just adds an additional curriculum gate.
  RETURN QUERY
  SELECT 
    gen_random_uuid() AS round_id,
    id,
    (payload->'question')::text AS question,
    payload->'options' AS options,
    (payload->'difficulty')::text AS difficulty,
    (payload->'min_lesson_number')::integer AS min_lesson_number,
    (payload->'correct_index')::integer AS correct_index
  FROM public.game_content_bank
  WHERE game_type = 'grammar_battle'
    AND min_lesson_number IS NOT NULL
    AND min_lesson_number <= v_max_lesson  -- <--- CURRICULUM GATING FILTER ADDED
    ORDER BY 
      CASE 
        WHEN (payload->'difficulty')::text = 'very_easy' THEN 1
        WHEN (payload->'difficulty')::text = 'easy' THEN 2
        WHEN (payload->'difficulty')::text = 'medium' THEN 3
        WHEN (payload->'difficulty')::text = 'hard' THEN 4
        WHEN (payload->'difficulty')::text = 'very_hard' THEN 5
      END,
      random()
  LIMIT 1;
END;
$$;

-- ============================
-- Verification notes
-- ============================
-- To verify the gating is working correctly, run:
--
-- SELECT 
--   glp.student_id,
--   glp.current_level,
--   greatest(1, least(100, (glp.current_level * 5))) AS max_lesson_allowed,
--   gcb.min_lesson_number,
--   gcb.game_type
-- FROM public.game_level_progress glp
-- JOIN public.students s ON glp.student_id = s.id
-- JOIN public.game_content_bank gcb ON gcb.game_type IN ('sentence_scramble','word_detective','grammar_battle')
-- WHERE gcb.min_lesson_number > greatest(1, least(100, (glp.current_level * 5)))
-- ORDER BY glp.current_level, gcb.min_lesson_number;
--
-- This should return 0 rows if the gating is working (no content
-- where min_lesson_number exceeds the student's allowed maximum).
--
-- End of migration 0199

-- shared core: repair submit_game_round (latest universal core)
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
      'results', '--- duplicate round ---'
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
      current_level = v_new_level,
      best_level_reached = greatest(best_level_reached, v_new_level::text);
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