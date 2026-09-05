-- Fix: Grammar Battle awarded full points for FAILED rounds.
--
-- Bug: submit_game_round() passed a grammar_battle round merely for
-- ANSWERING every question (v_words_total >= v_round_size), ignoring the
-- >=70% correctness threshold every other game enforces. Any completed
-- round leveled up and awarded 10 + tier bonus (22 pts at very_hard),
-- so rapid-fire failing rounds farmed unbounded points. Student 10
-- (Zack) submitted 542 rounds in 5 days, 541 of them failed, farming
-- 11,207 points.
--
-- Changes:
--   1. grammar_battle now requires >=70% correctness to pass/level/award,
--      identical to all other games.
--   2. Creates game_points_corrections audit table.
--   3. Corrects student 10: removes point transactions tied to failed
--      rounds and resets inflated level progress. Lesson points
--      (students.points / point_transactions) are NOT touched.

create table if not exists public.game_points_corrections (
  id bigserial primary key,
  student_id bigint not null,
  game_type text not null,
  removed_transaction_ids bigint[] not null,
  removed_points integer not null,
  reason text not null,
  performed_by text not null default 'system',
  created_at timestamptz not null default now()
);
CREATE OR REPLACE FUNCTION public.submit_game_round(p_round_id uuid, p_game_type text, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    when 'listening_challenge' then 'game_listening_challenge_correct'
    when 'sentence_scramble' then 'game_sentence_scramble_correct'
    when 'word_detective' then 'game_word_detective_correct'
    when 'grammar_battle' then 'game_grammar_battle_correct'
    when 'picture_quiz' then 'game_picture_quiz_correct'
    when 'hangman' then 'game_hangman_correct'
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

  if p_game_type in ('word_scramble', 'vocabulary_quiz', 'word_match', 'speed_challenge', 'word_builder', 'listening_challenge', 'hangman') then
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
          when 'hangman' then lower(trim(r.answer)) = lower(v.english)
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

    -- FIX (0193): grammar_battle previously passed on completion alone, letting
    -- failed rounds (<70%) level up and farm 22 pts each. Now requires 70%
    -- correctness like every other game.
    if p_game_type = 'grammar_battle' then
      v_pass := v_words_total > 0 and (v_words_correct::numeric / v_words_total) >= 0.70;
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
$function$;



-- ============ Correction: student 10 (Zack) ============
do $$
declare
  v_removed bigint[];
  v_points int;
begin
  with doomed as (
    delete from public.game_points_transactions g
    using public.game_sessions gs
    where gs.id = g.game_session_id
      and g.student_id = 10
      and g.game_type = 'grammar_battle'
      and gs.words_total > 0
      and (gs.words_correct::numeric / gs.words_total) < 0.70
    returning g.id, g.points
  )
  select array_agg(id order by id), coalesce(sum(points), 0)
    into v_removed, v_points
  from doomed;

  insert into public.game_points_corrections
    (student_id, game_type, removed_transaction_ids, removed_points, reason)
  values
    (10, 'grammar_battle', coalesce(v_removed, '{}'), coalesce(v_points, 0),
     'Removed awards for failed (<70%) grammar_battle rounds; bug fixed in submit_game_round (0193)');

  -- Reset inflated level progress: only 1 of 542 rounds legitimately passed,
  -- and that pass was itself only reachable through inflated levels.
  update public.game_level_progress
     set current_level = 1, best_level_reached = 1, updated_at = now()
   where student_id = 10 and game_type = 'grammar_battle';
end $$;