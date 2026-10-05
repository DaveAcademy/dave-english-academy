-- Ranking Model V3, unblocked components (see
-- docs/ranking-model-v3-investigation-2026-08-18.md §11): PDF Preparation
-- and Homework now contribute to Class Score through the existing
-- point_transactions ledger. No new ledger, no parallel scoring table.
--
-- 1. 'prep' point category (PDF Preparation), same seed pattern as 0018.
--    'homework' already exists from 0018 - nothing to add there.
-- 2. homework_status gets a points_awarded claim-guard column (production
--    already carries points_transaction_id from the old, since-disabled
--    0121 auto-award trigger below - only points_awarded is new here).
--    Same shape/intent as lesson_work_submissions' pair from 0104: the
--    atomic "UPDATE ... WHERE points_awarded IS NULL" a caller does before
--    inserting the ledger row is what prevents the same homework grading
--    finalization from ever awarding points twice (re-grading a score,
--    re-saving feedback, network retry). points_transaction_id stays a
--    display-only cache of the resulting point_transactions.id; the
--    ledger row itself remains the sole source of truth for totals.
-- 3. The 0162 duplicate-award guard is extended to also cover the new
--    'prep' category_key, matching the same 120s client+server dedup
--    already in place for 'bonus'/'penalty'. 'homework' is deliberately
--    NOT added here - it already gets a stronger, unconditional guarantee
--    from the points_awarded claim above, so this window-based guard
--    (which allows the *same* value to legitimately recur, e.g. two
--    different students both scoring 10) is not needed there.
-- 4. Live schema inspection (2026-08-18) found a DISABLED trigger,
--    `homework_status_award_points` / `award_homework_submission_points()`
--    (from the untracked prod-only migration `0121_homework_submission_points`,
--    2026-08-12, disabled 2026-08-15 alongside the broader "pause automatic
--    point awards" decision - see 0135/PROD_RECONCILED_*). It auto-awarded a
--    flat 10 'homework' points on status='Submitted' (not on grading, and
--    ignoring the actual score) and wrote the SAME points_transaction_id
--    column the new claim-guard mechanism relies on. It is dropped here,
--    not just left disabled: if it were ever re-enabled by mistake it would
--    silently double-award (it does not check points_awarded at all) every
--    time a homework grading flow in this migration's design also fires -
--    the two mechanisms are incompatible, and Dave's approved model ties
--    homework points to the 0-10 graded score, not to submission. The 4
--    existing 'homework' point_transactions rows (+20 points total, no
--    reversals) it already created are real historical data and are left
--    untouched, per the standing rule against altering historical ledger
--    rows; the backfill below only marks their homework_status rows as
--    already-claimed so the new grading path can never award them again.

drop trigger if exists homework_status_award_points on public.homework_status;
drop function if exists public.award_homework_submission_points();

insert into public.point_categories (key, name, icon, default_points, sort_order) values
  ('prep', 'PDF Preparation', '📄', 5, 11)
on conflict (key) do nothing;

alter table public.homework_status
  add column if not exists points_awarded integer,
  add column if not exists points_transaction_id bigint references public.point_transactions (id);

-- Backfill: any homework_status row already carrying a points_transaction_id
-- (from the dropped trigger above, or any other prior path) is already
-- awarded - claim it under the new guard too, so the grading UI never
-- re-awards it.
update public.homework_status hs
set points_awarded = pt.points
from public.point_transactions pt
where hs.points_transaction_id = pt.id
  and hs.points_awarded is null;

create or replace function public.prevent_duplicate_point_transaction()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.category_key in ('bonus', 'penalty', 'prep')
     and not new.is_reversal
     and not new.is_baseline
     and exists (
       select 1
       from public.point_transactions pt
       where pt.student_id = new.student_id
         and pt.category_key = new.category_key
         and pt.points = new.points
         and pt.reason is not distinct from new.reason
         and pt.awarded_by is not distinct from new.awarded_by
         and not pt.is_reversal
         and not pt.is_baseline
         and pt.created_at > now() - interval '120 seconds'
     )
  then
    raise exception 'Duplicate point award: an identical award for this student was already recorded in the last 2 minutes.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.prevent_duplicate_point_transaction() from public;
