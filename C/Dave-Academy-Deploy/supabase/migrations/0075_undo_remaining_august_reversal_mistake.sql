-- Corrects the rest of migration 0073's mistake. Same story as migration
-- 0074 (Albina): the user confirmed (2026-08-02) that ALL ten payments
-- reversed in 0073 were real, not test data - the timestamp-clustering
-- evidence used to group them was wrong. This undoes the remaining nine
-- reversals (correction ids 120, 122-129); Albina's (id 121) was already
-- undone in 0074.
--
-- Same append-only principle: adds a new correction canceling each
-- mistaken reversal, never edits/deletes the original rows or the
-- mistaken corrections themselves.

insert into public.payment_transactions
  (student_id, amount, transaction_type, payment_method, covers_period_start, covers_period_end, paid_at, notes)
select
  pt.student_id,
  -pt.amount, -- pt.amount is already negative (it's the mistaken reversal); negating it restores the original payment
  'correction',
  null,
  null,
  null,
  now(),
  'Undoes the mistaken reversal in migration 0073 (correction id ' || pt.id || ') - confirmed with admin: this was a real payment, not test data.'
from public.payment_transactions pt
where pt.id in (120, 122, 123, 124, 125, 126, 127, 128, 129);
