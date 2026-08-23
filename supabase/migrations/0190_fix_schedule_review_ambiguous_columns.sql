-- Fix schedule_dictionary_review ambiguous column references
-- Production function body still has unqualified column names in the UPDATE clause
-- (times_seen, times_correct, lapses, etc.) that collide with the RETURNS TABLE
-- OUT variables of the same names. Same bug class as 0184/0185/0186/0188.
-- Qualifies every column in the UPDATE with the table name.
-- NO signature changes, NO permission changes, NO logic changes.

create or replace function public.schedule_dictionary_review(p_word_id bigint, p_quality integer)
returns table (
  id bigint,
  student_id bigint,
  state text,
  next_review_at timestamptz,
  interval_days integer,
  ease_factor numeric(4,2),
  lapses integer,
  mastered_at timestamptz,
  updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_student_id bigint;
  v_current_record public.student_dictionary_words%ROWTYPE;
  v_new_interval integer;
  v_new_ease numeric(4,2);
  v_new_state text;
  v_new_lapses integer;
  v_mastered_at timestamptz := NULL;
  v_first_seen timestamptz;
begin
  -- Get current record and verify ownership
  select * into v_current_record
  from public.student_dictionary_words
  where student_dictionary_words.id = p_word_id;

  if not found then
    raise exception 'Dictionary word progress not found' using errcode = 'P0001';
  end if;

  v_student_id := v_current_record.student_id;

  -- Verify student owns this record (auth.uid() must match)
  if not public.is_own_student(v_student_id) then
    raise exception 'Unauthorized: cannot review another student''s word' using errcode = '42501';
  end if;

  -- Calculate SRS transition
  select * into v_new_interval, v_new_ease, v_new_state, v_new_lapses
  from public.srs_calculate_interval(
    v_current_record.interval_days,
    v_current_record.ease_factor,
    p_quality,
    v_current_record.state
  );

  -- Determine timestamps
  v_first_seen := coalesce(v_current_record.first_seen_at, now());

  if v_new_state = 'MASTERED' and v_current_record.state != 'MASTERED' then
    v_mastered_at := now();
  elsif v_current_record.state = 'MASTERED' and v_new_state = 'LAPSED' then
    v_mastered_at := NULL;
  else
    v_mastered_at := v_current_record.mastered_at;
  end if;

  -- Update the record (ALL columns qualified with table name to avoid
  -- ambiguity with RETURNS TABLE OUT variables). RETURN QUERY is required
  -- because the function is declared RETURNS TABLE.
  return query
  update public.student_dictionary_words
  set
    state = v_new_state,
    times_seen = student_dictionary_words.times_seen + 1,
    times_correct = student_dictionary_words.times_correct + case when p_quality in (2, 3) then 1 else 0 end,
    next_review_at = now() + (v_new_interval || ' days')::interval,
    interval_days = v_new_interval,
    ease_factor = v_new_ease,
    lapses = student_dictionary_words.lapses + v_new_lapses,
    first_seen_at = v_first_seen,
    last_reviewed_at = now(),
    mastered_at = v_mastered_at,
    updated_at = now()
  where student_dictionary_words.id = p_word_id
  returning
    student_dictionary_words.id,
    student_dictionary_words.student_id,
    student_dictionary_words.state,
    student_dictionary_words.next_review_at,
    student_dictionary_words.interval_days,
    student_dictionary_words.ease_factor,
    student_dictionary_words.lapses,
    student_dictionary_words.mastered_at,
    student_dictionary_words.updated_at;
end;
$$;