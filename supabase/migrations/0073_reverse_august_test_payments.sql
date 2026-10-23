-- Data correction, same pattern as migrations 0064/0070: reversal rows,
-- never edit/delete originals - preserve history.
--
-- Confirmed with the user (2026-08-02): no real payment has been made in
-- August yet. Ten manual payment_transactions rows (ids 107, 110-118),
-- all created by the same admin account within a ~4.5 hour window on
-- 2026-08-01 (13:31-18:06), for Test Student/Albina/Dilyora/Elshod A./
-- Farzona/Malika/Shahribonu/Shahzoda/Shaxruza (B)/Shodiyona, were test
-- activity from exercising the "Record payment" feature on the live app -
-- not real collections. (Asal's twin, id 108, was already reversed in
-- migration 0070.) Left uncorrected, they inflated August's cash-flow
-- collection figure by ~1.95M.
--
-- Reversed via one negative 'correction' row per original, referencing
-- the id it reverses in the note, rather than touching the original rows.

insert into public.payment_transactions
  (student_id, amount, transaction_type, payment_method, covers_period_start, covers_period_end, paid_at, notes)
select
  pt.student_id,
  -pt.amount,
  'correction',
  null,
  null,
  null,
  now(),
  'Reversal of test payment (id ' || pt.id || ', 2026-08-01) - confirmed with admin: no real payment was made in August yet.'
from public.payment_transactions pt
where pt.id in (107, 110, 111, 112, 113, 114, 115, 116, 117, 118);
