-- Payment system redesign, step 3 of N: backfill history from the legacy
-- boolean table into the new ledger. public.payments is left completely
-- untouched (still the compatibility layer) - this only inserts into
-- public.payment_transactions.
--
-- Known, accepted limitations (documented at design time, not discovered
-- here):
--   - public.payments never recorded an amount, only paid/unpaid. Every
--     backfilled row uses the student's CURRENT monthly_fee as its amount.
--     If a fee changed since a given historical month, that row is
--     approximate. Preview query (run before this migration) found 81
--     rows / ~17,900,000 so'm at current fees.
--   - transaction_type is 'monthly' for every backfilled row - the old
--     table has no way to tell a genuinely prorated first payment apart
--     from a regular one, so we don't guess.
--   - covers_period_start/end use plain calendar-month boundaries
--     (year/month from the old row), not payment_deadline-anchored
--     billing periods - the old system never tracked billing-cycle
--     anchoring, so there's nothing truer to backfill. This is cosmetic
--     only: get_student_payment_status() sums payment_transactions.amount
--     directly and does not match transactions to specific periods, so
--     these fields don't affect any derived balance/status calculation,
--     only the payment-timeline display.
--   - created_by is left null for every backfilled row (nullable exactly
--     for this reason, see 0054) - the old table never recorded who
--     toggled the flag.
--
-- monthly_fee = 0 rows are excluded outright, not backfilled as $0
-- transactions: payment_transactions.amount has a `> 0` check constraint
-- (0054, deliberate - every supported transaction_type represents real
-- money in). One student in production matches this today (id 44, "Test
-- Student", 2 paid months) - looks like leftover test data rather than a
-- real fee-waived enrollment, but this migration doesn't guess; it skips
-- and leaves it for manual follow-up rather than silently inventing a
-- workaround for a constraint that's doing its job.
--
-- Idempotent: the notes marker below identifies rows this migration
-- already inserted, so re-running it is a no-op.

insert into public.payment_transactions
  (student_id, amount, transaction_type, payment_method, covers_period_start, covers_period_end, paid_at, notes)
select
  p.student_id,
  s.monthly_fee,
  'monthly',
  null,
  make_date(p.year, p.month, 1),
  (make_date(p.year, p.month, 1) + interval '1 month')::date,
  p.paid_date::timestamptz,
  'Backfilled from legacy payments table (migration 0057)'
from public.payments p
join public.students s on s.id = p.student_id
where p.paid = true
  and s.monthly_fee > 0
  and not exists (
    select 1 from public.payment_transactions pt
    where pt.student_id = p.student_id
      and pt.covers_period_start = make_date(p.year, p.month, 1)
      and pt.notes = 'Backfilled from legacy payments table (migration 0057)'
  );
