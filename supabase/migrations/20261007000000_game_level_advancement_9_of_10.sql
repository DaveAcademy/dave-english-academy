-- Game level advancement 9/10 rule (content progression only).
-- Replaces the perfect-only gate from 20261005000000 with: completed full round
-- (total == round_size) at >=90% correct advances exactly one level. 10/10 and 9/10
-- advance; 8/10 and below stay. Gaming Points (incl. 70% pass), ranking, XP, Game Tier,
-- reversals, and historical data unchanged. Base body = 20261005000000 verbatim otherwise.

-- Gaming points best-performance policy (approved 2026).
-- Scope: future submissions only. No historical rows touched.
-- 1) word_detective RATE = 4 (hard tier 40/10; was falling to ELSE 1).
-- 2) grammar_battle v_pass = 70% accuracy like all other games (display/eligibility only; points never gated by v_pass; level-up gate unchanged).
-- 3) Best-performance per (student, game, level): greatest(existing, earned); weaker/equal replays add 0.
-- 4) game_points_awarded reports marginal delta (new_best - prior_best, floored at 0).
-- Concurrency: pg_advisory_xact_lock on (student, game, level) serializes prior-read + upsert inside this function transaction.
-- Reversals, ranking RPCs, round-token idempotency, best-performance points: unchanged.
-- Base body = 20261003000000_fix_gaming_points_authoritative.sql verbatim except the blocks noted above.

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
  v_prior_points integer := 0;
begin
  if p_game_type not in (
    'word_scramble', 'vocabulary_quiz', 'word_match', 'speed_challenge',
    'word_builder', 'sentence_scramble', 'word_detective',
    'grammar_battle', 'picture_quiz', 'hangman', 'picture_word'
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
    v_pass := v_words_total > 0 and (v_words_correct::numeric / v_words_total) >= 0.70;
  end if;

  select v_score > coalesce(max(score), -1) into v_is_new_best from public.game_sessions where student_id = v_student_id and game_type = p_game_type;
  insert into public.game_sessions (student_id, game_type, score, words_correct, words_total, level) values (v_student_id, p_game_type, v_score, v_words_correct, v_words_total, v_round_level) returning id into v_session_id;

  -- Level advancement: a completed full round at >=90% (9/10 on a 10-question round)
  -- advances exactly one game level. Scoring, points, pass, and reversals untouched.
  if v_round_size is not null and v_words_total = v_round_size and v_words_total > 0 and v_round_level is not null
     and (v_words_correct * 10 >= v_words_total * 9) then
    update public.game_level_progress set current_level = v_round_level + 1, best_level_reached = greatest(best_level_reached, v_round_level + 1), updated_at = now() where student_id = v_student_id and game_type = p_game_type and current_level = v_round_level;
    v_leveled_up := found;
  end if;

  -- Best-performance gaming points: one row per (student, game, level) holds the best earned score.
  -- Future submissions only; no historical rewrite. v_pass does not gate points.
  if v_words_total > 0 and v_round_level is not null then
    -- Serialize concurrent submissions for the same slot so prior-read + upsert cannot double-award delta.
    perform pg_advisory_xact_lock(hashtext(v_student_id::text || '|' || p_game_type || '|' || v_round_level::text));
    v_tier := public.game_type_difficulty(p_game_type);
    v_is_perfect := v_words_total > 0 and v_words_correct = v_words_total;
    v_earned := v_words_correct * case p_game_type when 'picture_quiz' then 1 when 'vocabulary_quiz' then 1 when 'hangman' then 1 when 'picture_word' then 1 when 'word_detective' then 4 when 'word_match' then 2 when 'word_scramble' then 2 when 'word_builder' then 3 when 'sentence_scramble' then 3 when 'speed_challenge' then 4 when 'grammar_battle' then 5 else 1 end;
    select coalesce(max(points), 0) into v_prior_points
      from public.game_points_transactions
     where student_id = v_student_id and game_type = p_game_type and level = v_round_level
       and not is_reversal;
    insert into public.game_points_transactions (student_id, game_type, level, tier, points, is_perfect, game_session_id)
    values (v_student_id, p_game_type, v_round_level, v_tier, v_earned, v_is_perfect, v_session_id)
    on conflict (student_id, game_type, level) where not is_reversal do update set
      points = greatest(game_points_transactions.points, excluded.points),
      is_perfect = game_points_transactions.is_perfect or excluded.is_perfect,
      game_session_id = case when excluded.points > game_points_transactions.points then excluded.game_session_id else game_points_transactions.game_session_id end
    returning points into v_points_awarded;
    -- Report marginal delta (newly earned by this submission), never negative.
    v_points_awarded := greatest(0, coalesce(v_points_awarded, 0) - coalesce(v_prior_points, 0));
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
