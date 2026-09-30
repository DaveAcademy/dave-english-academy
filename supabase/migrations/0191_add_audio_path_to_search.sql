-- Fix: Add audio_path to search_dictionary_unified result
-- This exposes the audio file path for pronunciation playback

DROP FUNCTION IF EXISTS public.search_dictionary_unified(text, integer);

CREATE OR REPLACE FUNCTION public.search_dictionary_unified(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, english text, uzbek text, pronunciation text, part_of_speech text, example text, source_type text, lesson_number integer, audio_path text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    lv.id,
    lv.english,
    lv.uzbek,
    lv.pronunciation,
    lv.part_of_speech,
    lv.example,
    'lesson_vocabulary'::text AS source_type,
    cl.lesson_number,
    lv.audio_path
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
    NULL::integer AS lesson_number,
    de.audio_path
  FROM public.dictionary_entries de
  WHERE de.english ILIKE '%' || p_query || '%'
     OR de.uzbek ILIKE '%' || p_query || '%'
  LIMIT p_limit;
$function$;