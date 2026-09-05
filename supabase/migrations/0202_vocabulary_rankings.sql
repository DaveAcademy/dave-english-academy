-- 0202_vocabulary_rankings.sql
-- Three vocabulary rankings: Translation, Typing, Sentence.
-- Based on unique vocabulary achievements at each stage.
-- Ties broken by accuracy then earliest completion.
-- Level-filterable. Read-only; no client-influenced calculations.

-- ── 1. Translation Ranking ─────────────────────────────────────────────
-- Counts unique words where translation_complete IS NOT NULL.
-- A student gets credit once per word, regardless of how many times
-- they demonstrated translation proficiency.

create or replace function public.get_translation_ranking(p_level text default null)
returns table (
  rank bigint,
  student_id bigint,
  real_name text,
  english_name text,
  level text,
  translation_words bigint,
  accuracy numeric,
  last_translation_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.students where profile_id = auth.uid())
     and not (public.is_teacher() or public.is_admin()) then
    raise exception 'No student record for the current user' using errcode = '42501';
  end if;

  return query
  with per_student as (
    select
      sdw.student_id,
      count(*) filter (where sdw.translation_complete is not null) as translation_words,
      coalesce(sum(sdw.times_correct), 0) as total_correct,
      coalesce(sum(sdw.times_seen), 0) as total_seen,
      max(sdw.translation_complete) as last_translation_at
    from public.student_dictionary_words sdw
    group by sdw.student_id
  )
  select
    (row_number() over (
      order by ps.translation_words desc,
               case when ps.total_seen > 0
                    then 1.0 * ps.total_correct / ps.total_seen else 0 end desc,
               ps.last_translation_at asc nulls last
    ))::bigint,
    s.id,
    s.real_name,
    s.english_name,
    s.level,
    ps.translation_words,
    case when ps.total_seen > 0
      then round(100.0 * ps.total_correct / ps.total_seen, 1) else 0 end,
    ps.last_translation_at
  from per_student ps
  join public.students s on s.id = ps.student_id
  where s.status = 'Active'
    and (p_level is null or s.level = p_level)
  order by 1;
end;
$$;

revoke execute on function public.get_translation_ranking(text) from public;
grant execute on function public.get_translation_ranking(text) to authenticated;

comment on function public.get_translation_ranking is
  'Translation ranking by unique vocabulary words with completed Translation stage.
  Ties broken by translation accuracy then earliest completion. Level-filterable.';

-- ── 2. Typing Ranking ──────────────────────────────────────────────────
-- Counts unique words where typing_complete IS NOT NULL.
-- A student gets credit once per word.

create or replace function public.get_typing_ranking(p_level text default null)
returns table (
  rank bigint,
  student_id bigint,
  real_name text,
  english_name text,
  level text,
  typing_words bigint,
  accuracy numeric,
  last_typing_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.students where profile_id = auth.uid())
     and not (public.is_teacher() or public.is_admin()) then
    raise exception 'No student record for the current user' using errcode = '42501';
  end if;

  return query
  with per_student as (
    select
      sdw.student_id,
      count(*) filter (where sdw.typing_complete is not null) as typing_words,
      coalesce(sum(sdw.times_correct), 0) as total_correct,
      coalesce(sum(sdw.times_seen), 0) as total_seen,
      max(sdw.typing_complete) as last_typing_at
    from public.student_dictionary_words sdw
    group by sdw.student_id
  )
  select
    (row_number() over (
      order by ps.typing_words desc,
               case when ps.total_seen > 0
                    then 1.0 * ps.total_correct / ps.total_seen else 0 end desc,
               ps.last_typing_at asc nulls last
    ))::bigint,
    s.id,
    s.real_name,
    s.english_name,
    s.level,
    ps.typing_words,
    case when ps.total_seen > 0
      then round(100.0 * ps.total_correct / ps.total_seen, 1) else 0 end,
    ps.last_typing_at
  from per_student ps
  join public.students s on s.id = ps.student_id
  where s.status = 'Active'
    and (p_level is null or s.level = p_level)
  order by 1;
end;
$$;

revoke execute on function public.get_typing_ranking(text) from public;
grant execute on function public.get_typing_ranking(text) to authenticated;

comment on function public.get_typing_ranking is
  'Typing ranking by unique vocabulary words with completed Typing stage.
  Ties broken by typing accuracy then earliest completion. Level-filterable.';


-- ── 3. Sentence Ranking ────────────────────────────────────────────────
-- Counts unique words where sentence_complete IS NOT NULL.
-- A student gets credit once per word.

create or replace function public.get_sentence_ranking(p_level text default null)
returns table (
  rank bigint,
  student_id bigint,
  real_name text,
  english_name text,
  level text,
  sentence_words bigint,
  accuracy numeric,
  last_sentence_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.students where profile_id = auth.uid())
     and not (public.is_teacher() or public.is_admin()) then
    raise exception 'No student record for the current user' using errcode = '42501';
  end if;

  return query
  with per_student as (
    select
      sdw.student_id,
      count(*) filter (where sdw.sentence_complete is not null) as sentence_words,
      coalesce(sum(sdw.times_correct), 0) as total_correct,
      coalesce(sum(sdw.times_seen), 0) as total_seen,
      max(sdw.sentence_complete) as last_sentence_at
    from public.student_dictionary_words sdw
    group by sdw.student_id
  )
  select
    (row_number() over (
      order by ps.sentence_words desc,
               case when ps.total_seen > 0
                    then 1.0 * ps.total_correct / ps.total_seen else 0 end desc,
               ps.last_sentence_at asc nulls last
    ))::bigint,
    s.id,
    s.real_name,
    s.english_name,
    s.level,
    ps.sentence_words,
    case when ps.total_seen > 0
      then round(100.0 * ps.total_correct / ps.total_seen, 1) else 0 end,
    ps.last_sentence_at
  from per_student ps
  join public.students s on s.id = ps.student_id
  where s.status = 'Active'
    and (p_level is null or s.level = p_level)
  order by 1;
end;
$$;

revoke execute on function public.get_sentence_ranking(text) from public;
grant execute on function public.get_sentence_ranking(text) to authenticated;

comment on function public.get_sentence_ranking is
  'Sentence ranking by unique vocabulary words with completed Sentence Usage stage.
  Ties broken by sentence accuracy then earliest completion. Level-filterable.';


-- ── 4. Mastered summary (for the "Mastered" column in rankings) ───────
-- Counts words where all four stage completions AND SRS mastery are achieved.

create or replace function public.get_mastered_summary(p_level text default null)
returns table (
  student_id bigint,
  real_name text,
  english_name text,
  level text,
  mastered_words bigint,
  translation_words bigint,
  typing_words bigint,
  sentence_words bigint,
  accuracy numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.students where profile_id = auth.uid())
     and not (public.is_teacher() or public.is_admin()) then
    raise exception 'No student record for the current user' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.real_name,
    s.english_name,
    s.level,
    count(*) filter (where sdw.translation_complete is not null
                     and sdw.typing_complete is not null
                     and sdw.sentence_complete is not null
                     and (sdw.state = 'MASTERED' AND sdw.interval_days >= 90)) as mastered_words,
    count(*) filter (where sdw.translation_complete is not null) as translation_words,
    count(*) filter (where sdw.typing_complete is not null) as typing_words,
    count(*) filter (where sdw.sentence_complete is not null) as sentence_words,
    case when count(*) filter (where sdw.times_seen > 0) > 0
      then round(100.0 * count(*) filter (where sdw.times_correct > 0)
                       / count(*) filter (where sdw.times_seen > 0), 1) else 0 end
  from public.student_dictionary_words sdw
  join public.students s on s.id = sdw.student_id
  where s.status = 'Active'
    and (p_level is null or s.level = p_level)
  group by s.id, s.real_name, s.english_name, s.level
  order by mastered_words desc, accuracy desc;
end;
$$;

revoke execute on function public.get_mastered_summary(text) from public;
grant execute on function public.get_mastered_summary(text) to authenticated;

comment on function public.get_mastered_summary is
  'Per-student summary of mastery stage completion: counts words with all four
  stage completions (translation, typing, sentence, retention) AND SRS mastery
  (state=MASTERED + interval>=90). Also returns per-stage word counts and
  overall accuracy. Level-filterable.';