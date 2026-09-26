-- Fix: Add source_type and audio_path to get_due_dictionary_reviews result

DROP FUNCTION IF EXISTS public.get_due_dictionary_reviews(bigint, integer);

CREATE OR REPLACE FUNCTION public.get_due_dictionary_reviews(p_student_id bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(
   id bigint,
   student_id bigint,
   lesson_vocabulary_id uuid,
   dictionary_entry_id bigint,
   state text,
   next_review_at timestamp with time zone,
   interval_days integer,
   ease_factor numeric,
   english text,
   uzbek text,
   pronunciation text,
   part_of_speech text,
   example text,
   source_type text,
   audio_path text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.is_own_student(p_student_id) or public.is_teacher() or public.is_admin()) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  select
    sdw.id,
    sdw.student_id,
    sdw.lesson_vocabulary_id,
    sdw.dictionary_entry_id,
    sdw.state,
    sdw.next_review_at,
    sdw.interval_days,
    sdw.ease_factor,
    coalesce(lv.english, de.english) as english,
    coalesce(lv.uzbek, de.uzbek) as uzbek,
    coalesce(lv.pronunciation, de.pronunciation) as pronunciation,
    coalesce(lv.part_of_speech, de.part_of_speech) as part_of_speech,
    coalesce(lv.example, de.example) as example,
    case
      when sdw.lesson_vocabulary_id is not null then 'lesson_vocabulary'::text
      when sdw.dictionary_entry_id is not null then 'dictionary_entries'::text
      else null
    end as source_type,
    coalesce(lv.audio_path, de.audio_path) as audio_path
  from public.student_dictionary_words sdw
  left join public.lesson_vocabulary lv on lv.id = sdw.lesson_vocabulary_id
  left join public.dictionary_entries de on de.id = sdw.dictionary_entry_id
  where sdw.student_id = p_student_id
    and sdw.state in ('NEW', 'LEARNING', 'REVIEWING', 'LAPSED', 'MASTERED')
    and sdw.next_review_at <= now()
  order by sdw.next_review_at asc
  limit p_limit;
end;
$function$;