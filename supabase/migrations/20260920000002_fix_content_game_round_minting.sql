-- Fix: Restore round minting + correct contract shapes for the 3 content-game
-- round RPCs (grammar_battle, sentence_scramble, word_detective).
--
-- Why: 0207/20260904000000 rewrote these to `return query ... gen_random_uuid()
-- as round_id` per ROW, which (a) never inserts a `game_rounds` row, so
-- submit_game_round() rejects the round token ("This round is invalid or has
-- already been submitted"); (b) returns payload-derived `difficulty` that is
-- empty in the content bank rows, so the client can't group by tier; (c) drops
-- columns the frontend AND submit expect (`words`/`canonical_words` for
-- sentence_scramble, `category` for word_detective, `options text[]` for
-- grammar_battle); (d) get_sentence_scramble_round returns a jsonb value for a
-- column declared `english text` -> "structure of query does not match function
-- result type"; (e) get_grammar_battle_round ORDER BY compares a jsonb value to
-- unquoted text -> "invalid input syntax for type json". Grammar Battle logged
-- ORDER BY: `(payload->'difficulty') = 'medium'` (implicit text->jsonb cast of
-- 'medium' fails).
--
-- The live functions span conflicting signatures from the 0207/20260904000000
-- regression series, so CREATE OR REPLACE cannot change their return types
-- (42P13). Drop the no-arg overloads first, then recreate.

drop function if exists public.get_sentence_scramble_round();
drop function if exists public.get_word_detective_round();
drop function if exists public.get_grammar_battle_round();

-- Fix: restore the last-working 0150-vintage bodies (single round token minted
-- into game_rounds with student_id + level, difficulty taken from the
-- game_content_bank.difficulty COLUMN which is populated, correct return
-- shapes), keeping the 0207 curriculum gating
-- (min_lesson_number <= greatest(1, least(100, current_level * 5))).
-- Idempotent: CREATE OR REPLACE. No scoring/points/level logic changed.

-- =====================================================================
-- 1. get_sentence_scramble_round()
-- =====================================================================
create or replace function public.get_sentence_scramble_round()
returns table (round_id uuid, id uuid, words text[], canonical_words text[], type text, level integer)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  v_tier text;
  v_max_lesson integer;
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

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'sentence_scramble')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'sentence_scramble';

  v_max_lesson := greatest(1, least(100, (coalesce(v_level, 1) * 5)));
  v_tier := public.game_level_to_tier(coalesce(v_level, 1));

  v_stages := case v_tier
    when 'very_easy' then array['very_easy','easy','medium']
    when 'easy' then array['easy','very_easy','medium']
    when 'medium' then array['medium','easy','hard']
    when 'hard' then array['hard','medium','very_hard']
    else array['very_hard','hard','medium']
  end;

  select count(*) into v_count from public.game_content_bank
   where game_type = 'sentence_scramble' and difficulty = v_stages[1] and min_lesson_number <= v_max_lesson;
  if v_count >= 6 then
    v_stages := v_stages[1:1];
  else
    select count(*) into v_count from public.game_content_bank
     where game_type = 'sentence_scramble' and difficulty = any(v_stages[1:2]) and min_lesson_number <= v_max_lesson;
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
      and b.min_lesson_number <= v_max_lesson
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
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'sentence_scramble', v_ids, v_level);
  end if;
end;
$function$;
revoke execute on function public.get_sentence_scramble_round() from public;
grant execute on function public.get_sentence_scramble_round() to authenticated;

-- =====================================================================
-- 2. get_word_detective_round()
-- =====================================================================
create or replace function public.get_word_detective_round()
returns table (round_id uuid, id uuid, sentence text, category text, level integer)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  v_tier text;
  v_max_lesson integer;
  v_stages text[];
  v_count integer;
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'word_detective')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'word_detective';

  v_max_lesson := greatest(1, least(100, (coalesce(v_level, 1) * 5)));
  v_tier := public.game_level_to_tier(coalesce(v_level, 1));

  v_stages := case v_tier
    when 'very_easy' then array['very_easy','easy','medium']
    when 'easy' then array['easy','very_easy','medium']
    when 'medium' then array['medium','easy','hard']
    when 'hard' then array['hard','medium','very_hard']
    else array['very_hard','hard','medium']
  end;

  select count(*) into v_count from public.game_content_bank
   where game_type = 'word_detective' and difficulty = v_stages[1] and min_lesson_number <= v_max_lesson;
  if v_count >= 8 then
    v_stages := v_stages[1:1];
  else
    select count(*) into v_count from public.game_content_bank
     where game_type = 'word_detective' and difficulty = any(v_stages[1:2]) and min_lesson_number <= v_max_lesson;
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
      and b.min_lesson_number <= v_max_lesson
    order by random()
    limit 8
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    sentence := r.payload->>'sentence';
    category := r.bank_category;
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'word_detective', v_ids, v_level);
  end if;
end;
$function$;
revoke execute on function public.get_word_detective_round() from public;
grant execute on function public.get_word_detective_round() to authenticated;

-- =====================================================================
-- 3. get_grammar_battle_round()
-- =====================================================================
create or replace function public.get_grammar_battle_round()
returns table (round_id uuid, id uuid, question text, options text[], category text, difficulty text, level integer)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  v_tier text;
  v_max_lesson integer;
  v_limits int[];
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'grammar_battle')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'grammar_battle';

  v_max_lesson := greatest(1, least(100, (coalesce(v_level, 1) * 5)));
  v_tier := public.game_level_to_tier(coalesce(v_level, 1));

  v_limits := case v_tier
    when 'very_easy' then array[8,6,4,2,1]
    when 'easy' then array[5,7,5,2,1]
    when 'medium' then array[3,5,7,4,2]
    when 'hard' then array[1,3,5,7,5]
    else array[1,2,3,6,9]
  end;

  v_round_id := gen_random_uuid();

  for r in
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'very_easy' and b.min_lesson_number <= v_max_lesson order by random() limit v_limits[1])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'easy' and b.min_lesson_number <= v_max_lesson order by random() limit v_limits[2])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'medium' and b.min_lesson_number <= v_max_lesson order by random() limit v_limits[3])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'hard' and b.min_lesson_number <= v_max_lesson order by random() limit v_limits[4])
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'very_hard' and b.min_lesson_number <= v_max_lesson order by random() limit v_limits[5])
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    question := r.payload->>'question';
    options := array(select jsonb_array_elements_text(r.payload->'options'));
    category := r.payload->>'category';
    difficulty := r.difficulty;
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'grammar_battle', v_ids, v_level);
  end if;
end;
$function$;
revoke execute on function public.get_grammar_battle_round() from public;
grant execute on function public.get_grammar_battle_round() to authenticated;