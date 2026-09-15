-- Distinguishes ledger rows created by the 0057 backfill from rows entered
-- through the new payment-recording flow going forward. Purpose: nobody
-- should treat migration-bridge data (see 0057's comments - old payments
-- never recorded an amount, and 22 students have pre-join-date "paid"
-- months in the legacy table) with the same confidence as a transaction
-- someone actually recorded through the new system.
--
-- Default 'manual' so every future insert is correctly classified without
-- the frontend needing to know this column exists yet.

alter table public.payment_transactions
  add column if not exists source text not null default 'manual' check (source in ('migration', 'manual'));

update public.payment_transactions
  set source = 'migration'
  where notes = 'Backfilled from legacy payments table (migration 0057)'
    and source <> 'migration';
