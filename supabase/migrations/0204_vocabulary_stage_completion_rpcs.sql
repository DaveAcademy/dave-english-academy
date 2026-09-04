-- 0201_vocabulary_stage_completion_rpcs.sql
-- RPCs for tracking Translation/Typing/Sentence Usage/Retention stage completion.
-- These flow through the existing schedule_dictionary_review() infrastructure
-- and set the new stage-completion timestamps.

-- ── 1. Complete Translation stage ─────────────────────────────────────────
-- Marks that the student has successfully completed the Translation stage
-- for a given dictionary word. Sets translation_complete timestamp.
-- Can only transition forward: NULL → now().
-- Idempotent: calling again does not change the timestamp.

create or replace function public.complete_dictionary_translation(
  p_word_id bigint
) returns table (
  id bigint,
  student_id bigint,
  state text,
  translation_complete timestamptz,
  typing_complete timestamptz,
  sentence_complete timestamptz,
  retention_at timestamptz,
  updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_student_id bigint;
  v_current public.student_dictionary_words%rowtype;
  v_translation_complete timestamptz := now();
begin
  -- Verify student ownership
  select student_id into v_student_id
  from public.students
  where profile_id = auth.uid();

  if v_student_id is null then
    raise exception 'No student record for the current user' using errcode = '42501';
  end if;

  -- Fetch current record
  select * into v_current
  from public.student_dictionary_words
  where id = p_word_id;

  if not found then
    raise exception 'Dictionary word progress not found' using errcode = 'P0001';
  end if;

  -- Verify ownership
  if not public.is_own_student(v_current.student_id) then
    raise exception 'Unauthorized: cannot complete another student\'s word' using errcode = '42501';
  end if;

  -- Update translation_complete if not already set (idempotent)
  update public.student_dictionary_words
  set translation_complete = v_translation_complete,
      updated_at = now()
  where id = p_word_id
    and translation_complete is null;

  -- Return updated record
  return query
  select
    sdw.id,
    sdw.student_id,
    sdw.state,
    sdw.translation_complete,
    sdw.typing_complete,
    sdw.sentence_complete,
    sdw.retention_at,
    sdw.updated_at
  from public.student_dictionary_words sdw
  where sdw.id = p_word_id;
end;
$$;

revoke execute on function public.complete_dictionary_translation(bigint) from public;
grant execute on function public.complete_dictionary_translation(bigint) to authenticated;

comment on function public.complete_dictionary_translation is
  'Mark the Translation stage as complete for a dictionary word. Sets translation_complete timestamp. Idempotent if already complete. Server-authoritative.';


-- ── 2. Complete Typing stage ────────────────────────────────────────────
-- Marks that the student has successfully completed the Typing stage.
-- Prerequisite: translation_complete must already be set.
-- Sets typing_complete timestamp. Idempotent if already complete.

create or replace function public.complete_dictionary_typing(
  p_word_id bigint
) returns table (
  id bigint,
  student_id bigint,
  state text,
  translation_complete timestamptz,
  typing_complete timestamptz,
  sentence_complete timestamptz,
  retention_at timestamptz,
  updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_student_id bigint;
  v_current public.student_dictionary_words%rowtype;
  v_typing_complete timestamptz := now();
begin
  -- Verify student ownership
  select student_id into v_student_id
  from public.students
  where profile_id = auth.uid();

  if v_student_id is null then
    raise exception 'No student record for the current user' using errcode = '42501';
  end if;

  -- Fetch current record
  select * into v_current
  from public.student_dictionary_words
  where id = p_word_id;

  if not found then
    raise exception 'Dictionary word progress not found' using errcode = 'P0001';
  end if;

  -- Verify ownership
  if not public.is_own_student(v_current.student_id) then
    raise exception 'Unauthorized: cannot complete another student\'s word' using errcode = '42501';
  end if;

  -- Prerequisite check: translation must be complete first
  if v_current.translation_complete is null then
    raise exception 'Translation stage must be completed before Typing stage' using errcode = 'P0001';
  end if;

  -- Update typing_complete if not already set (idempotent)
  update public.student_dictionary_words
  set typing_complete = v_typing_complete,
      updated_at = now()
  where id = p_word_id
    and typing_complete is null;

  -- Return updated record
  return query
  select
    sdw.id,
    sdw.student_id,
    sdw.state,
    sdw.translation_complete,
    sdw.typing_complete,
    sdw.sentence_complete,
    sdw.retention_at,
    sdw.updated_at
  from public.student_dictionary_words sdw
  where sdw.id = p_word_id;
end;
$$;

revoke execute on function public.complete_dictionary_typing(bigint) from public;
grant execute on function public.complete_dictionary_typing(bigint) to authenticated;

comment on function public.complete_dictionary_typing is
  'Mark the Typing stage as complete for a dictionary word. Requires translation_complete first. Sets typing_complete timestamp. Idempotent if already complete. Server-authoritative.';


-- ── 3. Complete Sentence Usage stage ────────────────────────────────────
-- Marks that the student has successfully completed the Sentence Usage stage.
-- Prerequisites: translation_complete and typing_complete must already be set.
-- Sets sentence_complete timestamp. Idempotent if already complete.

create or replace function public.complete_dictionary_sentence(
  p_word_id bigint
) returns table (
  id bigint,
  student_id bigint,
  state text,
  translation_complete timestamptz,
  typing_complete timestamptz,
  sentence_complete timestamptz,
  retention_at timestamptz,
  updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_student_id bigint;
  v_current public.student_dictionary_words%rowtype;
  v_sentence_complete timestamptz := now();
begin
  -- Verify student ownership
  select student_id into v_student_id
  from public.students
  where profile_id = auth.uid();

  if v_student_id is null then
    raise exception 'No student record for the current user' using errcode = '42501';
  end if;

  -- Fetch current record
  select * into v_current
  from public.student_dictionary_words
  where id = p_word_id;

  if not found then
    raise exception 'Dictionary word progress not found' using errcode = 'P0001';
  end if;

  -- Verify ownership
  if not public.is_own_student(v_current.student_id) then
    raise exception 'Unauthorized: cannot complete another student\'s word' using errcode = '42501';
  end if;

  -- Prerequisite checks
  if v_current.translation_complete is null then
    raise exception 'Translation stage must be completed before Sentence Usage stage' using errcode = 'P0001';
  end if;
  if v_current.typing_complete is null then
    raise exception 'Typing stage must be completed before Sentence Usage stage' using errcode = 'P0001';
  end if;

  -- Update sentence_complete if not already set (idempotent)
  update public.student_dictionary_words
  set sentence_complete = v_sentence_complete,
      updated_at = now()
  where id = p_word_id
    and sentence_complete is null;

  -- Return updated record
  return query
  select
    sdw.id,
    sdw.student_id,
    sdw.state,
    sdw.translation_complete,
    sdw.typing_complete,
    sdw.sentence_complete,
    sdw.retention_at,
    sdw.updated_at
  from public.student_dictionary_words sdw
  where sdw.id = p_word_id;
end;
$$;

revoke execute on function public.complete_dictionary_sentence(bigint) from public;
grant execute on function public.complete_dictionary_sentence(bigint) to authenticated;

comment on function public.complete_dictionary_sentence is
  'Mark the Sentence Usage stage as complete for a dictionary word. Requires translation and typing complete first. Sets sentence_complete timestamp. Idempotent if already complete. Server-authoritative.';


-- ── 4. Complete Retention stage ──────────────────────────────────────────
-- Marks that the student has successfully completed the Retention stage.
-- Prerequisites: translation_complete, typing_complete, and sentence_complete
-- must already be set.
-- Sets retention_at timestamp. Idempotent if already complete.
-- After this, the word may transition to MASTERED via the SRS if the
-- interval reaches 90+ days.

create or replace function public.complete_dictionary_retention(
  p_word_id bigint
) returns table (
  id bigint,
  student_id bigint,
  state text,
  translation_complete timestamptz,
  typing_complete timestamptz,
  sentence_complete timestamptz,
  retention_at timestamptz,
  updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_student_id bigint;
  v_current public.student_dictionary_words%rowtype;
  v_retention_at timestamptz := now();
begin
  -- Verify student ownership
  select student_id into v_student_id
  from public.students
  where profile_id = auth.uid();

  if v_student_id is null then
    raise exception 'No student record for the current user' using errcode = '42501';
  end if;

  -- Fetch current record
  select * into v_current
  from public.student_dictionary_words
  where id = p_word_id;

  if not found then
    raise exception 'Dictionary word progress not found' using errcode = 'P0001';
  end if;

  -- Verify ownership
  if not public.is_own_student(v_current.student_id) then
    raise exception 'Unauthorized: cannot complete another student\'s word' using errcode = '42501';
  end if;

  -- Prerequisite checks (all three stages must be complete)
  if v_current.translation_complete is null then
    raise exception 'Translation stage must be completed before Retention stage' using errcode = 'P0001';
  end if;
  if v_current.typing_complete is null then
    raise exception 'Typing stage must be completed before Retention stage' using errcode = 'P0001';
  end if;
  if v_current.sentence_complete is null then
    raise exception 'Sentence Usage stage must be completed before Retention stage' using errcode = 'P0001';
  end if;

  -- Update retention_at if not already set (idempotent)
  update public.student_dictionary_words
  set retention_at = v_retention_at,
      updated_at = now()
  where id = p_word_id
    and retention_at is null;

  -- Return updated record
  return query
  select
    sdw.id,
    sdw.student_id,
    sdw.state,
    sdw.translation_complete,
    sdw.typing_complete,
    sdw.sentence_complete,
    sdw.retention_at,
    sdw.updated_at
  from public.student_dictionary_words sdw
  where sdw.id = p_word_id;
end;
$$;

revoke execute on function public.complete_dictionary_retention(bigint) from public;
grant execute on function public.complete_dictionary_retention(bigint) to authenticated;

comment on function public.complete_dictionary_retention is
  'Mark the Retention stage as complete for a dictionary word. Requires all three prior stages complete. Sets retention_at timestamp. Idempotent if already complete. Server-authoritative.';


-- ── 5. Check if word is fully mastered ──────────────────────────────────
-- Returns whether a word has achieved all four stage completions AND SRS mastery.
-- Used by the UI to show "Mastered" status and count toward the 1000-word benchmark.

create or replace function public.is_dictionary_word_mastered(
  p_word_id bigint
) returns table (
  word_id bigint,
  student_id bigint,
  translation_complete boolean,
  typing_complete boolean,
  sentence_complete boolean,
  retention_complete boolean,
  srs_mastered boolean,
  mastered_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_current public.student_dictionary_words%rowtype;
begin
  -- Fetch current record
  select * into v_current
  from public.student_dictionary_words
  where id = p_word_id;

  if not found then
    raise exception 'Dictionary word progress not found' using errcode = 'P0001';
  end if;

  return query select v_current.id as word_id, v_current.student_id, (v_current.translation_complete is not null) as translation_complete, (v_current.typing_complete is not null) as typing_complete, (v_current.sentence_complete is not null) as sentence_complete, (v_current.retention_at is not null) as retention_complete, (v_current.state = 'MASTERED' AND v_current.interval_days >= 90) as srs_mastered, v_current.mastered_at;
end;
$$;

revoke execute on function public.is_dictionary_word_mastered(bigint) from public;
grant execute on function public.is_dictionary_word_mastered(bigint) to authenticated;

comment on function public.is_dictionary_word_mastered is
  'Check if a dictionary word has achieved full mastery (all four stage completions + SRS mastery). Returns booleans for each stage and overall SRS mastery status.';