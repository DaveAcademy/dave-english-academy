-- Lock search_dictionary_unified() down to authenticated callers.
--
-- 0183 created this function without the revoke/grant pairs that every
-- other RPC migration in this project applies, so it kept Postgres'
-- default PUBLIC EXECUTE grant and has been callable by anon clients
-- since it reached production (applied out-of-band ~2026-08-21; see
-- DATABASE.md §7). The function is read-only over curriculum vocabulary
-- and dictionary_entries, so the exposure was low-sensitivity, but the
-- house convention is authenticated-only EXECUTE - align with it here.
--
-- No function body, signature, table, or policy changes. Written
-- 2026-08-23; NOT yet applied to production.

revoke execute on function public.search_dictionary_unified(text, integer) from public;
grant execute on function public.search_dictionary_unified(text, integer) to authenticated;
