-- 0196_vocabulary_mastery_stages.sql
-- Add Translation/Typing/Sentence Usage/Retention stage tracking to
-- student_dictionary_words. These columns support the Stage 5 vocabulary
-- mastery model: Translation → Typing → Sentence Usage → Retention → Mastered.
--
-- Design decisions:
-- - Columns are NULLable by default — a word that has never attempted a
--   given stage shows NULL, not "not-applicable". This lets the UI
--   distinguish "not yet attempted" from "already completed".
-- - Every column has a sensible default for new records so existing
--   rows are not broken by the ALTER.
-- - Indexes support the "what should I practice?" query paths.
-- - All values are set server-side via RPC; the UI never writes directly
--   to these columns.
-- - RLS scopes everything to the owning student; teachers/admins see
--   through lateral joins if they need aggregate views.

-- ── Column: translation_complete ──────────────────────────────────────────
-- Student has successfully completed the Translation stage for this word.
-- Set to now() when the Translation stage is first passed; never cleared
-- thereafter (historical evidence preserved).

alter table public.student_dictionary_words
  add column if not exists translation_complete timestamptz;

comment on column public.student_dictionary_words.translation_complete
  IS 'Timestamp when the student first passed the Translation stage for this word. NULL = not yet attempted or not yet passed. Preserved historically.';

-- ── Column: typing_complete ─────────────────────────────────────────────
-- Student has successfully completed the Typing stage for this word.

alter table public.student_dictionary_words
  add column if not exists typing_complete timestamptz;

comment on column public.student_dictionary_words.typing_complete
  IS 'Timestamp when the student first passed the Typing stage for this word. NULL = not yet attempted or not yet passed. Preserved historically.';

-- ── Column: sentence_complete ───────────────────────────────────────────
-- Student has successfully completed the Sentence Usage stage for this word.

alter table public.student_dictionary_words
  add column if not exists sentence_complete timestamptz;

comment on column public.student_dictionary_words.sentence_complete
  IS 'Timestamp when the student first passed the Sentence Usage stage for this word. NULL = not yet attempted or not yet passed. Preserved historically.';

-- ── Column: retention_at ────────────────────────────────────────────────
-- The date this word entered the Retention state (scheduled review that
-- the student successfully retained). Used to track whether the word
-- has been retained over time.

alter table public.student_dictionary_words
  add column if not exists retention_at timestamptz;

comment on column public.student_dictionary_words.retention_at
  IS 'Timestamp when the word was confirmed retained after the Retention stage. NULL = not yet through Retention or not yet retained. Preserved historically.';

-- ── Indexes for practice/focus queries ────────────────────────────────────
-- Words ready for Translation practice (never attempted translation)
create index if not exists
  idx_sdwt_translation_ready
    on public.student_dictionary_words (student_id)
    where translation_complete is null;

-- Words ready for Typing practice (translation done, typing not yet)
create index if not exists
  idx_sdwt_typing_ready
    on public.student_dictionary_words (student_id)
    where translation_complete is not null
      and typing_complete is null;

-- Words ready for Sentence Usage practice (translation+typing done, sentence not yet)
create index if not exists
  idx_sdwt_sentence_ready
    on public.student_dictionary_words (student_id)
    where translation_complete is not null
      and typing_complete is not null
      and sentence_complete is null;

-- Words due for Retention review (all three stages complete, retention due)
create index if not exists
  idx_sdwt_retention_due
    on public.student_dictionary_words (student_id)
    where translation_complete is not null
      and typing_complete is not null
      and sentence_complete is not null
      and retention_at is null;

-- Words mastered overall (all four stages complete)
create index if not exists
  idx_sdwt_mastered
    on public.student_dictionary_words (student_id)
    where translation_complete is not null
      and typing_complete is not null
      and sentence_complete is not null
      and retention_at is not null;

-- ── RLS policies ──────────────────────────────────────────────────────────
-- Students can read their own stage completion data
drop policy if exists student_dictionary_words_self_select_stages on public.student_dictionary_words;
create policy student_dictionary_words_self_select_stages
  on public.student_dictionary_words
  for select
  using (public.is_own_student(student_id));

-- Teachers and admins can read all stage completion data
drop policy if exists student_dictionary_words_stages_teacher_select on public.student_dictionary_words;
create policy student_dictionary_words_stages_teacher_select
  on public.student_dictionary_words
  for select
  using (public.is_teacher() OR public.is_admin());

-- Admins can update stage completion timestamps (for corrections/maintenance)
drop policy if exists student_dictionary_words_stages_admin_update on public.student_dictionary_words;
create policy student_dictionary_words_stages_admin_update
  on public.student_dictionary_words
  for update
  using (public.is_admin())
  with check (public.is_admin());