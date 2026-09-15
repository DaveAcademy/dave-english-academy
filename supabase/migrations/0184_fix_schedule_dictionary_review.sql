-- Fix: Fix ambiguous column reference in schedule_dictionary_review
-- This is a follow-up to 0181_dictionary_v1_foundation.sql

CREATE OR REPLACE FUNCTION public.schedule_dictionary_review(
  p_word_id bigint,
  p_quality integer
) RETURNS TABLE (
  id bigint,
  student_id bigint,
  state text,
  next_review_at timestamptz,
  interval_days integer,
  ease_factor numeric(4,2),
  lapses integer,
  mastered_at timestamptz,
  updated_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_student_id bigint;
  v_current_record public.student_dictionary_words%ROWTYPE;
  v_new_interval integer;
  v_new_ease numeric(4,2);
  v_new_state text;
  v_new_lapses integer;
  v_mastered_at timestamptz := NULL;
  v_first_seen timestamptz;
BEGIN
  -- Get current record and verify ownership
  SELECT * INTO v_current_record
  FROM public.student_dictionary_words
  WHERE student_dictionary_words.id = p_word_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dictionary word progress not found' USING ERRCODE = 'P0001';
  END IF;

  v_student_id := v_current_record.student_id;

  -- Verify student owns this record (auth.uid() must match)
  IF NOT public.is_own_student(v_student_id) THEN
    RAISE EXCEPTION 'Unauthorized: cannot review another student''s word' USING ERRCODE = '42501';
  END IF;

  -- Calculate SRS transition
  SELECT * INTO v_new_interval, v_new_ease, v_new_state, v_new_lapses
  FROM public.srs_calculate_interval(
    v_current_record.interval_days,
    v_current_record.ease_factor,
    p_quality,
    v_current_record.state
  );

  -- Determine timestamps
  v_first_seen := COALESCE(v_current_record.first_seen_at, now());

  IF v_new_state = 'MASTERED' AND v_current_record.state != 'MASTERED' THEN
    v_mastered_at := now();
  ELSIF v_current_record.state = 'MASTERED' AND v_new_state = 'LAPSED' THEN
    v_mastered_at := NULL;
  ELSE
    v_mastered_at := v_current_record.mastered_at;
  END IF;

  -- Update the record
  UPDATE public.student_dictionary_words
  SET
    state = v_new_state,
    times_seen = times_seen + 1,
    times_correct = times_correct + CASE WHEN p_quality IN (2, 3) THEN 1 ELSE 0 END,
    next_review_at = now() + (v_new_interval || ' days')::interval,
    interval_days = v_new_interval,
    ease_factor = v_new_ease,
    lapses = lapses + v_new_lapses,
    first_seen_at = v_first_seen,
    last_reviewed_at = now(),
    mastered_at = v_mastered_at,
    updated_at = now()
  WHERE student_dictionary_words.id = p_word_id
  RETURNING
    student_dictionary_words.id,
    student_dictionary_words.student_id,
    student_dictionary_words.state,
    student_dictionary_words.next_review_at,
    student_dictionary_words.interval_days,
    student_dictionary_words.ease_factor,
    student_dictionary_words.lapses,
    student_dictionary_words.mastered_at,
    student_dictionary_words.updated_at;
END;
$$;

COMMENT ON FUNCTION public.schedule_dictionary_review
  IS 'Apply a review result to student Dictionary word. Validates ownership, quality, state transitions.';