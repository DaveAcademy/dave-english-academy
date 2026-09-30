-- Level Progression, wiring layer. Depends on 0149 (game_level_progress,
-- game_level_to_tier/length_cap, game_rounds.level, game_sessions.level).
--
-- get_*_round() now always serves content at the student's current_level
-- (auto-created at level 1 on first fetch) - never a client-supplied
-- level, matching the spec's server-side-enforcement requirement. Content
-- SELECTION logic (curriculum filtering, spaced-repetition buckets,
-- 0145's tier-fallback-broadening) is otherwise byte-for-byte unchanged;
-- only the difficulty SIGNAL feeding it is now level-driven.
--
-- submit_game_round determines pass/fail and advances current_level by
-- exactly one on a pass, only when the submitted round was actually for
-- the student's current level (a passed replay of an earlier level never
-- advances progression further - see spec Q7). Existing grading, scoring,
-- game_word_history, achievements, and personal-best logic are unchanged.
--
-- Scope note: this migration does not add a "replay an arbitrary past
-- level" entry point - get_*_round() always serves current_level. The
-- data model doesn't prevent adding that later (game_rounds/game_sessions
-- already carry level); it's simply not built this session, by explicit
-- scope decision (the priority was the core Level N -> N+1 loop).

-- =====================================================================
-- pick_game_words: length_cap now level-driven when p_level is given.
-- Backward-compatible default (p_level null) keeps the old exposure-count
-- heuristic, in case anything else ever calls this without a level.
-- =====================================================================
create or replace function public.pick_game_words(p_alpha_only boolean, p_count integer default 8, p_level integer default null)
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

  if p_level is not null then
    v_length_cap := public.game_level_to_length_cap(p_level);
  else
    select count(*) into v_exposure_count from public.game_word_history where student_id = v_student_id;
    v_length_cap := case
      when v_exposure_count < 15 then 6
      when v_exposure_count < 40 then 9
      else null
    end;
  end if;

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

-- =====================================================================
-- Family V round generators (Word Scramble, Word Builder: single-field;
-- Vocabulary Quiz, Speed Challenge, Listening Challenge: multiple-choice;
-- Word Match: pair). All get an initial current_level lookup/creation and
-- a `level` output column; content selection otherwise unchanged.
-- =====================================================================
drop function if exists public.get_word_scramble_round();
create or replace function public.get_word_scramble_round()
returns table (round_id uuid, id uuid, english text, level integer)
language plpgsql
security definer
set search_path = 'public'
as $$
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

  for r in select p.id, p.english from public.pick_game_words(true, 8, v_level) p
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
$$;
revoke execute on function public.get_word_scramble_round() from public;
grant execute on function public.get_word_scramble_round() to authenticated;

drop function if exists public.get_word_builder_round();
create or replace function public.get_word_builder_round()
returns table (round_id uuid, id uuid, english text, level integer)
language plpgsql
security definer
set search_path = 'public'
as $$
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
  values (v_student_id, 'word_builder')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'word_builder';

  v_round_id := gen_random_uuid();

  for r in select p.id, p.english from public.pick_game_words(true, 8, v_level) p
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
    values (v_round_id, v_student_id, 'word_builder', v_ids, v_level);
  end if;
end;
$$;
revoke execute on function public.get_word_builder_round() from public;
grant execute on function public.get_word_builder_round() to authenticated;

drop function if exists public.get_vocabulary_quiz_round();
create or replace function public.get_vocabulary_quiz_round()
returns table (round_id uuid, id uuid, english text, options text[], level integer)
language plpgsql
security definer
set search_path = 'public'
as $$
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

  for r in select p.id, p.english, p.uzbek from public.pick_game_words(false, 8, v_level) p
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
$$;
revoke execute on function public.get_vocabulary_quiz_round() from public;
grant execute on function public.get_vocabulary_quiz_round() to authenticated;

drop function if exists public.get_speed_challenge_round();
create or replace function public.get_speed_challenge_round()
returns table (round_id uuid, id uuid, english text, options text[], level integer)
language plpgsql
security definer
set search_path = 'public'
as $$
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

  for r in select p.id, p.english, p.uzbek from public.pick_game_words(false, 10, v_level) p
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
$$;
revoke execute on function public.get_speed_challenge_round() from public;
grant execute on function public.get_speed_challenge_round() to authenticated;

drop function if exists public.get_listening_challenge_round();
create or replace function public.get_listening_challenge_round()
returns table (round_id uuid, id uuid, english text, options text[], level integer)
language plpgsql
security definer
set search_path = 'public'
as $$
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
  values (v_student_id, 'listening_challenge')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'listening_challenge';

  v_round_id := gen_random_uuid();

  for r in select p.id, p.english, p.uzbek from public.pick_game_words(false, 8, v_level) p
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
    values (v_round_id, v_student_id, 'listening_challenge', v_ids, v_level);
  end if;
end;
$$;
revoke execute on function public.get_listening_challenge_round() from public;
grant execute on function public.get_listening_challenge_round() to authenticated;

drop function if exists public.get_word_match_round();
create or replace function public.get_word_match_round()
returns table (round_id uuid, id uuid, english text, uzbek text, level integer)
language plpgsql
security definer
set search_path = 'public'
as $$
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

  for r in select p.id, p.english, p.uzbek from public.pick_game_words(false, 6, v_level) p
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
$$;
revoke execute on function public.get_word_match_round() from public;
grant execute on function public.get_word_match_round() to authenticated;

-- =====================================================================
-- Family C round generators (Sentence Scramble, Word Detective): tier now
-- comes from game_level_to_tier(current_level) instead of
-- adaptive_difficulty_tier(). 0145's fallback-broadening logic (widen to
-- adjacent stages, then to any unlocked stage, if the level's tier is too
-- thin for the student's curriculum unlock) is preserved byte-for-byte.
-- =====================================================================
drop function if exists public.get_sentence_scramble_round();
create or replace function public.get_sentence_scramble_round()
returns table (round_id uuid, id uuid, words text[], canonical_words text[], type text, level integer)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_unlocked integer;
  v_level integer;
  v_tier text;
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

  v_unlocked := public.student_unlocked_lesson_number();
  v_tier := public.game_level_to_tier(v_level);

  v_stages := case v_tier
    when 'very_easy' then array['very_easy','easy','medium']
    when 'easy' then array['easy','very_easy','medium']
    when 'medium' then array['medium','easy','hard']
    when 'hard' then array['hard','medium','very_hard']
    else array['very_hard','hard','medium']
  end;

  select count(*) into v_count from public.game_content_bank
   where game_type = 'sentence_scramble' and difficulty = v_stages[1] and min_lesson_number <= v_unlocked;
  if v_count >= 6 then
    v_stages := v_stages[1:1];
  else
    select count(*) into v_count from public.game_content_bank
     where game_type = 'sentence_scramble' and difficulty = any(v_stages[1:2]) and min_lesson_number <= v_unlocked;
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
      and b.min_lesson_number <= v_unlocked
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
$$;
revoke execute on function public.get_sentence_scramble_round() from public;
grant execute on function public.get_sentence_scramble_round() to authenticated;

drop function if exists public.get_word_detective_round();
create or replace function public.get_word_detective_round()
returns table (round_id uuid, id uuid, sentence text, category text, level integer)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_unlocked integer;
  v_level integer;
  v_tier text;
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

  v_unlocked := public.student_unlocked_lesson_number();
  v_tier := public.game_level_to_tier(v_level);

  v_stages := case v_tier
    when 'very_easy' then array['very_easy','easy','medium']
    when 'easy' then array['easy','very_easy','medium']
    when 'medium' then array['medium','easy','hard']
    when 'hard' then array['hard','medium','very_hard']
    else array['very_hard','hard','medium']
  end;

  select count(*) into v_count from public.game_content_bank
   where game_type = 'word_detective' and difficulty = v_stages[1] and min_lesson_number <= v_unlocked;
  if v_count >= 8 then
    v_stages := v_stages[1:1];
  else
    select count(*) into v_count from public.game_content_bank
     where game_type = 'word_detective' and difficulty = any(v_stages[1:2]) and min_lesson_number <= v_unlocked;
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
      and b.min_lesson_number <= v_unlocked
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
$$;
revoke execute on function public.get_word_detective_round() from public;
grant execute on function public.get_word_detective_round() to authenticated;

-- =====================================================================
-- Grammar Battle: mixed-tier pool bias now driven by game_level_to_tier()
-- instead of adaptive_difficulty_tier(); the 5 existing v_limits presets
-- and per-item min_lesson_number gating are unchanged.
-- =====================================================================
drop function if exists public.get_grammar_battle_round();
create or replace function public.get_grammar_battle_round()
returns table (round_id uuid, id uuid, question text, options text[], category text, difficulty text, level integer)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_unlocked integer;
  v_level integer;
  v_tier text;
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

  v_unlocked := public.student_unlocked_lesson_number();
  v_tier := public.game_level_to_tier(v_level);

  v_limits := case v_tier
    when 'very_easy' then array[8,6,4,2,1]
    when 'easy' then array[5,7,5,2,1]
    when 'medium' then array[3,5,7,4,2]
    when 'hard' then array[1,3,5,7,5]
    else array[1,2,3,6,9]
  end;

  v_round_id := gen_random_uuid();

  for r in
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'very_easy' and b.min_lesson_number <= v_unlocked order by random() limit v_limits[1])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'easy' and b.min_lesson_number <= v_unlocked order by random() limit v_limits[2])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'medium' and b.min_lesson_number <= v_unlocked order by random() limit v_limits[3])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'hard' and b.min_lesson_number <= v_unlocked order by random() limit v_limits[4])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'very_hard' and b.min_lesson_number <= v_unlocked order by random() limit v_limits[5])
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
$$;
revoke execute on function public.get_grammar_battle_round() from public;
grant execute on function public.get_grammar_battle_round() to authenticated;

-- =====================================================================
-- submit_game_round: pass/fail + level advance. Grading/scoring/
-- game_word_history/achievements/is_new_best logic is unchanged - only
-- additions are: read the consumed round's level, compute pass/fail,
-- upsert+advance game_level_progress, tag the game_sessions row with
-- level, and return level info to the client.
--
-- Pass condition (approved 2026-08-17): >=70% correct for the 8 accuracy-
-- based games. Grammar Battle is lives-based, not accuracy-based - "pass"
-- means the student answered every item the round actually contained
-- (v_words_total, from the submitted answers) without being cut short by
-- losing all lives, which the client detects and stops submitting.
-- Verified server-side by comparing v_words_total against the FULL
-- original round size (array_length of the consumed game_rounds row's
-- vocabulary_ids) - a client cannot claim survival by simply omitting
-- unanswered items, because a genuinely shorter submission is
-- indistinguishable from a genuinely smaller round only when it matches
-- the round's real length.
create or replace function public.submit_game_round(p_round_id uuid, p_game_type text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_words_correct integer := 0;
  v_words_total integer := 0;
  v_score numeric := 0;
  v_results jsonb := '[]'::jsonb;
  r record;
  v_correct boolean;
  v_points numeric;
  v_elapsed_ms numeric;
  v_speed_bonus numeric;
  v_session_id bigint;
  v_is_new_best boolean;
  v_metric_key text;
  v_round_game_type text;
  v_round_level integer;
  v_round_size integer;
  v_payload jsonb;
  v_submitted_words text[];
  v_canonical_words text[];
  v_pass boolean;
  v_current_level integer;
  v_leveled_up boolean := false;
begin
  if p_game_type not in (
    'word_scramble', 'vocabulary_quiz', 'word_match', 'speed_challenge',
    'word_builder', 'listening_challenge', 'sentence_scramble', 'word_detective', 'grammar_battle'
  ) then
    raise exception 'Unknown game_type: %', p_game_type;
  end if;
  v_metric_key := case p_game_type
    when 'word_scramble' then 'game_words_scrambled_correct'
    when 'vocabulary_quiz' then 'game_vocabulary_quiz_correct'
    when 'word_match' then 'game_word_match_correct'
    when 'speed_challenge' then 'game_speed_challenge_correct'
    when 'word_builder' then 'game_word_builder_correct'
    when 'listening_challenge' then 'game_listening_challenge_correct'
    when 'sentence_scramble' then 'game_sentence_scramble_correct'
    when 'word_detective' then 'game_word_detective_correct'
    when 'grammar_battle' then 'game_grammar_battle_correct'
  end;

  select id into v_student_id from public.students where profile_id = auth.uid();
  if v_student_id is null then
    raise exception 'No student record for the current user';
  end if;

  update public.game_rounds
     set consumed_at = now()
   where id = p_round_id
     and student_id = v_student_id
     and consumed_at is null
  returning game_type, level, array_length(vocabulary_ids, 1)
    into v_round_game_type, v_round_level, v_round_size;

  if not found then
    raise exception 'This round is invalid or has already been submitted' using errcode = 'P0001';
  end if;

  if v_round_game_type <> p_game_type then
    raise exception 'Round/game type mismatch';
  end if;

  if p_game_type in ('word_scramble', 'vocabulary_quiz', 'word_match', 'speed_challenge', 'word_builder', 'listening_challenge') then
    for r in
      select
        (a->>'vocabulary_id')::uuid as vocabulary_id,
        a->>'answer' as answer,
        coalesce((a->>'used_hint')::boolean, false) as used_hint,
        coalesce((a->>'skipped')::boolean, false) as skipped,
        (a->>'elapsed_ms')::numeric as elapsed_ms
      from jsonb_array_elements(p_answers) as a
    loop
      v_words_total := v_words_total + 1;

      select (not r.skipped) and (
        case p_game_type
          when 'word_scramble' then lower(trim(r.answer)) = lower(v.english)
          when 'vocabulary_quiz' then trim(r.answer) = v.uzbek
          when 'word_match' then trim(r.answer) = v.uzbek
          when 'speed_challenge' then trim(r.answer) = v.uzbek
          when 'word_builder' then lower(trim(r.answer)) = lower(v.english)
          when 'listening_challenge' then trim(r.answer) = v.uzbek
        end
      )
        into v_correct
      from public.student_available_vocabulary() v
      where v.id = r.vocabulary_id;

      v_correct := coalesce(v_correct, false);

      if v_correct then
        v_words_correct := v_words_correct + 1;
        if p_game_type = 'speed_challenge' then
          v_elapsed_ms := greatest(0, least(coalesce(r.elapsed_ms, 10000), 10000));
          v_speed_bonus := round(5 * (1 - v_elapsed_ms / 10000));
          v_points := 10 + v_speed_bonus;
        else
          v_points := case when r.used_hint then 5 else 10 end;
        end if;
        v_score := v_score + v_points;
      end if;

      insert into public.game_word_history (student_id, vocabulary_id, times_seen, times_correct, last_seen_at)
      values (v_student_id, r.vocabulary_id, 1, case when v_correct then 1 else 0 end, now())
      on conflict (student_id, vocabulary_id) do update set
        times_seen = game_word_history.times_seen + 1,
        times_correct = game_word_history.times_correct + case when v_correct then 1 else 0 end,
        last_seen_at = now();

      v_results := v_results || jsonb_build_object('vocabulary_id', r.vocabulary_id, 'correct', v_correct);
    end loop;

    v_pass := v_words_total > 0 and (v_words_correct::numeric / v_words_total) >= 0.70;
  else
    for r in
      select
        (a->>'content_id')::uuid as content_id,
        a->>'answer' as answer,
        a->'words' as answer_words,
        coalesce((a->>'wrong_index')::int, -1) as wrong_index,
        a->>'correction' as correction,
        coalesce((a->>'skipped')::boolean, false) as skipped
      from jsonb_array_elements(p_answers) as a
    loop
      v_words_total := v_words_total + 1;
      v_payload := (select payload from public.game_content_bank where id = r.content_id and game_type = p_game_type);
      v_correct := false;

      if v_payload is not null and not r.skipped then
        if p_game_type = 'sentence_scramble' then
          select array_agg(w) into v_submitted_words from jsonb_array_elements_text(coalesce(r.answer_words, '[]'::jsonb)) w;
          select array_agg(w) into v_canonical_words from jsonb_array_elements_text(v_payload->'words') w;
          v_correct := v_submitted_words = v_canonical_words;
        elsif p_game_type = 'word_detective' then
          v_correct := r.wrong_index = coalesce((v_payload->>'wrong_index')::int, -2)
            and lower(trim(coalesce(r.correction, ''))) = lower(trim(coalesce(v_payload->>'correction', '')));
        elsif p_game_type = 'grammar_battle' then
          v_correct := trim(coalesce(r.answer, '')) = ((v_payload->'options') ->> ((v_payload->>'correct_index')::int));
        end if;
      end if;

      v_correct := coalesce(v_correct, false);
      if v_correct then
        v_words_correct := v_words_correct + 1;
        v_points := 10;
        v_score := v_score + v_points;
      end if;

      v_results := v_results || jsonb_build_object('content_id', r.content_id, 'correct', v_correct);
    end loop;

    if p_game_type = 'grammar_battle' then
      -- Lives-based pass: reached the end of the round the server actually
      -- minted, not cut short by a life-loss (or a skip-heavy bail-out -
      -- skipped items are graded incorrect above but still count toward
      -- v_words_total, so only an early client-side stop shortens it).
      v_pass := v_round_size is not null and v_words_total >= v_round_size;
    else
      v_pass := v_words_total > 0 and (v_words_correct::numeric / v_words_total) >= 0.70;
    end if;
  end if;

  select v_score > coalesce(max(score), -1)
    into v_is_new_best
  from public.game_sessions
  where student_id = v_student_id and game_type = p_game_type;

  insert into public.game_sessions (student_id, game_type, score, words_correct, words_total, level)
  values (v_student_id, p_game_type, v_score, v_words_correct, v_words_total, v_round_level)
  returning id into v_session_id;

  -- Level advance: only if this round was actually the student's current
  -- level (a passed replay of an earlier level never pushes progression
  -- further - see spec Q7) and content_level is known.
  if v_pass and v_round_level is not null then
    update public.game_level_progress
       set current_level = v_round_level + 1,
           best_level_reached = greatest(best_level_reached, v_round_level + 1),
           updated_at = now()
     where student_id = v_student_id and game_type = p_game_type
       and current_level = v_round_level;
    v_leveled_up := found;
  end if;

  select current_level into v_current_level
  from public.game_level_progress
  where student_id = v_student_id and game_type = p_game_type;

  perform public.bump_student_metric(v_student_id, v_metric_key, v_words_correct);
  perform public.evaluate_achievements(v_student_id);

  return jsonb_build_object(
    'session_id', v_session_id,
    'score', v_score,
    'words_correct', v_words_correct,
    'words_total', v_words_total,
    'is_new_best', coalesce(v_is_new_best, true),
    'results', v_results,
    'level', v_round_level,
    'pass', coalesce(v_pass, false),
    'leveled_up', v_leveled_up,
    'current_level', v_current_level
  );
end;
$$;

revoke execute on function public.submit_game_round(uuid, text, jsonb) from public;
grant execute on function public.submit_game_round(uuid, text, jsonb) to authenticated;
