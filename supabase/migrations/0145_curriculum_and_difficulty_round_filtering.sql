-- Minimal round-selection wiring for the grounded content 0144 shipped.
-- Without this, 0144's min_lesson_number/five-stage columns exist but
-- nothing reads them - the round generators would still hand out any
-- row for the game_type regardless of what the student has unlocked or
-- how they're performing. That's the exact gap flagged before agreeing
-- to fold this in rather than commit 0144 alone.
--
-- Scope, deliberately narrow: only the three game_content_bank-driven
-- games (sentence_scramble, word_detective, grammar_battle) touched by
-- 0144 are modified here. The six vocabulary-driven games are untouched
-- - their content/selection was already fine, not part of this content
-- session at all.
--
-- Reuses, not reinvents:
--   - student_unlocked_lesson_number() is the exact same unlock
--     predicate as student_available_vocabulary()'s unlocked_lessons CTE
--     (0112), just aggregated to a single MAX(lesson_number) instead of
--     joined to vocabulary rows. Same rule, same source of truth
--     (curriculum_progress + student_lesson_progress), no new table.
--   - adaptive_difficulty_tier() is the function already built and
--     validated in 0143 (Phase 1 of this same session's earlier work,
--     tested against 6 controlled scenarios) - this migration is what
--     finally calls it from a round generator, which was always the
--     intended Phase 2 wiring step before this session's content-audit
--     detour took over.

create or replace function public.student_unlocked_lesson_number()
returns integer
language sql
stable
security definer
set search_path = 'public'
as $$
  with me as (
    select s.id as student_id, s.level from public.students s where s.profile_id = auth.uid()
  ),
  cp as (
    select * from public.curriculum_progress cp, me where cp.level = me.level
  ),
  unlocked_lessons as (
    select cl.lesson_number
    from public.lessons l
    join public.curriculum_lessons cl on cl.id = l.curriculum_lesson_id
    join me on l.level = me.level
    left join cp on true
    where cl.lesson_number <= coalesce(cp.max_available_lesson, 100000)
      and (
        cl.lesson_number <= 1
        or cl.lesson_number <= coalesce(cp.current_lesson_number, 0)
        or exists (
          select 1
          from public.lessons l2
          join public.curriculum_lessons cl2 on cl2.id = l2.curriculum_lesson_id
          join public.student_lesson_progress slp
            on slp.lesson_id = l2.id and slp.student_id = me.student_id and slp.status = 'completed'
          where l2.level = l.level and cl2.lesson_number = cl.lesson_number - 1
        )
      )
  )
  select coalesce(max(lesson_number), 0) from unlocked_lessons;
$$;

revoke execute on function public.student_unlocked_lesson_number() from public;
grant execute on function public.student_unlocked_lesson_number() to authenticated;

-- Sentence Scramble: single-stage round (unchanged round size, 6 items).
-- Stage comes from adaptive_difficulty_tier(); if the exact stage lacks
-- enough unlocked content, broaden to the next-nearest stage(s), then to
-- any unlocked stage as a last resort - never an empty round just
-- because a tier is thin for that student's unlocked lesson range.
create or replace function public.get_sentence_scramble_round()
returns table (round_id uuid, id uuid, words text[], canonical_words text[], type text)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_unlocked integer;
  v_tier text;
  v_stages text[];
  v_count integer;
  r record;
  v_shuffled text[];
  v_canonical text[];
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  v_unlocked := public.student_unlocked_lesson_number();
  v_tier := public.adaptive_difficulty_tier(v_student_id, 'sentence_scramble');

  v_stages := case v_tier
    when 'very_easy' then array['very_easy','easy','medium']
    when 'easy' then array['easy','very_easy','medium']
    when 'medium' then array['medium','easy','hard']
    when 'hard' then array['hard','medium','very_hard']
    else array['very_hard','hard','medium']
  end;

  select count(*) into v_count from public.game_content_bank
   where game_type = 'sentence_scramble' and difficulty = v_stages[1] and min_lesson_number <= v_unlocked;
  if v_count >= 6 then
    v_stages := v_stages[1:1];
  else
    select count(*) into v_count from public.game_content_bank
     where game_type = 'sentence_scramble' and difficulty = any(v_stages[1:2]) and min_lesson_number <= v_unlocked;
    if v_count >= 6 then
      v_stages := v_stages[1:2];
    else
      v_stages := array['very_easy','easy','medium','hard','very_hard'];
    end if;
  end if;

  v_round_id := gen_random_uuid();

  for r in
    select b.id, b.payload
    from public.game_content_bank b
    where b.game_type = 'sentence_scramble'
      and b.difficulty = any(v_stages)
      and b.min_lesson_number <= v_unlocked
    order by random()
    limit 6
  loop
    select array_agg(w order by random())
      into v_shuffled
    from jsonb_array_elements_text(r.payload->'words') w;

    select array_agg(w)
      into v_canonical
    from jsonb_array_elements_text(r.payload->'words') w;

    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    words := v_shuffled;
    canonical_words := v_canonical;
    type := r.payload->>'type';
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids)
    values (v_round_id, v_student_id, 'sentence_scramble', v_ids);
  end if;
end;
$$;

revoke execute on function public.get_sentence_scramble_round() from public;
grant execute on function public.get_sentence_scramble_round() to authenticated;

-- Word Detective: identical filtering pattern, round size 8.
create or replace function public.get_word_detective_round()
returns table (round_id uuid, id uuid, sentence text, category text)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_unlocked integer;
  v_tier text;
  v_stages text[];
  v_count integer;
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  v_unlocked := public.student_unlocked_lesson_number();
  v_tier := public.adaptive_difficulty_tier(v_student_id, 'word_detective');

  v_stages := case v_tier
    when 'very_easy' then array['very_easy','easy','medium']
    when 'easy' then array['easy','very_easy','medium']
    when 'medium' then array['medium','easy','hard']
    when 'hard' then array['hard','medium','very_hard']
    else array['very_hard','hard','medium']
  end;

  select count(*) into v_count from public.game_content_bank
   where game_type = 'word_detective' and difficulty = v_stages[1] and min_lesson_number <= v_unlocked;
  if v_count >= 8 then
    v_stages := v_stages[1:1];
  else
    select count(*) into v_count from public.game_content_bank
     where game_type = 'word_detective' and difficulty = any(v_stages[1:2]) and min_lesson_number <= v_unlocked;
    if v_count >= 8 then
      v_stages := v_stages[1:2];
    else
      v_stages := array['very_easy','easy','medium','hard','very_hard'];
    end if;
  end if;

  v_round_id := gen_random_uuid();

  for r in
    select b.id, b.payload, b.category as bank_category
    from public.game_content_bank b
    where b.game_type = 'word_detective'
      and b.difficulty = any(v_stages)
      and b.min_lesson_number <= v_unlocked
    order by random()
    limit 8
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    sentence := r.payload->>'sentence';
    category := r.bank_category;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids)
    values (v_round_id, v_student_id, 'word_detective', v_ids);
  end if;
end;
$$;

revoke execute on function public.get_word_detective_round() from public;
grant execute on function public.get_word_detective_round() to authenticated;

-- Grammar Battle: preserves its existing mixed-tier-pool design (this
-- game is lives-based and progresses through difficulty WITHIN one
-- round client-side, not just across rounds like the other two - see
-- 0142's original comment on this). A hard single-stage filter would
-- break that existing behavior, so instead the per-tier pool sizes are
-- biased toward the adaptive tier while every row, from every tier
-- mixed into the round, still respects min_lesson_number <= unlocked.
create or replace function public.get_grammar_battle_round()
returns table (round_id uuid, id uuid, question text, options text[], category text, difficulty text)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_unlocked integer;
  v_tier text;
  v_limits int[];
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  v_unlocked := public.student_unlocked_lesson_number();
  v_tier := public.adaptive_difficulty_tier(v_student_id, 'grammar_battle');

  -- [very_easy, easy, medium, hard, very_hard] pool sizes, biased toward
  -- v_tier while keeping every stage represented (a strong student still
  -- meets some easier questions early in a lives-based round, and vice
  -- versa) - same spirit as the original fixed 10/10/8 mix, now shifted.
  v_limits := case v_tier
    when 'very_easy' then array[8,6,4,2,1]
    when 'easy' then array[5,7,5,2,1]
    when 'medium' then array[3,5,7,4,2]
    when 'hard' then array[1,3,5,7,5]
    else array[1,2,3,6,9]
  end;

  v_round_id := gen_random_uuid();

  for r in
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'very_easy' and b.min_lesson_number <= v_unlocked order by random() limit v_limits[1])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'easy' and b.min_lesson_number <= v_unlocked order by random() limit v_limits[2])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'medium' and b.min_lesson_number <= v_unlocked order by random() limit v_limits[3])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'hard' and b.min_lesson_number <= v_unlocked order by random() limit v_limits[4])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'very_hard' and b.min_lesson_number <= v_unlocked order by random() limit v_limits[5])
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    question := r.payload->>'question';
    options := array(select jsonb_array_elements_text(r.payload->'options'));
    category := r.payload->>'category';
    difficulty := r.difficulty;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids)
    values (v_round_id, v_student_id, 'grammar_battle', v_ids);
  end if;
end;
$$;

revoke execute on function public.get_grammar_battle_round() from public;
grant execute on function public.get_grammar_battle_round() to authenticated;
