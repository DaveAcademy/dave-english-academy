-- Payment system redesign, step 4 of N: mark public.payments as legacy now
-- that Payments.jsx, Dashboard.jsx, and Reports.jsx are all off it (see
-- migrations 0054-0065). Not made read-only - importAllData still needs to
-- INSERT into it to restore a backup, a real disaster-recovery need, not a
-- leftover consumer to migrate away. This migration only documents the
-- table so a future session doesn't reach for it by habit.

comment on table public.payments is
  'Legacy compatibility table, superseded by payment_transactions (migration 0054). '
  'Do not read or write this from application/business logic - source of truth for '
  'payment status is get_student_payment_status() / payment_transactions. Only '
  'legitimate consumer is backup export/restore (listLegacyPaymentsForBackup, '
  'exportAllData/importAllData in storageBridge.js).';
