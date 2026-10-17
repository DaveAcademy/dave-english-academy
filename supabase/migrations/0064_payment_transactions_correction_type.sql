-- Adds 'correction' as a transaction_type, with amount allowed to be
-- negative ONLY for that type - every other type stays strictly
-- money-in-only, exactly as designed in 0054 ("A future discount/refund
-- type will need signed amounts... a deliberate decision for whenever
-- that type is actually added, not something to guess at here"). That
-- moment is now.
--
-- Immediate cause: Malika's August payment_transactions row (id 28) was
-- correctly backfilled by 0057 when the legacy payments table said
-- paid=true for August - but that legacy row was toggled back to false
-- sometime after the backfill ran (both systems were intentionally kept
-- running in parallel; this is the one drift case that produced - the
-- legacy grid and the new ledger disagreeing because an edit landed after
-- the one-time backfill snapshot). Confirmed with the user: August
-- genuinely wasn't paid. Audited the full roster for the same pattern
-- (backfilled transaction whose legacy payments row is now paid=false) -
-- Malika is the only one affected.
--
-- Fixed via a reversal transaction (negative amount, type='correction'),
-- not a delete or edit of the original row - same principle as every
-- other data-quality issue handled this session: preserve history, never
-- silently rewrite it.

alter table public.payment_transactions drop constraint payment_transactions_amount_check;
alter table public.payment_transactions add constraint payment_transactions_amount_check
  check (amount > 0 or transaction_type = 'correction');

alter table public.payment_transactions drop constraint payment_transactions_transaction_type_check;
alter table public.payment_transactions add constraint payment_transactions_transaction_type_check
  check (transaction_type in ('first_partial', 'monthly', 'advance', 'extra', 'correction'));
