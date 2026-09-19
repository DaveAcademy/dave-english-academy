-- Payment Safety Audit (docs/PAYMENT-SAFETY-AUDIT-2026-08-19.md), finding
-- P-1: payment_transactions_admin_all (0054) is `FOR ALL`, which grants
-- admin UPDATE/DELETE on the ledger at the RLS layer even though no
-- application code path ever calls .update()/.delete() on this table
-- (storageBridge.js's recordPayment()/createCorrection() are insert-only -
-- confirmed by re-reading both this session). This contradicts the
-- ledger's own design principle (see 0064/0070/0073-0079: corrections are
-- always a new reversal row, never an edit) and the parallel table
-- point_transactions, which was deliberately built SELECT+INSERT-only
-- (0019: pt_admin_select / pt_admin_insert, no pt_admin_update/delete).
--
-- This migration makes payment_transactions match that same shape. No
-- write path in the app requires UPDATE or DELETE - confirmed by grepping
-- storageBridge.js and Payments.jsx for every payment_transactions call
-- site before writing this. If a genuine one-off correction to a
-- malformed row is ever needed, that goes through a manual, logged,
-- one-off SQL statement via the service role (which bypasses RLS by
-- construction, same as every other ledger table) - not standing
-- application-level permission.
--
-- Read access (admin full read, student self-read via is_own_student())
-- and insert access (admin only) are unchanged - this only removes what
-- was never supposed to be reachable in normal operation.

drop policy if exists payment_transactions_admin_all on public.payment_transactions;

create policy payment_transactions_admin_select on public.payment_transactions
  for select using (is_admin());

create policy payment_transactions_admin_insert on public.payment_transactions
  for insert with check (is_admin());

-- payment_transactions_self_read (0054) is untouched - still admin-shaped
-- SELECT for the owning student via is_own_student().
