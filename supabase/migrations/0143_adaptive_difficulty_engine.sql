-- Adaptive difficulty engine: the shared tier-selection function used by
-- 0145's three get_*_round() functions. This migration is additive: it
-- creates one new function and two new nullable columns.
--
-- Five-stage scale (matches the 0144 game_content_bank.difficulty domain
-- exactly: very_easy/easy/medium/hard/very_hard). Originally drafted as a
-- 3-tier easy/medium/hard scale before 0144 settled on five cognitive-
-- complexity stages; widened here to the 0-4 range so its output vocabulary
-- matches what 0145's callers and game_content_bank actually use.
--
-- Algorithm (validated against 6 controlled scenarios in a standalone JS
-- harness before being ported here - see session notes):
--   - Reads the student's last 5 game_sessions rows for (student, game_type),
--     recency-weighted (most recent round weighted most heavily).
--   - Weighted accuracy mapped to a target tier via the agreed bands
--     (90-100 up, 75-89 up only on 2 consecutive strong rounds else hold,
--     50-74 hold, 25-49 down, 0-24 down).
--   - Movement clamped to at most one tier per round (never skip a stage)
--     - this is what prevents a single bad round from collapsing difficulty
--     and a single good round from jumping straight to very_hard.
--   - No history yet: falls back to a conservative floor by academy level
--     (A/B -> easy, C -> medium) rather than assuming ability.
--
-- Schema note: the one-tier-per-round clamp requires knowing what tier the
-- *previous* round was played at. Two nullable columns close that gap - not
-- a new table, no behavior change to any existing row (both default to null
-- and are ignored by every existing query). Neither column is currently
-- written by submit_game_round (out of scope for this migration - see
-- session notes), so v_prev_tier falls back to the level floor every round
-- until that write path is added in a later session.
alter table public.game_rounds
  add column if not exists difficulty text check (difficulty in ('very_easy', 'easy', 'medium', 'hard', 'very_hard'));

alter table public.game_sessions
  add column if not exists difficulty text check (difficulty in ('very_easy', 'easy', 'medium', 'hard', 'very_hard'));

-- Pure-ish decision function: given a student and game_type, returns the
-- difficulty tier the NEXT round should use. Server-side only (security
-- definer, never exposed for a client to pass a tier in) - this is what
-- prevents a client from ever claiming "give me hard mode" directly; tier
-- selection is entirely a function of that student's own recorded history.
create or replace function public.adaptive_difficulty_tier(p_student_id bigint, p_game_type text)
returns text
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_level text;
  v_current int; -- 0=very_easy, 1=easy, 2=medium, 3=hard, 4=very_hard
  v_prev_tier text;
  v_weighted_acc numeric;
  v_target int;
  v_next int;
  v_last_two_strong boolean;
  v_weights numeric[] := array[0.35, 0.25, 0.20, 0.12, 0.08];
  v_acc numeric := 0;
  v_wsum numeric := 0;
  r record;
  i int := 0;
  v_accs numeric[] := '{}';
begin
  select level into v_level from public.students where id = p_student_id;

  -- Most recent 5 sessions for this game, most-recent-first.
  for r in
    select words_correct, words_total, difficulty
    from public.game_sessions
    where student_id = p_student_id and game_type = p_game_type
    order by played_at desc
    limit 5
  loop
    i := i + 1;
    v_accs := array_append(v_accs, case when r.words_total > 0 then r.words_correct::numeric / r.words_total else 0 end);
    if i = 1 then
      v_prev_tier := r.difficulty;
    end if;
  end loop;

  -- No history: conservative level floor. A and B both start at easy
  -- (never assume ability without evidence); C starts at medium. Every
  -- starter still reaches very_easy or very_hard via the normal one-tier-
  -- per-round promotion/demotion rule below once it has evidence to act on.
  if array_length(v_accs, 1) is null then
    return case when v_level = 'C' then 'medium' else 'easy' end;
  end if;

  v_current := case coalesce(v_prev_tier, case when v_level = 'C' then 'medium' else 'easy' end)
    when 'very_easy' then 0 when 'easy' then 1 when 'medium' then 2 when 'hard' then 3 else 4 end;

  for i in 1..array_length(v_accs, 1) loop
    v_acc := v_acc + v_weights[i] * v_accs[i];
    v_wsum := v_wsum + v_weights[i];
  end loop;
  v_weighted_acc := (v_acc / v_wsum) * 100;

  v_last_two_strong := array_length(v_accs, 1) >= 2 and v_accs[1] >= 0.75 and v_accs[2] >= 0.75;

  v_target := case
    when v_weighted_acc >= 90 then v_current + 1
    when v_weighted_acc >= 75 then case when v_last_two_strong then v_current + 1 else v_current end
    when v_weighted_acc >= 50 then v_current
    else v_current - 1
  end;

  -- One-tier-per-round clamp, then clamp to the valid [0,4] range.
  v_next := greatest(v_current - 1, least(v_current + 1, v_target));
  v_next := greatest(0, least(4, v_next));

  return case v_next
    when 0 then 'very_easy' when 1 then 'easy' when 2 then 'medium' when 3 then 'hard' else 'very_hard'
  end;
end;
$$;

revoke execute on function public.adaptive_difficulty_tier(bigint, text) from public;
-- Deliberately NOT granted to authenticated yet - only SECURITY DEFINER
-- callers (the get_*_round() functions, in Phase 2) need to invoke this;
-- there is no legitimate reason for a client to call it directly.
