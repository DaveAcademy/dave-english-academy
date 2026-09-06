-- Dictionary V1 Foundation Migration
-- Adds database foundation for student Dictionary learning system

-- 1. Add dictionary_candidate flag to lesson_vocabulary
ALTER TABLE public.lesson_vocabulary
  ADD COLUMN dictionary_candidate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lesson_vocabulary.dictionary_candidate
  IS 'Marks vocabulary suitable for Core Dictionary SRS progression';

-- 2. Create student_dictionary_words table
CREATE TABLE public.student_dictionary_words (
  id bigserial PRIMARY KEY,
  student_id bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  lesson_vocabulary_id uuid REFERENCES public.lesson_vocabulary(id) ON DELETE CASCADE,
  dictionary_entry_id bigint REFERENCES public.dictionary_entries(id) ON DELETE CASCADE,

  -- SRS state machine
  state text NOT NULL DEFAULT 'NEW'
    CHECK (state IN ('NEW', 'LEARNING', 'REVIEWING', 'MASTERED', 'LAPSED')),

  -- SRS metrics
  times_seen integer NOT NULL DEFAULT 0,
  times_correct integer NOT NULL DEFAULT 0,
  next_review_at timestamptz NOT NULL DEFAULT now(),
  interval_days integer NOT NULL DEFAULT 1,
  ease_factor numeric(4,2) NOT NULL DEFAULT 2.50
    CHECK (ease_factor >= 1.30),
  lapses integer NOT NULL DEFAULT 0,

  -- Timestamps
  first_seen_at timestamptz,
  last_reviewed_at timestamptz,
  mastered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Exactly one source must be populated
  CONSTRAINT student_dictionary_words_one_source CHECK (
    (lesson_vocabulary_id IS NOT NULL AND dictionary_entry_id IS NULL)
    OR (lesson_vocabulary_id IS NULL AND dictionary_entry_id IS NOT NULL)
  ),

  -- No duplicate progress for same student + same source word
  CONSTRAINT student_dictionary_words_unique_source UNIQUE (student_id, lesson_vocabulary_id),
  CONSTRAINT student_dictionary_words_unique_entry UNIQUE (student_id, dictionary_entry_id)
);

COMMENT ON TABLE public.student_dictionary_words
  IS 'Student Dictionary SRS progress tracking. One row per student per Dictionary word source.';

COMMENT ON COLUMN public.student_dictionary_words.state
  IS 'SRS state: NEW -> LEARNING -> REVIEWING -> MASTERED, with LAPSED for failed recalls';

-- 3. Indexes for query performance
CREATE INDEX idx_student_dictionary_words_student_due
  ON public.student_dictionary_words (student_id, next_review_at)
  WHERE state IN ('LEARNING', 'REVIEWING', 'LAPSED', 'MASTERED');

CREATE INDEX idx_student_dictionary_words_student_state
  ON public.student_dictionary_words (student_id, state);

CREATE INDEX idx_student_dictionary_words_student_new
  ON public.student_dictionary_words (student_id, next_review_at)
  WHERE state = 'NEW';

-- 4. SRS helper function: calculate next interval
CREATE OR REPLACE FUNCTION public.srs_calculate_interval(
  p_current_interval integer,
  p_ease_factor numeric,
  p_quality integer,
  p_state text
) RETURNS TABLE (
  new_interval integer,
  new_ease_factor numeric(4,2),
  new_state text,
  new_lapses integer
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_interval integer := p_current_interval;
  v_ease numeric(4,2) := p_ease_factor;
  v_state text := p_state;
  v_lapses integer := 0;
BEGIN
  -- Validate quality
  IF p_quality < 0 OR p_quality > 3 THEN
    RAISE EXCEPTION 'Quality must be 0-3';
  END IF;

  -- Handle incorrect recall (quality 0 or 1) -> LAPSED
  IF p_quality IN (0, 1) THEN
    v_state := 'LAPSED';
    v_interval := 1;
    v_ease := GREATEST(1.30, v_ease - 0.15);
    v_lapses := 1;
    RETURN QUERY SELECT v_interval, v_ease, v_state, v_lapses;
    RETURN;
  END IF;

  -- Correct recall (quality 2 or 3)
  CASE p_state
    WHEN 'NEW' THEN
      v_state := 'LEARNING';
      v_interval := 1;
    WHEN 'LEARNING' THEN
      v_state := 'REVIEWING';
      v_interval := 3;
    WHEN 'REVIEWING' THEN
      v_interval := LEAST(
        ROUND(v_interval * v_ease)::integer,
        180
      );
      IF v_interval >= 90 THEN
        v_state := 'MASTERED';
      END IF;
    WHEN 'MASTERED' THEN
      v_interval := LEAST(
        ROUND(v_interval * v_ease)::integer,
        180
      );
    WHEN 'LAPSED' THEN
      v_state := 'LEARNING';
      v_interval := 1;
    ELSE
      RAISE EXCEPTION 'Invalid state: %', p_state;
  END CASE;

  -- Quality 3 (easy) gives small ease factor boost
  IF p_quality = 3 THEN
    v_ease := v_ease + 0.05;
  END IF;

  v_ease := GREATEST(1.30, v_ease);

  RETURN QUERY SELECT v_interval, v_ease, v_state, v_lapses;
END;
$$;

COMMENT ON FUNCTION public.srs_calculate_interval
  IS 'Core SRS interval calculation. Deterministic, server-side, no client trust.';

-- 5. Main scheduling RPC
CREATE OR REPLACE FUNCTION public.schedule_dictionary_review(
  p_student_dictionary_word_id bigint,
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
  WHERE id = p_student_dictionary_word_id;

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
  WHERE id = p_student_dictionary_word_id
  RETURNING
    id,
    student_id,
    state,
    next_review_at,
    interval_days,
    ease_factor,
    lapses,
    mastered_at,
    updated_at;
END;
$$;

COMMENT ON FUNCTION public.schedule_dictionary_review
  IS 'Apply a review result to student Dictionary word. Validates ownership, quality, state transitions.';

-- 6. Get due reviews RPC
CREATE OR REPLACE FUNCTION public.get_due_dictionary_reviews(
  p_student_id bigint,
  p_limit integer DEFAULT 20
) RETURNS TABLE (
  id bigint,
  student_id bigint,
  lesson_vocabulary_id uuid,
  dictionary_entry_id bigint,
  state text,
  next_review_at timestamptz,
  interval_days integer,
  ease_factor numeric(4,2),
  english text,
  uzbek text,
  pronunciation text,
  part_of_speech text,
  example text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
BEGIN
  -- Verify student owns the records or is teacher/admin
  IF NOT (public.is_own_student(p_student_id) OR public.is_teacher() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    sdw.id,
    sdw.student_id,
    sdw.lesson_vocabulary_id,
    sdw.dictionary_entry_id,
    sdw.state,
    sdw.next_review_at,
    sdw.interval_days,
    sdw.ease_factor,
    COALESCE(lv.english, de.english) AS english,
    COALESCE(lv.uzbek, de.uzbek) AS uzbek,
    COALESCE(lv.pronunciation, de.pronunciation) AS pronunciation,
    COALESCE(lv.part_of_speech, de.part_of_speech) AS part_of_speech,
    COALESCE(lv.example, de.example) AS example
  FROM public.student_dictionary_words sdw
  LEFT JOIN public.lesson_vocabulary lv ON lv.id = sdw.lesson_vocabulary_id
  LEFT JOIN public.dictionary_entries de ON de.id = sdw.dictionary_entry_id
  WHERE sdw.student_id = p_student_id
    AND sdw.state IN ('LEARNING', 'REVIEWING', 'LAPSED', 'MASTERED')
    AND sdw.next_review_at <= now()
  ORDER BY sdw.next_review_at ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_due_dictionary_reviews
  IS 'Get student''s due Dictionary reviews. Returns words ready for review.';

-- 7. Get next new Dictionary words RPC
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

-- 8. Trigger to maintain updated_at
CREATE OR REPLACE FUNCTION public.update_dictionary_words_updated_at()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_student_dictionary_words_updated_at
  BEFORE UPDATE ON public.student_dictionary_words
  FOR EACH ROW EXECUTE FUNCTION public.update_dictionary_words_updated_at();

-- 9. RLS Policies for student_dictionary_words
ALTER TABLE public.student_dictionary_words ENABLE ROW LEVEL SECURITY;

-- Students can SELECT their own words
CREATE POLICY student_dictionary_words_self_select
  ON public.student_dictionary_words
  FOR SELECT
  USING (public.is_own_student(student_id));

-- Students can INSERT their own words (only via RPC, but allow for completeness)
CREATE POLICY student_dictionary_words_self_insert
  ON public.student_dictionary_words
  FOR INSERT
  WITH CHECK (public.is_own_student(student_id));

-- Students can UPDATE their own words (state transitions enforced by RPC)
CREATE POLICY student_dictionary_words_self_update
  ON public.student_dictionary_words
  FOR UPDATE
  USING (public.is_own_student(student_id))
  WITH CHECK (public.is_own_student(student_id));

-- Teachers/admins can SELECT all
CREATE POLICY student_dictionary_words_teacher_select
  ON public.student_dictionary_words
  FOR SELECT
  USING (public.is_teacher() OR public.is_admin());

-- Admins can UPDATE all (for maintenance/corrections)
CREATE POLICY student_dictionary_words_admin_all
  ON public.student_dictionary_words
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 10. Seed dictionary_candidate for ~500 Core Dictionary words
-- Selection: Curriculum-anchored, high-frequency, progressive through lessons
-- Deduplicated by (english, uzbek) pair across lessons
UPDATE public.lesson_vocabulary lv
SET dictionary_candidate = true
FROM (
  SELECT
    lv2.id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(lv2.english), lower(lv2.uzbek)
      ORDER BY cl.lesson_number, lv2.display_order
    ) as rn,
    cl.lesson_number
  FROM public.lesson_vocabulary lv2
  JOIN public.lessons l ON l.id = lv2.lesson_id
  JOIN public.curriculum_lessons cl ON cl.id = l.curriculum_lesson_id
  WHERE lv2.is_active
    AND cl.lesson_number BETWEEN 1 AND 100
) rc
WHERE lv.id = rc.id
  AND rc.rn = 1
  AND rc.lesson_number <= 80;  -- Focus on Foundation through Strong A2 bands (lessons 1-80)