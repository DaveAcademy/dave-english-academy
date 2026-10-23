-- Game Center foundation: curriculum-aware, repetition-aware vocabulary
-- selection shared by every game, plus a generic grading RPC so adding a
-- new game (Word Match next) doesn't mean duplicating auth/curriculum/
-- scoring/achievement plumbing. Builds on 0111 (game_sessions already
-- exists and is untouched in shape); replaces 0111's two functions with
-- curriculum-scoped, repetition-aware versions, and adds one small new
-- table for per-word exposure history.
--
-- Curriculum-first rule (this migration's actual point): a game must only
-- draw from vocabulary the student has actually reached, not "anything at
-- their level". student_available_vocabulary() ports the exact unlock
-- rule src/lib/lessonLogic.js already uses for lesson PDFs
-- (isLessonUnlocked - legacy lessons always available, lesson_number<=1
-- always available, otherwise gated by curriculum_progress.
-- max_available_lesson as a hard cap and by
-- current_lesson_number/previous-lesson-completed as the soft unlock) -
-- not a second curriculum system, the same one, read server-side.
--
-- Repetition rule: game_word_history (student_id, vocabulary_id) is a
-- plain exposure counter, not a spaced-repetition engine - no due dates,
-- no ease factors. pick_game_words() splits each round into three simple
-- pools (new / needs-review / recently-mastered) and backfills from
-- "new" if any pool comes up short. This is intentionally the simplest
-- version that satisfies "incorrect answers get reprioritized, mastered
-- words still recur occasionally".

create table if not exists public.game_word_history (
  student_id bigint not null references public.students(id) on delete cascade,
  vocabulary_id uuid not null references public.lesson_vocabulary(id) on delete cascade,
  times_seen integer not null default 0,
  times_correct integer not null default 0,
  last_seen_at timestamptz,
  primary key (student_id, vocabulary_id)
);

alter table public.game_word_history enable row level security;

drop policy if exists game_word_history_admin_all on public.game_word_history;
create policy game_word_history_admin_all on public.game_word_history for all
  using (is_admin()) with check (is_admin());

drop policy if exists game_word_history_teacher_select on public.game_word_history;
create policy game_word_history_teacher_select on public.game_word_history for select
  using (is_teacher());

-- Read-only for students, same reasoning as game_sessions/
-- student_metric_snapshots: only submit_game_round() (SECURITY DEFINER)
-- writes this table.
drop policy if exists game_word_history_self_select on public.game_word_history;
create policy game_word_history_self_select on public.game_word_history for select
  using (public.is_own_student(student_id));

-- The one curriculum-scoping function every game's round-picker calls.
-- Returns exactly the vocabulary this student has actually reached -
-- mirrors isLessonUnlocked() (lessonLogic.js) rather than inventing a
-- second notion of "available". A student who can already read a word
-- via listAllVocabulary/RLS may still not see it in a game round if the
-- class hasn't reached that lesson yet - RLS stays as-is (unchanged,
-- deliberately looser for the read-only vocabulary browser), this is an
-- additional narrowing specific to games.
create or replace function public.student_available_vocabulary()
returns table (id uuid, english text, uzbek text, lesson_number integer)
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
    -- Curriculum-linked lessons: capped by max_available_lesson, opened by
    -- teacher pace (current_lesson_number) or by the student having
    -- completed the immediately preceding lesson - exactly lessonLogic.js.
    select l.id as lesson_id, cl.lesson_number
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
    union all
    -- Legacy (non-curriculum) lessons at the student's level: always
    -- available, matching today's behaviour - no lesson_number to gate by.
    -- (No rows currently exist in this shape; kept for correctness.)
    select l.id, null::integer
    from public.lessons l
    join me on l.level = me.level
    where l.curriculum_lesson_id is null
  )
  select v.id, v.english, v.uzbek, ul.lesson_number
  from public.lesson_vocabulary v
  join unlocked_lessons ul on ul.lesson_id = v.lesson_id
  where v.is_active;
$$;

revoke execute on function public.student_available_vocabulary() from public;
grant execute on function public.student_available_vocabulary() to authenticated;

-- Shared round-picker: p_alpha_only restricts to single-word alphabetic
-- entries (Word Scramble's requirement; Vocabulary Quiz doesn't need this
-- restriction and passes false). Mix: up to 4 never-seen, up to 3
-- needs-review (previously missed or not seen in 3+ days), up to 1
-- recently-mastered, backfilled from the general available pool if any
-- bucket is short (e.g. a student's very first round, where nothing has
-- history yet, is entirely "new").
--
-- Difficulty note: curriculum-unlock scoping (student_available_vocabulary)
-- keeps a student off vocabulary from lessons they haven't reached, but
-- "reached" can already span dozens of words of very different length -
-- being unlocked isn't the same as being an appropriate first word to
-- show. Two soft preferences (never hard filters - a pool never comes up
-- short just because every candidate is long/old) apply within every
-- pool: lesson_age (0 = the single most-recently-unlocked lesson, rising
-- for earlier ones) is checked first, so "current lesson -> earlier
-- reached lessons -> only then anything else" is the real ordering, not
-- an even mix across everything the student has ever unlocked; then
-- v_length_cap prefers shorter words while the student has little game
-- history, loosening automatically as their exposure count grows. No new
-- difficulty column/table - lesson_number, length(english), and the
-- student's own exposure count are all already available, which is what
-- "derive difficulty from existing curriculum/word properties" means
-- here.
create or replace function public.pick_game_words(p_alpha_only boolean, p_count integer default 8)
returns table (id uuid, english text, uzbek text)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_exposure_count integer;
  v_length_cap integer;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  select count(*) into v_exposure_count from public.game_word_history where student_id = v_student_id;
  -- Early stage (<15 distinct words ever seen in any game): favor short/
  -- common words. Middle stage (<40): allow moderately longer ones.
  -- Later stage: no length preference at all - genuine mastery, not
  -- curriculum position, is what unlocks harder words.
  v_length_cap := case
    when v_exposure_count < 15 then 6
    when v_exposure_count < 40 then 9
    else null
  end;

  return query
  with pool as (
    select v.id, v.english, v.uzbek,
           coalesce(h.times_seen, 0) as times_seen,
           coalesce(h.times_correct, 0) as times_correct,
           h.last_seen_at,
           -- 0 = within the current soft difficulty cap, 1 = over it.
           -- Ordering by this first means capped-length words are always
           -- exhausted before longer ones are used to fill a bucket, but
           -- a short-on-candidates bucket still fills rather than
           -- staying empty.
           case when v_length_cap is not null and length(v.english) > v_length_cap then 1 else 0 end as over_cap,
           -- 0 = from the student's single most-recently-unlocked lesson
           -- (their "current" material), rising for older lessons, and a
           -- large constant for legacy/non-curriculum vocabulary (no
           -- lesson_number to rank by, treated as "oldest"). This is the
           -- curriculum-priority requirement: current/recent lesson vocab
           -- first, then earlier reached lessons, only reaching further
           -- back when a pool needs filling.
           coalesce(max(v.lesson_number) over () - v.lesson_number, 9999) as lesson_age
    from public.student_available_vocabulary() v
    left join public.game_word_history h
      on h.student_id = v_student_id and h.vocabulary_id = v.id
    where (not p_alpha_only) or (v.english ~ '^[A-Za-z]+$' and length(v.english) >= 3)
  ),
  new_words as (
    select * from pool where times_seen = 0 order by lesson_age, over_cap, random() limit greatest(p_count / 2, 1)
  ),
  review_words as (
    select * from pool
    where times_seen > 0
      and (times_correct < times_seen or last_seen_at < now() - interval '3 days')
      and id not in (select id from new_words)
    order by lesson_age, over_cap, random() limit ceil(p_count * 0.375)
  ),
  mastered_words as (
    select * from pool
    where times_seen >= 2 and times_correct = times_seen and last_seen_at >= now() - interval '3 days'
      and id not in (select id from new_words union select id from review_words)
    order by lesson_age, over_cap, random() limit greatest(p_count - (select count(*) from new_words) - (select count(*) from review_words), 0)
  ),
  chosen as (
    select id, english, uzbek from new_words
    union all select id, english, uzbek from review_words
    union all select id, english, uzbek from mastered_words
  ),
  backfill as (
    select id, english, uzbek, over_cap, lesson_age from pool
    where id not in (select id from chosen)
    order by lesson_age, over_cap, random()
    limit greatest(p_count - (select count(*) from chosen), 0)
  )
  select id, english, uzbek from chosen
  union all
  select id, english, uzbek from backfill
  limit p_count;
end;
$$;

revoke execute on function public.pick_game_words(boolean, integer) from public;
grant execute on function public.pick_game_words(boolean, integer) to authenticated;

drop function if exists public.get_word_scramble_round();

create or replace function public.get_word_scramble_round()
returns table (id uuid, english text)
language sql
stable
security definer
set search_path = 'public'
as $$
  select id, english from public.pick_game_words(true, 8);
$$;

revoke execute on function public.get_word_scramble_round() from public;
grant execute on function public.get_word_scramble_round() to authenticated;

-- Vocabulary Quiz round: each item carries 4 shuffled options (1 correct
-- Uzbek meaning + 3 distractors drawn from the same available pool, same
-- curriculum scope - never arbitrary words). Distractor content isn't
-- secret (same as the correct answer, already readable via My
-- Vocabulary); what matters is that grading never trusts which option
-- index the client claims was "correct" - submit_game_round always
-- re-checks the submitted text against lesson_vocabulary.uzbek.
create or replace function public.get_vocabulary_quiz_round()
returns table (id uuid, english text, options text[])
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  r record;
  v_distractors text[];
  v_options text[];
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

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
    id := r.id;
    english := r.english;
    options := v_options;
    return next;
  end loop;
end;
$$;

revoke execute on function public.get_vocabulary_quiz_round() from public;
grant execute on function public.get_vocabulary_quiz_round() to authenticated;

drop function if exists public.submit_word_scramble_round(jsonb);

-- Generic grading + scoring + history + achievement hook, shared by every
-- game. p_game_type selects what "correct" means (word_scramble compares
-- against english, vocabulary_quiz against uzbek) and which achievement
-- metric key gets bumped - everything else (student_id derivation,
-- server-side grading, game_sessions insert, game_word_history upsert,
-- evaluate_achievements call) is identical across games, which is the
-- actual point of this function: adding a new game means adding one
-- `when` branch here, not a new copy of this whole function.
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
  if p_game_type not in ('word_scramble', 'vocabulary_quiz') then
    raise exception 'Unknown game_type: %', p_game_type;
  end if;
  v_metric_key := case p_game_type
    when 'word_scramble' then 'game_words_scrambled_correct'
    when 'vocabulary_quiz' then 'game_vocabulary_quiz_correct'
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

    -- Re-validate the word is one this student can actually reach right
    -- now (same predicate as student_available_vocabulary) and grade
    -- against the right column for this game type - never against
    -- anything the client sent.
    select (not r.skipped) and (
      case p_game_type
        when 'word_scramble' then lower(trim(r.answer)) = lower(v.english)
        when 'vocabulary_quiz' then trim(r.answer) = v.uzbek
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
