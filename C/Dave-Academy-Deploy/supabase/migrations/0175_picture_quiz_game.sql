-- Picture Quiz: the 10th game. Student sees an image, picks the matching
-- English word from 4 options. Reuses the existing Family C infrastructure
-- (game_content_bank, get_*_round widening pattern, submit_game_round) so
-- level progression, Game Points, and leaderboards all work for free -
-- see docs/GAMING-SYSTEM.md for the Family V/C split this follows.
--
-- Content: a curated 20-word starter set (concrete, easily-picturable
-- nouns only - abstract vocabulary can't be drawn), AI-generated flat
-- vector icon images (z_image model), no text baked into any image (would
-- leak the answer). image_url points at Higgsfield's CDN, not Supabase
-- Storage - a documented simplification (same spirit as 0009's shared-
-- bucket tradeoff): fastest path to ship, with the accepted risk that a
-- third-party CDN could someday change retention. Re-hosting in Supabase
-- Storage is a clean follow-up if that ever becomes a real problem, not
-- a blocker for v1.

alter table public.game_content_bank
  drop constraint game_content_bank_game_type_check;

alter table public.game_content_bank
  add constraint game_content_bank_game_type_check
  check (game_type in ('sentence_scramble', 'word_detective', 'grammar_battle', 'picture_quiz'));

insert into public.game_content_bank (game_type, difficulty, category, payload, min_lesson_number) values
  ('picture_quiz', 'very_easy', 'animal',  '{"english":"dog","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_122938_b4d2aa43-d960-4c9b-bad4-6631f130c076.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'animal',  '{"english":"cat","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123014_08d17224-de07-4e0f-a59c-612c87897637.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'object',  '{"english":"house","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123014_6416e8a3-5d08-4c7e-a83d-bcb3fc0a61cc.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'nature',  '{"english":"sun","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123014_38ecaf9b-29ed-4d6f-8f67-ea50184555cf.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'object',  '{"english":"book","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123040_4a1d5cf0-2c60-4dac-809b-9fbe1e3aad0d.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'object',  '{"english":"car","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123040_fd9ac809-34a8-4c13-831e-e3cb303032ca.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'nature',  '{"english":"apple","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123040_56e36504-3005-4cee-9e89-bbea05d20152.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'object',  '{"english":"ball","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123124_9d3469e9-25d0-407c-b62b-65d801ccac12.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'object',  '{"english":"chair","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123124_8a7b6db2-f701-4a66-9efa-0535a0ce8c05.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'nature',  '{"english":"tree","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123206_b9c7669c-ad54-47a6-b987-e6f702c900f7.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'animal',  '{"english":"elephant","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123234_1b80b436-ac2c-487e-91cc-3904623ab703.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object',  '{"english":"bicycle","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123206_f927dcc3-deae-47fb-9b5c-33e00c6f5b38.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object',  '{"english":"umbrella","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123233_58fbc0e4-c357-4577-81b1-508b8510bbd1.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object',  '{"english":"guitar","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123339_e3a0c79a-3d96-4b6e-987f-b1894b69aaad.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'nature',  '{"english":"banana","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123313_429597d3-8626-4f98-a0fe-0bdc1ee722f4.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'animal',  '{"english":"butterfly","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123402_bc1edb4b-c114-4fc6-965a-5a91c5f8b328.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object',  '{"english":"boat","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123432_62808de6-4d5e-4acb-bc21-1ef08c88228d.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object',  '{"english":"camera","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123503_557f8c67-6773-4b77-82d0-68d16f638824.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'animal',  '{"english":"spider","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123530_27e4b072-4917-4e4e-96c4-c0b06dd3ba35.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object',  '{"english":"ladder","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_123608_bc1ff085-6008-4764-86f0-34a253dfeb6e.png"}'::jsonb, 1);

-- ---------- get_picture_quiz_round() ----------
-- Same tier-widening shape as get_sentence_scramble_round (0150): try the
-- level's own tier, widen to 2 tiers, then to everything, until there's
-- enough content for a round. Round size 8 (matches Vocabulary Quiz/
-- Listening Challenge). Options are 4 English words - correct + 3 random
-- distractors pulled from anywhere in the bank (20 items is plenty of
-- distractor variety regardless of tier).
create or replace function public.get_picture_quiz_round()
returns table (round_id uuid, id uuid, image_url text, options text[], level integer)
language plpgsql
security definer
set search_path = 'public'
as $$
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

  v_tier := public.game_level_to_tier(v_level);

  v_stages := case v_tier
    when 'very_easy' then array['very_easy','easy','medium']
    when 'easy' then array['easy','very_easy','medium']
    when 'medium' then array['medium','easy','hard']
    when 'hard' then array['hard','medium','very_hard']
    else array['very_hard','hard','medium']
  end;

  select count(*) into v_count from public.game_content_bank
   where game_type = 'picture_quiz' and difficulty = v_stages[1];
  if v_count >= 8 then
    v_stages := v_stages[1:1];
  else
    select count(*) into v_count from public.game_content_bank
     where game_type = 'picture_quiz' and difficulty = any(v_stages[1:2]);
    if v_count >= 8 then
      v_stages := v_stages[1:2];
    else
      v_stages := array['very_easy','easy','medium','hard','very_hard'];
    end if;
  end if;

  v_round_id := gen_random_uuid();

  for r in
    select b.id, b.payload
    from public.game_content_bank b
    where b.game_type = 'picture_quiz' and b.difficulty = any(v_stages)
    order by random()
    limit 8
  loop
    select array_agg(w) into v_distractors from (
      select b2.payload->>'english' as w
      from public.game_content_bank b2
      where b2.game_type = 'picture_quiz' and b2.id <> r.id
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
$$;

revoke execute on function public.get_picture_quiz_round() from public;
grant execute on function public.get_picture_quiz_round() to authenticated;

-- ---------- extend submit_game_round ----------
-- Byte-for-byte identical to 0155 except: 'picture_quiz' added to the
-- allowlist and metric-key map, and one new branch inserted between the
-- vocabulary-graded branch and the existing curated-content branch. Picture
-- Quiz grades like the vocabulary games (simple MCQ, >=70% pass) but its
-- canonical answer comes from game_content_bank.payload->>'english' since
-- it isn't vocabulary-pool content - doesn't fit either existing branch
-- cleanly, so it gets its own.
create or replace function public.submit_game_round(p_round_id uuid, p_game_type text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_academy_level text;
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
begin
  if p_game_type not in (
    'word_scramble', 'vocabulary_quiz', 'word_match', 'speed_challenge',
    'word_builder', 'listening_challenge', 'sentence_scramble', 'word_detective',
    'grammar_battle', 'picture_quiz'
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
    when 'picture_quiz' then 'game_picture_quiz_correct'
  end;

  select id, level into v_student_id, v_academy_level from public.students where profile_id = auth.uid();
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
  elsif p_game_type = 'picture_quiz' then
    for r in
      select
        (a->>'content_id')::uuid as content_id,
        a->>'answer' as answer,
        coalesce((a->>'skipped')::boolean, false) as skipped
      from jsonb_array_elements(p_answers) as a
    loop
      v_words_total := v_words_total + 1;
      v_payload := (select payload from public.game_content_bank where id = r.content_id and game_type = 'picture_quiz');
      v_correct := v_payload is not null and not r.skipped
        and lower(trim(coalesce(r.answer, ''))) = lower(trim(coalesce(v_payload->>'english', '')));
      v_correct := coalesce(v_correct, false);

      if v_correct then
        v_words_correct := v_words_correct + 1;
        v_points := 10;
        v_score := v_score + v_points;
      end if;

      v_results := v_results || jsonb_build_object('content_id', r.content_id, 'correct', v_correct);
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
      v_pass := v_round_size is not null and v_words_total >= v_round_size;
    else
      v_pass := v_words_total > 0 and (v_words_correct::numeric / v_words_total) >= 0.70;
    end if;
  end if;

  select v_score > coalesce(max(score), -1)
    into v_is_new_best
  from public.game_sessions
  where student_id = v_student_id and game_type = p_game_type;

  insert into public.game_sessions (student_id, game_type, score, words_correct, words_total, level, academy_level)
  values (v_student_id, p_game_type, v_score, v_words_correct, v_words_total, v_round_level, v_academy_level)
  returning id into v_session_id;

  if v_pass and v_round_level is not null then
    update public.game_level_progress
       set current_level = v_round_level + 1,
           best_level_reached = greatest(best_level_reached, v_round_level + 1),
           updated_at = now()
     where student_id = v_student_id and game_type = p_game_type
       and current_level = v_round_level;
    v_leveled_up := found;
  end if;

  if v_leveled_up then
    v_tier := public.game_level_to_tier(v_round_level);
    v_is_perfect := v_words_total > 0 and v_words_correct = v_words_total;

    insert into public.game_points_transactions (student_id, game_type, level, tier, points, is_perfect, game_session_id)
    values (
      v_student_id, p_game_type, v_round_level, v_tier,
      10 + public.game_tier_bonus(v_tier) + case when v_is_perfect then 5 else 0 end,
      v_is_perfect, v_session_id
    )
    on conflict (student_id, game_type, level) do nothing
    returning points into v_points_awarded;
  end if;

  select coalesce(sum(points), 0) into v_game_points_total
  from public.game_points_transactions
  where student_id = v_student_id;

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
    'current_level', v_current_level,
    'game_points_awarded', coalesce(v_points_awarded, 0),
    'game_points_is_perfect', v_is_perfect,
    'game_points_total', v_game_points_total
  );
end;
$$;

revoke execute on function public.submit_game_round(uuid, text, jsonb) from public;
grant execute on function public.submit_game_round(uuid, text, jsonb) to authenticated;
