-- Word Match: third Game Center game. Reuses every existing piece of the
-- Game System infrastructure - student_available_vocabulary() (curriculum
-- unlock scope), pick_game_words() (recency/length-soft-preference mix,
-- new/review/mastered rotation via game_word_history), and
-- submit_game_round() (server-side grading, game_sessions, achievement
-- hook) - no new tables, no parallel selection system.
--
-- Grading is identical in shape to vocabulary_quiz: the client submits
-- {vocabulary_id, answer} per pair (answer = the Uzbek text the student
-- tapped as that word's match), and the server re-checks it against
-- lesson_vocabulary.uzbek - never against which pair the client claims it
-- matched. word_match and vocabulary_quiz are therefore graded by the
-- same branch below, not duplicated logic.

-- Round: 6 pairs (id, english, uzbek) drawn from the same curriculum-
-- scoped, difficulty-aware pool every other game uses. The frontend
-- shuffles the Uzbek column for display; shuffling display order is not
-- a trust boundary (grading never depends on position), so no shuffling
-- needs to happen server-side here the way get_vocabulary_quiz_round's
-- 4-option arrays do.
create or replace function public.get_word_match_round()
returns table (id uuid, english text, uzbek text)
language sql
stable
security definer
set search_path = 'public'
as $$
  select id, english, uzbek from public.pick_game_words(false, 6);
$$;

revoke execute on function public.get_word_match_round() from public;
grant execute on function public.get_word_match_round() to authenticated;

-- Adds the word_match game type to the existing generic grader (0115).
-- Same correctness rule as vocabulary_quiz (submitted answer vs.
-- lesson_vocabulary.uzbek, re-validated against the caller's own
-- curriculum scope via student_available_vocabulary()); everything else
-- - student_id from auth.uid(), game_word_history upsert, game_sessions
-- insert, bump_student_metric/evaluate_achievements - is the same code
-- path already used by the other two games, unchanged.
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
  v_session_id bigint;
  v_is_new_best boolean;
  v_metric_key text;
begin
  if p_game_type not in ('word_scramble', 'vocabulary_quiz', 'word_match') then
    raise exception 'Unknown game_type: %', p_game_type;
  end if;
  v_metric_key := case p_game_type
    when 'word_scramble' then 'game_words_scrambled_correct'
    when 'vocabulary_quiz' then 'game_vocabulary_quiz_correct'
    when 'word_match' then 'game_word_match_correct'
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
      coalesce((a->>'skipped')::boolean, false) as skipped
    from jsonb_array_elements(p_answers) as a
  loop
    v_words_total := v_words_total + 1;

    select (not r.skipped) and (
      case p_game_type
        when 'word_scramble' then lower(trim(r.answer)) = lower(v.english)
        when 'vocabulary_quiz' then trim(r.answer) = v.uzbek
        when 'word_match' then trim(r.answer) = v.uzbek
      end
    )
      into v_correct
    from public.student_available_vocabulary() v
    where v.id = r.vocabulary_id;

    v_correct := coalesce(v_correct, false);

    if v_correct then
      v_words_correct := v_words_correct + 1;
      v_points := case when r.used_hint then 5 else 10 end;
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
