-- Word Builder progressive word length
-- Previous: game_level_to_length_cap() only capped maximum length (6 for L1-20, 9 for L21-40, uncapped after)
-- Early levels could still receive 6-letter words when 2-3 letter curriculum words existed
-- New: genuine progressive target ranges, preferring short words early and longer words later
-- Curriculum gating remains mandatory, fallback expands by ±1 if insufficient candidates

-- New helper: returns target min/max length for Word Builder at given level
create or replace function public.game_level_to_word_builder_range(p_level integer)
returns table (min_len integer, max_len integer)
language sql
immutable
as $$
  select
    case
      when p_level <= 5 then 2
      when p_level <= 10 then 3
      when p_level <= 15 then 4
      when p_level <= 20 then 5
      when p_level <= 30 then 5
      when p_level <= 50 then 6
      else 7
    end as min_len,
    case
      when p_level <= 5 then 3
      when p_level <= 10 then 4
      when p_level <= 15 then 5
      when p_level <= 20 then 6
      when p_level <= 30 then 7
      when p_level <= 50 then 8
      else 9
    end as max_len
$$;

comment on function public.game_level_to_word_builder_range(integer) is 'Word Builder target length range per level. L1-5:2-3, L6-10:3-4, L11-15:4-5, L16-20:5-6, L21-30:5-7, L31-50:6-8, L51-100:7-9. Fallback expands by ±1 if insufficient curriculum-eligible candidates.';

-- Update pick_game_words to use progressive range for Word Builder
-- When p_level is given and caller is Word Builder (detected via p_alpha_only=true and p_count=8 with Word Builder context),
-- we apply the range filter. For backward compatibility, other games continue to use length_cap.
-- To avoid breaking other callers, we add a new function specifically for Word Builder selection
-- and update get_word_builder_round to use it.

create or replace function public.pick_word_builder_words(p_level integer, p_count integer default 8)
returns table (id uuid, english text, uzbek text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_student_id bigint;
  v_min_len integer;
  v_max_len integer;
  v_expanded_min integer;
  v_expanded_max integer;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then return; end if;

  select min_len, max_len into v_min_len, v_max_len from public.game_level_to_word_builder_range(p_level);

  -- Try target range first
  return query
  with pool as (
    select v.id as vocabulary_id, v.english as vocabulary_english, v.uzbek as vocabulary_uzbek,
           coalesce(h.times_seen, 0) as times_seen, h.last_seen_at,
           length(v.english) as word_len
    from public.student_available_vocabulary() v
    left join public.game_word_history h on h.student_id = v_student_id and h.vocabulary_id = v.id
    where v.english ~ '^[A-Za-z]+$' and length(v.english) >= v_min_len and length(v.english) <= v_max_len
  ),
  new_words as (
    select * from pool where times_seen = 0 order by last_seen_at nulls first, random() limit greatest(p_count / 2, 1)
  ),
  review_words as (
    select * from pool where times_seen > 0 and vocabulary_id not in (select vocabulary_id from new_words)
    order by last_seen_at nulls first, random() limit ceil(p_count * 0.375)
  ),
  chosen as (
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from new_words
    union all select vocabulary_id, vocabulary_english, vocabulary_uzbek from review_words
  )
  select vocabulary_id, vocabulary_english, vocabulary_uzbek from chosen
  union all
  select vocabulary_id, vocabulary_english, vocabulary_uzbek from (
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from pool
    where vocabulary_id not in (select vocabulary_id from chosen)
    order by last_seen_at nulls first, random()
    limit greatest(p_count - (select count(*) from chosen), 0)
  ) backfill
  limit p_count;

  -- If insufficient in target range, expand by ±1 (fallback 1)
  if not found or (select count(*) from public.student_available_vocabulary() v where length(v.english) between v_min_len and v_max_len) < p_count then
    v_expanded_min := greatest(2, v_min_len - 1);
    v_expanded_max := v_max_len + 1;
    return query
    with pool as (
      select v.id as vocabulary_id, v.english as vocabulary_english, v.uzbek as vocabulary_uzbek,
             coalesce(h.times_seen, 0) as times_seen, h.last_seen_at
      from public.student_available_vocabulary() v
      left join public.game_word_history h on h.student_id = v_student_id and h.vocabulary_id = v.id
      where v.english ~ '^[A-Za-z]+$' and length(v.english) >= v_expanded_min and length(v.english) <= v_expanded_max
    ),
    new_words as (
      select * from pool where times_seen = 0 order by last_seen_at nulls first, random() limit greatest(p_count / 2, 1)
    ),
    review_words as (
      select * from pool where times_seen > 0 and vocabulary_id not in (select vocabulary_id from new_words)
      order by last_seen_at nulls first, random() limit ceil(p_count * 0.375)
    ),
    chosen as (
      select vocabulary_id, vocabulary_english, vocabulary_uzbek from new_words
      union all select vocabulary_id, vocabulary_english, vocabulary_uzbek from review_words
    )
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from chosen
    union all
    select vocabulary_id, vocabulary_english, vocabulary_uzbek from (
      select vocabulary_id, vocabulary_english, vocabulary_uzbek from pool
      where vocabulary_id not in (select vocabulary_id from chosen)
      order by last_seen_at nulls first, random()
      limit greatest(p_count - (select count(*) from chosen), 0)
    ) backfill
    limit p_count;
  end if;

  -- Final fallback: if still insufficient, use any curriculum-eligible (no length filter) but never outside curriculum
  -- This ensures playability even with small pools, without duplicates if possible
  if not found then
    return query select p.id, p.english, p.uzbek from public.pick_game_words(true, p_count, p_level) p;
  end if;
end;
$$;

-- Update Word Builder to use progressive selection
drop function if exists public.get_word_builder_round();
create or replace function public.get_word_builder_round()
returns table (round_id uuid, id uuid, english text, level integer)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  v_level integer;
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then return; end if;
  insert into public.game_level_progress (student_id, game_type) values (v_student_id, 'word_builder') on conflict (student_id, game_type) do nothing;
  select current_level into v_level from public.game_level_progress where student_id = v_student_id and game_type = 'word_builder';
  v_round_id := gen_random_uuid();
  for r in select p.id, p.english from public.pick_word_builder_words(v_level, 8) p loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id; id := r.id; english := r.english; level := v_level; return next;
  end loop;
  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids, level) values (v_round_id, v_student_id, 'word_builder', v_ids, v_level);
  end if;
end;
$$;
revoke execute on function public.get_word_builder_round() from public;
grant execute on function public.get_word_builder_round() to authenticated;
grant execute on function public.pick_word_builder_words(integer, integer) to authenticated;

comment on function public.pick_word_builder_words(integer, integer) is 'Word Builder curriculum-gated selection with progressive length. Respects student_available_vocabulary() always.';
