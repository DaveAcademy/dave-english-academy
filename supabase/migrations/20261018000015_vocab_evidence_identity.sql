-- Vocabulary Knowledge Phase 1: stable evidence identity.
--
-- Adds nullable vocabulary_id links from evidence rows to the canonical
-- lesson_vocabulary.id (the de-facto key already used by Games and the
-- Dictionary SRS). Nullable because many questions genuinely have no
-- single vocabulary target (sentence creation, reading, grammar,
-- multi-word matching/ordering). ON DELETE SET NULL so vocabulary
-- cleanup never deletes evidence. No data changes, no grading changes,
-- no RLS changes. Backfill lives separately in
-- scripts/backfill-vocab-identity.sql (idempotent, report-first).

alter table public.homework_questions
  add column if not exists vocabulary_id uuid
    references public.lesson_vocabulary (id) on delete set null;

alter table public.online_test_items
  add column if not exists vocabulary_id uuid
    references public.lesson_vocabulary (id) on delete set null;

create index if not exists homework_questions_vocabulary_id_idx
  on public.homework_questions (vocabulary_id);

create index if not exists online_test_items_vocabulary_id_idx
  on public.online_test_items (vocabulary_id);

comment on column public.homework_questions.vocabulary_id is
  'Canonical lesson_vocabulary.id for single-word questions (MC/translation); NULL when unmappable. Filled by scripts/backfill-vocab-identity.sql and the seed scripts, never by grading.';
comment on column public.online_test_items.vocabulary_id is
  'Canonical lesson_vocabulary.id for single-word vocabulary items; NULL when unmappable. Filled by scripts/backfill-vocab-identity.sql, never by grading.';
