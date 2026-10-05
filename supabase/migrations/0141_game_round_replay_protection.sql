-- Replay/duplicate-submission protection for submit_game_round.
--
-- Root cause: get_*_round() functions hand out word content with no
-- accompanying identifier, and submit_game_round(p_game_type, p_answers)
-- accepts any p_answers payload at any time, any number of times. Grading
-- itself is fully server-verified (0111/0112/0118/0119), so a duplicate
-- call cannot fabricate correctness - but nothing stops the exact same or
-- a freshly-fetched round from being submitted twice, each time inserting
-- a new game_sessions row, bumping game_word_history and the student's
-- achievement metric again, and re-running evaluate_achievements(). That
-- is the gap this migration closes, before any game reward is ever wired
-- to points/Ranking V2/achievements.
--
-- Duplicate invariant chosen: a "round" is now a concrete, server-minted,
-- single-use token (game_rounds.id), not an inferred fingerprint of the
-- submitted answers. The audit that scoped this task explicitly rejected
-- fragile keys derived from timestamps/scores/client-generated values;
-- there was no existing canonical round identifier to reuse, so the
-- smallest server-enforced invariant is: each get_*_round() call mints
-- exactly one row in game_rounds (student_id, game_type, vocabulary_ids
-- snapshot), and submit_game_round can consume that row exactly once.
-- A second submission with the same round_id, or any round_id that
-- doesn't belong to the caller / was already consumed, is rejected.

create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  student_id bigint not null references public.students(id) on delete cascade,
  game_type text not null,
  vocabulary_ids uuid[] not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists game_rounds_student_idx on public.game_rounds (student_id);

alter table public.game_rounds enable row level security;

-- Purely internal plumbing between get_*_round() and submit_game_round(),
-- both SECURITY DEFINER - no student/teacher UI ever reads this table
-- directly. Same "admin can see everything, nobody else has a policy"
-- shape as other game tables' write path.
drop policy if exists game_rounds_admin_all on public.game_rounds;
create policy game_rounds_admin_all on public.game_rounds for all
  using (is_admin()) with check (is_admin());

-- Each get_*_round() now mints one game_rounds row per call and returns
-- round_id alongside the round content (same value on every returned
-- row, since a round token identifies the whole round, not a single
-- word). Round content/selection logic (pick_game_words,
-- student_available_vocabulary) is unchanged - only the wrapper shape
-- changes, to attach a round_id.

drop function if exists public.get_word_scramble_round();

create or replace function public.get_word_scramble_round()
returns table (round_id uuid, id uuid, english text)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  v_round_id := gen_random_uuid();

  for r in select p.id, p.english from public.pick_game_words(true, 8) p
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    english := r.english;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids)
    values (v_round_id, v_student_id, 'word_scramble', v_ids);
  end if;
end;
$$;

revoke execute on function public.get_word_scramble_round() from public;
grant execute on function public.get_word_scramble_round() to authenticated;

drop function if exists public.get_vocabulary_quiz_round();

create or replace function public.get_vocabulary_quiz_round()
returns table (round_id uuid, id uuid, english text, options text[])
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  r record;
  v_distractors text[];
  v_options text[];
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  v_round_id := gen_random_uuid();

  for r in select p.id, p.english, p.uzbek from public.pick_game_words(false, 8) p
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
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    english := r.english;
    options := v_options;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids)
    values (v_round_id, v_student_id, 'vocabulary_quiz', v_ids);
  end if;
end;
$$;

revoke execute on function public.get_vocabulary_quiz_round() from public;
grant execute on function public.get_vocabulary_quiz_round() to authenticated;

drop function if exists public.get_word_match_round();

create or replace function public.get_word_match_round()
returns table (round_id uuid, id uuid, english text, uzbek text)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  v_round_id := gen_random_uuid();

  for r in select p.id, p.english, p.uzbek from public.pick_game_words(false, 6) p
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    english := r.english;
    uzbek := r.uzbek;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids)
    values (v_round_id, v_student_id, 'word_match', v_ids);
  end if;
end;
$$;

revoke execute on function public.get_word_match_round() from public;
grant execute on function public.get_word_match_round() to authenticated;

drop function if exists public.get_speed_challenge_round();

create or replace function public.get_speed_challenge_round()
returns table (round_id uuid, id uuid, english text, options text[])
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  r record;
  v_distractors text[];
  v_options text[];
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  v_round_id := gen_random_uuid();

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
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    english := r.english;
    options := v_options;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids)
    values (v_round_id, v_student_id, 'speed_challenge', v_ids);
  end if;
end;
$$;

revoke execute on function public.get_speed_challenge_round() from public;
grant execute on function public.get_speed_challenge_round() to authenticated;

-- submit_game_round now requires the round token minted above. The
-- consuming UPDATE is the actual enforcement point: it flips
-- consumed_at only when the row is still unconsumed and belongs to the
-- caller, and returns the row it updated. Postgres row-level locking on
-- UPDATE makes this safe under concurrency (see completion report) -
-- two simultaneous submissions for the same round_id serialize on that
-- row, and only the first to commit sees consumed_at is null.
--
-- Everything below the token check (grading, game_sessions insert,
-- game_word_history upsert, bump_student_metric, evaluate_achievements)
-- is unchanged from 0119 - this migration only adds the p_round_id
-- parameter and the guard in front of that existing body.
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

  -- Single-use consumption. Matches nothing (wrong id, wrong student,
  -- already consumed) => 0 rows updated => reject. This is the entire
  -- replay-protection mechanism; everything else in this function is
  -- unchanged grading logic that only runs once a round is successfully
  -- claimed here.
  update public.game_rounds
     set consumed_at = now()
   where id = p_round_id
     and student_id = v_student_id
     and consumed_at is null
  returning game_type into v_round_game_type;

  if not found then
    raise exception 'This round is invalid or has already been submitted' using errcode = 'P0001';
  end if;

  if v_round_game_type <> p_game_type then
    raise exception 'Round/game type mismatch';
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

revoke execute on function public.submit_game_round(uuid, text, jsonb) from public;
grant execute on function public.submit_game_round(uuid, text, jsonb) to authenticated;

-- Old two-argument signature is replaced, not overloaded - no caller
-- should be able to bypass the round check by calling the old shape.
drop function if exists public.submit_game_round(text, jsonb);
