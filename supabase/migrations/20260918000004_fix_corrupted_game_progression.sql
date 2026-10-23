-- P0 Fix: Corrupted Game Progression Levels
-- Forensic audit found 45 game_level_progress rows inflated (total 1225 levels over)
-- Top: Zack grammar_battle 613->1 (612 over), Mira picture_quiz 133->3 (130 over), etc.
-- Root: historical submit_game_round advanced on pass (70% or completion) not 10/10,
-- allowing 0/10 or 7/10 to still level up. Current correct rule is 10/10 perfect at exact level.
-- This migration recalculates legitimate level by replaying game_sessions in order:
-- start 1, if words_correct=10 and words_total=10 and session.level == current_recalc then ++
-- and corrects current_level and best_level_reached to legitimate value.
-- Idempotent: only updates where current != legit and logs correction once per (student,game).

-- Recalc function (temporary, used only inside this migration)
create or replace function temp_recalc_level_for_migration(p_student_id bigint, p_game_type text)
returns integer language plpgsql as $$
declare
  v_level int := 1;
  r record;
begin
  for r in
    select words_correct, words_total, level as session_level
    from game_sessions
    where student_id = p_student_id and game_type = p_game_type
    order by played_at asc, id asc
  loop
    if r.words_correct = 10 and r.words_total = 10 and r.session_level = v_level then
      v_level := v_level + 1;
    end if;
  end loop;
  return v_level;
end;
$$;

-- Audit table for corrections
create table if not exists public.game_level_corrections (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  game_type text not null,
  old_level integer not null,
  old_best integer not null,
  new_level integer not null,
  new_best integer not null,
  diff integer not null,
  reason text not null,
  evidence jsonb,
  created_at timestamptz not null default now(),
  unique (student_id, game_type)
);

-- Insert audit rows for corrupted (where current != legit), idempotent via unique constraint
insert into public.game_level_corrections (student_id, game_type, old_level, old_best, new_level, new_best, diff, reason, evidence)
select
  g.student_id,
  g.game_type,
  g.current_level as old_level,
  g.best_level_reached as old_best,
  temp_recalc_level_for_migration(g.student_id, g.game_type) as new_level,
  temp_recalc_level_for_migration(g.student_id, g.game_type) as new_best,
  g.current_level - temp_recalc_level_for_migration(g.student_id, g.game_type) as diff,
  'P0 forensic: level inflated by historical pass-based advancement (pre-20260906000000 10/10 rule); recalculated via perfect 10/10 replay' as reason,
  jsonb_build_object('recalc_method','perfect_10_at_exact_level','sessions_considered', (select count(*) from game_sessions where student_id=g.student_id and game_type=g.game_type))
from public.game_level_progress g
where g.current_level != temp_recalc_level_for_migration(g.student_id, g.game_type)
on conflict (student_id, game_type) do nothing;

-- Apply corrections: set current and best to legitimate
update public.game_level_progress g
set
  current_level = c.new_level,
  best_level_reached = greatest(c.new_best, 1), -- ensure at least 1
  updated_at = now()
from public.game_level_corrections c
where c.student_id = g.student_id
  and c.game_type = g.game_type
  and g.current_level = c.old_level -- only if still at old (idempotent)
  and c.new_level != c.old_level;

-- Clean up temp function (optional, keep for audit)
-- drop function if exists temp_recalc_level_for_migration(bigint, text);

-- Log summary
do $$
declare v_corrupted int; v_total int;
begin
  select count(*) into v_corrupted from public.game_level_corrections;
  select count(*) into v_total from public.game_level_progress;
  raise log 'game_level_correction: corrected % of % rows', v_corrupted, v_total;
end $$;

comment on table public.game_level_corrections is 'P0 forensic audit of inflated game levels; each row is one (student,game) correction from old to new, idempotent';
