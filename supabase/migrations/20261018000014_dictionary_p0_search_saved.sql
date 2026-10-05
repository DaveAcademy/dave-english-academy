-- Dictionary P0: ranked/typo-tolerant search, entry start support, entry favorites.
--
-- 1. search_dictionary_unified() v2 (replaces 0191):
--    - Ranked results: exact EN/UZ match (0), prefix (1), trigram
--      similarity (2), substring (3); ORDER BY rank, english. Previously
--      UNION ALL with LIMIT and no ORDER BY, so exact matches did not
--      reliably surface first.
--    - Typo tolerance: pg_trgm similarity() > 0.3 on either side also
--      qualifies a row (extension created in 0116; existing trigram
--      indexes serve it). LIKE metacharacters in the query are escaped.
--    - Adds example_uzbek (dictionary_entries has it; lesson_vocabulary
--      does not, so lesson rows return NULL) and entry_id (the real
--      dictionary_entries id; the legacy uuid id column is kept
--      unchanged for backward compatibility).
--    - Empty/blank queries return no rows (frontend already skips them).
--    - Re-applies the authenticated-only EXECUTE trio: 0191's DROP wiped
--      the 0186/0187 grants, so this also re-locks the function.
-- 2. start_dictionary_words(p_word_ids uuid[], p_entry_ids bigint[]):
--    replaces the uuid[]-only form so Search can start general entries
--    through the same server-authoritative path (same 10/day cap, same
--    duplicate protection, no SRS changes). Lesson-word rules unchanged.
-- 3. student_vocabulary_favorites: nullable dictionary_entry_id +
--    exactly-one-source CHECK + unique(student, entry). Existing rows
--    (vocabulary_id set, entry NULL) satisfy the CHECK; RLS policies are
--    source-agnostic and unchanged. Reuses the existing favorites
--    system - no new table.
--
-- No SRS algorithm, ranking, XP, game, homework, or lesson changes.

-- ---------- 3. favorites extension (table first, functions reference it) ----------

alter table public.student_vocabulary_favorites
  alter column vocabulary_id drop not null;

alter table public.student_vocabulary_favorites
  add column if not exists dictionary_entry_id bigint
    references public.dictionary_entries (id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'student_vocabulary_favorites_one_source'
  ) then
    alter table public.student_vocabulary_favorites
      add constraint student_vocabulary_favorites_one_source check (
        (vocabulary_id is not null and dictionary_entry_id is null)
        or (vocabulary_id is null and dictionary_entry_id is not null)
      );
  end if;
end;
$$;

create unique index if not exists student_vocabulary_favorites_student_entry_idx
  on public.student_vocabulary_favorites (student_id, dictionary_entry_id);

-- ---------- 1. ranked search ----------

drop function if exists public.search_dictionary_unified(text, integer);

create function public.search_dictionary_unified(p_query text, p_limit integer default 20)
returns table (
  id uuid, english text, uzbek text, pronunciation text, part_of_speech text,
  example text, example_uzbek text, source_type text, lesson_number integer,
  audio_path text, entry_id bigint
)
language sql
security definer
set search_path = 'public'
as $function$
  with q as (
    select nullif(btrim(lower(p_query)), '') as t
  ),
  e as (
    select t,
      replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') as pat
    from q
  )
  select s.id, s.english, s.uzbek, s.pronunciation, s.part_of_speech,
    s.example, s.example_uzbek, s.source_type, s.lesson_number,
    s.audio_path, s.entry_id
  from (
    select lv.id, lv.english, lv.uzbek, lv.pronunciation, lv.part_of_speech,
      lv.example, null::text as example_uzbek,
      'lesson_vocabulary'::text as source_type, cl.lesson_number,
      lv.audio_path, null::bigint as entry_id,
      case
        when lower(lv.english) = e.t or lower(lv.uzbek) = e.t then 0
        when lv.english ilike e.pat || '%' escape '\'
          or lv.uzbek ilike e.pat || '%' escape '\' then 1
        when public.similarity(lv.english, e.t) > 0.3
          or public.similarity(lv.uzbek, e.t) > 0.3 then 2
        else 3
      end as rnk
    from public.lesson_vocabulary lv
    join public.lessons l on l.id = lv.lesson_id
    join public.curriculum_lessons cl on cl.id = l.curriculum_lesson_id,
      e
    where lv.is_active
      and e.t is not null
      and (
        lv.english ilike '%' || e.pat || '%' escape '\'
        or lv.uzbek ilike '%' || e.pat || '%' escape '\'
        or public.similarity(lv.english, e.t) > 0.3
        or public.similarity(lv.uzbek, e.t) > 0.3
      )
    union all
    select gen_random_uuid(), de.english, de.uzbek, de.pronunciation,
      de.part_of_speech, de.example, de.example_uzbek,
      'dictionary_entries'::text as source_type, null::integer as lesson_number,
      de.audio_path, de.id as entry_id,
      case
        when lower(de.english) = e.t or lower(de.uzbek) = e.t then 0
        when de.english ilike e.pat || '%' escape '\'
          or de.uzbek ilike e.pat || '%' escape '\' then 1
        when public.similarity(de.english, e.t) > 0.3
          or public.similarity(de.uzbek, e.t) > 0.3 then 2
        else 3
      end as rnk
    from public.dictionary_entries de, e
    where e.t is not null
      and (
        de.english ilike '%' || e.pat || '%' escape '\'
        or de.uzbek ilike '%' || e.pat || '%' escape '\'
        or public.similarity(de.english, e.t) > 0.3
        or public.similarity(de.uzbek, e.t) > 0.3
      )
  ) s
  order by s.rnk, s.english
  limit p_limit;
$function$;

revoke execute on function public.search_dictionary_unified(text, integer) from anon;
revoke execute on function public.search_dictionary_unified(text, integer) from public;
grant execute on function public.search_dictionary_unified(text, integer) to authenticated;

-- ---------- 2. start entries through the same path ----------

drop function if exists public.start_dictionary_words(uuid[]);

create function public.start_dictionary_words(p_word_ids uuid[], p_entry_ids bigint[] default '{}')
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_level text;
  v_max_lesson integer;
  v_already_today integer;
  v_allowed integer;
  v_lesson_inserted integer := 0;
  v_entry_inserted integer := 0;
begin
  select id, level into v_student_id, v_level
    from public.students where profile_id = auth.uid();
  if v_student_id is null then
    raise exception 'No student record for the current user';
  end if;

  -- Same daily window/limit as get_next_dictionary_words (Tashkent date).
  -- Counts rows from both sources: one shared 10/day cap.
  select count(*) into v_already_today
    from public.student_dictionary_words
   where student_id = v_student_id
     and created_at >= (now() at time zone 'Asia/Tashkent')::date;

  v_allowed := 10 - v_already_today;  -- hard daily cap 10 across all calls
  if v_allowed <= 0 then
    return 0;
  end if;

  -- Curriculum access check mirrors get_next_dictionary_words: candidate,
  -- active, level-matched, lesson unlocked by teacher pace.
  select coalesce(cp.max_available_lesson, 100000) into v_max_lesson
    from public.curriculum_progress cp where cp.level = v_level;
  v_max_lesson := coalesce(v_max_lesson, 100000);

  with eligible as (
    select v.id
      from public.lesson_vocabulary v
      join public.lessons l on l.id = v.lesson_id
      join public.curriculum_lessons cl on cl.id = l.curriculum_lesson_id
     where v.id = any(p_word_ids)
       and v.is_active
       and v.dictionary_candidate
       and (l.level is null or l.level = v_level)
       and cl.lesson_number <= v_max_lesson
       and not exists (
         select 1 from public.student_dictionary_words sdw
          where sdw.student_id = v_student_id
            and sdw.lesson_vocabulary_id = v.id
       )
     limit v_allowed
  )
  insert into public.student_dictionary_words
    (student_id, lesson_vocabulary_id, state, next_review_at, first_seen_at)
  select v_student_id, e.id, 'NEW', now(), now() from eligible e;

  get diagnostics v_lesson_inserted = row_count;

  -- General entries: readable by every authenticated student by design
  -- (dictionary_entries_read_all), so no level gating - only existence
  -- and duplicate protection, sharing the same daily cap.
  with eligible_entries as (
    select de.id
      from public.dictionary_entries de
     where de.id = any(p_entry_ids)
       and not exists (
         select 1 from public.student_dictionary_words sdw
          where sdw.student_id = v_student_id
            and sdw.dictionary_entry_id = de.id
       )
     limit greatest(v_allowed - v_lesson_inserted, 0)
  )
  insert into public.student_dictionary_words
    (student_id, dictionary_entry_id, state, next_review_at, first_seen_at)
  select v_student_id, e.id, 'NEW', now(), now() from eligible_entries e;

  get diagnostics v_entry_inserted = row_count;
  return v_lesson_inserted + v_entry_inserted;
end;
$$;

revoke execute on function public.start_dictionary_words(uuid[], bigint[]) from anon;
revoke execute on function public.start_dictionary_words(uuid[], bigint[]) from public;
grant execute on function public.start_dictionary_words(uuid[], bigint[]) to authenticated;

comment on function public.start_dictionary_words(uuid[], bigint[]) is
  'Create NEW dictionary progress rows for curriculum words and general entries. Enforces the shared 10/day hard cap server-side, curriculum access for lesson words, and no-duplicate ownership. Returns rows actually created.';
