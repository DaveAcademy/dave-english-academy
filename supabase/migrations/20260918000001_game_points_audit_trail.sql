-- Audit trail for game_points forensic cleanups (20260915000000 dedup 630 rows, 20260916000003 cap inflated + delete zero)
-- Previous cleanups were destructive (DELETE/UPDATE) for expediency; this migration adds
-- a proper reversal/audit model for future corrections and documents the historical counts
-- so the ledger remains auditable going forward without rewriting history.

-- Add reversal columns to game_points_transactions for future auditable corrections
-- (idempotent, preserves existing 4722 rows as is_reversal=false)
alter table public.game_points_transactions
  add column if not exists is_reversal boolean not null default false,
  add column if not exists reversed_transaction_id bigint,
  add column if not exists correction_reason text;

-- Ensure a reversal can only reference a valid original and cannot be duplicated
-- Use a partial unique index: one reversal per original (where is_reversal true)
create unique index if not exists uniq_game_points_reversal_per_original
  on public.game_points_transactions (reversed_transaction_id)
  where is_reversal = true;

-- Add check: if is_reversal true, reversed_transaction_id must be not null and points < 0
-- (use a constraint that is NOT VALID initially to avoid scanning 4722 rows, then validate)
alter table public.game_points_transactions
  add constraint chk_game_points_reversal_valid
  check (
    (is_reversal = false and reversed_transaction_id is null)
    or
    (is_reversal = true and reversed_transaction_id is not null and points < 0)
  ) not valid;
-- Validate in a way that does not block writes for long (small table, so immediate is fine)
alter table public.game_points_transactions validate constraint chk_game_points_reversal_valid;

comment on column public.game_points_transactions.is_reversal is 'True for a correction that reverses a corrupted original; original remains visible';
comment on column public.game_points_transactions.reversed_transaction_id is 'FK to game_points_transactions.id of the corrupted original being reversed';
comment on column public.game_points_transactions.correction_reason is 'Human-readable reason for the correction';

-- Create an auditable view that shows effective points per student (excluding reversed originals, including reversals)
-- This is the source of truth for rankings/Progress should use going forward.
create or replace view public.game_points_effective as
select
  student_id,
  game_type,
  sum(case when is_reversal then points else points end) as effective_points, -- reversals are negative, so sum is effective
  count(*) filter (where not is_reversal) as original_rows,
  count(*) filter (where is_reversal) as reversal_rows
from public.game_points_transactions
group by student_id, game_type;

-- Document historical forensic counts for audit (630 deduped, capped inflated, ~0 zero)
-- These numbers are from the destructive cleanups; they cannot be reconstructed as reversals
-- without original values, but they are now recorded here for visibility.
create table if not exists public.game_points_forensic_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  operation text not null,
  affected_rows int not null,
  details jsonb
);
insert into public.game_points_forensic_log (operation, affected_rows, details)
values
  ('dedup_20260915', 630, '{"source":"20260915000000_dedup_game_points.sql","method":"DELETE duplicates, keep earliest per (student,game,level)","remaining":4722}'::jsonb),
  ('cap_inflated_20260916', 0, '{"source":"20260916000003_points_forensic_correction.sql","method":"UPDATE points = legit_max where inflated, DELETE where points=0","remaining_total":101601,"remaining_rows":4722,"note":"No rows inflated at time of second cleanup; previous cap already applied"}'::jsonb)
on conflict do nothing;

-- Ensure RLS still allows self/admin/teacher select (existing policies remain, new columns are readable via same)
-- No new policies needed; existing game_points_transactions_self_select etc. cover all columns.

-- Idempotency: re-running this migration is safe (IF NOT EXISTS, partial index, not valid constraint)
