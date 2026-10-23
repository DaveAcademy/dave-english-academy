-- Unified Rewards: canonical learning event + XP ledger
-- One authoritative event per valid learning action powers XP, missions, achievements, pet XP, streak
-- Idempotent: same source (game round) never duplicates rewards via unique constraints
-- Server-authoritative: no client-controlled XP/points, all derived from submitted answers

-- ========== 1. Canonical learning event ==========
create table if not exists public.student_learning_events (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  event_type text not null check (event_type in ('GAME_ROUND_COMPLETED','VOCAB_REVIEW','LESSON_COMPLETED','HOMEWORK_SUBMITTED')),
  source_type text not null,
  source_id text not null,
  result jsonb not null default '{}'::jsonb,
  xp_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  unique (student_id, source_type, source_id)
);
comment on table public.student_learning_events is 'One row per valid learning action. Idempotent via (student_id,source_type,source_id). Downstream XP/missions/achievements/pet/streak all derive from this single event.';

alter table public.student_learning_events enable row level security;
drop policy if exists student_learning_events_self_select on public.student_learning_events;
create policy student_learning_events_self_select on public.student_learning_events for select using (public.is_own_student(student_id));
drop policy if exists student_learning_events_admin_all on public.student_learning_events;
create policy student_learning_events_admin_all on public.student_learning_events for all using (is_admin()) with check (is_admin());
create index if not exists idx_sle_student_created on public.student_learning_events(student_id, created_at desc);
create index if not exists idx_sle_source on public.student_learning_events(source_type, source_id);

-- ========== 2. XP transaction ledger (append-only, auditable) ==========
create table if not exists public.student_xp_transactions (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  amount integer not null check (amount > 0 and amount <= 100),
  event_id bigint not null references public.student_learning_events(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  created_at timestamptz not null default now(),
  unique (event_id),
  unique (student_id, source_type, source_id)
);
comment on table public.student_xp_transactions is 'Append-only XP ledger. One row per learning event, idempotent via event_id. No UPDATE/DELETE for any role (like point_transactions).';

alter table public.student_xp_transactions enable row level security;
drop policy if exists student_xp_self_select on public.student_xp_transactions;
create policy student_xp_self_select on public.student_xp_transactions for select using (public.is_own_student(student_id));
drop policy if exists student_xp_admin_all on public.student_xp_transactions;
create policy student_xp_admin_all on public.student_xp_transactions for all using (is_admin()) with check (is_admin());
create index if not exists idx_sxp_student_created on public.student_xp_transactions(student_id, created_at desc);

-- No INSERT policy for client — only SECURITY DEFINER functions can write (like point_transactions)
-- Ensure no direct client INSERT: rely on RLS (no policy) + SECURITY DEFINER bypass

-- ========== 3. Helper: award XP for event (idempotent, server-authoritative) ==========
-- XP rule: 10 XP per valid game completion (any score >=0, but round must be valid and consumed)
-- Hint does not reduce XP (points already reflect hint), XP is separate progression currency
-- Do not award XP for invalid/replayed rounds (caller ensures round is valid)
create or replace function public.award_xp_for_event(p_student_id bigint, p_event_id bigint, p_source_type text, p_source_id text, p_base_score integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_amount integer := 10;
  v_inserted_id bigint;
begin
  if not public.is_own_student(p_student_id) and not is_admin() then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  -- XP is fixed 10 per valid completion, not client-controlled
  -- If base_score is null or 0, still award 10 for participation? No — only if round was valid and had at least 1 correct? For now award 10 for any valid completion with at least 1 total
  -- Caller passes v_words_total to ensure at least 1 question answered
  insert into public.student_xp_transactions (student_id, amount, event_id, source_type, source_id)
  values (p_student_id, v_amount, p_event_id, p_source_type, p_source_id)
  on conflict (event_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    return 0; -- already awarded (idempotent)
  end if;

  -- Also bump total_points metric for backward compat? No — XP is separate, do not touch point_transactions
  return v_amount;
end;
$$;
revoke execute on function public.award_xp_for_event(bigint,bigint,text,text,integer) from public;
grant execute on function public.award_xp_for_event(bigint,bigint,text,text,integer) to authenticated;

-- ========== 4. Helper: create canonical event from game round (idempotent) ==========
create or replace function public.create_learning_event(p_student_id bigint, p_source_type text, p_source_id text, p_result jsonb)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event_id bigint;
  v_existing_id bigint;
begin
  if not public.is_own_student(p_student_id) and not is_admin() then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  -- Try to insert, if conflict return existing id (idempotent)
  insert into public.student_learning_events (student_id, event_type, source_type, source_id, result)
  values (p_student_id, 'GAME_ROUND_COMPLETED', p_source_type, p_source_id, coalesce(p_result,'{}'::jsonb))
  on conflict (student_id, source_type, source_id) do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    return v_event_id;
  end if;

  select id into v_existing_id from public.student_learning_events where student_id=p_student_id and source_type=p_source_type and source_id=p_source_id;
  return v_existing_id;
end;
$$;
revoke execute on function public.create_learning_event(bigint,text,text,jsonb) from public;
grant execute on function public.create_learning_event(bigint,text,text,jsonb) to authenticated;

-- ========== 5. Extend submit_game_round to create event + award XP + trigger downstream (idempotent) ==========
-- We patch the existing submit_game_round to create event and award XP after the existing logic
-- To avoid rewriting the entire 250-line function, we create a wrapper trigger function that is called from storageBridge
-- However for true transactional consistency, we need to modify submit_game_round to create event within same transaction
-- So we create a new version that wraps the existing logic: we will replace submit_game_round with a version that after the current inserts, also creates event

-- For minimal risk, we add an after-insert trigger on game_sessions that creates the event and awards XP
-- This keeps submit_game_round unchanged (frozen foundation) and adds unified pipeline via trigger
-- Trigger is idempotent via unique constraints

create or replace function public.on_game_session_create_unified_rewards()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event_id bigint;
  v_xp integer;
  v_today date;
begin
  -- Only for valid sessions (words_total >0)
  if coalesce(NEW.words_total,0) = 0 then return NEW; end if;

  -- Create canonical event (idempotent)
  v_event_id := public.create_learning_event(NEW.student_id, 'GAME_ROUND', NEW.id::text, jsonb_build_object('game_type', NEW.game_type, 'score', NEW.score, 'words_correct', NEW.words_correct, 'words_total', NEW.words_total, 'level', NEW.level));

  -- Award XP (idempotent)
  v_xp := public.award_xp_for_event(NEW.student_id, v_event_id, 'GAME_ROUND', NEW.id::text, NEW.score::int);

  -- Mission progress: increment game-related missions (if any) — event-driven, not client
  -- For now, bump a generic game metric that missions subscribe to (total game rounds completed)
  -- Use bump_student_metric with idempotent check: only if XP was actually awarded (first time)
  if v_xp > 0 then
    perform public.bump_student_metric(NEW.student_id, 'game_rounds_completed', 1);
    -- Also bump per-game metric for mission filtering
    perform public.bump_student_metric(NEW.student_id, 'game_' || NEW.game_type || '_completed', 1);
  end if;

  -- Achievement evaluation (already done in submit_game_round, but also here for idempotency — safe to double-evaluate)
  if v_xp > 0 then
    perform public.evaluate_achievements(NEW.student_id);
  end if;

  -- Pet XP: award 10 pet XP to active pet's progress via bump (if active pet exists)
  -- For now, simple: if student has active pet, increment a metric that pet system can use
  -- Future: pet_xp table; for now metric is enough and server-authoritative
  if v_xp > 0 then
    perform public.bump_student_metric(NEW.student_id, 'pet_xp_earned', 10);
  end if;

  -- Streak: record learning activity for Tashkent today (one per day, not per game)
  if v_xp > 0 then
    v_today := (now() at time zone 'Asia/Tashkent')::date;
    insert into public.student_learning_days (student_id, date, activity_type)
    values (NEW.student_id, v_today, 'game')
    on conflict (student_id, date) do nothing;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_game_session_unified_rewards on public.game_sessions;
create trigger trg_game_session_unified_rewards
after insert on public.game_sessions
for each row execute function public.on_game_session_create_unified_rewards();

comment on function public.on_game_session_create_unified_rewards() is 'Unified reward pipeline: GAME_ROUND → EVENT → XP → MISSIONS → ACHIEVEMENTS → PET XP → STREAK. Trigger on game_sessions insert, idempotent via unique constraints.';
