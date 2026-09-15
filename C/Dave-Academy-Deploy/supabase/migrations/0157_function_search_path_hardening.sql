-- 0157_function_search_path_hardening.sql
-- Supabase security advisor: "Function Search Path Mutable" (WARN) flagged
-- 8 functions with no search_path pinned. None are SECURITY DEFINER, but an
-- unpinned search_path still lets a caller-controlled search_path shadow
-- unqualified identifiers (is_admin() in the three admin-report functions
-- below) with an object from another schema. All 8 bodies already
-- schema-qualify their own table references with `public.`, so pinning
-- search_path is a pure hardening no-op for current behavior.
-- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

alter function public.game_level_to_length_cap(integer) set search_path = public, pg_temp;
alter function public.game_level_to_tier(integer) set search_path = public, pg_temp;
alter function public.game_tier_bonus(text) set search_path = public, pg_temp;
alter function public.month_bounds(date) set search_path = public, pg_temp;
alter function public.week_bounds(date) set search_path = public, pg_temp;
alter function public.get_activity_feed(integer) set search_path = public, pg_temp;
alter function public.get_monthly_payment_collection(integer, integer) set search_path = public, pg_temp;
alter function public.get_payment_collection_summary(date, date) set search_path = public, pg_temp;
