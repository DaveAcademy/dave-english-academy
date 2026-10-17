-- Level Progression, schema layer. Design: docs/level-progression-specification-2026-08-17.md
-- (approved 2026-08-17). One existing round = one level; a small persistent
-- cursor per (student, game_type) replaces "8 questions -> Play Again"
-- with real Level 1 -> Level 2 -> ... -> 100+ progression, reusing every
-- existing content-selection/curriculum-gating/grading system unchanged.
--
-- Two independently-capped difficulty dimensions (the core idea): content-
-- window stays curriculum-capped exactly as today (student_unlocked_lesson_
-- number() / min_lesson_number / student_available_vocabulary(), untouched
-- by this migration); challenge-bar (tier / word-length cap) is now driven
-- by level number instead of the old accuracy-history signals
-- (adaptive_difficulty_tier(), pick_game_words()'s exposure-count heuristic)
-- - approved as "retire adaptive_difficulty_tier() as the driver" 2026-08-17.
-- Neither function is dropped (still callable, just no longer wired into
-- round selection) in case a future session wants them for something else.

create table public.game_level_progress (
  student_id bigint not null references public.students(id) on delete cascade,
  game_type text not null,
  current_level integer not null default 1,
  best_level_reached integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (student_id, game_type)
);

comment on table public.game_level_progress is
  'Per-student-per-game level cursor. current_level = next level to attempt (always 1..N, server-enforced - the round-generators only ever serve content at this level, never a client-supplied one). best_level_reached is a high-water mark that never decreases, kept distinct from current_level for future use (e.g. a level-reached leaderboard, badges) without conflating "where you are" with "how far you have ever gotten".';

alter table public.game_level_progress enable row level security;

create policy game_level_progress_admin_all on public.game_level_progress for all
  using (is_admin()) with check (is_admin());

create policy game_level_progress_teacher_select on public.game_level_progress for select
  using (is_teacher());

create policy game_level_progress_self_select on public.game_level_progress for select
  using (is_own_student(student_id));

-- Level tagging on the two existing round/session tables - nullable and
-- additive, no backfill: every row written before this migration simply
-- has level = null ("unleveled legacy session/round"), which is accurate,
-- not a data quality problem to paper over.
alter table public.game_rounds add column if not exists level integer;
alter table public.game_sessions add column if not exists level integer;

-- Level -> difficulty tier, for the 3 content-bank games (sentence_scramble,
-- word_detective, grammar_battle). Band widths matched loosely to each
-- tier's real pool size (very_easy 20 / easy 20 / medium 25 / hard 20 /
-- very_hard 15 - confirmed identical across all three games).
create or replace function public.game_level_to_tier(p_level integer)
returns text
language sql
immutable
as $$
  select case
    when p_level <= 20 then 'very_easy'
    when p_level <= 40 then 'easy'
    when p_level <= 65 then 'medium'
    when p_level <= 85 then 'hard'
    else 'very_hard'
  end
$$;

-- Level -> word-length cap, for the 6 vocabulary-pool games. Same 3-bucket
-- shape pick_game_words() already used (6 / 9 / uncapped) - only the
-- signal driving it changes (level instead of global cross-game exposure
-- count), the difficulty shape itself is unchanged and already validated
-- in production.
create or replace function public.game_level_to_length_cap(p_level integer)
returns integer
language sql
immutable
as $$
  select case
    when p_level <= 20 then 6
    when p_level <= 40 then 9
    else null
  end
$$;
