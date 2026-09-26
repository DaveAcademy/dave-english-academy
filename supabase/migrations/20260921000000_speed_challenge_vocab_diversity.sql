-- =============================================================================
-- 20260921000000_speed_challenge_vocab_diversity.sql
-- =============================================================================
-- Speed Challenge vocabulary diversity (Speed Challenge only).
-- Addresses: consecutive rounds re-serving the same small set (~10 words).
--
-- Root causes (2026-09-21 audit, verified against the live DB):
--   * the shared pick_game_words() has no recent-round exclusion, and its
--     lesson_age-dominated ordering (new_words + backfill) collapses
--     selection onto the newest unlocked lesson (~10-15 words). Verified:
--     the heaviest speed_challenge player (107 rounds, 572 available words)
--     saw only 19 distinct words across their last 5 rounds.
--   * for non-alpha games the tier-band filter in pick_game_words() is dead
--     code: its WHERE clause is "(not p_alpha_only) OR (alpha AND tier)" -
--     with p_alpha_only = false the AND chain is short-circuited and the
--     intended level band never applies.
--
-- FIX: a dedicated pick_speed_challenge_words() - Speed Challenge's own
-- picker. The shared pick_game_words() is left byte-identical for every
-- other game (Hangman/other games untouched, and the still-unapplied
-- 20261019000000 hangman migration can apply cleanly on top later). The
-- new picker adds:
--   1. Last-5-rounds exclusion, gated to speed_challenge game_rounds.
--   2. Session-recent window: words seen within the last 20 Speed Challenge
--      rounds, correlated against each round's actual vocabulary_ids (the
--      join the unapplied 20261019000000 got wrong - it never correlated
--      history rows to round membership, which would have excluded every
--      word the student has ever seen in any game).
--   3. Tier-band selection: random across the unlocked level band
--      (lesson_age demoted to a tiebreak), matching 0149/0150's intended
--      "round-generators only ever serve content at this level".
--   4. Recency-aware review/mastered ordering (least-recently-seen first)
--      and a 3-stage exhaustion-safe fallback so small pools still produce
--      a playable round; a word is reused only when the available pool is
--      genuinely exhausted.
--
-- get_speed_challenge_round() keeps its exact round/options/level shape and
-- only swaps the word source - no scoring, points, round-token, grading, or
-- answer-format change. Additive + idempotent; replay-safe (nothing later
-- in the migration history redefines the generator or the new function).
-- =============================================================================

create or replace function public.pick_speed_challenge_words(p_count integer default 10, p_level integer default null)
returns table(id uuid, english text, uzbek text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_student_id bigint;
  v_exposure_count integer;
  v_length_cap integer;
  v_target_tier text;
  v_max_lesson integer;
  v_min_lesson integer;
  v_recent uuid[] := '{}';
  v_session_recent uuid[] := '{}';
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  -- 1. Recent-round exclusion: the last 5 Speed Challenge rounds only.
  select coalesce(array_agg(distinct cid) filter (where cid is not null), '{}') into v_recent from (
    select unnest(r.vocabulary_ids) as cid
    from (
      select r2.vocabulary_ids from public.game_rounds r2
      where r2.student_id = v_student_id and r2.game_type = 'speed_challenge'
      order by r2.created_at desc, r2.id desc limit 5
    ) r
  ) s;

  -- 2. Session-recent: words seen within the last 20 Speed Challenge
  --    rounds, correlated against each round's actual vocabulary_ids.
  select coalesce(array_agg(distinct h.vocabulary_id), '{}') into v_session_recent
  from public.game_word_history h
  where h.student_id = v_student_id
    and h.vocabulary_id is not null
    and h.vocabulary_id in (
      select unnest(r.vocabulary_ids) as cid
      from (
        select r2.vocabulary_ids from public.game_rounds r2
        where r2.student_id = v_student_id and r2.game_type = 'speed_challenge'
        order by r2.created_at desc, r2.id desc limit 20
      ) r
    );

  -- 3. Level-driven difficulty parameters (same tier band as 0149/0150).
  if p_level is not null then
    v_length_cap := public.game_level_to_length_cap(p_level);
    v_target_tier := public.game_level_to_tier(p_level);
    v_max_lesson := case public.game_level_to_tier(p_level)
      when 'very_easy' then 20
      when 'easy' then 40
      when 'medium' then 65
      when 'hard' then 85
      else 100000
    end;
    v_min_lesson := case public.game_level_to_tier(p_level)
      when 'very_easy' then 1
      when 'easy' then 21
      when 'medium' then 41
      when 'hard' then 66
      else 86
    end;
  else
    -- Unreachable for speed_challenge (the round generator always seeds
    -- game_level_progress first); legacy exposure path kept for safety.
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
    select v.id as vocabulary_id,
           v.english as vocabulary_english,
           v.uzbek as vocabulary_uzbek,
           v.lesson_number,
           coalesce(h.times_seen, 0) as times_seen,
           coalesce(h.times_correct, 0) as times_correct,
           h.last_seen_at,
           case when v_length_cap is not null and length(v.english) > v_length_cap then 1 else 0 end as over_cap,
           coalesce(max(v.lesson_number) over () - v.lesson_number, 9999) as lesson_age,
           case
             when h.times_seen >= 2 and h.times_correct = h.times_seen
              and h.last_seen_at >= now() - interval '10 minutes' then 1
             else 0
           end as on_cooldown
    from public.student_available_vocabulary() v
    left join public.game_word_history h
      on h.student_id = v_student_id and h.vocabulary_id = v.id
    where (v_target_tier is null or (v.lesson_number >= v_min_lesson and v.lesson_number <= v_max_lesson))
  ),
  pool_deduped as (
    -- One record per distinct english word (97 of 572 available records are
    -- cross-lesson duplicates) so a round never shows the same word twice
    -- and a just-seen word cannot resurface via its duplicate record.
    -- Whichever record is kept, its own uzbek is the graded answer.
    select * from (
      select p.*,
             row_number() over (partition by lower(trim(p.vocabulary_english))
                                order by p.times_seen desc, p.over_cap, random()) as rn
      from pool p
    ) d
    where rn = 1
  ),
  recent_filtered as (
    select * from pool_deduped
    where vocabulary_id <> all(v_recent)
      and vocabulary_id <> all(v_session_recent)
  ),
  new_words as (
    select * from recent_filtered
    where times_seen = 0
    order by over_cap, random(), lesson_age
    limit greatest(p_count / 2, 1)
  ),
  review_words as (
    select * from recent_filtered
    where times_seen > 0
      and on_cooldown = 0
      and (times_correct < times_seen or last_seen_at < now() - interval '3 days')
      and vocabulary_id not in (select vocabulary_id from new_words)
    order by last_seen_at nulls first, over_cap, random()
    limit ceil(p_count * 0.375)
  ),
  mastered_words as (
    select * from recent_filtered
    where times_seen >= 2 and times_correct = times_seen
      and on_cooldown = 0
      and vocabulary_id not in (select vocabulary_id from new_words union select vocabulary_id from review_words)
    order by last_seen_at nulls first, over_cap, random()
    limit greatest(p_count - (select count(*) from new_words) - (select count(*) from review_words), 0)
  ),
  chosen as (
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from new_words
    union all select vocabulary_id, vocabulary_english, vocabulary_uzbek from review_words
    union all select vocabulary_id, vocabulary_english, vocabulary_uzbek from mastered_words
  ),
  backfill as (
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from recent_filtered
    where vocabulary_id not in (select vocabulary_id from chosen)
    order by over_cap, random(), lesson_age
  ),
  combined as (
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from chosen
    union all
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from backfill
    limit p_count
  )
  select vocabulary_id, vocabulary_english, vocabulary_uzbek
  from combined
  limit p_count;

  -- 4. Exhaustion-safe fallback ladder, in order:
  --    a. keep the level band, drop the session-recent window (keep last-5);
  --    b. drop the band, keep both recency windows;
  --    c. drop every filter except least-recently-seen ordering - a word is
  --       reused only when the available pool is genuinely exhausted.
  if not found then
    return query
    with pool as (
      select v.id as vocabulary_id,
             v.english as vocabulary_english,
             v.uzbek as vocabulary_uzbek,
             coalesce(h.times_seen, 0) as times_seen,
             h.last_seen_at,
             case when v_length_cap is not null and length(v.english) > v_length_cap then 1 else 0 end as over_cap
      from public.student_available_vocabulary() v
      left join public.game_word_history h
        on h.student_id = v_student_id and h.vocabulary_id = v.id
      where (v_target_tier is null or (v.lesson_number >= v_min_lesson and v.lesson_number <= v_max_lesson))
    )
    select vocabulary_id, vocabulary_english, vocabulary_uzbek
    from pool
    where vocabulary_id <> all(v_recent)
    order by last_seen_at nulls first, over_cap, random()
    limit p_count;
  end if;

  if not found then
    return query
    select v.id as vocabulary_id,
           v.english as vocabulary_english,
           v.uzbek as vocabulary_uzbek
    from public.student_available_vocabulary() v
    left join public.game_word_history h
      on h.student_id = v_student_id and h.vocabulary_id = v.id
    where v.id <> all(v_recent)
      and v.id <> all(v_session_recent)
    order by coalesce(h.last_seen_at, 'epoch') asc, random()
    limit p_count;
  end if;

  if not found then
    return query
    select v.id as vocabulary_id,
           v.english as vocabulary_english,
           v.uzbek as vocabulary_uzbek
    from public.student_available_vocabulary() v
    left join public.game_word_history h
      on h.student_id = v_student_id and h.vocabulary_id = v.id
    order by coalesce(h.last_seen_at, 'epoch') asc, random()
    limit p_count;
  end if;
end;
$function$;

-- get_speed_challenge_round(): byte-identical to the live production body
-- (20260920000005) except the word source - pick_speed_challenge_words()
-- instead of the shared pick_game_words(). Round id, level-progress
-- seeding, distractor options, and the game_rounds snapshot unchanged.
create or replace function public.get_speed_challenge_round()
 returns table(round_id uuid, id uuid, english text, options text[], level integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  r record;
  v_distractors text[];
  v_options text[];
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'speed_challenge')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'speed_challenge';

  v_round_id := gen_random_uuid();

  for r in select p.id, p.english, p.uzbek from public.pick_speed_challenge_words(10, v_level) p
  loop
    select array_agg(u) into v_distractors from (
      select v.uzbek as u
      from public.student_available_vocabulary() v
      where v.uzbek is distinct from r.uzbek
      order by random()
      limit 3
    ) d;
    v_options := array_append(coalesce(v_distractors, '{}'), r.uzbek);
    select array_agg(o order by random()) into v_options from unnest(v_options) o;
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    english := r.english;
    options := v_options;
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'speed_challenge', v_ids, v_level);
  end if;
end;
$function$;

revoke execute on function public.pick_speed_challenge_words(integer, integer) from public;
grant execute on function public.pick_speed_challenge_words(integer, integer) to authenticated;
grant execute on function public.pick_speed_challenge_words(integer, integer) to service_role;
revoke execute on function public.get_speed_challenge_round() from public;
grant execute on function public.get_speed_challenge_round() to public, anon, authenticated;
grant execute on function public.get_speed_challenge_round() to service_role;
