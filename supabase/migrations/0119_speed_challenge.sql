-- Speed Challenge: fourth Game Center game. Reuses the same curriculum-
-- scoped selection (student_available_vocabulary via pick_game_words)
-- and the same generic grading gateway (submit_game_round) as Word
-- Scramble/Vocabulary Quiz/Word Match - no second vocabulary-selection
-- system, no new tables.
--
-- Scoring/timing note (the one real tradeoff in this game, documented
-- rather than hidden): correctness is fully server-verified, exactly
-- like every other game - the client cannot fabricate a correct answer.
-- The "speed bonus" component is inherently client-timed (there is no
-- round trip per question - the whole point of this game is instant
-- next-question advancement, so the server cannot itself time each
-- answer). To keep this from being a real exploit, p_elapsed_ms is
-- clamped server-side to [0, 10000] before it can affect score at all,
-- and it only ever adds a small bonus (max 5) on TOP of an
-- already-server-verified correct answer - a student manipulating
-- elapsed_ms can gain at most 5 points per question, never fabricate
-- correctness or the base 10 points. This is a deliberately bounded,
-- low-value exploit surface rather than an unbounded one.

-- Round: 10 items, each with 4 shuffled options - same shape/generation
-- as get_vocabulary_quiz_round, just p_count=10 instead of 8 (both call
-- the same pick_game_words(); this is not a parallel selector).
create or replace function public.get_speed_challenge_round()
returns table (id uuid, english text, options text[])
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  r record;
  v_distractors text[];
  v_options text[];
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  for r in select p.id, p.english, p.uzbek from public.pick_game_words(false, 10) p
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
    id := r.id;
    english := r.english;
    options := v_options;
    return next;
  end loop;
end;
$$;

revoke execute on function public.get_speed_challenge_round() from public;
grant execute on function public.get_speed_challenge_round() to authenticated;

-- Adds the speed_challenge game type to the existing generic grader.
-- Correctness grading is identical to vocabulary_quiz/word_match
-- (submitted answer vs. lesson_vocabulary.uzbek, re-validated against
-- the caller's own curriculum scope). The only new piece is the clamped
-- speed bonus described above - everything else (student_id from
-- auth.uid(), game_word_history upsert, game_sessions insert,
-- bump_student_metric/evaluate_achievements) is the same code path
-- already used by every other game, unchanged.
create or replace function public.submit_game_round(p_game_type text, p_answers jsonb)
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
begin
  if p_game_type not in ('word_scramble', 'vocabulary_quiz', 'word_match', 'speed_challenge') then
    raise exception 'Unknown game_type: %', p_game_type;
  end if;
  v_metric_key := case p_game_type
    when 'word_scramble' then 'game_words_scrambled_correct'
    when 'vocabulary_quiz' then 'game_vocabulary_quiz_correct'
    when 'word_match' then 'game_word_match_correct'
    when 'speed_challenge' then 'game_speed_challenge_correct'
  end;

  select id into v_student_id from public.students where profile_id = auth.uid();
  if v_student_id is null then
    raise exception 'No student record for the current user';
  end if;

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
      end
    )
      into v_correct
    from public.student_available_vocabulary() v
    where v.id = r.vocabulary_id;

    v_correct := coalesce(v_correct, false);

    if v_correct then
      v_words_correct := v_words_correct + 1;
      if p_game_type = 'speed_challenge' then
        -- Clamp to [0, 10000]ms regardless of what the client reports -
        -- see header comment. Bonus is at most 5, only ever added to an
        -- already-verified-correct answer.
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

  select v_score > coalesce(max(score), -1)
    into v_is_new_best
  from public.game_sessions
  where student_id = v_student_id and game_type = p_game_type;

  insert into public.game_sessions (student_id, game_type, score, words_correct, words_total)
  values (v_student_id, p_game_type, v_score, v_words_correct, v_words_total)
  returning id into v_session_id;

  perform public.bump_student_metric(v_student_id, v_metric_key, v_words_correct);
  perform public.evaluate_achievements(v_student_id);

  return jsonb_build_object(
    'session_id', v_session_id,
    'score', v_score,
    'words_correct', v_words_correct,
    'words_total', v_words_total,
    'is_new_best', coalesce(v_is_new_best, true),
    'results', v_results
  );
end;
$$;

revoke execute on function public.submit_game_round(text, jsonb) from public;
grant execute on function public.submit_game_round(text, jsonb) to authenticated;
