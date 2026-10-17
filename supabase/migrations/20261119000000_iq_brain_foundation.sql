-- IQ & Brain, Phase 3 / M1 foundation (isolated system).
--
-- Separate from Homework, Payments, Exams, Groups, Games, Online Tests,
-- Rankings, XP, students.points, student_lesson_progress and achievements.
-- No FKs into those systems and no writes to them from any object here.
--
-- Tables (exactly five, per IQ Phase 2 blueprint):
--   iq_questions        content bank; answer_key never readable by students
--   iq_challenges       challenge/test configuration
--   iq_attempts         lifecycle + frozen question set + graded result
--   iq_answers          per-question answer record
--   iq_daily_challenges one curated question set per calendar date
--
-- C1 (answer-key security): iq_questions has NO student SELECT policy at
-- all - same pattern as online_test_items. Students receive content only
-- through the keyless SECURITY DEFINER RPCs in the next migration.
-- C2: `category` holds content categories only; challenge `kind` lives on
-- iq_challenges (daily / iq_challenge / practice are NOT categories).
-- C3: iq_student_progress is deliberately NOT created (adaptive difficulty
-- is deferred).
--
-- Plain `create table` (not `if not exists`) on purpose: a pre-existing
-- object must fail the migration loudly instead of silently adopting
-- someone else's shape.

-- ---------- Tables ----------

create table public.iq_questions (
  id                bigint generated always as identity primary key,
  category          text not null check (category in
                      ('logic', 'number_patterns', 'visual_patterns', 'spatial', 'memory')),
  difficulty        smallint not null check (difficulty between 1 and 5),
  question_type     text not null check (question_type in
                      ('multiple_choice', 'number_sequence', 'pattern_recognition',
                       'odd_one_out', 'spatial_reasoning', 'logic', 'memory')),
  prompt            jsonb not null check (jsonb_typeof(prompt) = 'object'),
  stimulus          jsonb,
  options           jsonb,
  answer_key        jsonb not null check (jsonb_typeof(answer_key) = 'object'),
  accepted_answers  jsonb,
  explanation       text,
  time_limit_sec    int check (time_limit_sec is null or time_limit_sec > 0),
  points            int not null default 10 check (points between 1 and 100),
  status            text not null default 'draft'
                      check (status in ('draft', 'published', 'retired')),
  tags              jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index iq_questions_pick
  on public.iq_questions (category, difficulty)
  where status = 'published';

create index iq_questions_status on public.iq_questions (status);

create table public.iq_challenges (
  id               bigint generated always as identity primary key,
  slug             text not null,
  kind             text not null check (kind in ('iq_challenge', 'practice', 'daily')),
  title            text not null,
  description      text,
  question_count   int not null default 25 check (question_count between 1 and 100),
  time_limit_sec   int check (time_limit_sec is null or time_limit_sec > 0),
  difficulty_min   smallint not null default 1 check (difficulty_min between 1 and 5),
  difficulty_max   smallint not null default 5 check (difficulty_max between 1 and 5),
  -- {} = equal split across all five categories; otherwise the keys are
  -- the allowed categories and the values are relative weights.
  category_weights jsonb not null default '{}'::jsonb,
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (difficulty_min <= difficulty_max)
);

create unique index iq_challenges_slug on public.iq_challenges (slug);

create table public.iq_attempts (
  id                bigint generated always as identity primary key,
  challenge_id      bigint not null references public.iq_challenges (id) on delete restrict,
  student_id        bigint not null references public.students (id) on delete cascade,
  status            text not null default 'in_progress'
                      check (status in ('in_progress', 'submitted', 'expired')),
  scheduled_date    date,
  started_at        timestamptz not null default now(),
  deadline          timestamptz not null,
  submitted_at      timestamptz,
  -- Frozen selection at start: ordered array of question ids. The client
  -- can neither choose nor reshuffle it, and grading walks exactly this.
  question_ids      jsonb not null default '[]'::jsonb
                      check (jsonb_typeof(question_ids) = 'array'),
  score             int,
  max_score         int,
  percentage        numeric(5, 2),
  category_scores   jsonb not null default '{}'::jsonb,
  correct_count     int,
  performance_level text,
  duration_ms       int,
  created_at        timestamptz not null default now()
);

-- One live attempt per student per challenge (race-safe resume target).
create unique index iq_attempts_one_active
  on public.iq_attempts (challenge_id, student_id)
  where status = 'in_progress';

-- Daily challenge: exactly one attempt per student per calendar date.
create unique index iq_attempts_daily_one
  on public.iq_attempts (student_id, scheduled_date)
  where scheduled_date is not null;

create index iq_attempts_student_recent
  on public.iq_attempts (student_id, created_at desc);

create index iq_attempts_challenge_student
  on public.iq_attempts (challenge_id, student_id, created_at desc);

create table public.iq_answers (
  attempt_id     bigint not null references public.iq_attempts (id) on delete cascade,
  question_id    bigint not null references public.iq_questions (id) on delete restrict,
  answer         jsonb,
  -- null while the attempt is in_progress: correctness is decided exactly
  -- once, server-side, at submit/finalize. Never a pre-submit oracle.
  is_correct     boolean,
  points_earned  int not null default 0,
  elapsed_ms     int,
  answered_at    timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create index iq_answers_attempt on public.iq_answers (attempt_id);

create table public.iq_daily_challenges (
  challenge_date  date primary key
                    default ((now() at time zone 'Asia/Tashkent')::date),
  question_ids    jsonb not null
                    check (jsonb_typeof(question_ids) = 'array'
                           and jsonb_array_length(question_ids) > 0),
  title           text,
  time_limit_sec  int check (time_limit_sec is null or time_limit_sec > 0),
  is_published    boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ---------- Retry cap (max 3 attempts per student per challenge) ----------

-- Enforced in the database, not in the application. The advisory lock
-- serializes concurrent inserts for the same (student, challenge), so the
-- count can never race a second inserter; iq_attempts_one_active above
-- independently blocks two simultaneous in_progress rows. Students hold no
-- INSERT policy, so this trigger is the only insert path besides the
-- SECURITY DEFINER start RPC.
create or replace function public.enforce_iq_attempt_limit()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_used int;
  v_cap constant int := 3;
begin
  perform pg_advisory_xact_lock(
    hashtext('iq_attempt_limit:' || new.student_id::text || ':' || new.challenge_id::text)::bigint);
  select count(*) into v_used
    from public.iq_attempts a
    where a.student_id = new.student_id and a.challenge_id = new.challenge_id;
  if v_used >= v_cap then
    raise exception 'attempt limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_iq_attempt_limit() from public;
revoke all on function public.enforce_iq_attempt_limit() from anon, authenticated;

drop trigger if exists iq_attempts_limit on public.iq_attempts;
create trigger iq_attempts_limit
  before insert on public.iq_attempts
  for each row execute function public.enforce_iq_attempt_limit();

-- ---------- RLS ----------

alter table public.iq_questions enable row level security;
alter table public.iq_challenges enable row level security;
alter table public.iq_attempts enable row level security;
alter table public.iq_answers enable row level security;
alter table public.iq_daily_challenges enable row level security;

-- iq_questions carries answer_key: admin-only. No student/teacher SELECT
-- policy exists on purpose (C1). Zero policies = deny for those roles.
drop policy if exists iq_questions_admin_all on public.iq_questions;
create policy iq_questions_admin_all on public.iq_questions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists iq_challenges_read_published on public.iq_challenges;
create policy iq_challenges_read_published on public.iq_challenges
  for select to authenticated using (is_published);

drop policy if exists iq_challenges_admin_all on public.iq_challenges;
create policy iq_challenges_admin_all on public.iq_challenges
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Attempts / answers: self SELECT only for students, plus the academy's
-- verified teacher read model (is_teacher(), the same broad staff read used
-- by students_teacher_read and online_test_attempts_teacher_read). Admin ALL.
-- Deliberately NO INSERT / UPDATE / DELETE policy for anyone but admin: all
-- writes go through SECURITY DEFINER RPCs, so a client-written score is
-- impossible by construction.
drop policy if exists iq_attempts_self_read on public.iq_attempts;
create policy iq_attempts_self_read on public.iq_attempts
  for select to authenticated
  using (student_id in (select s.id from public.students s where s.profile_id = auth.uid()));

drop policy if exists iq_attempts_teacher_read on public.iq_attempts;
create policy iq_attempts_teacher_read on public.iq_attempts
  for select to authenticated using (public.is_teacher());

drop policy if exists iq_attempts_admin_all on public.iq_attempts;
create policy iq_attempts_admin_all on public.iq_attempts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists iq_answers_self_read on public.iq_answers;
create policy iq_answers_self_read on public.iq_answers
  for select to authenticated
  using (exists (
    select 1 from public.iq_attempts a
    join public.students s on s.id = a.student_id
    where a.id = attempt_id and s.profile_id = auth.uid()
  ));

drop policy if exists iq_answers_teacher_read on public.iq_answers;
create policy iq_answers_teacher_read on public.iq_answers
  for select to authenticated using (public.is_teacher());

drop policy if exists iq_answers_admin_all on public.iq_answers;
create policy iq_answers_admin_all on public.iq_answers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists iq_daily_challenges_read_published on public.iq_daily_challenges;
create policy iq_daily_challenges_read_published on public.iq_daily_challenges
  for select to authenticated using (is_published);

drop policy if exists iq_daily_challenges_admin_all on public.iq_daily_challenges;
create policy iq_daily_challenges_admin_all on public.iq_daily_challenges
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
