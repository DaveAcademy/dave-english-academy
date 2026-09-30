-- Data correction only - no reporting logic, RPC, or student-status
-- calculation touched. Confirmed with the user (2026-08-02): the 11
-- manual payment_transactions rows dated 2026-08-01 were not received in
-- August. The "Record payment" form has no date field (recordPayment()
-- always defaults paid_at to now() at insert time - a genuine product
-- gap, not a data bug on its own), so paid_at for these rows only ever
-- recorded when they were entered, not when the cash was actually
-- collected. The real collection date isn't captured anywhere in the
-- system; per the user, they were July payments. No exact day is known,
-- so (same convention as migration 0078's backfill fix) the 1st of July
-- is used as the best available placeholder, not a fabricated precise
-- date.
--
-- Excludes id 28 (Malika, migration, covers Aug1-Sep1) deliberately - it
-- is already paired with correction id 109 (a prior session's fix,
-- unrelated to today, confirmed then that the August advance was never
-- actually completed) and the pair already nets to exactly 0. Moving
-- id 28 alone without its pair would create a phantom -250,000 in August
-- and +250,000 in July. Left untouched; contributes 0 to either month.
--
-- covers_period_start/end are untouched on every row (all null already
-- for these manual entries) - this only changes when the money arrived,
-- never which period it's for.

update public.payment_transactions
set paid_at = '2026-07-01T00:00:00Z'
where id in (108, 110, 111, 112, 113, 114, 115, 116, 117, 118);

-- Test Student (id 107, 2,000) excluded from revenue entirely - confirmed
-- not a real student payment. Already has a reversal/undo pair (id 120,
-- id 131) from earlier today's churn netting back to +2,000; adding one
-- more reversal nets the whole chain to 0, preserving history rather
-- than deleting any of the three rows.
insert into public.payment_transactions
  (student_id, amount, transaction_type, payment_method, covers_period_start, covers_period_end, paid_at, notes)
select pt.student_id, -pt.amount, 'correction', null, null, null, now(),
  'Excludes Test Student payment (id 107) from revenue - confirmed with admin: not a real student payment.'
from public.payment_transactions pt
where pt.id = 107;
