-- HOTFIX: submit_game_round() throws for every student.
--
-- ROOT CAUSE: live submit_game_round() selects students.level (a TEXT
-- column holding 'A1'/'A'/'B'/'C') into the INTEGER variable v_words_correct:
--
--     select id, level into v_student_id, v_words_correct
--       from public.students where profile_id = auth.uid();
--
-- Postgres casts the text level to integer -> "invalid input syntax for type
-- integer: "C"" etc. This fires at the very start of the function, so EVERY
-- round submission (Picture Quiz and all games) fails -> the final question
-- never submits, the result screen never appears, and no Game Points are
-- awarded. Introduced by the 20260827223000 "definitive" rewrite, which
-- retargeted a text 'level' read (previously into v_academy_level text) into
-- the integer v_words_correct and dropped the v_academy_level declaration.
--
-- FIX (smallest safe): select only students.id into v_student_id; the
-- 'level' column is unused (the very next line already resets
-- v_words_correct := 0). Nothing else is changed: grading, points, level
-- logic, RLS, grants are untouched.
--
-- 2026-08-28
-- DEFINITIVE: Apply the correct submit_game_round() to production.
-- This migration ensures picture_quiz is properly graded.
-- Safe to re-run: uses CREATE OR REPLACE, idempotent.
-- Created 2026-08-27 to guarantee the fix is live.

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
begin
  if p_game_type not in (
    'word_scramble', 'vocabulary_quiz', 'word_match', 'speed_challenge',
    'word_builder', 'sentence_scramble', 'word_detective',
    'grammar_battle', 'picture_quiz', 'hangman'
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
   returning game_type, level, array_length(vocabulary_ids, 1)
     into v_round_game_type, v_round_level, v_round_size;

  if not found then
    raise exception 'This round is invalid or has already been submitted' using errcode = 'P0001';
  end if;

  if v_round_game_type <> p_game_type then
    raise exception 'Round/game type mismatch';
  end if;

  if p_game_type in ('word_scramble', 'vocabulary_quiz', 'word_match', 'speed_challenge', 'word_builder', 'hangman') then
    for r in
      select
        (a->>'vocabulary_id')::uuid as vocabulary_id,
        a->>'answer' as answer,
        coalesce((a->>'used_hint')::boolean, false) as used_hint,
        coalesce((a->>'skipped')::boolean, false) as skipped,
        a->>'elapsed_ms' as elapsed_ms_str
      from jsonb_array_elements(p_answers) as a
    loop
      v_words_total := v_words_total + 1;
      v_correct := null;

      if r.skipped then
        v_correct := false;
      else
        select lower(trim(lv.english)) = lower(trim(coalesce(r.answer, '')))
          into v_correct
        from public.lesson_vocabulary lv
        where lv.id = r.vocabulary_id;
      end if;

      v_correct := coalesce(v_correct, false);

      if v_correct then
        v_words_correct := v_words_correct + 1;
        if p_game_type = 'speed_challenge' then
          v_elapsed_ms := greatest(0, least(coalesce(r.elapsed_ms_str::numeric, 10000), 10000));
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
        coalesce((a->>'skipped')::boolean, false) as skipped,
        coalesce((a->>'wrong_attempts')::int, 0) as wrong_attempts
      from jsonb_array_elements(p_answers) as a
    loop
      v_words_total := v_words_total + 1;
      v_payload := null;
      v_correct := null;

      select payload into v_payload
      from public.game_content_bank
      where id = r.content_id;

      if v_payload is null or r.skipped then
        v_correct := false;
      elsif p_game_type = 'sentence_scramble' then
        select array_agg(w) into v_submitted_words from jsonb_array_elements_text(coalesce(r.answer_words, '[]'::jsonb)) w;
        select array_agg(w) into v_canonical_words from jsonb_array_elements_text(v_payload->'words') w;
        v_correct := v_submitted_words = v_canonical_words;
      elsif p_game_type = 'word_detective' then
        v_correct := r.wrong_index = coalesce((v_payload->>'wrong_index')::int, -2)
          and lower(trim(coalesce(r.correction, ''))) = lower(trim(coalesce(v_payload->>'correction', '')));
      elsif p_game_type = 'grammar_battle' then
        v_correct := trim(coalesce(r.answer, '')) = ((v_payload->'options') ->> ((v_payload->>'correct_index')::int));
      elsif p_game_type = 'picture_quiz' then
        v_correct := lower(trim(coalesce(r.answer, ''))) = lower(trim(coalesce(v_payload->>'english', '')));
      end if;

      v_correct := coalesce(v_correct, false);
      if v_correct then
        v_words_correct := v_words_correct + 1;
        v_points := 10;
        v_score := v_score + v_points;
      end if;

      v_wrong_attempts := coalesce(r.wrong_attempts, 0);

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

  insert into public.game_sessions (student_id, game_type, score, words_correct, words_total, level)
  values (v_student_id, p_game_type, v_score, v_words_correct, v_words_total, v_round_level)
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
    v_tier := public.game_type_difficulty(p_game_type);
    v_is_perfect := v_words_total > 0 and v_words_correct = v_words_total;

    if p_game_type = 'word_match' and v_is_perfect then
      v_is_perfect := coalesce(v_wrong_attempts, 0) = 0;
    end if;

    insert into public.game_points_transactions (student_id, game_type, level, tier, points, is_perfect, game_session_id)
    values (
      v_student_id, p_game_type, v_round_level, v_tier,
      public.game_tier_bonus(v_tier) + case when v_is_perfect then 5 else 0 end,
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
$function$;

revoke execute on function public.submit_game_round(uuid, text, jsonb) from public;
grant execute on function public.submit_game_round(uuid, text, jsonb) to authenticated;
