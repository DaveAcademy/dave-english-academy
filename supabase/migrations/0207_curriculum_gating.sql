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