-- Anagram Builder game (Games subsystem only).
-- New game: the student sees ONE shuffled letter pool (e.g. S T O N E)
-- and must discover valid English words built only from those letters.
-- Difficulty = required word count: 2 at level 1 up to 10 at level 90+.
--
-- WHY A NEW GAME_TYPE: 'word_builder' (/word-builder, tap tiles to spell
-- one given word) already exists with its own round shape and grading.
-- Reworking it would change existing scoring behavior, so this game uses
-- game_type 'anagram_builder' with its own generator + grading branch.
-- Nothing below touches any other game's logic, Dictionary, Homework,
-- Exams, Payments, Pets, or XP tables.
--
-- DESIGN (mirrors the hangman/picture_word precedents):
-- 1) game_level_to_anagram_range(): level -> (letter-count range, target).
--    Bands MUST stay in sync with anagramDifficultyForLevel() in
--    src/features/games/utils/anagram.js.
-- 2) get_anagram_builder_round(): picks a seed word from
--    student_available_vocabulary() (the single approved source - no
--    second dictionary), counts constructible candidates server-side, and
--    only mints the round when candidates >= target (retry loop, widened
--    fallback, then target adaptation - never an unsolvable round).
--    vocabulary_ids stores ONLY the seed id (candidates are never sent to
--    the client, so there is no answer key to leak).
-- 3) submit_game_round(): new 'anagram_builder' branch - re-validates
--    every submitted word server-side (normalize, min length 3,
--    letter-multiset construction, membership in the student's available
--    vocabulary, duplicate rejection). Points/levels/sessions/achievements
--    flow through the UNCHANGED shared tail: single-use rounds
--    (consumed_at) + result_payload replay + the partial unique index on
--    (student_id, game_type, level) give exactly-once points, same as
--    every other game. Client-provided scores are never trusted.
-- Safe to re-run: CREATE OR REPLACE + IF NOT EXISTS throughout.

-- =====================================================================
-- 0. Round columns: the letter pool + required count live on the round
--    row so grading never trusts client-sent letters/targets.
-- =====================================================================
alter table public.game_rounds add column if not exists letters text;
alter table public.game_rounds add column if not exists target_words integer;

-- =====================================================================
-- 1. Difficulty: letter-count range + required words per level.
--    Easy 3-4/2, Normal 4-5/3-4, Medium 5-6/5-6, Hard 6-8/7-8,
--    Very Hard 8-10/up to 10.
-- =====================================================================
create or replace function public.game_level_to_anagram_range(p_level integer)
returns table (min_letters integer, max_letters integer, target integer)
language sql
immutable
as $$
  select
    case
      when p_level <= 4 then 3
      when p_level <= 14 then 4
      when p_level <= 34 then 5
      when p_level <= 49 then 6
      when p_level <= 69 then 7
      else 8
    end as min_letters,
    case
      when p_level <= 4 then 4
      when p_level <= 14 then 5
      when p_level <= 34 then 6
      when p_level <= 49 then 7
      when p_level <= 69 then 8
      when p_level <= 89 then 9
      else 10
    end as max_letters,
    case
      when p_level <= 4 then 2
      when p_level <= 9 then 3
      when p_level <= 14 then 4
      when p_level <= 24 then 5
      when p_level <= 34 then 6
      when p_level <= 49 then 7
      when p_level <= 69 then 8
      when p_level <= 89 then 9
      else 10
    end as target
$$;

comment on function public.game_level_to_anagram_range(integer) is
  'Anagram Builder difficulty per level. Keep in sync with anagramDifficultyForLevel() in src/features/games/utils/anagram.js.';

-- =====================================================================
-- 2. Letter-multiset construction check: every letter of p_word may be
--    used at most as many times as it appears in p_letters. Handles
--    repeated letters (pool AAT allows TAT... no: allows AT, rejects
--    ATTA/AAA which need a second T / third A).
-- =====================================================================
create or replace function public.anagram_word_constructible(p_word text, p_letters text)
returns boolean
language sql
immutable
as $$
  select lower(p_word) ~ '^[a-z]+$'
    and char_length(lower(p_word)) >= 3
    and not exists (
      select 1
      from (select ch, count(*) as n from regexp_split_to_table(lower(p_word), '') ch group by ch) need
      where need.n > (select count(*) from regexp_split_to_table(lower(p_letters), '') ch2 where ch2 = need.ch)
    )
$$;

comment on function public.anagram_word_constructible(text, text) is
  'True when p_word can be built from the p_letters multiset (each letter used at most as often as it appears).';

-- =====================================================================
-- 3. Round generator: seed-first generation guarantees solvability.
--    A seed is only used when the available vocabulary contains at
--    least <target> constructible words for its letters. Seeds prefer
--    unseen / least-recently-seen words via game_word_history (the same
--    recent-word exclusion every game uses - no parallel system).
-- =====================================================================
drop function if exists public.get_anagram_builder_round();
create or replace function public.get_anagram_builder_round()
returns table (round_id uuid, level integer, letters text, target_words integer)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_level integer;
  v_min_letters integer;
  v_max_letters integer;
  v_target integer;
  v_seed record;
  v_count integer;
  v_best_letters text := null;
  v_best_seed_id uuid := null;
  v_best_count integer := 0;
  v_attempt integer;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then return; end if;
  insert into public.game_level_progress (student_id, game_type) values (v_student_id, 'anagram_builder') on conflict (student_id, game_type) do nothing;
  select current_level into v_level from public.game_level_progress where student_id = v_student_id and game_type = 'anagram_builder';

  select min_letters, max_letters, target into v_min_letters, v_max_letters, v_target
  from public.game_level_to_anagram_range(v_level);

  -- Try the band range, then widened by 1 (min 3 letters), then accept
  -- the best seed found with an adapted (lowered) target. The seed
  -- itself always qualifies (alpha-only, length >= 3, in-vocabulary, and
  -- trivially constructible from its own letters), so best_count >= 1
  -- whenever the student has ANY eligible seed - an unsolvable round is
  -- impossible; only the target adapts down for tiny pools.
  for v_attempt in 1..2 loop
    for v_seed in
      select v.id as vid, lower(trim(v.english)) as w
      from public.student_available_vocabulary() v
      left join public.game_word_history h on h.student_id = v_student_id and h.vocabulary_id = v.id
      where v.english ~ '^[A-Za-z]+$'
        and char_length(trim(v.english)) >= case when v_attempt = 1 then v_min_letters else greatest(3, v_min_letters - 1) end
        and char_length(trim(v.english)) <= case when v_attempt = 1 then v_max_letters else v_max_letters + 1 end
      order by coalesce(h.times_seen, 0) > 0, h.last_seen_at nulls first, random()
      limit 30
    loop
      select count(*) into v_count from (
        select distinct lower(trim(c.english)) as w
        from public.student_available_vocabulary() c
        where c.english ~ '^[A-Za-z]+$'
      ) d
      where public.anagram_word_constructible(d.w, v_seed.w);
      if v_count > v_best_count then
        v_best_count := v_count;
        v_best_letters := v_seed.w;
        v_best_seed_id := v_seed.vid;
      end if;
      if v_count >= v_target then
        v_round_id := gen_random_uuid();
        insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level, letters, target_words)
        values (v_round_id, v_student_id, 'anagram_builder', array[v_seed.vid], v_level, v_seed.w, v_target);
        round_id := v_round_id; level := v_level; letters := v_seed.w; target_words := v_target;
        return next;
        return;
      end if;
    end loop;
  end loop;

  -- Adapted fallback: lower the target to what the best seed supports.
  if v_best_seed_id is not null then
    v_target := least(v_target, greatest(v_best_count, 1));
    v_round_id := gen_random_uuid();
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level, letters, target_words)
    values (v_round_id, v_student_id, 'anagram_builder', array[v_best_seed_id], v_level, v_best_letters, v_target);
    round_id := v_round_id; level := v_level; letters := v_best_letters; target_words := v_target;
    return next;
  end if;
end;
$$;
revoke execute on function public.get_anagram_builder_round() from public;
grant execute on function public.get_anagram_builder_round() to authenticated;

comment on function public.get_anagram_builder_round() is
  'Anagram Builder round: one letter pool + required word count. Seed-first generation guarantees candidates >= target (adapts target only for tiny pools). vocabulary_ids holds the seed id only.';

-- =====================================================================
-- 4. Tier mapping: active word-retrieval like word_match/word_scramble.
-- =====================================================================
create or replace function public.game_type_difficulty(p_game_type text)
returns text
language sql
immutable
set search_path = 'public'
as $$
  select case p_game_type
    when 'picture_quiz'       then 'very_easy'
    when 'hangman'            then 'easy'
    when 'vocabulary_quiz'    then 'easy'
    when 'word_match'         then 'medium'
    when 'word_scramble'      then 'medium'
    when 'anagram_builder'    then 'medium'
    when 'sentence_scramble'  then 'medium_hard'
    when 'word_builder'       then 'medium_hard'
    when 'word_detective'     then 'hard'
    when 'speed_challenge'    then 'hard'
    when 'grammar_battle'     then 'very_hard'
    else 'easy'
  end
$$;

-- =====================================================================
-- 5. submit_game_round + 'anagram_builder' branch. Identical to the
--    authoritative 20261003 version except: whitelist/metric/earned-map
--    entries, letters+target_words in the round fetch, the new grading
--    branch, and the anagram-aware level-up condition. Every other
--    game's path is byte-for-byte the same logic.
-- =====================================================================
create or replace function public.submit_game_round(p_round_id uuid, p_game_type text, p_answers jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  v_tier text;
  v_is_perfect boolean := false;
  v_points_awarded integer;
  v_game_points_total integer;
  v_wrong_attempts integer;
  v_earned integer := 0;
  v_recovered_payload jsonb;
  v_recovered_type text;
  v_round_ids uuid[];
  v_seen_ids uuid[] := '{}';
  v_result jsonb;
  v_letters text;
  v_target integer;
  v_seed_id uuid;
  v_w text;
  v_word_id uuid;
  v_seen_words text[] := '{}';
  v_invalid_count integer := 0;
begin
  if p_game_type not in (
    'word_scramble', 'vocabulary_quiz', 'word_match', 'speed_challenge',
    'word_builder', 'sentence_scramble', 'word_detective',
    'grammar_battle', 'picture_quiz', 'hangman', 'picture_word',
    'anagram_builder'
  ) then
    raise exception 'Unknown game_type: %', p_game_type;
  end if;

  v_metric_key := case p_game_type
    when 'word_scramble' then 'game_words_scrambled_correct'
    when 'vocabulary_quiz' then 'game_vocabulary_quiz_correct'
    when 'word_match' then 'game_word_match_correct'
    when 'speed_challenge' then 'game_speed_challenge_correct'
    when 'word_builder' then 'game_word_builder_correct'
    when 'sentence_scramble' then 'game_sentence_scramble_correct'
    when 'word_detective' then 'game_word_detective_correct'
    when 'grammar_battle' then 'game_grammar_battle_correct'
    when 'picture_quiz' then 'game_picture_quiz_correct'
    when 'hangman' then 'game_hangman_correct'
    when 'picture_word' then 'game_picture_word_correct'
    when 'anagram_builder' then 'game_anagram_builder_correct'
  end;

  select id into v_student_id from public.students where profile_id = auth.uid();
  v_words_correct := 0;

  if v_student_id is null then
    raise exception 'No student record for the current user';
  end if;

  update public.game_rounds
     set consumed_at = now()
   where id = p_round_id
     and student_id = v_student_id
     and consumed_at is null
   returning game_type, level, vocabulary_ids, letters, target_words
     into v_round_game_type, v_round_level, v_round_ids, v_letters, v_target;

  if not found then
    select result_payload, game_type into v_recovered_payload, v_recovered_type from public.game_rounds where id = p_round_id and student_id = v_student_id;
    if v_recovered_payload is not null then
      if v_recovered_type is distinct from p_game_type then raise exception 'Round/game type mismatch'; end if;
      return v_recovered_payload;
    end if;
    raise exception 'This round is invalid or has already been submitted' using errcode = 'P0001';
  end if;

  v_round_size := coalesce(array_length(v_round_ids, 1), 0);
  if v_round_game_type <> p_game_type then raise exception 'Round/game type mismatch'; end if;

  if p_game_type in ('word_scramble', 'vocabulary_quiz', 'word_match', 'speed_challenge', 'word_builder', 'hangman') then
    for r in select (a->>'vocabulary_id')::uuid as vocabulary_id, a->>'answer' as answer, coalesce((a->>'used_hint')::boolean, false) as used_hint, coalesce((a->>'skipped')::boolean, false) as skipped, a->>'elapsed_ms' as elapsed_ms_str, coalesce((a->>'wrong_attempts')::int, 0) as wrong_attempts from jsonb_array_elements(p_answers) as a
    loop
      v_words_total := v_words_total + 1;
      v_correct := null;
      if r.skipped then v_correct := false;
      elsif r.vocabulary_id is null then v_correct := false;
      elsif not (r.vocabulary_id = any(v_round_ids)) then v_correct := false;
      elsif r.vocabulary_id = any(v_seen_ids) then v_correct := false;
      else
        select lower(trim(coalesce(r.answer, ''))) = lower(trim(case when p_game_type in ('vocabulary_quiz', 'word_match', 'speed_challenge') then lv.uzbek else lv.english end))
          into v_correct from public.lesson_vocabulary lv where lv.id = r.vocabulary_id;
        v_seen_ids := array_append(v_seen_ids, r.vocabulary_id);
      end if;
      v_correct := coalesce(v_correct, false);
      if v_correct then v_words_correct := v_words_correct + 1; v_wrong_attempts := greatest(v_wrong_attempts, coalesce(r.wrong_attempts, 0)); v_points := 1; v_score := v_score + v_points; end if;
      insert into public.game_word_history (student_id, vocabulary_id, times_seen, times_correct, last_seen_at)
      values (v_student_id, r.vocabulary_id, 1, case when v_correct then 1 else 0 end, now())
      on conflict (student_id, vocabulary_id) do update set times_seen = game_word_history.times_seen + 1, times_correct = game_word_history.times_correct + case when v_correct then 1 else 0 end, last_seen_at = now();
      v_results := v_results || jsonb_build_object('vocabulary_id', r.vocabulary_id, 'correct', v_correct);
    end loop;
    v_pass := v_words_total > 0 and (v_words_correct::numeric / v_words_total) >= 0.70;
  elsif p_game_type = 'anagram_builder' then
    -- Free-word answers [{word}]: every rule re-checked server-side.
    -- v_letters/v_target come from the stored round row, never the client.
    v_seed_id := v_round_ids[1];
    if v_letters is null or v_target is null or v_target < 1 then
      raise exception 'Anagram round is missing its letter pool';
    end if;
    for r in select lower(trim(a->>'word')) as word from jsonb_array_elements(p_answers) as a
    loop
      v_w := nullif(r.word, '');
      if v_w is null then continue; end if;
      v_correct := false;
      if char_length(v_w) < 3 then v_correct := false;
      elsif v_w = any(v_seen_words) then v_correct := false;
      elsif not public.anagram_word_constructible(v_w, v_letters) then v_correct := false;
      elsif not exists (select 1 from public.student_available_vocabulary() v where lower(trim(v.english)) = v_w) then v_correct := false;
      else
        v_correct := true;
        v_seen_words := array_append(v_seen_words, v_w);
        v_word_id := null;
        select v.id into v_word_id from public.student_available_vocabulary() v where lower(trim(v.english)) = v_w limit 1;
        insert into public.game_word_history (student_id, vocabulary_id, times_seen, times_correct, last_seen_at)
        values (v_student_id, v_word_id, 1, 1, now())
        on conflict (student_id, vocabulary_id) do update set times_seen = game_word_history.times_seen + 1, times_correct = game_word_history.times_correct + 1, last_seen_at = now();
      end if;
      v_correct := coalesce(v_correct, false);
      if v_correct then v_words_correct := v_words_correct + 1; v_points := 1; v_score := v_score + v_points;
      else v_invalid_count := v_invalid_count + 1; end if;
      v_results := v_results || jsonb_build_object('word', v_w, 'correct', v_correct);
    end loop;
    v_words_correct := least(v_words_correct, v_target);
    -- Invalid attempts inflate the total so perfection requires clean play;
    -- passing (level-up) only needs the required words found.
    v_words_total := v_target + v_invalid_count;
    v_pass := v_target > 0 and v_words_correct >= v_target;
    -- Seed recency: the seed counts as seen so consecutive rounds vary
    -- (same game_word_history mechanism every game uses).
    if v_seed_id is not null then
      insert into public.game_word_history (student_id, vocabulary_id, times_seen, times_correct, last_seen_at)
      values (v_student_id, v_seed_id, 1, 0, now())
      on conflict (student_id, vocabulary_id) do update set times_seen = game_word_history.times_seen + 1, last_seen_at = now();
    end if;
  else
    v_seen_ids := '{}'::uuid[];
    for r in select (a->>'content_id')::uuid as content_id, a->>'answer' as answer, a->'words' as answer_words, coalesce((a->>'wrong_index')::int, -1) as wrong_index, a->>'correction' as correction, coalesce((a->>'skipped')::boolean, false) as skipped, coalesce((a->>'wrong_attempts')::int, 0) as wrong_attempts from jsonb_array_elements(p_answers) as a
    loop
      v_words_total := v_words_total + 1; v_payload := null; v_correct := null;
      if r.content_id is null or r.skipped then v_correct := false;
      elsif not (r.content_id = any(v_round_ids)) then v_correct := false;
      elsif r.content_id = any(v_seen_ids) then v_correct := false;
      else
        v_seen_ids := array_append(v_seen_ids, r.content_id);
        select payload into v_payload from public.game_content_bank where id = r.content_id;
        if v_payload is null then v_correct := false;
        elsif p_game_type = 'sentence_scramble' then select array_agg(w) into v_submitted_words from jsonb_array_elements_text(coalesce(r.answer_words, '[]'::jsonb)) w; select array_agg(w) into v_canonical_words from jsonb_array_elements_text(v_payload->'words') w; v_correct := v_submitted_words = v_canonical_words;
        elsif p_game_type = 'word_detective' then v_correct := r.wrong_index = coalesce((v_payload->>'wrong_index')::int, -2) and lower(trim(coalesce(r.correction, ''))) = lower(trim(coalesce(v_payload->>'correction', '')));
        elsif p_game_type = 'grammar_battle' then v_correct := trim(coalesce(r.answer, '')) = ((v_payload->'options') ->> ((v_payload->>'correct_index')::int));
        elsif p_game_type in ('picture_quiz', 'picture_word') then v_correct := lower(trim(coalesce(r.answer, ''))) = lower(trim(coalesce(v_payload->>'english', '')));
        end if;
      end if;
      v_correct := coalesce(v_correct, false);
      if v_correct then v_words_correct := v_words_correct + 1; v_points := 1; v_score := v_score + v_points; end if;
      v_wrong_attempts := coalesce(r.wrong_attempts, 0);
      v_results := v_results || jsonb_build_object('content_id', r.content_id, 'correct', v_correct);
    end loop;
    if p_game_type = 'grammar_battle' then v_pass := v_round_size is not null and v_words_total >= v_round_size; else v_pass := v_words_total > 0 and (v_words_correct::numeric / v_words_total) >= 0.70; end if;
  end if;

  select v_score > coalesce(max(score), -1) into v_is_new_best from public.game_sessions where student_id = v_student_id and game_type = p_game_type;
  insert into public.game_sessions (student_id, game_type, score, words_correct, words_total, level) values (v_student_id, p_game_type, v_score, v_words_correct, v_words_total, v_round_level) returning id into v_session_id;

  -- Level-up: anagram levels on reaching the required word count (its
  -- vocabulary_ids holds only the seed, so the round-size comparison
  -- used by the other games does not apply). Other games unchanged.
  if p_game_type = 'anagram_builder' then
    if v_target > 0 and v_words_correct >= v_target and v_round_level is not null then
      update public.game_level_progress set current_level = v_round_level + 1, best_level_reached = greatest(best_level_reached, v_round_level + 1), updated_at = now() where student_id = v_student_id and game_type = p_game_type and current_level = v_round_level;
      v_leveled_up := found;
    end if;
  elsif v_round_size is not null and v_words_total = v_round_size and v_words_correct = v_words_total and v_round_level is not null then
    update public.game_level_progress set current_level = v_round_level + 1, best_level_reached = greatest(best_level_reached, v_round_level + 1), updated_at = now() where student_id = v_student_id and game_type = p_game_type and current_level = v_round_level;
    v_leveled_up := found;
  end if;

  -- Authoritative gaming points: one row per genuine completion, idempotent, no mirror to point_transactions
  if v_words_total > 0 and v_round_level is not null then
    v_tier := public.game_type_difficulty(p_game_type);
    v_is_perfect := v_words_total > 0 and v_words_correct = v_words_total;
    v_earned := v_words_correct * case p_game_type when 'picture_quiz' then 1 when 'vocabulary_quiz' then 1 when 'hangman' then 1 when 'picture_word' then 1 when 'anagram_builder' then 2 when 'word_match' then 2 when 'word_scramble' then 2 when 'word_builder' then 3 when 'sentence_scramble' then 3 when 'speed_challenge' then 4 when 'grammar_battle' then 5 else 1 end;
    insert into public.game_points_transactions (student_id, game_type, level, tier, points, is_perfect, game_session_id)
    values (v_student_id, p_game_type, v_round_level, v_tier, v_earned, v_is_perfect, v_session_id)
    on conflict (student_id, game_type, level) where not is_reversal do nothing
    returning points into v_points_awarded;
    -- v_points_awarded is null on conflict -> coalesce to 0 downstream (no increase)
  end if;

  select coalesce(sum(points), 0) into v_game_points_total from public.game_points_transactions where student_id = v_student_id and not is_reversal;
  select current_level into v_current_level from public.game_level_progress where student_id = v_student_id and game_type = p_game_type;
  perform public.bump_student_metric(v_student_id, v_metric_key, v_words_correct);
  perform public.evaluate_achievements(v_student_id);
  v_result := jsonb_build_object('session_id', v_session_id, 'score', v_score, 'words_correct', v_words_correct, 'words_total', v_words_total, 'is_new_best', coalesce(v_is_new_best, true), 'results', v_results, 'level', v_round_level, 'pass', coalesce(v_pass, false), 'leveled_up', v_leveled_up, 'current_level', v_current_level, 'game_points_awarded', coalesce(v_points_awarded, 0), 'game_points_is_perfect', v_is_perfect, 'game_points_total', v_game_points_total);
  update public.game_rounds set result_payload = v_result where id = p_round_id;
  return v_result;
end;
$function$;
revoke execute on function public.submit_game_round(uuid, text, jsonb) from public;
grant execute on function public.submit_game_round(uuid, text, jsonb) to authenticated;
