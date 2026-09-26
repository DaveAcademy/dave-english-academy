-- Enable Class Score corrections without weakening the original duplicate
-- guard (Ranking Model V3, 0166), and close a race condition found during
-- architectural review of the correction-chain design.
--
-- ---------------------------------------------------------------------
-- Part 1: narrow the one-score-per-session index to exempt corrections.
-- ---------------------------------------------------------------------
-- 0166's unique index blocks ANY second category_key='class_score' row
-- for a (student, class_session) pair -- exactly right for catching an
-- accidental duplicate FRESH entry, but it also blocks the one
-- legitimate case that needs a second row: an explicit, reviewed
-- correction (e.g. Lisa 7 -> 9). point_transactions has no UPDATE or
-- DELETE policy for any role, admin included (0019, by design, for
-- audit-trail integrity), so a correction can only ever be recorded as a
-- new insert-only delta row: is_reversal = true, reversed_transaction_id
-- -> the transaction it corrects, points = the signed difference
-- (new - old). Today that insert is rejected outright by 0166.
--
-- Read-only audit before this migration (2026-08-19): 9 existing
-- class_score rows, all is_reversal = false, all reversed_transaction_id
-- IS NULL, one row per (student, class_session) exactly -- identical to
-- what the narrower index still requires, so creating it cannot fail
-- against current data.
--
-- Fix: narrow the index to cover only is_reversal = false rows. A fresh
-- (non-correction) class_score entry is still uniquely constrained per
-- (student, session) exactly as before -- this does not weaken that
-- protection at all, it only lets an explicitly-flagged correction row
-- coexist alongside the original it corrects. Ranking RPCs
-- (get_class/weekly/monthly_class_leaderboard, 0167) already
-- SUM(points) per (student, session, category_key='class_score') with no
-- is_reversal filter, so a correction's net effect is picked up
-- automatically -- no RPC change needed.
DROP INDEX IF EXISTS point_transactions_one_class_score_per_student_session;

CREATE UNIQUE INDEX IF NOT EXISTS point_transactions_one_class_score_per_student_session
  ON point_transactions (student_id, class_session_id)
  WHERE class_session_id IS NOT NULL AND category_key = 'class_score' AND is_reversal = false;

-- ---------------------------------------------------------------------
-- Part 2: validate the correction chain server-side.
-- ---------------------------------------------------------------------
-- The correction-chain model (app-level, ManualClassScoreEntry.jsx): each
-- correction's reversed_transaction_id references the transaction
-- representing the immediately previous EFFECTIVE score for that
-- (student, class_session) -- the original fresh row for a first
-- correction, or the prior correction row for every correction after
-- that. The client computes this as "the highest-id class_score row for
-- this student/session" at the moment it loaded the form.
--
-- That client-side computation is exactly the race this trigger closes:
-- if two corrections are submitted concurrently (two teachers/tabs both
-- load the same stale "current score" before either saves), both would
-- reference the same reversed_transaction_id and both would be accepted
-- by Part 1's index alone, silently producing a net total neither
-- teacher intended (the deltas both apply, but relative to a base that
-- no longer reflects reality by the time the second one lands). Without
-- this check, this is a silent-corruption bug, not a rejected write.
--
-- Guard: a class_score correction row is only accepted if the
-- transaction it references is still the CURRENT chain tip -- i.e. no
-- class_score row for the same (student, class_session) already has a
-- higher id. A stale correction is rejected outright (the second
-- teacher's insert fails and the UI must reload current values), rather
-- than silently applying against an outdated base. This also directly
-- answers "can a correction reference an already-reversed transaction
-- incorrectly?" (no -- rejected) and "can a correction be applied
-- twice?" (no -- the first one moves the chain tip, so a resubmit of the
-- same correction fails the same check).
create or replace function public.validate_class_score_correction()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.category_key = 'class_score' and new.is_reversal then
    if new.reversed_transaction_id is null then
      raise exception 'A Class Score correction must reference the transaction it corrects.' using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from point_transactions rt
      where rt.id = new.reversed_transaction_id
        and rt.student_id = new.student_id
        and rt.class_session_id = new.class_session_id
        and rt.category_key = 'class_score'
    ) then
      raise exception 'Referenced transaction does not match this student/session/category.' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from point_transactions pt
      where pt.student_id = new.student_id
        and pt.class_session_id = new.class_session_id
        and pt.category_key = 'class_score'
        and pt.id > new.reversed_transaction_id
    ) then
      raise exception 'This Class Score has already been corrected by a more recent transaction - reload and try again.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.validate_class_score_correction() from public;

drop trigger if exists point_transactions_validate_class_score_correction on public.point_transactions;
create trigger point_transactions_validate_class_score_correction
  before insert on public.point_transactions
  for each row execute function public.validate_class_score_correction();
