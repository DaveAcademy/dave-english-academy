-- Follow-up to 0114: that migration renamed the ambiguous `id` column but
-- left `english`/`uzbek` bare inside the same CTEs - they are equally
-- implicit OUT parameters of `returns table (id uuid, english text,
-- uzbek text)` and hit the identical 42702 "ambiguous column" error one
-- level deeper (proven live via the same authenticated-role test used to
-- find 0114's bug). Renaming all three internal columns
-- (vocabulary_id/vocabulary_english/vocabulary_uzbek) removes every bare
-- reference that could collide with an OUT parameter. No other logic
-- change.
create or replace function public.pick_game_words(p_alpha_only boolean, p_count integer default 8)
returns table (id uuid, english text, uzbek text)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_exposure_count integer;
  v_length_cap integer;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  select count(*) into v_exposure_count from public.game_word_history where student_id = v_student_id;
  v_length_cap := case
    when v_exposure_count < 15 then 6
    when v_exposure_count < 40 then 9
    else null
  end;

  return query
  with pool as (
    select v.id as vocabulary_id, v.english as vocabulary_english, v.uzbek as vocabulary_uzbek,
           coalesce(h.times_seen, 0) as times_seen,
           coalesce(h.times_correct, 0) as times_correct,
           h.last_seen_at,
           case when v_length_cap is not null and length(v.english) > v_length_cap then 1 else 0 end as over_cap,
           coalesce(max(v.lesson_number) over () - v.lesson_number, 9999) as lesson_age
    from public.student_available_vocabulary() v
    left join public.game_word_history h
      on h.student_id = v_student_id and h.vocabulary_id = v.id
    where (not p_alpha_only) or (v.english ~ '^[A-Za-z]+$' and length(v.english) >= 3)
  ),
  new_words as (
    select * from pool where times_seen = 0 order by lesson_age, over_cap, random() limit greatest(p_count / 2, 1)
  ),
  review_words as (
    select * from pool
    where times_seen > 0
      and (times_correct < times_seen or last_seen_at < now() - interval '3 days')
      and vocabulary_id not in (select vocabulary_id from new_words)
    order by lesson_age, over_cap, random() limit ceil(p_count * 0.375)
  ),
  mastered_words as (
    select * from pool
    where times_seen >= 2 and times_correct = times_seen and last_seen_at >= now() - interval '3 days'
      and vocabulary_id not in (select vocabulary_id from new_words union select vocabulary_id from review_words)
    order by lesson_age, over_cap, random() limit greatest(p_count - (select count(*) from new_words) - (select count(*) from review_words), 0)
  ),
  chosen as (
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from new_words
    union all select vocabulary_id, vocabulary_english, vocabulary_uzbek from review_words
    union all select vocabulary_id, vocabulary_english, vocabulary_uzbek from mastered_words
  ),
  backfill as (
    select vocabulary_id, vocabulary_english, vocabulary_uzbek, over_cap, lesson_age from pool
    where vocabulary_id not in (select vocabulary_id from chosen)
    order by lesson_age, over_cap, random()
    limit greatest(p_count - (select count(*) from chosen), 0)
  )
  select vocabulary_id, vocabulary_english, vocabulary_uzbek from chosen
  union all
  select vocabulary_id, vocabulary_english, vocabulary_uzbek from backfill
  limit p_count;
end;
$$;

revoke execute on function public.pick_game_words(boolean, integer) from public;
grant execute on function public.pick_game_words(boolean, integer) to authenticated;
