-- Gaming Diversity Phase 1 (content selection only).
-- Scope: sentence_scramble, grammar_battle, picture_quiz, picture_word round generators.
-- Replaces pure ORDER BY RANDOM() with exposure-aware ordering sourced from existing
-- game_rounds rows (no new tables, no history rewrite). Scoring, points, ranking, XP,
-- Game Tier, level-up, lesson/level filters, round sizes, and return shapes unchanged.
-- Vocabulary pickers (pick_game_words / pick_word_builder_words) untouched (Phase 2).
-- Word Detective untouched (not in current game inventory scope).

-- 1. Shared exposure helper: per (student, game) content history from game_rounds.
--    recent = appeared in either of the student's previous 2 rounds of that game.
--    History is never reset by level/tier changes (no level key by design).
create or replace function public.game_content_exposure(p_student_id bigint, p_game_type text)
returns table(content_id uuid, times_seen bigint, last_seen timestamptz, recent boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  with rounds as (
    select r.vocabulary_ids, r.created_at,
           row_number() over (order by r.created_at desc, r.id desc) as rn
    from public.game_rounds r
    where r.student_id = p_student_id and r.game_type = p_game_type
  ),
  items as (
    select unnest(r.vocabulary_ids) as cid, r.created_at, r.rn from rounds r
  )
  select i.cid, count(*)::bigint, max(i.created_at),
         bool_or(i.rn <= 2)
  from items i
  group by i.cid;
$$;
revoke execute on function public.game_content_exposure(bigint, text) from public;
grant execute on function public.game_content_exposure(bigint, text) to authenticated, anon, service_role;

-- 2. Targeted index for the per-generation exposure lookup (existing index covers student_id only).
create index if not exists game_rounds_student_game_created_idx
  on public.game_rounds (student_id, game_type, created_at desc);

-- 3. Sentence Scramble: same eligibility/stages, exposure-aware order, recent-2 exclusion when fillable.
create or replace function public.get_sentence_scramble_round()
 returns table(round_id uuid, id uuid, words text[], canonical_words text[], type text, level integer)
 language plpgsql
 security definer
 set search_path to 'public'
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
  if v_count >= 10 then
    v_stages := v_stages[1:1];
  else
    select count(*) into v_count from public.game_content_bank
     where game_type = 'sentence_scramble' and difficulty = any(v_stages[1:2]) and min_lesson_number <= v_max_lesson;
    if v_count >= 10 then
      v_stages := v_stages[1:2];
    else
      v_stages := array['very_easy','easy','medium','hard','very_hard'];
    end if;
  end if;

  v_round_id := gen_random_uuid();

  for r in
    with eligible as (
      select b.id, b.payload
      from public.game_content_bank b
      where b.game_type = 'sentence_scramble'
        and b.difficulty = any(v_stages)
        and b.min_lesson_number <= v_max_lesson
    ),
    pool as (
      select e.id, e.payload,
             coalesce(x.recent, false) as recent,
             x.last_seen, coalesce(x.times_seen, 0) as times_seen
      from eligible e
      left join public.game_content_exposure(v_student_id, 'sentence_scramble') x
        on x.content_id = e.id
    )
    select p.id, p.payload from pool p
    where (select count(*) from pool where not recent) < 10 or (not p.recent)
    order by p.last_seen nulls first, p.times_seen, random()
    limit 10
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

-- 4. Picture Quiz: same stages/valid-filter/distractors, exposure-aware order, recent-2 exclusion when fillable.
create or replace function public.get_picture_quiz_round()
 returns table(round_id uuid, id uuid, image_url text, options text[], level integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  v_tier text;
  v_stages text[];
  v_count integer;
  r record;
  v_distractors text[];
  v_options text[];
  v_unlocked integer;
  v_valid_filter text := ' and (b.payload->>''image_url'' not like ''%supabase.co%'' or (b.payload->>''image_url'' like ''%supabase.co%'' and exists (select 1 from storage.objects o where o.bucket_id = ''game-content'' and o.name = split_part(b.payload->>''image_url'', ''/game-content/'', 2) and (o.metadata->>''size'')::int > 500)))';
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'picture_quiz')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'picture_quiz';

  v_unlocked := public.student_unlocked_lesson_number();
  v_tier := public.game_level_to_tier(v_level);

  v_stages := case v_tier
    when 'very_easy' then array['very_easy','easy','medium']
    when 'easy' then array['easy','very_easy','medium']
    when 'medium' then array['medium','easy','hard']
    when 'hard' then array['hard','medium','very_hard']
    else array['very_hard','hard','medium']
  end;

  -- Helper to count valid (non-placeholder) items
  execute 'select count(*) from public.game_content_bank b
   where b.game_type = ''picture_quiz''
     and b.difficulty = $1
     and b.min_lesson_number <= $2
     ' || v_valid_filter
  into v_count
  using v_stages[1], v_unlocked;
  if v_count >= 10 then
    v_stages := v_stages[1:1];
  else
    execute 'select count(*) from public.game_content_bank b
     where b.game_type = ''picture_quiz''
       and b.difficulty = any($1)
       and b.min_lesson_number <= $2
       ' || v_valid_filter
    into v_count
    using v_stages[1:2], v_unlocked;
    if v_count >= 10 then
      v_stages := v_stages[1:2];
    else
      v_stages := array['very_easy','easy','medium','hard','very_hard'];
    end if;
  end if;

  v_round_id := gen_random_uuid();

  for r in
    execute 'with eligible as (
    select b.id, b.payload
    from public.game_content_bank b
    where b.game_type = ''picture_quiz''
      and b.difficulty = any($1)
      and b.min_lesson_number <= $2
      ' || v_valid_filter || '
    ),
    pool as (
      select e.id, e.payload,
             coalesce(x.recent, false) as recent,
             x.last_seen, coalesce(x.times_seen, 0) as times_seen
      from eligible e
      left join public.game_content_exposure($3, ''picture_quiz'') x
        on x.content_id = e.id
    )
    select p.id, p.payload from pool p
    where (select count(*) from pool where not recent) < 10 or (not p.recent)
    order by p.last_seen nulls first, p.times_seen, random()
    limit 10'
  using v_stages, v_unlocked, v_student_id
  loop
    select array_agg(u) into v_distractors from (
      select v.payload->>'english' as u
      from public.game_content_bank v
      where v.game_type = 'picture_quiz'
        and v.payload->>'english' is distinct from r.payload->>'english'
      order by random()
      limit 3
    ) d;
    v_options := array_append(coalesce(v_distractors, '{}'), r.payload->>'english');
    select array_agg(o order by random()) into v_options from unnest(v_options) o;
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    image_url := r.payload->>'image_url';
    options := v_options;
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'picture_quiz', v_ids, v_level);
  end if;
end;
$function$;

-- 5. Picture Word: same stages/valid-filter, exposure-aware order keyed to picture_word history.
create or replace function public.get_picture_word_round()
 returns table(round_id uuid, id uuid, image_url text, level integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  v_tier text;
  v_stages text[];
  v_count integer;
  r record;
  v_unlocked integer;
  v_valid_filter text := ' and (b.payload->>''image_url'' not like ''%supabase.co%'' or (b.payload->>''image_url'' like ''%supabase.co%'' and exists (select 1 from storage.objects o where o.bucket_id = ''game-content'' and o.name = split_part(b.payload->>''image_url'', ''/game-content/'', 2) and (o.metadata->>''size'')::int > 500)))';
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  insert into public.game_level_progress (student_id, game_type)
  values (v_student_id, 'picture_word')
  on conflict (student_id, game_type) do nothing;

  select current_level into v_level from public.game_level_progress
   where student_id = v_student_id and game_type = 'picture_word';

  v_unlocked := public.student_unlocked_lesson_number();
  v_tier := public.game_level_to_tier(v_level);

  v_stages := case v_tier
    when 'very_easy' then array['very_easy','easy','medium']
    when 'easy' then array['easy','very_easy','medium']
    when 'medium' then array['medium','easy','hard']
    when 'hard' then array['hard','medium','very_hard']
    else array['very_hard','hard','medium']
  end;

  -- Helper to count valid picture-bank items, widening stages until we have
  -- at least 10 distinct, so a round is never short.
  execute 'select count(*) from public.game_content_bank b
   where b.game_type = ''picture_quiz''
     and b.difficulty = $1
     and b.min_lesson_number <= $2
     ' || v_valid_filter
  into v_count
  using v_stages[1], v_unlocked;
  if v_count >= 10 then
    v_stages := v_stages[1:1];
  else
    execute 'select count(*) from public.game_content_bank b
     where b.game_type = ''picture_quiz''
       and b.difficulty = any($1)
       and b.min_lesson_number <= $2
       ' || v_valid_filter
    into v_count
    using v_stages[1:2], v_unlocked;
    if v_count >= 10 then
      v_stages := v_stages[1:2];
    else
      v_stages := array['very_easy','easy','medium','hard','very_hard'];
    end if;
  end if;

  v_round_id := gen_random_uuid();

  for r in
    execute 'with eligible as (
    select b.id, b.payload
    from public.game_content_bank b
    where b.game_type = ''picture_quiz''
      and b.difficulty = any($1)
      and b.min_lesson_number <= $2
      ' || v_valid_filter || '
    ),
    pool as (
      select e.id, e.payload,
             coalesce(x.recent, false) as recent,
             x.last_seen, coalesce(x.times_seen, 0) as times_seen
      from eligible e
      left join public.game_content_exposure($3, ''picture_word'') x
        on x.content_id = e.id
    )
    select p.id, p.payload from pool p
    where (select count(*) from pool where not recent) < 10 or (not p.recent)
    order by p.last_seen nulls first, p.times_seen, random()
    limit 10'
  using v_stages, v_unlocked, v_student_id
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    image_url := r.payload->>'image_url';
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'picture_word', v_ids, v_level);
  end if;
end;
$function$;

-- 6. Grammar Battle: same tier quotas/lesson gate, exposure-ordered over-collect,
--    max 3 per payload category per round, recent-2 exclusion when fillable.
create or replace function public.get_grammar_battle_round()
 returns table(round_id uuid, id uuid, question text, options text[], category text, difficulty text, level integer)
 language plpgsql
 security definer
 set search_path to 'public'
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
  -- diversity collect/emit workspace
  v_cid uuid[] := '{}';
  v_cpay jsonb[] := '{}';
  v_cdiff text[] := '{}';
  v_ccat text[] := '{}';
  v_seg int[] := '{}';        -- segment index (1..5) per collected item
  v_seg_quota int[] := '{}';  -- per-segment emit target
  v_leg_need int[] := '{0,0,0,0,0}';
  v_recent uuid[] := '{}';
  v_cats text[] := '{}';
  v_counts int[] := '{}';
  v_skipped boolean[] := '{}';
  v_total_target integer := 0;
  v_total_need integer;
  v_i integer; v_j integer; v_leg integer; v_ci integer; v_rem integer;
  v_cat text;
  v_before integer;
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
    when 'very_easy' then array[4,3,2,1,0]
    when 'easy' then array[2,4,3,1,0]
    when 'medium' then array[1,3,4,2,0]
    when 'hard' then array[0,2,3,3,2]
    else array[0,1,2,3,4]
  end;

  v_round_id := gen_random_uuid();

  -- Recent-2-round content ids for this student+game (exposure persists across levels).
  select coalesce(array_agg(distinct cid), '{}') into v_recent from (
    select distinct unnest(r2.vocabulary_ids) as cid
    from (select r3.vocabulary_ids from public.game_rounds r3
          where r3.student_id = v_student_id and r3.game_type = 'grammar_battle'
          order by r3.created_at desc, r3.id desc limit 2) r2
  ) s;

  -- Collect: same per-difficulty buckets, exposure-ordered, over-collected for fallback room.
  -- Segment 1: very_easy
  v_before := coalesce(array_length(v_cid, 1), 0);
  for r in
    select e.id, e.payload, e.difficulty from public.game_content_bank e
    left join public.game_content_exposure(v_student_id, 'grammar_battle') x on x.content_id = e.id
    where e.game_type = 'grammar_battle' and e.difficulty = 'very_easy' and e.min_lesson_number <= v_max_lesson
    order by x.last_seen nulls first, coalesce(x.times_seen, 0), random()
    limit (v_limits[1] + 6)
  loop
    v_cid := v_cid || r.id; v_cpay := v_cpay || r.payload; v_cdiff := v_cdiff || r.difficulty;
    v_ccat := v_ccat || coalesce(r.payload->>'category', 'uncategorized'); v_seg := v_seg || 1;
  end loop;
  v_seg_quota := v_seg_quota || least(v_limits[1], coalesce(array_length(v_cid, 1), 0) - v_before);
  -- Segment 2: easy
  v_before := coalesce(array_length(v_cid, 1), 0);
  for r in
    select e.id, e.payload, e.difficulty from public.game_content_bank e
    left join public.game_content_exposure(v_student_id, 'grammar_battle') x on x.content_id = e.id
    where e.game_type = 'grammar_battle' and e.difficulty = 'easy' and e.min_lesson_number <= v_max_lesson
    order by x.last_seen nulls first, coalesce(x.times_seen, 0), random()
    limit (v_limits[2] + 6)
  loop
    v_cid := v_cid || r.id; v_cpay := v_cpay || r.payload; v_cdiff := v_cdiff || r.difficulty;
    v_ccat := v_ccat || coalesce(r.payload->>'category', 'uncategorized'); v_seg := v_seg || 2;
  end loop;
  v_seg_quota := v_seg_quota || least(v_limits[2], coalesce(array_length(v_cid, 1), 0) - v_before);
  -- Segment 3: medium
  v_before := coalesce(array_length(v_cid, 1), 0);
  for r in
    select e.id, e.payload, e.difficulty from public.game_content_bank e
    left join public.game_content_exposure(v_student_id, 'grammar_battle') x on x.content_id = e.id
    where e.game_type = 'grammar_battle' and e.difficulty = 'medium' and e.min_lesson_number <= v_max_lesson
    order by x.last_seen nulls first, coalesce(x.times_seen, 0), random()
    limit (v_limits[3] + 6)
  loop
    v_cid := v_cid || r.id; v_cpay := v_cpay || r.payload; v_cdiff := v_cdiff || r.difficulty;
    v_ccat := v_ccat || coalesce(r.payload->>'category', 'uncategorized'); v_seg := v_seg || 3;
  end loop;
  v_seg_quota := v_seg_quota || least(v_limits[3], coalesce(array_length(v_cid, 1), 0) - v_before);
  -- Segment 4: hard
  v_before := coalesce(array_length(v_cid, 1), 0);
  for r in
    select e.id, e.payload, e.difficulty from public.game_content_bank e
    left join public.game_content_exposure(v_student_id, 'grammar_battle') x on x.content_id = e.id
    where e.game_type = 'grammar_battle' and e.difficulty = 'hard' and e.min_lesson_number <= v_max_lesson
    order by x.last_seen nulls first, coalesce(x.times_seen, 0), random()
    limit (v_limits[4] + 6)
  loop
    v_cid := v_cid || r.id; v_cpay := v_cpay || r.payload; v_cdiff := v_cdiff || r.difficulty;
    v_ccat := v_ccat || coalesce(r.payload->>'category', 'uncategorized'); v_seg := v_seg || 4;
  end loop;
  v_seg_quota := v_seg_quota || least(v_limits[4], coalesce(array_length(v_cid, 1), 0) - v_before);
  -- Segment 5: very_hard
  v_before := coalesce(array_length(v_cid, 1), 0);
  for r in
    select e.id, e.payload, e.difficulty from public.game_content_bank e
    left join public.game_content_exposure(v_student_id, 'grammar_battle') x on x.content_id = e.id
    where e.game_type = 'grammar_battle' and e.difficulty = 'very_hard' and e.min_lesson_number <= v_max_lesson
    order by x.last_seen nulls first, coalesce(x.times_seen, 0), random()
    limit (v_limits[5] + 6)
  loop
    v_cid := v_cid || r.id; v_cpay := v_cpay || r.payload; v_cdiff := v_cdiff || r.difficulty;
    v_ccat := v_ccat || coalesce(r.payload->>'category', 'uncategorized'); v_seg := v_seg || 5;
  end loop;
  v_seg_quota := v_seg_quota || least(v_limits[5], coalesce(array_length(v_cid, 1), 0) - v_before);

  for v_i in 1..5 loop
    v_leg_need[v_i] := v_seg_quota[v_i];
    v_total_target := v_total_target + v_seg_quota[v_i];
  end loop;
  for v_i in 1..coalesce(array_length(v_cid, 1), 0) loop
    v_skipped[v_i] := false;
  end loop;

  -- Pass 1: emit within quota, skipping recent items and 4th+ same-category items only when still fillable.
  for v_i in 1..coalesce(array_length(v_cid, 1), 0) loop
    v_leg := v_seg[v_i];
    if v_leg_need[v_leg] <= 0 then
      v_skipped[v_i] := true;
      continue;
    end if;
    v_cat := v_ccat[v_i];
    v_ci := coalesce(array_position(v_cats, v_cat), 0);
    -- remaining fillable slots vs remaining non-surplus candidates after this one
    v_total_need := 0;
    for v_j in 1..5 loop v_total_need := v_total_need + v_leg_need[v_j]; end loop;
    v_rem := 0;
    for v_j in (v_i + 1)..coalesce(array_length(v_cid, 1), 0) loop
      if v_leg_need[v_seg[v_j]] > 0 then v_rem := v_rem + 1; end if;
    end loop;
    if (v_cid[v_i] = any(v_recent)
        or (v_ci > 0 and v_counts[v_ci] >= 3))
       and v_rem >= v_total_need then
      v_skipped[v_i] := true;
      continue;
    end if;
    if v_ci = 0 then v_cats := v_cats || v_cat; v_counts := v_counts || 1;
    else v_counts[v_ci] := v_counts[v_ci] + 1; end if;
    v_leg_need[v_leg] := v_leg_need[v_leg] - 1;
    v_ids := array_append(v_ids, v_cid[v_i]);
    round_id := v_round_id;
    id := v_cid[v_i];
    question := v_cpay[v_i]->>'question';
    options := array(select jsonb_array_elements_text(v_cpay[v_i]->'options'));
    category := v_cpay[v_i]->>'category';
    difficulty := v_cdiff[v_i];
    level := v_level;
    return next;
  end loop;

  -- Pass 2: fill any shortfall from skipped items in order (recency/cap relaxed, never fail).
  for v_i in 1..coalesce(array_length(v_cid, 1), 0) loop
    v_leg := v_seg[v_i];
    if not v_skipped[v_i] or v_leg_need[v_leg] <= 0 then continue; end if;
    v_cat := v_ccat[v_i];
    v_ci := coalesce(array_position(v_cats, v_cat), 0);
    if v_ci = 0 then v_cats := v_cats || v_cat; v_counts := v_counts || 1;
    else v_counts[v_ci] := v_counts[v_ci] + 1; end if;
    v_leg_need[v_leg] := v_leg_need[v_leg] - 1;
    v_ids := array_append(v_ids, v_cid[v_i]);
    round_id := v_round_id;
    id := v_cid[v_i];
    question := v_cpay[v_i]->>'question';
    options := array(select jsonb_array_elements_text(v_cpay[v_i]->'options'));
    category := v_cpay[v_i]->>'category';
    difficulty := v_cdiff[v_i];
    level := v_level;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level)
    values (v_round_id, v_student_id, 'grammar_battle', v_ids, v_level);
  end if;
end;
$function$;
