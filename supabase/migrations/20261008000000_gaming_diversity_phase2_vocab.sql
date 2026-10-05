-- Gaming Diversity Phase 2 (vocabulary games only).
-- Adds game-specific previous-1-round exclusion (via existing game_rounds, no new table)
-- and least-recent-first ordering to the two shared vocabulary pickers.
-- Signatures, return shapes, bucket quotas, tier/lesson/length filters, round sizes,
-- scoring, and progression untouched. game_word_history (cross-game by schema) still
-- drives unseen/review/mastered buckets; the new exclusion is game-specific.
-- Also fixes a latent broken fallback in pick_word_builder_words (3-arg pick_game_words
-- call to overloads dropped by 20260920000005 -> now 4-arg with 'word_builder').
-- Phase 1 content-bank functions untouched.

CREATE OR REPLACE FUNCTION public.pick_game_words(p_alpha_only boolean, p_count integer DEFAULT 10, p_level integer DEFAULT NULL::integer, p_game_type text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, english text, uzbek text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id bigint;
  v_exposure_count integer;
  v_length_cap integer;
  v_target_tier text;
  v_max_lesson integer;
  v_min_lesson integer;
  v_recent uuid[] := '{}';
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  -- Previous-round exclusion (game-specific). Empty array disables the filter naturally.
  if p_game_type is not null then
    select coalesce(array_agg(distinct cid), '{}') into v_recent from (
      select unnest(r.vocabulary_ids) as cid
      from (select r2.vocabulary_ids from public.game_rounds r2
            where r2.student_id = v_student_id and r2.game_type = p_game_type
            order by r2.created_at desc, r2.id desc limit 1) r) s;
  end if;

  if p_level is not null then
    v_length_cap := public.game_level_to_length_cap(p_level);
    v_target_tier := public.game_level_to_tier(p_level);
    v_max_lesson := case v_target_tier
      when 'very_easy' then 20
      when 'easy' then 40
      when 'medium' then 65
      when 'hard' then 85
      else 100000
    end;
    v_min_lesson := case v_target_tier
      when 'very_easy' then 1
      when 'easy' then 21
      when 'medium' then 41
      when 'hard' then 66
      else 86
    end;
  else
    select count(*) into v_exposure_count from public.game_word_history where student_id = v_student_id;
    v_length_cap := case
      when v_exposure_count < 15 then 6
      when v_exposure_count < 40 then 9
      else null
    end;
    v_target_tier := null;
    v_max_lesson := 100000;
    v_min_lesson := 1;
  end if;

  return query
  with pool as (
    select v.id as vocabulary_id, v.english as vocabulary_english, v.uzbek as vocabulary_uzbek,
           coalesce(h.times_seen, 0) as times_seen,
           coalesce(h.times_correct, 0) as times_correct,
           h.last_seen_at,
           case when v_length_cap is not null and length(v.english) > v_length_cap then 1 else 0 end as over_cap,
           coalesce(max(v.lesson_number) over () - v.lesson_number, 9999) as lesson_age,
           v.lesson_number,
           case
             when h.times_seen >= 2 and h.times_correct = h.times_seen
              and h.last_seen_at >= now() - interval '10 minutes' then 1
             else 0
           end as on_cooldown
    from public.student_available_vocabulary() v
    left join public.game_word_history h
      on h.student_id = v_student_id and h.vocabulary_id = v.id
    where (not p_alpha_only) or (v.english ~ '^[A-Za-z]+$' and length(v.english) >= 3)
      and (v_target_tier is null or (v.lesson_number >= v_min_lesson and v.lesson_number <= v_max_lesson))
  ),
  new_words as (
    select * from pool
    where times_seen = 0
      and not (vocabulary_id = any(v_recent))
    order by lesson_age, over_cap, random()
    limit greatest(p_count / 2, 1)
  ),
  review_words as (
    select * from pool
    where times_seen > 0
      and on_cooldown = 0
      and (times_correct < times_seen or last_seen_at < now() - interval '3 days')
      and vocabulary_id not in (select vocabulary_id from new_words)
      and not (vocabulary_id = any(v_recent))
    order by last_seen_at, over_cap, random()
    limit ceil(p_count * 0.375)
  ),
  mastered_words as (
    select * from pool
    where times_seen >= 2 and times_correct = times_seen
      and on_cooldown = 0
      and vocabulary_id not in (select vocabulary_id from new_words union select vocabulary_id from review_words)
      and not (vocabulary_id = any(v_recent))
    order by last_seen_at, over_cap, random()
    limit greatest(p_count - (select count(*) from new_words) - (select count(*) from review_words), 0)
  ),
  chosen as (
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from new_words
    union all select vocabulary_id, vocabulary_english, vocabulary_uzbek from review_words
    union all select vocabulary_id, vocabulary_english, vocabulary_uzbek from mastered_words
  ),
  backfill as (
    select vocabulary_id, vocabulary_english, vocabulary_uzbek, over_cap, lesson_age, lesson_number from pool
    where vocabulary_id not in (select vocabulary_id from chosen)
    order by
      case when vocabulary_id = any(v_recent) then 1 else 0 end,
      case when v_target_tier is null or (lesson_number >= v_min_lesson and lesson_number <= v_max_lesson) then 0 else 1 end,
      over_cap, lesson_age, random()
  )
  select vocabulary_id, vocabulary_english, vocabulary_uzbek
  from chosen
  union all
  select vocabulary_id, vocabulary_english, vocabulary_uzbek
  from backfill
  limit p_count;
end;
$function$;

create or replace function public.pick_word_builder_words(p_level integer, p_count integer default 8)
returns table (id uuid, english text, uzbek text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_student_id bigint;
  v_min_len integer;
  v_max_len integer;
  v_expanded_min integer;
  v_expanded_max integer;
  v_recent uuid[] := '{}';
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then return; end if;

  -- Previous-round exclusion (word_builder is the sole caller; game key fixed).
  select coalesce(array_agg(distinct cid), '{}') into v_recent from (
    select unnest(r.vocabulary_ids) as cid
    from (select r2.vocabulary_ids from public.game_rounds r2
          where r2.student_id = v_student_id and r2.game_type = 'word_builder'
          order by r2.created_at desc, r2.id desc limit 1) r) s;

  select min_len, max_len into v_min_len, v_max_len from public.game_level_to_word_builder_range(p_level);

  -- Try target range first
  return query
  with pool as (
    select v.id as vocabulary_id, v.english as vocabulary_english, v.uzbek as vocabulary_uzbek,
           coalesce(h.times_seen, 0) as times_seen, h.last_seen_at,
           length(v.english) as word_len
    from public.student_available_vocabulary() v
    left join public.game_word_history h on h.student_id = v_student_id and h.vocabulary_id = v.id
    where v.english ~ '^[A-Za-z]+$' and length(v.english) >= v_min_len and length(v.english) <= v_max_len
  ),
  new_words as (
    select * from pool where times_seen = 0
      and not (vocabulary_id = any(v_recent))
      order by last_seen_at nulls first, random() limit greatest(p_count / 2, 1)
  ),
  review_words as (
    select * from pool where times_seen > 0 and vocabulary_id not in (select vocabulary_id from new_words)
      and not (vocabulary_id = any(v_recent))
    order by last_seen_at nulls first, random() limit ceil(p_count * 0.375)
  ),
  chosen as (
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from new_words
    union all select vocabulary_id, vocabulary_english, vocabulary_uzbek from review_words
  )
  select vocabulary_id, vocabulary_english, vocabulary_uzbek from chosen
  union all
  select vocabulary_id, vocabulary_english, vocabulary_uzbek from (
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from pool
    where vocabulary_id not in (select vocabulary_id from chosen)
    order by case when vocabulary_id = any(v_recent) then 1 else 0 end, last_seen_at nulls first, random()
    limit greatest(p_count - (select count(*) from chosen), 0)
  ) backfill
  limit p_count;

  -- If insufficient in target range, expand by ±1 (fallback 1)
  if not found or (select count(*) from public.student_available_vocabulary() v where length(v.english) between v_min_len and v_max_len) < p_count then
    v_expanded_min := greatest(2, v_min_len - 1);
    v_expanded_max := v_max_len + 1;
    return query
    with pool as (
      select v.id as vocabulary_id, v.english as vocabulary_english, v.uzbek as vocabulary_uzbek,
             coalesce(h.times_seen, 0) as times_seen, h.last_seen_at
      from public.student_available_vocabulary() v
      left join public.game_word_history h on h.student_id = v_student_id and h.vocabulary_id = v.id
      where v.english ~ '^[A-Za-z]+$' and length(v.english) >= v_expanded_min and length(v.english) <= v_expanded_max
    ),
    new_words as (
      select * from pool where times_seen = 0
        and not (vocabulary_id = any(v_recent))
        order by last_seen_at nulls first, random() limit greatest(p_count / 2, 1)
    ),
    review_words as (
      select * from pool where times_seen > 0 and vocabulary_id not in (select vocabulary_id from new_words)
        and not (vocabulary_id = any(v_recent))
        order by last_seen_at nulls first, random() limit ceil(p_count * 0.375)
    ),
    chosen as (
      select vocabulary_id, vocabulary_english, vocabulary_uzbek from new_words
      union all select vocabulary_id, vocabulary_english, vocabulary_uzbek from review_words
    )
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from chosen
    union all
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from (
      select vocabulary_id, vocabulary_english, vocabulary_uzbek from pool
      where vocabulary_id not in (select vocabulary_id from chosen)
      order by case when vocabulary_id = any(v_recent) then 1 else 0 end, last_seen_at nulls first, random()
      limit greatest(p_count - (select count(*) from chosen), 0)
    ) backfill
    limit p_count;
  end if;

  -- Final fallback: if still insufficient, use any curriculum-eligible (no length filter) but never outside curriculum
  -- This ensures playability even with small pools, without duplicates if possible
  if not found then
    return query select p.id, p.english, p.uzbek from public.pick_game_words(true, p_count, p_level, 'word_builder') p;
  end if;
end;
$$;
