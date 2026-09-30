-- Fixes two issues the security advisor caught in 0055, before any
-- frontend code depends on these functions.
--
-- 1. next_billing_date/billing_periods/calculate_first_payment were
--    missing `set search_path`, unlike every other function in this
--    schema (is_admin(), is_own_student(), etc.) - a mutable search_path
--    lets a caller influence which objects an unqualified reference
--    resolves to. None of these three actually reference unqualified
--    objects today, but there's no reason to be the one function in the
--    codebase that skips this.
--
-- 2. get_student_payment_status (and the three helpers) were reachable by
--    the `anon` role via PostgREST RPC. Supabase projects grant EXECUTE on
--    new public-schema functions to anon/authenticated by default at
--    creation time - revoking from the `public` pseudo-role (done in 0055)
--    does not remove that direct grant. Functionally this was already
--    safe: get_student_payment_status's own `is_admin() or
--    is_own_student()` check rejects a caller with no session (auth.uid()
--    is null for anon, so both are false) - but there's no reason for a
--    money-related endpoint to be reachable pre-auth at all, so closing it
--    at the grant level too, not just inside the function body.

alter function public.next_billing_date(date, integer) set search_path = 'public';
alter function public.billing_periods(date, integer, date, integer) set search_path = 'public';
alter function public.calculate_first_payment(date, integer, numeric) set search_path = 'public';

revoke execute on function public.next_billing_date(date, integer) from anon;
revoke execute on function public.billing_periods(date, integer, date, integer) from anon;
revoke execute on function public.calculate_first_payment(date, integer, numeric) from anon;
revoke execute on function public.get_student_payment_status(bigint) from anon;
