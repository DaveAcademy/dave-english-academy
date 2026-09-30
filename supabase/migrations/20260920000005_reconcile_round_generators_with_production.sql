-- =============================================================================
-- 20260920000005_reconcile_round_generators_with_production.sql
-- =============================================================================
-- PURPOSE
-- ------
-- Reconcile the gaming round-generator functions and the live 4-argument
-- pick_game_words() so that a fresh replay of the migration history produces
-- the exact definitions currently running in production.
--
-- BACKGROUND
-- ----------
-- Production's round generators evolved past what the committed migration
-- history defines:
--   * All word/vocabulary games select 10 vocabulary items per round via the
--     live 4-argument pick_game_words(p_alpha_only, p_count, p_level,
--     p_game_type). Git's latest tracked round bodies call the obsolete
--     3-argument overload with 8 items.
--   * pick_game_words() in git never drops the legacy 2-arg / 3-arg
--     overloads, so a clean replay yields multiple overloads. Production has
--     exactly ONE overload (the 4-argument one). We drop the legacy
--     overloads (IF EXISTS -> no-op on live) and install the 4-arg version.
--   * The content games (sentence_scramble, word_detective, grammar_battle)
--     were reverted in production to the 0150-vintage bodies with the 0207
--     curriculum gating, a DIFFERENT return shape than the tracked 0207 /
--     2026091800000x regression series. PostgreSQL cannot change a function's
--     return type with CREATE OR REPLACE (42P13), so we DROP the returned
--     functions first (guarded: the DROP fires only when the existing return
--     signature differs from production, i.e. on clean replay; on live it is a
--     no-op), exactly as the on-disk (uncommitted)
--     20260920000002_fix_content_game_round_minting.sql already did.
--
-- SAFETY / IDEMPOTENCY
-- --------------------
-- * Every definition below is byte-identical to the live production function
--   (captured via pg_get_functiondef on 2026-09-08).
-- * Re-running this migration against the state it creates is a no-op.
-- * No scoring, points, progression, tier, XP, replay, membership, or answer-
--   validation logic is changed: production bodies are copied verbatim.
-- * Grants are REVOKE/GRANTed to converge a clean replay to production's
--   exact ACLs; on live these statements are already satisfied (no-ops).
--
-- =============================================================================
-- =============================================================================
-- SECTION 1: pick_game_words() -> single live 4-argument overload
-- =============================================================================
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
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
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
    order by lesson_age, over_cap, random() 
    limit greatest(p_count / 2, 1)
  ),
  review_words as (
    select * from pool
    where times_seen > 0
      and on_cooldown = 0
      and (times_correct < times_seen or last_seen_at < now() - interval '3 days')
      and vocabulary_id not in (select vocabulary_id from new_words)
    order by lesson_age, over_cap, random() 
    limit ceil(p_count * 0.375)
  ),
  mastered_words as (
    select * from pool
    where times_seen >= 2 and times_correct = times_seen
      and on_cooldown = 0
      and vocabulary_id not in (select vocabulary_id from new_words union select vocabulary_id from review_words)
    order by lesson_age, over_cap, random() 
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



DROP FUNCTION IF EXISTS public.pick_game_words(boolean, integer);
DROP FUNCTION IF EXISTS public.pick_game_words(boolean, integer, integer);
-- =============================================================================
-- SECTION 2: Word / vocabulary round generators (CREATE OR REPLACE safe)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_word_scramble_round()
 RETURNS TABLE(round_id uuid, id uuid, english text, level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'word_scramble')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'word_scramble';

  v_round_id := gen_random_uuid();

  for r in select p.id, p.english from public.pick_game_words(true, 10, v_level, 'word_scramble') p
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    english := r.english;
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'word_scramble', v_ids, v_level);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_vocabulary_quiz_round()
 RETURNS TABLE(round_id uuid, id uuid, english text, options text[], level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  values (v_student_id, 'vocabulary_quiz')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'vocabulary_quiz';

  v_round_id := gen_random_uuid();

  for r in select p.id, p.english, p.uzbek from public.pick_game_words(false, 10, v_level, 'vocabulary_quiz') p
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
    values (v_round_id, v_student_id, 'vocabulary_quiz', v_ids, v_level);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_speed_challenge_round()
 RETURNS TABLE(round_id uuid, id uuid, english text, options text[], level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  for r in select p.id, p.english, p.uzbek from public.pick_game_words(false, 10, v_level, 'speed_challenge') p
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

CREATE OR REPLACE FUNCTION public.get_word_match_round()
 RETURNS TABLE(round_id uuid, id uuid, english text, uzbek text, level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'word_match')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'word_match';

  v_round_id := gen_random_uuid();

  for r in select p.id, p.english, p.uzbek from public.pick_game_words(false, 10, v_level, 'word_match') p
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    english := r.english;
    uzbek := r.uzbek;
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'word_match', v_ids, v_level);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_hangman_round()
 RETURNS TABLE(round_id uuid, id uuid, english text, uzbek text, level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'hangman')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'hangman';

  v_round_id := gen_random_uuid();

  for r in select p.id, p.english, p.uzbek from public.pick_game_words(true, 10, v_level, 'hangman') p
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    english := r.english;
    uzbek := r.uzbek;
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'hangman', v_ids, v_level);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_word_builder_round()
 RETURNS TABLE(round_id uuid, id uuid, english text, level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then return; end if;
  insert into public.game_level_progress (student_id, game_type) values (v_student_id, 'word_builder') on conflict (student_id, game_type) do nothing;
  select current_level into v_level from public.game_level_progress where student_id = v_student_id and game_type = 'word_builder';
  v_round_id := gen_random_uuid();
  for r in select p.id, p.english from public.pick_word_builder_words(v_level, 8) p loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id; id := r.id; english := r.english; level := v_level; return next;
  end loop;
  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level) values (v_round_id, v_student_id, 'word_builder', v_ids, v_level);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_picture_quiz_round()
 RETURNS TABLE(round_id uuid, id uuid, image_url text, options text[], level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  v_tier text;
  v_stages text[];
  v_count integer;
  r record;
  v_distractors text[];
  v_options text[];
  v_unlocked integer;
  v_valid_filter text := ' and (b.payload->>''image_url'' not like ''%supabase.co%'' or (b.payload->>''image_url'' like ''%supabase.co%'' and exists (select 1 from storage.objects o where o.bucket_id = ''game-content'' and o.name = split_part(b.payload->>''image_url'', ''/game-content/'', 2) and (o.metadata->>''size'')::int > 500)))';
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'picture_quiz')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'picture_quiz';

  v_unlocked := public.student_unlocked_lesson_number();
  v_tier := public.game_level_to_tier(v_level);

  v_stages := case v_tier
    when 'very_easy' then array['very_easy','easy','medium']
    when 'easy' then array['easy','very_easy','medium']
    when 'medium' then array['medium','easy','hard']
    when 'hard' then array['hard','medium','very_hard']
    else array['very_hard','hard','medium']
  end;

  -- Helper to count valid (non-placeholder) items
  execute 'select count(*) from public.game_content_bank b
   where b.game_type = ''picture_quiz''
     and b.difficulty = $1
     and b.min_lesson_number <= $2
     ' || v_valid_filter
  into v_count
  using v_stages[1], v_unlocked;
  if v_count >= 10 then
    v_stages := v_stages[1:1];
  else
    execute 'select count(*) from public.game_content_bank b
     where b.game_type = ''picture_quiz''
       and b.difficulty = any($1)
       and b.min_lesson_number <= $2
       ' || v_valid_filter
    into v_count
    using v_stages[1:2], v_unlocked;
    if v_count >= 10 then
      v_stages := v_stages[1:2];
    else
      v_stages := array['very_easy','easy','medium','hard','very_hard'];
    end if;
  end if;

  v_round_id := gen_random_uuid();

  for r in
    execute 'select b.id, b.payload
    from public.game_content_bank b
    where b.game_type = ''picture_quiz''
      and b.difficulty = any($1)
      and b.min_lesson_number <= $2
      ' || v_valid_filter || '
    order by random()
    limit 10'
  using v_stages, v_unlocked
  loop
    select array_agg(u) into v_distractors from (
      select v.payload->>'english' as u
      from public.game_content_bank v
      where v.game_type = 'picture_quiz'
        and v.payload->>'english' is distinct from r.payload->>'english'
      order by random()
      limit 3
    ) d;
    v_options := array_append(coalesce(v_distractors, '{}'), r.payload->>'english');
    select array_agg(o order by random()) into v_options from unnest(v_options) o;
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    image_url := r.payload->>'image_url';
    options := v_options;
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'picture_quiz', v_ids, v_level);
  end if;
end;
$function$;


-- =============================================================================
-- SECTION 3: Content-game round generators (DROP + CREATE, return type changed)
-- =============================================================================
-- The tracked 0207 / 2026091800000x regression series left these functions
-- with DIFFERENT return shapes than production. PostgreSQL cannot change a
-- return type with CREATE OR REPLACE (42P13), so if the live signature is not
-- already present we DROP the stale overload first. On live (where production
-- already carries the correct signature) the guard is a no-op and the
-- subsequent CREATE OR REPLACE is idempotent.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'get_sentence_scramble_round'
      AND p.pronamespace = 'public'::regnamespace
      AND pg_get_function_result(p.oid) <> 'TABLE(round_id uuid, id uuid, words text[], canonical_words text[], type text, level integer)'
  ) THEN
    EXECUTE 'DROP FUNCTION public.get_sentence_scramble_round()';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_sentence_scramble_round()
 RETURNS TABLE(round_id uuid, id uuid, words text[], canonical_words text[], type text, level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  v_tier text;
  v_max_lesson integer;
  v_stages text[];
  v_count integer;
  r record;
  v_shuffled text[];
  v_canonical text[];
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'sentence_scramble')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'sentence_scramble';

  v_max_lesson := greatest(1, least(100, (coalesce(v_level, 1) * 5)));
  v_tier := public.game_level_to_tier(coalesce(v_level, 1));

  v_stages := case v_tier
    when 'very_easy' then array['very_easy','easy','medium']
    when 'easy' then array['easy','very_easy','medium']
    when 'medium' then array['medium','easy','hard']
    when 'hard' then array['hard','medium','very_hard']
    else array['very_hard','hard','medium']
  end;

  select count(*) into v_count from public.game_content_bank
   where game_type = 'sentence_scramble' and difficulty = v_stages[1] and min_lesson_number <= v_max_lesson;
  if v_count >= 6 then
    v_stages := v_stages[1:1];
  else
    select count(*) into v_count from public.game_content_bank
     where game_type = 'sentence_scramble' and difficulty = any(v_stages[1:2]) and min_lesson_number <= v_max_lesson;
    if v_count >= 6 then
      v_stages := v_stages[1:2];
    else
      v_stages := array['very_easy','easy','medium','hard','very_hard'];
    end if;
  end if;

  v_round_id := gen_random_uuid();

  for r in
    select b.id, b.payload
    from public.game_content_bank b
    where b.game_type = 'sentence_scramble'
      and b.difficulty = any(v_stages)
      and b.min_lesson_number <= v_max_lesson
    order by random()
    limit 6
  loop
    select array_agg(w order by random())
      into v_shuffled
    from jsonb_array_elements_text(r.payload->'words') w;

    select array_agg(w)
      into v_canonical
    from jsonb_array_elements_text(r.payload->'words') w;

    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    words := v_shuffled;
    canonical_words := v_canonical;
    type := r.payload->>'type';
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'sentence_scramble', v_ids, v_level);
  end if;
end;
$function$;


DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'get_word_detective_round'
      AND p.pronamespace = 'public'::regnamespace
      AND pg_get_function_result(p.oid) <> 'TABLE(round_id uuid, id uuid, sentence text, category text, level integer)'
  ) THEN
    EXECUTE 'DROP FUNCTION public.get_word_detective_round()';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_word_detective_round()
 RETURNS TABLE(round_id uuid, id uuid, sentence text, category text, level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  v_tier text;
  v_max_lesson integer;
  v_stages text[];
  v_count integer;
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'word_detective')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'word_detective';

  v_max_lesson := greatest(1, least(100, (coalesce(v_level, 1) * 5)));
  v_tier := public.game_level_to_tier(coalesce(v_level, 1));

  v_stages := case v_tier
    when 'very_easy' then array['very_easy','easy','medium']
    when 'easy' then array['easy','very_easy','medium']
    when 'medium' then array['medium','easy','hard']
    when 'hard' then array['hard','medium','very_hard']
    else array['very_hard','hard','medium']
  end;

  select count(*) into v_count from public.game_content_bank
   where game_type = 'word_detective' and difficulty = v_stages[1] and min_lesson_number <= v_max_lesson;
  if v_count >= 8 then
    v_stages := v_stages[1:1];
  else
    select count(*) into v_count from public.game_content_bank
     where game_type = 'word_detective' and difficulty = any(v_stages[1:2]) and min_lesson_number <= v_max_lesson;
    if v_count >= 8 then
      v_stages := v_stages[1:2];
    else
      v_stages := array['very_easy','easy','medium','hard','very_hard'];
    end if;
  end if;

  v_round_id := gen_random_uuid();

  for r in
    select b.id, b.payload, b.category as bank_category
    from public.game_content_bank b
    where b.game_type = 'word_detective'
      and b.difficulty = any(v_stages)
      and b.min_lesson_number <= v_max_lesson
    order by random()
    limit 8
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    sentence := r.payload->>'sentence';
    category := r.bank_category;
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'word_detective', v_ids, v_level);
  end if;
end;
$function$;


DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'get_grammar_battle_round'
      AND p.pronamespace = 'public'::regnamespace
      AND pg_get_function_result(p.oid) <> 'TABLE(round_id uuid, id uuid, question text, options text[], category text, difficulty text, level integer)'
  ) THEN
    EXECUTE 'DROP FUNCTION public.get_grammar_battle_round()';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_grammar_battle_round()
 RETURNS TABLE(round_id uuid, id uuid, question text, options text[], category text, difficulty text, level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  v_tier text;
  v_max_lesson integer;
  v_limits int[];
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'grammar_battle')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'grammar_battle';

  v_max_lesson := greatest(1, least(100, (coalesce(v_level, 1) * 5)));
  v_tier := public.game_level_to_tier(coalesce(v_level, 1));

  v_limits := case v_tier
    when 'very_easy' then array[8,6,4,2,1]
    when 'easy' then array[5,7,5,2,1]
    when 'medium' then array[3,5,7,4,2]
    when 'hard' then array[1,3,5,7,5]
    else array[1,2,3,6,9]
  end;

  v_round_id := gen_random_uuid();

  for r in
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'very_easy' and b.min_lesson_number <= v_max_lesson order by random() limit v_limits[1])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'easy' and b.min_lesson_number <= v_max_lesson order by random() limit v_limits[2])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'medium' and b.min_lesson_number <= v_max_lesson order by random() limit v_limits[3])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'hard' and b.min_lesson_number <= v_max_lesson order by random() limit v_limits[4])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'very_hard' and b.min_lesson_number <= v_max_lesson order by random() limit v_limits[5])
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    question := r.payload->>'question';
    options := array(select jsonb_array_elements_text(r.payload->'options'));
    category := r.payload->>'category';
    difficulty := r.difficulty;
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'grammar_battle', v_ids, v_level);
  end if;
end;
$function$;


-- =============================================================================
-- SECTION 4: Grants - converge clean replay to production ACLs (no-op on live)
-- =============================================================================
-- pick_game_words (4-arg): production ACL has PUBLIC + anon + authenticated
REVOKE EXECUTE ON FUNCTION public.pick_game_words(boolean, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pick_game_words(boolean, integer, integer, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_game_words(boolean, integer, integer, text) TO service_role;

-- pick_word_builder_words: production ACL has PUBLIC + anon + authenticated
GRANT EXECUTE ON FUNCTION public.pick_word_builder_words(integer, integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_word_builder_words(integer, integer) TO service_role;

-- get_word_scramble_round: authenticated only (no PUBLIC)
REVOKE EXECUTE ON FUNCTION public.get_word_scramble_round() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_word_scramble_round() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_word_scramble_round() TO service_role;

-- get_vocabulary_quiz_round: authenticated only (no PUBLIC)
REVOKE EXECUTE ON FUNCTION public.get_vocabulary_quiz_round() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vocabulary_quiz_round() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vocabulary_quiz_round() TO service_role;

-- get_speed_challenge_round: PUBLIC + anon + authenticated
REVOKE EXECUTE ON FUNCTION public.get_speed_challenge_round() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_speed_challenge_round() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_speed_challenge_round() TO service_role;

-- get_word_match_round: authenticated only (no PUBLIC)
REVOKE EXECUTE ON FUNCTION public.get_word_match_round() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_word_match_round() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_word_match_round() TO service_role;

-- get_hangman_round: authenticated only (no PUBLIC)
REVOKE EXECUTE ON FUNCTION public.get_hangman_round() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hangman_round() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hangman_round() TO service_role;

-- get_word_builder_round: anon + authenticated (no PUBLIC)
REVOKE EXECUTE ON FUNCTION public.get_word_builder_round() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_word_builder_round() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_word_builder_round() TO service_role;

-- get_picture_quiz_round: PUBLIC + anon + authenticated
REVOKE EXECUTE ON FUNCTION public.get_picture_quiz_round() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_picture_quiz_round() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_picture_quiz_round() TO service_role;

-- get_sentence_scramble_round: anon + authenticated (no PUBLIC)
REVOKE EXECUTE ON FUNCTION public.get_sentence_scramble_round() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sentence_scramble_round() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sentence_scramble_round() TO service_role;

-- get_word_detective_round: anon + authenticated (no PUBLIC)
REVOKE EXECUTE ON FUNCTION public.get_word_detective_round() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_word_detective_round() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_word_detective_round() TO service_role;

-- get_grammar_battle_round: anon + authenticated (no PUBLIC)
REVOKE EXECUTE ON FUNCTION public.get_grammar_battle_round() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_grammar_battle_round() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_grammar_battle_round() TO service_role;

-- =============================================================================
-- END OF RECONCILIATION MIGRATION
-- =============================================================================
