-- FIX: Game Points may be silently suppressed on a genuine level-up event.
--
-- SYMPTOM (observed 2026-08-28, real students): "I passed, I advanced to the
-- next level, but I received 0 Game Points."
--
-- ROOT CAUSE: game_points_transactions carries a UNIQUE (student_id, game_type,
-- level) constraint, and submit_game_round() inserts the award with an
-- "ON CONFLICT (student_id, game_type, level) DO NOTHING" clause. Whenever a
-- student reaches a level they have already earned a transaction for - which
-- happens whenever game_level_progress.current_level is reset to or below an
-- already-completed level (an admin correction, a rolled-back migration that
-- rewrote current_level, or a deliberate restart) - the level-up fires
-- (v_leveled_up = true; the atomic UPDATE ... WHERE current_level = v_round_level
-- matches again) but the points insert is silently discarded by ON CONFLICT.
-- The student sees "level up" and "0 Game Points".
--
-- An earlier attempt (20260828120000, NOT applied to production) switched
-- ON CONFLICT to DO UPDATE. That was WRONG: it overwrote the previous
-- transaction's points with the replay value, corrupting the append-only
-- ledger (e.g. a 15-point transaction becoming 10). Production was reverted
-- to DO NOTHING and that migration was deleted.
--
-- THIS FIX (correct design):
--   * Points are an append-only ledger: one row per genuine level-up event,
--     never an overwrite.
--   * The UNIQUE(student_id, game_type, level) constraint is the problem, not
--     the guard. It is DROPPED. Duplicate-award protection comes from two
--     mechanisms that already exist and are stronger:
--       1. game_rounds.consumed_at single-use guard - the same round can never
--          be submitted twice (retry/double-submit is rejected before any
--          points logic runs), and
--       2. the atomic level-up UPDATE ... WHERE current_level = v_round_level -
--          only one concurrent submission can match, so concurrent different
--          rounds for the SAME level cannot both award.
--   * The points INSERT therefore uses a plain insert (no ON CONFLICT). Every
--     genuine v_leveled_up event now appends a transaction. The amount is
--     unchanged (game_tier_bonus(tier) + 5 if perfect) and computed fresh for
--     the event; historical rows are never rewritten.
--   * A NON-UNIQUE index replaces the dropped unique constraint so the
--     leaderboard/aggregation lookups over (student_id, game_type, level)
--     stay fast.
--
-- Behavior for normal students is unchanged: they advance monotonically, so
-- each level still produces exactly one transaction. Students whose progress
-- was reset now re-earn their award on re-advancement instead of receiving a
-- silent 0. Existing totals never decrease.
--
-- Grading, pass/fail, level progression, perfect calculation, tier mapping,
-- RLS, and the function's revoke/grant are byte-identical to the live
-- 20260828004000 version - only the failing INSERT semantics change.
--
-- 2026-08-29

-- Drop the uniqueness constraint that blocks legitimate re-advancement awards.
-- (Append-only ledger: multiple awards for the same (student, game, level) are
-- legitimate when a student genuinely re-advances after a reset, and are
-- already guarded against duplicates by game_rounds.consumed_at single-use plus
-- the atomic game_level_progress level-up update. See header.)
alter table public.game_points_transactions
  drop constraint if exists game_points_transactions_student_id_game_type_level_key;

-- Non-unique supporting index for (student_id, game_type, level) lookups used
-- by the points aggregates and leaderboards.
create index if not exists game_points_transactions_student_game_level_idx
  on public.game_points_transactions (student_id, game_type, level);

comment on table public.game_points_transactions is
  'Immutable, append-only Game Points ledger (lifetime, no monthly reset). One row per genuine level-up event. No unique (student_id, game_type, level) constraint - re-advancement after a reset appends a new row, and duplicate submissions are prevented by game_rounds.consumed_at single-use plus the atomic game_level_progress level-up update. Lifetime total = sum(points), derived on read via get_student_game_points(), never a stored mutable column. Physically separate from point_transactions (Class Points) - never merge. See docs/game-points-specification-2026-08-17.md.';

create or replace function public.submit_game_round(p_round_id uuid, p_game_type text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
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

  -- FIX BUG 2: select ONLY id; the level column is TEXT and would cast to integer
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
        -- FIX BUG 1: per-game-type comparison
        select case
          when p_game_type in ('vocabulary_quiz', 'word_match', 'speed_challenge')
            then lower(trim(lv.uzbek)) = lower(trim(coalesce(r.answer, '')))
          else lower(trim(lv.english)) = lower(trim(coalesce(r.answer, '')))
        end
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