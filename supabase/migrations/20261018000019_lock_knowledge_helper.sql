-- Vocabulary Knowledge: lock the internal helper to service role.
--
-- 20261018000018 revoked anon/public on vocabulary_knowledge_for(bigint)
-- but Supabase default privileges still grant EXECUTE to authenticated,
-- so any signed-in student could call it with an arbitrary student id
-- and read another student's per-word evidence. The helper takes a raw
-- student id by design (the ranking loop needs it); only the three
-- public RPCs (self-scoped count/knowledge, level-filtered ranking) may
-- be callable by authenticated users. Service-role retains access for
-- server-side use. No function bodies, signatures, or grants besides
-- this one are touched.

revoke execute on function public.vocabulary_knowledge_for(bigint) from authenticated;
