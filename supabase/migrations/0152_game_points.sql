-- Game Points, Phase 2 implementation. Design: docs/game-points-specification-2026-08-17.md
-- (all §18 decisions approved by Dave, 2026-08-17).
--
-- Formula: 10 base + tier bonus (very_easy=0/easy=2/medium=5/hard=8/very_hard=12)
-- + 5 perfect bonus, awarded ONLY when submit_game_round() produces a genuine
-- leveled_up=true event (never per-answer, never on failure, never on replay).
-- "Perfect" reuses the exact words_correct = words_total signal both existing
-- scoring branches already compute - no new definition invented.
--
-- Family V / Family C tier question (spec Q5), resolved by inspection:
-- game_level_to_tier(p_level) (0149) takes only a level number, not a game
-- type - it was already family-agnostic, just conventionally called only from
-- the 3 content-bank round-generators. Reused as-is for all 9 games here; no
-- separate Family V tier mapping needed or built.
--
-- Duplicate-award protection is two-layered: (1) the existing level-advance
-- UPDATE ... WHERE current_level = v_round_level in submit_game_round() is
-- already atomic/concurrency-safe - a second concurrent call finds 0 rows and
-- v_leveled_up = false; (2) unique(student_id, game_type, level) on the new
-- ledger table is a hard DB-level guarantee independent of that logic - a
-- given student+game+level can physically never appear twice.

create table public.game_points_transactions (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  game_type text not null,
  level integer not null,
  tier text not null,
  points integer not null,
  is_perfect boolean not null default false,
  game_session_id bigint references public.game_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, game_type, level)
);

comment on table public.game_points_transactions is
  'Immutable, append-only Game Points ledger (lifetime, no monthly reset). One row per genuine level-completion event only. unique(student_id, game_type, level) is the server-side duplicate-award guard. Lifetime total = sum(points), derived on read via get_student_game_points(), never a stored mutable column. Physically separate from point_transactions (Class Points) - never merge. See docs/game-points-specification-2026-08-17.md.';

alter table public.game_points_transactions enable row level security;

create policy game_points_transactions_admin_all on public.game_points_transactions for all
  using (is_admin()) with check (is_admin());

create policy game_points_transactions_teacher_select on public.game_points_transactions for select
  using (is_teacher());

create policy game_points_transactions_self_select on public.game_points_transactions for select
  using (is_own_student(student_id));

-- Tier -> point bonus. Small, named, reusable - not inlined as a bare CASE
-- in submit_game_round() so the approved formula (spec §6/§18) is auditable
-- in one place.
create or replace function public.game_tier_bonus(p_tier text)
returns integer
language sql
immutable
as $$
  select case p_tier
    when 'very_easy' then 0
    when 'easy' then 2
    when 'medium' then 5
    when 'hard' then 8
    when 'very_hard' then 12
    else 0
  end
$$;

-- Lifetime total, derived on read (no stored running total - matches
-- point_transactions' own no-drift pattern).
create or replace function public.get_student_game_points()
returns integer
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_total integer;
begin
  select id into v_student_id from public.students where profile_id = auth.uid();
  if v_student_id is null then
    raise exception 'No student record for the current user';
  end if;

  select coalesce(sum(points), 0) into v_total
  from public.game_points_transactions
  where student_id = v_student_id;

  return v_total;
end;
$$;

revoke execute on function public.get_student_game_points() from public;
grant execute on function public.get_student_game_points() to authenticated;

-- submit_game_round(): unchanged in every branch except the new Game Points
-- block inserted right after the existing level-advance logic, and three new
-- keys added to the returned jsonb. All grading/scoring/level-progression
-- behavior is byte-for-byte identical to 0150.
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
  v_tier text;
  v_is_perfect boolean := false;
  v_points_awarded integer;
  v_game_points_total integer;
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

  -- Game Points: awarded only on a genuine leveled_up event (spec §3/§18).
  -- "Perfect" reuses the same words_correct = words_total signal every game
  -- already computes above - no new performance definition invented.
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
