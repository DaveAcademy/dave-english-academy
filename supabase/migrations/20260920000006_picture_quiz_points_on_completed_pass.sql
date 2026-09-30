-- PICTURE QUIZ POINTS FIX: 2026-09-08 (PICTURE-QUIZ-POINTS-FIX).
--
-- This file is a CREATE OR REPLACE of the 3-arg submit_game_round, built on
-- the 20260920000004 body (which equals the live production function exactly,
-- verified via pg_get_functiondef diff). It adds ONE behavior change and is
-- otherwise byte-identical to 20260920000004 for every other game type.
--
-- CHANGE: Academy points for picture_quiz are now awarded on ANY COMPLETED
-- PASS, not only on level-up.
--
--   Pre-fix (all games, from 0003/0004): game_points_transactions only fires
--   inside `if v_leveled_up`, and the advancement gate requires a FULL,
--   PERFECT round (v_words_total = v_round_size AND v_words_correct =
--   v_words_total). A picture_quiz round the student COMPLETED but did not
--   perfect (e.g. 8/10 = 80%, pass=true) therefore leveled_up=false and
--   awarded ZERO academy points - while the results screen showed the raw
--   score (80, or 100 on a replayed/perfect round) as a big unlabeled
--   number, reading as "points." Reported production bug.
--
--   Fix: for picture_quiz only, when the round was ANY completed pass (full
--   round submitted with >=70% correct, the universal pass rule), award
--   academy points exactly like a level-up would:
--       tier base (picture_quiz = very_easy = 5) + 5 if perfect  =>  5 or 10.
--   Dave's confirmed decision (2026-09-08): completed pass => 5, perfect =>
--   10 maximum, fail/incomplete => 0. Max 10 per completed game. The game
--   performance score (up to 100) is NOT the academy-points award.
--
--   Anti-farming is preserved by the existing unique index
--   uniq_game_points_student_game_level (student_id, game_type, level):
--   each level can be banked once, exactly as before. A later perfect round
--   of an already-banked level does NOT override the banked 5 (matches the
--   historical ledger, e.g. Mira picture_quiz level 3 = 5 non-perfect).
--
-- UNCHANGED for all 9 other games (word_scramble, vocabulary_quiz,
-- word_match, speed_challenge, word_builder, sentence_scramble,
-- word_detective, grammar_battle, hangman): points still fire ONLY on
-- leveled_up (full+perfect round), identical to 20260920000004. The elsif
-- branch below is guarded by p_game_type = 'picture_quiz' and a not-leveled
-- full, passing round, so it is a no-op for every other game.
--
-- Idempotent: CREATE OR REPLACE. Scoring per correct (10 pts) is unchanged.
-- Full+perfect advancement gate for all 10 games unchanged.

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
   v_round_ids uuid[];
   v_seen_ids uuid[] := '{}';
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
   returning game_type, level, vocabulary_ids
     into v_round_game_type, v_round_level, v_round_ids;

  if not found then
    raise exception 'This round is invalid or has already been submitted' using errcode = 'P0001';
  end if;

  v_round_size := coalesce(array_length(v_round_ids, 1), 0);

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
        a->>'elapsed_ms' as elapsed_ms_str,
        coalesce((a->>'wrong_attempts')::int, 0) as wrong_attempts
      from jsonb_array_elements(p_answers) as a
    loop
      v_words_total := v_words_total + 1;
      v_correct := null;

      if r.skipped then
        v_correct := false;
      elsif r.vocabulary_id is null then
        v_correct := false;
      elsif not (r.vocabulary_id = any(v_round_ids)) then
        v_correct := false;
      elsif r.vocabulary_id = any(v_seen_ids) then
        v_correct := false;
      else
        select lower(trim(coalesce(r.answer, ''))) = lower(trim(
                 case
                   when p_game_type in ('vocabulary_quiz', 'word_match', 'speed_challenge') then lv.uzbek
                   else lv.english
                 end
               ))
          into v_correct
        from public.lesson_vocabulary lv
        where lv.id = r.vocabulary_id;
        v_seen_ids := array_append(v_seen_ids, r.vocabulary_id);
      end if;

      v_correct := coalesce(v_correct, false);

      if v_correct then
        v_words_correct := v_words_correct + 1;
        v_wrong_attempts := greatest(v_wrong_attempts, coalesce(r.wrong_attempts, 0));
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
    v_seen_ids := '{}'::uuid[];
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

      if r.content_id is null or r.skipped then
        v_correct := false;
      elsif not (r.content_id = any(v_round_ids)) then
        v_correct := false;
      elsif r.content_id = any(v_seen_ids) then
        v_correct := false;
      else
        v_seen_ids := array_append(v_seen_ids, r.content_id);

        select payload into v_payload
        from public.game_content_bank
        where id = r.content_id;

        if v_payload is null then
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

  if v_round_size is not null and v_words_total = v_round_size and v_words_correct = v_words_total and v_round_level is not null then
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
  elsif p_game_type = 'picture_quiz'
        and v_round_level is not null
        and v_round_size is not null
        and v_words_total = v_round_size
        and v_pass then
    v_tier := public.game_type_difficulty(p_game_type);
    v_is_perfect := v_words_total > 0 and v_words_correct = v_words_total;

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
