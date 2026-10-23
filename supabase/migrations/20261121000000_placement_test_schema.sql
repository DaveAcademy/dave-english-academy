-- 20261121000000_placement_test_schema.sql
-- CEFR Placement Test: schema, indexes, RLS.
--
-- Isolated subsystem (mirrors iq_brain conventions, migration 20261119000000):
-- four tables, no FKs into homework/exams/games/points. All client writes go
-- through SECURITY DEFINER RPCs (20261121000100) - there are deliberately NO
-- INSERT/UPDATE/DELETE RLS policies for students or teachers on any of these
-- tables, so a client can never write a score, answer, or review directly.
--
-- Answer-key protection: placement_questions is admin-only at the RLS layer.
-- Students never receive answer_key/explanation (RPCs project keyless
-- payloads); teachers receive them only for submitted/reviewed attempts via
-- the staff payload in get_placement_attempt.
--
-- Teacher scoping follows the established level-assignment pattern
-- (migration 0131 exam_scores_teacher_level_scope): a teacher sees placement
-- data only for students whose group level matches their
-- teacher_group_assignments rows. Administrators see everything.

-- ---------------------------------------------------------------------------
-- Question bank
-- ---------------------------------------------------------------------------
create table public.placement_questions (
  id bigint generated always as identity primary key,
  -- grammar / vocabulary / reading / listening are objective (auto-scored);
  -- writing / speaking are teacher-assessed prompts (is_correct stays NULL).
  skill text not null check (skill in ('grammar','vocabulary','reading','listening','writing','speaking')),
  -- CEFR target level on the internal ladder: 1=A1 2=A2 3=B1 4=B2 5=C1 6=C2
  cefr_level smallint not null check (cefr_level between 1 and 6),
  -- mcq | gap_fill | prompt (writing/speaking)
  question_type text not null check (question_type in ('mcq','gap_fill','prompt')),
  prompt jsonb not null,
  answer_key jsonb,
  accepted_answers jsonb,
  explanation text,
  -- evidence weight contributed by a correct answer at this item's level
  -- (defaults to the CEFR ladder index; harder items are stronger evidence)
  weight smallint not null default 2 check (weight between 1 and 6),
  status text not null default 'published' check (status in ('draft','published','retired')),
  created_at timestamptz not null default now(),
  constraint placement_questions_key_required check (
    (question_type = 'mcq' and answer_key is not null)
    or (question_type = 'gap_fill' and accepted_answers is not null)
    or (question_type = 'prompt' and answer_key is null and accepted_answers is null)
  )
);

create index placement_questions_skill_level_idx
  on public.placement_questions (skill, cefr_level, id)
  where status = 'published';

-- ---------------------------------------------------------------------------
-- Attempts
-- ---------------------------------------------------------------------------
create table public.placement_attempts (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress','submitted','reviewed','expired')),
  started_at timestamptz not null default now(),
  -- server-set; all RPCs reject writes past this point and the attempt
  -- expires on next access
  deadline timestamptz not null,
  submitted_at timestamptz,
  -- frozen ordered set of question ids served so far (drives adaptive
  -- selection and lets interrupted attempts resume deterministically)
  asked_question_ids jsonb not null default '[]'::jsonb,
  -- provisional result computed at submit (skill breakdown, evidence,
  -- confidence, recommended academy level) - see 20261121000100
  result jsonb,
  estimated_level smallint check (estimated_level between 1 and 6),
  confidence text check (confidence in ('high','medium','low')),
  -- pending | insufficient_evidence | reviewed
  review_status text not null default 'pending'
    check (review_status in ('pending','insufficient_evidence','reviewed')),
  final_level smallint check (final_level between 1 and 6),
  created_at timestamptz not null default now()
);

-- One live attempt per student; retries are allowed once a previous attempt
-- is submitted/reviewed/expired. Enforced again (advisory-locked) inside
-- start_placement_attempt.
create unique index placement_attempts_one_active
  on public.placement_attempts (student_id)
  where status = 'in_progress';

create index placement_attempts_student_idx on public.placement_attempts (student_id, started_at desc);
create index placement_attempts_status_idx on public.placement_attempts (status);

-- ---------------------------------------------------------------------------
-- Answers (one row per asked question; written on save, graded server-side)
-- ---------------------------------------------------------------------------
create table public.placement_answers (
  attempt_id bigint not null references public.placement_attempts (id) on delete cascade,
  question_id bigint not null references public.placement_questions (id) on delete restrict,
  answer jsonb,
  skipped boolean not null default false,
  -- NULL for writing/speaking (teacher-assessed) and for skipped items
  is_correct boolean,
  weight smallint not null,
  answered_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create index placement_answers_attempt_idx on public.placement_answers (attempt_id);

-- ---------------------------------------------------------------------------
-- Teacher reviews (one per attempt; re-review upserts with a new reason)
-- ---------------------------------------------------------------------------
create table public.placement_reviews (
  attempt_id bigint primary key references public.placement_attempts (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  final_level smallint not null check (final_level between 1 and 6),
  -- rubric scores: {task_completion, grammar_control, vocabulary_range, coherence}
  -- for writing; {intelligibility, grammar_control, vocabulary_range, fluency_coherence}
  -- for speaking. Each dimension 0..3.
  writing_scores jsonb,
  speaking_scores jsonb,
  speaking_conducted boolean not null default false,
  -- mandatory: why the level was confirmed or adjusted
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.placement_questions enable row level security;
alter table public.placement_attempts enable row level security;
alter table public.placement_answers enable row level security;
alter table public.placement_reviews enable row level security;

-- Questions: admin only. Students must never read the bank (answer keys);
-- teachers get keyless payloads + post-submit keys through RPCs instead.
create policy placement_questions_admin_all on public.placement_questions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Attempts: owner reads own; teachers scoped to their assigned group levels;
-- admin all. No write policies - lifecycle is RPC-only.
create policy placement_attempts_self_read on public.placement_attempts
  for select to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = placement_attempts.student_id
        and s.profile_id = auth.uid()
    )
  );

create policy placement_attempts_teacher_read on public.placement_attempts
  for select to authenticated
  using (
    public.is_teacher()
    and exists (
      select 1
      from public.students s
      join public.teacher_group_assignments tga
        on tga.level = s.level
       and tga.teacher_id = auth.uid()
      where s.id = placement_attempts.student_id
    )
  );

create policy placement_attempts_admin_all on public.placement_attempts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Answers: same visibility contract as attempts. is_correct is visible to
-- the owner only after submit (the RPC payload governs that; RLS governs
-- who can read rows at all).
create policy placement_answers_self_read on public.placement_answers
  for select to authenticated
  using (
    exists (
      select 1
      from public.placement_attempts a
      join public.students s on s.id = a.student_id
      where a.id = placement_answers.attempt_id
        and s.profile_id = auth.uid()
    )
  );

create policy placement_answers_teacher_read on public.placement_answers
  for select to authenticated
  using (
    public.is_teacher()
    and exists (
      select 1
      from public.placement_attempts a
      join public.students s
        on s.id = a.student_id
      join public.teacher_group_assignments tga
        on tga.level = s.level
       and tga.teacher_id = auth.uid()
      where a.id = placement_answers.attempt_id
    )
  );

create policy placement_answers_admin_all on public.placement_answers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Reviews: same scope; writes happen only through submit_placement_review.
create policy placement_reviews_self_read on public.placement_reviews
  for select to authenticated
  using (
    exists (
      select 1
      from public.placement_attempts a
      join public.students s on s.id = a.student_id
      where a.id = placement_reviews.attempt_id
        and s.profile_id = auth.uid()
    )
  );

create policy placement_reviews_teacher_read on public.placement_reviews
  for select to authenticated
  using (
    public.is_teacher()
    and exists (
      select 1
      from public.placement_attempts a
      join public.students s
        on s.id = a.student_id
      join public.teacher_group_assignments tga
        on tga.level = s.level
       and tga.teacher_id = auth.uid()
      where a.id = placement_reviews.attempt_id
    )
  );

create policy placement_reviews_admin_all on public.placement_reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
