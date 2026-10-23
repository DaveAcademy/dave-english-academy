-- Fix: Add search_dictionary_unified function
-- This is a follow-up to 0181_dictionary_v1_foundation.sql

CREATE OR REPLACE FUNCTION public.search_dictionary_unified(
  p_query text,
  p_limit integer DEFAULT 20
) RETURNS TABLE (
  id uuid,
  english text,
  uzbek text,
  pronunciation text,
  part_of_speech text,
  example text,
  source_type text,
  lesson_number integer
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$
  SELECT
    lv.id,
    lv.english,
    lv.uzbek,
    lv.pronunciation,
    lv.part_of_speech,
    lv.example,
    'lesson_vocabulary'::text AS source_type,
    cl.lesson_number
  FROM public.lesson_vocabulary lv
  JOIN public.lessons l ON l.id = lv.lesson_id
  JOIN public.curriculum_lessons cl ON cl.id = l.curriculum_lesson_id
  WHERE lv.is_active
    AND (
      lv.english ILIKE '%' || p_query || '%'
      OR lv.uzbek ILIKE '%' || p_query || '%'
    )
  UNION ALL
  SELECT
    gen_random_uuid() AS id,
    de.english,
    de.uzbek,
    de.pronunciation,
    de.part_of_speech,
    de.example,
    'dictionary_entries'::text AS source_type,
    NULL::integer AS lesson_number
  FROM public.dictionary_entries de
  WHERE de.english ILIKE '%' || p_query || '%'
     OR de.uzbek ILIKE '%' || p_query || '%'
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.search_dictionary_unified
  IS 'Unified search across curriculum vocabulary and general dictionary entries.';