-- Fix: pick_game_words() threw "column reference \"id\" is ambiguous"
-- (42702) for every real authenticated student - not an RLS/auth/grant
-- issue, not mobile-specific. The function is plpgsql with
-- `returns table (id uuid, english text, uzbek text)`, which implicitly
-- creates an OUT parameter named `id`. Every bare `id` used inside the
-- internal new_words/review_words/mastered_words/chosen/backfill CTEs
-- collided with that OUT parameter. This only fires once
-- student_available_vocabulary() actually returns rows to feed those
-- CTEs - anon requests (no student row, early `return`) and read-only
-- diagnostic queries that re-implemented the SELECT logic outside the
-- real function (used in the previous two sessions) never executed this
-- code path, which is why it looked fixed until tested via a real
-- authenticated role.
--
-- Fix: rename the internal CTE column to vocabulary_id throughout the
-- query body so no bare `id` ever appears there. RETURN QUERY matches
-- the function's declared output columns positionally, not by name, so
-- the final `select vocabulary_id, english, uzbek from chosen/backfill`
-- still correctly populates the (id, english, uzbek) output row - no
-- signature or caller change needed. Selection logic itself
-- (curriculum scope, lesson-recency/length soft preferences, new/
-- review/mastered mix) is unchanged.
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
    select v.id as vocabulary_id, v.english, v.uzbek,
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
    select vocabulary_id, english, uzbek from new_words
    union all select vocabulary_id, english, uzbek from review_words
    union all select vocabulary_id, english, uzbek from mastered_words
  ),
  backfill as (
    select vocabulary_id, english, uzbek, over_cap, lesson_age from pool
    where vocabulary_id not in (select vocabulary_id from chosen)
    order by lesson_age, over_cap, random()
    limit greatest(p_count - (select count(*) from chosen), 0)
  )
  select vocabulary_id, english, uzbek from chosen
  union all
  select vocabulary_id, english, uzbek from backfill
  limit p_count;
end;
$$;

revoke execute on function public.pick_game_words(boolean, integer) from public;
grant execute on function public.pick_game_words(boolean, integer) to authenticated;
