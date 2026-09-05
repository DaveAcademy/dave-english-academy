-- RECONCILIATION ARTIFACT — DOCUMENTATION ONLY. NOT APPLIED VIA `supabase db push`.
-- Original prod migration: 20260815101344_0136_reverse_hanna_redundant_manual_level_transfer
-- (applied directly to project usqzcsoolkbuxyiiawmx, no local file existed).
-- Confidence: RECONSTRUCTED FROM RESULTING DATA STATE (near-exact — only 2 rows,
-- full literal values recovered), NOT the original migration source text itself.
--   Verified live rows (queried 2026-08-15):
--     id=1725  student_id=35  category_key='bonus'  points=-211
--              reversed_transaction_id=1450
--     id=1726  student_id=35  category_key='bonus'  points=-66
--              reversed_transaction_id=1442
--     both: reason = 'Reversal: redundant manual Level A -> A1 point transfer
--           removed (lifetime points now carry forward automatically since
--           the promotion policy update)'
--     both: created_at = 2026-08-15 10:13:44.969463+00
--   ("Hanna" per the prod migration name is presumed to be student_id=35's
--   real_name; not independently re-verified here to avoid an extra PII query.)

-- Reconstructed original INSERT (values match live rows exactly; only the
-- generated id/created_at/awarded_by of the ORIGINAL statement cannot be
-- reproduced verbatim since those are server-assigned):
INSERT INTO public.point_transactions
  (student_id, category_key, points, reason, lesson_date, is_reversal, reversed_transaction_id)
VALUES
  (35, 'bonus', -211,
   'Reversal: redundant manual Level A -> A1 point transfer removed (lifetime points now carry forward automatically since the promotion policy update)',
   '2026-08-15', true, 1450),
  (35, 'bonus', -66,
   'Reversal: redundant manual Level A -> A1 point transfer removed (lifetime points now carry forward automatically since the promotion policy update)',
   '2026-08-15', true, 1442);
-- NOT EXECUTED. Documentation only — these rows already exist live as
-- point_transactions.id 1725 and 1726.
