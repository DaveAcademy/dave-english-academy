-- Corrects an error in migration 0079. That migration moved id 108
-- (Asal's manual duplicate payment) to July along with the 9 genuinely
-- distinct July payments, but left its reversal (id 119, already
-- confirmed and applied earlier) in August - breaking that pairing the
-- same way migration 0079's own commentary warned against doing to
-- Malika's migration/correction pair (id 28 / id 109).
--
-- id 108 was never a real, distinct payment - it's fully void (exactly
-- cancelled by id 119, both amount 250,000). It should never have been
-- in the "move to July" batch; it belongs wherever its pairing
-- correction is, contributing net 0 to whichever month that is. Reverted
-- to its original paid_at (2026-08-01 13:39:27, matching id 119's
-- 2026-08-02 - both now sit in August, net 0, same as the Malika pair).

update public.payment_transactions
set paid_at = '2026-08-01T13:39:27.083Z'
where id = 108;
