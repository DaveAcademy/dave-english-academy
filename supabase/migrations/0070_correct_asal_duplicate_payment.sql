-- Data correction, same pattern as migration 0064 (Malika): a reversal
-- transaction, never a delete/edit of the original row - preserve history.
--
-- Asal (student id 37) has two payment_transactions rows: id 69
-- (migration, 250,000, paid_at 2026-07-27, covers Jul1-Aug1 - the real
-- July payment) and id 108 (manual, 250,000, paid_at 2026-08-01 13:39:27 -
-- a real "Record payment" submission through the app, not a backfill
-- artifact, but confirmed with the user (2026-08-02) to be wrong: Asal
-- actually paid until 14 August, i.e. exactly one period, not two. Cause
-- of the duplicate manual entry not established - could be a genuine
-- double-submit or recorded against the wrong student - only that the
-- business fact is one payment, confirmed 100% by the user.
--
-- Reversed via a negative 'correction' row rather than deleting id 108, so
-- the fact that a (mistaken) payment was recorded and later reversed
-- stays visible in her timeline instead of silently disappearing.

-- Guarded on student existence so this migration is a safe no-op when
-- student id 37 doesn't exist (e.g. a fresh database) rather than failing
-- the FK constraint, same pattern as migration 0060.
insert into public.payment_transactions
  (student_id, amount, transaction_type, payment_method, covers_period_start, covers_period_end, paid_at, notes)
select 37, -250000, 'correction', null, null, null, now(),
   'Reversal of duplicate manual payment (id 108, 2026-08-01) - confirmed with admin: Asal paid until 14 August only, one period, not two.'
where exists (select 1 from public.students where id = 37);
