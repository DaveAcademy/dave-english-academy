-- Corrects a mistake in migration 0073. Reversal id 121 (from 0073)
-- treated Albina's 2026-08-01 manual payment (id 110, 200,000) as test
-- data, grouped in with the other same-session entries purely on
-- timestamp-clustering evidence. The user confirmed (2026-08-02) that
-- Albina's payment was real - she genuinely paid, "until 13 August" was
-- correct. Never edit/delete the mistaken correction row (id 121) either -
-- add a new one that cancels it out, same append-only principle as every
-- other correction this session.

insert into public.payment_transactions
  (student_id, amount, transaction_type, payment_method, covers_period_start, covers_period_end, paid_at, notes)
values
  (18, 200000, 'correction', null, null, null, now(),
   'Undoes the mistaken reversal in migration 0073 (correction id 121) - confirmed with admin: Albina''s 2026-08-01 payment (id 110) was real, not test data.');
