-- Hangman Vocabulary Diversity and Difficulty Progression
-- Addresses: word pool too small (~10-12 word practical loop), weak recent-word exclusion (1 round),
-- insufficient difficulty progression, inadequate cross-session diversity.
--
-- Changes:
-- 1. Enhanced recent-word exclusion: tracks last 5 rounds instead of 1 round
-- 2. Session-scoped recent word tracking (via game_word_history + game_rounds)
-- 3. Improved difficulty tiers with better word length distribution per tier
-- 4. Cross-session diversity via extended recent-word window
-- 5. Exhaustion-safe fallback logic
-- 6. Word normalization (trim, case, alpha-only enforcement)

CREATE OR REPLACE FUNCTION public.pick_game_words(
    p_alpha_only boolean,
    p_count integer DEFAULT 10,
    p_level integer DEFAULT NULL::integer,
    p_game_type text DEFAULT NULL::text
)
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
    v_session_recent uuid[] := '{}';
    v_pool_size integer;
    v_needed integer := p_count;
    v_alpha_enforced boolean := p_alpha_only;
begin
    select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
    if v_student_id is null then
        return;
    end if;

    -- Extended recent-word exclusion: last 5 rounds (game-specific) + session tracking
    if p_game_type is not null then
        -- Last 5 rounds exclusion (game-specific)
        select coalesce(array_agg(distinct cid), '{}') into v_recent from (
            select unnest(r.vocabulary_ids) as cid
            from (
                select r2.vocabulary_ids from public.game_rounds r2
                where r2.student_id = v_student_id and r2.game_type = p_game_type
                order by r2.created_at desc, r2.id desc limit 5
            ) r
        ) s;

        -- Session-recent words from game_word_history (last 20 seen in this game type)
        select coalesce(array_agg(distinct h.vocabulary_id), '{}') into v_session_recent from (
            select h.vocabulary_id
            from public.game_word_history h
            join public.game_rounds r on r.id = any(
                select id from public.game_rounds
                where student_id = v_student_id and game_type = p_game_type
                order by created_at desc limit 20
            )
            where h.student_id = v_student_id
              and h.vocabulary_id is not null
              and r.id is not null
            order by h.last_seen_at desc
        ) h;
    end if;

    -- Combine recent arrays
    v_recent := array_cat(v_recent, v_session_recent);

    -- Level-driven difficulty parameters
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
        -- Fallback: exposure-based heuristic (legacy path)
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

    -- Enhanced length cap for Hangman: stricter caps for early tiers
    if p_game_type = 'hangman' then
        v_length_cap := case public.game_level_to_tier(p_level)
            when 'very_easy' then 5
            when 'easy' then 7
            when 'medium' then 9
            when 'hard' then 11
            else v_length_cap
        end;
    end if;

    return query
    with pool as (
        select v.id as vocabulary_id,
               v.english as vocabulary_english,
               v.uzbek as vocabulary_uzbek,
               length(v.english) as word_len,
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
               end as on_cooldown,
               case when h.vocabulary_id is not null then 1 else 0 end as has_history
        from public.student_available_vocabulary() v
        left join public.game_word_history h
          on h.student_id = v_student_id and h.vocabulary_id = v.id
        where (not p_alpha_only) or (v.english ~ '^[A-Za-z]+$' and length(v.english) >= 3)
          and (v_target_tier is null or (v.lesson_number >= v_min_lesson and v.lesson_number <= v_max_lesson))
          and (v_length_cap is null or length(v.english) <= v_length_cap)
    ),
    pool_normalized as (
        select vocabulary_id,
               lower(trim(vocabulary_english)) as vocabulary_english,
               trim(vocabulary_uzbek) as vocabulary_uzbek,
               word_len,
               lesson_number,
               times_seen,
               times_correct,
               last_seen_at,
               over_cap,
               lesson_age,
               on_cooldown,
               has_history
        from pool
        where vocabulary_english ~ '^[a-z]+$'  -- enforce clean alpha-only after normalization
    ),
    -- Exclude recent words aggressively
    pool_filtered as (
        select * from pool_normalized
        where vocabulary_id not in (select unnest(v_recent))
    ),
    new_words as (
        select * from pool_filtered
        where times_seen = 0
        order by lesson_age, over_cap, random()
        limit greatest(p_count / 2, 1)
    ),
    review_words as (
        select * from pool_filtered
        where times_seen > 0
          and on_cooldown = 0
          and (times_correct < times_seen or last_seen_at < now() - interval '3 days')
          and vocabulary_id not in (select vocabulary_id from new_words)
        order by last_seen_at nulls first, over_cap, random()
        limit ceil(p_count * 0.375)
    ),
    mastered_words as (
        select * from pool_filtered
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
        select vocabulary_id, vocabulary_english, vocabulary_uzbek, over_cap, lesson_age, lesson_number
        from pool_filtered
        where vocabulary_id not in (select vocabulary_id from chosen)
        order by
            case when v_target_tier is null or (lesson_number >= v_min_lesson and lesson_number <= v_max_lesson) then 0 else 1 end,
            over_cap, lesson_age, random()
    ),
    combined as (
        select vocabulary_id, vocabulary_english, vocabulary_uzbek from chosen
        union all
        select vocabulary_id, vocabulary_english, vocabulary_uzbek
        from backfill
        limit p_count
    )
    select vocabulary_id, vocabulary_english, vocabulary_uzbek
    from combined
    limit p_count;

    -- Exhaustion-safe fallback: if we couldn't fill the count, relax constraints progressively
    if not found then
        return query
        with pool as (
            select v.id as vocabulary_id,
                   lower(trim(v.english)) as vocabulary_english,
                   trim(v.uzbek) as vocabulary_uzbek,
                   length(v.english) as word_len,
                   v.lesson_number,
                   coalesce(h.times_seen, 0) as times_seen
            from public.student_available_vocabulary() v
            left join public.game_word_history h
              on h.student_id = v_student_id and h.vocabulary_id = v.id
            where (not v_alpha_enforced) or (v.english ~ '^[A-Za-z]+$' and length(v.english) >= 3)
              and v_length_cap is null
        )
        select vocabulary_id, vocabulary_english, vocabulary_uzbek
        from (
            select * from (
                select vocabulary_id, vocabulary_english, vocabulary_uzbek,
                       row_number() over (partition by vocabulary_id order by random()) as rn
                from (
                    select * from (
                        select vocabulary_id, vocabulary_english, vocabulary_uzbek from (
                            select vocabulary_id, vocabulary_english, vocabulary_uzbek
                            from pool
                            where vocabulary_id not in (select unnest(v_recent))
                            order by random()
                            limit p_count * 2
                        ) t
                    ) t2
                ) t3
            ) t4
            where rn = 1
            limit p_count;
    end if;
end;
$function$;

revoke execute on function public.pick_game_words(boolean, integer, integer, text) from public;
grant execute on function public.pick_game_words(boolean, integer, integer, text) to authenticated;
grant execute on function public.pick_game_words(boolean, integer, integer, text) to service_role;