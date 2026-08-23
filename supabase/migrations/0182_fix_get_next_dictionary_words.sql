-- Fix: Add missing get_next_dictionary_words function
-- This is a follow-up to 0181_dictionary_v1_foundation.sql

CREATE OR REPLACE FUNCTION public.get_next_dictionary_words(
  p_student_id bigint,
  p_limit integer DEFAULT 5
) RETURNS TABLE (
  id uuid,
  english text,
  uzbek text,
  pronunciation text,
  part_of_speech text,
  example text,
  lesson_number integer,
  source_type text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_student_level text;
  v_new_words_today integer;
BEGIN
  -- Verify student owns the records or is teacher/admin
  IF NOT (public.is_own_student(p_student_id) OR public.is_teacher() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Get student's level
  SELECT level INTO v_student_level FROM public.students WHERE id = p_student_id;
  IF v_student_level IS NULL THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0001';
  END IF;

  -- Count new words added today (NEW state created today)
  SELECT COUNT(*) INTO v_new_words_today
  FROM public.student_dictionary_words
  WHERE student_id = p_student_id
    AND state = 'NEW'
    AND created_at >= (now() AT TIME ZONE 'Asia/Tashkent')::date;

  -- Enforce daily limit (default 5, max 10)
  IF v_new_words_today >= LEAST(p_limit, 10) THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer, 'limit_reached'::text WHERE FALSE;
    RETURN;
  END IF;

  -- Get eligible new words from curriculum (dictionary_candidate = true)
  -- that student has access to and hasn't started yet
  -- Match logic from student_available_vocabulary(): l.level IS NULL OR l.level = v_student_level
  RETURN QUERY
  WITH available_vocab AS (
    SELECT v.id, v.english, v.uzbek, v.pronunciation, v.part_of_speech, v.example,
           cl.lesson_number
    FROM public.lesson_vocabulary v
    JOIN public.lessons l ON l.id = v.lesson_id
    JOIN public.curriculum_lessons cl ON cl.id = l.curriculum_lesson_id
    WHERE v.is_active
      AND v.dictionary_candidate = true
      AND (l.level IS NULL OR l.level = v_student_level)
      AND cl.lesson_number <= (
        SELECT COALESCE(cp.max_available_lesson, 100000)
        FROM public.curriculum_progress cp
        WHERE cp.level = v_student_level
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.student_dictionary_words sdw
        WHERE sdw.student_id = p_student_id
          AND sdw.lesson_vocabulary_id = v.id
      )
    ORDER BY cl.lesson_number, v.display_order
  )
  SELECT
    av.id,
    av.english,
    av.uzbek,
    av.pronunciation,
    av.part_of_speech,
    av.example,
    av.lesson_number,
    'lesson_vocabulary'::text AS source_type
  FROM available_vocab av
  LIMIT GREATEST(0, LEAST(p_limit, 10) - v_new_words_today);
END;
$$;

COMMENT ON FUNCTION public.get_next_dictionary_words
  IS 'Get eligible new Dictionary words for student. Respects curriculum access, daily limit (5 default, 10 max).';