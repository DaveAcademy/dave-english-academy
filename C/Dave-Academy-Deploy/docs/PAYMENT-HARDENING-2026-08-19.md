# Payment System Hardening — 2026-08-19

Follow-up to `docs/PAYMENT-SAFETY-AUDIT-2026-08-19.md`. Two migrations written and reviewed, **not applied**. No payment data modified. `npm run build` passes.

## 1. Payment ledger status

**Migration written, not yet applied** — `supabase/migrations/0169_payment_transactions_append_only_rls.sql` drops `payment_transactions_admin_all` (`FOR ALL`) and replaces it with `payment_transactions_admin_select` (SELECT) + `payment_transactions_admin_insert` (INSERT). Confirmed before writing it: `storageBridge.js`'s only two write functions on this table, `recordPayment()` and `createCorrection()`, are both `.insert()` calls — no `.update()`/`.delete()` call site exists anywhere in the app. No legitimate workflow needs UPDATE/DELETE; the correction workflow is already reversal-row-based and stays fully intact (still an INSERT). Once applied, the DB will match `point_transactions`'s existing SELECT+INSERT-only shape.

## 2. RLS (post-migration, once applied)

- **Admin:** SELECT + INSERT only on `payment_transactions`. No UPDATE, no DELETE (removed).
- **Student (self):** SELECT only, own rows (`payment_transactions_self_read`, unchanged).
- **Teacher:** no policy exists for this table today (unchanged) — teachers have no payment access, same as before this change.
- **Anonymous:** no access (RLS default-deny, unchanged).

## 3. Reminder RPC

**Migration written, not yet applied** — `supabase/migrations/0170_payment_reminder_candidates_revoke_anon.sql` revokes `EXECUTE` on `get_payment_reminder_candidates()` from `anon`. Confirmed the function is `SECURITY DEFINER` with its own `is_admin()` guard as the first statement, and its only real caller is `Reminders.jsx` (admin page, authenticated session) — `authenticated` keeps EXECUTE, unaffected. Root cause was `0083`'s `DROP FUNCTION`+recreate re-triggering Supabase's default anon grant, then only revoking from the `public` pseudo-role instead of `anon` directly (unlike the correct fix already done for `get_student_payment_status` in `0087`).

## 4. Duplicate reconciliation — revised finding

Re-investigating the 9 pairs against full transaction history (not visible in the original audit's narrower query) surfaces a **prior, related correction already on record**: for all 9 students, the `source='manual'` July row was itself reversed and then un-reversed on 2026-08-02, in two batched migrations (`0073_reverse_august_test_payments.sql` at `06:37:40`, `0074`/`0075_undo_*_reversal_mistake.sql` at `06:49:51`). The `0073` reversal's note calls it a "test payment... no real payment was made in August yet"; the `0074`/`0075` undo's note says the opposite — "confirmed with admin: this was a real payment, not test data." **That resolved a different question** (was this developer test data vs a real admin entry) — it did **not** address whether the manual row duplicates the earlier `0057` legacy-table backfill row for the same July period. That question is still open, which is why every row below is marked **AMBIGUOUS**, not "clearly duplicate" — despite the amounts matching, there's on-record evidence the admin already reviewed part of this transaction chain and confirmed it as real.

| Student | Backfill ID (0057) | Manual ID | Amount | Payment Date | Manual Entry Created | Reversal→Undo trail | Likely Duplicate? | Evidence |
|---|---|---|---|---|---|---|---|---|
| 1 — Shahribonu | 102 | 115 | 250,000 | 2026-07-01 | 2026-08-01 18:05:45 | reversed id126 (08-02 06:37) → undone id136 (08-02 06:49), "confirmed real, not test" | AMBIGUOUS | Manual row already admin-confirmed "real" via 0074/0075, but never checked against the 0057 backfill covering the same July period |
| 2 — Dilyora | 46 | 111 | 250,000 | 2026-07-01 | 2026-08-01 18:04:28 | reversed id122 → undone id132, same note | AMBIGUOUS | Same pattern |
| 3 — Malika | 66 | 114 | 250,000 | 2026-07-01 | 2026-08-01 18:05:22 | reversed id125 → undone id135, same note | AMBIGUOUS | Same pattern. Note: this student also has a *separate*, already-resolved August duplicate (id 28 backfill vs id 109 reversal, `0064`'s worked example) — that one is closed, distinct from the July pair here |
| 9 — Elshod | 76 | 112 | 200,000 | 2026-07-01 | 2026-08-01 18:04:44 | reversed id123 → undone id133, same note | AMBIGUOUS | Same pattern |
| 16 — Shaxruza | 91 | 117 | 200,000 | 2026-07-01 | 2026-08-01 18:06:13 | reversed id128 → undone id138, same note | AMBIGUOUS | Same pattern |
| 17 — Shahzoda | 36 | 116 | 200,000 | 2026-07-01 | 2026-08-01 18:05:56 | reversed id127 → undone id137, same note | AMBIGUOUS | Same pattern |
| 18 — Albina | 39 | 110 | 200,000 | 2026-07-01 | 2026-08-01 18:03:38 | reversed id121 → undone id130 (06:43, slightly off-batch), note names Albina specifically: "Albina's 2026-08-01 payment (id 110) was real, not test data" | AMBIGUOUS | Same pattern, but this one has a named (not templated) confirmation note — slightly stronger evidence it was deliberately reviewed |
| 19 — Shodiyona | 71 | 118 | 200,000 | 2026-07-01 | 2026-08-01 18:06:35 | reversed id129 → undone id139, same note | AMBIGUOUS | Same pattern |
| 21 — Farzona | 105 | 113 | 200,000 | 2026-07-01 | 2026-08-01 18:04:53 | reversed id124 → undone id134, same note | AMBIGUOUS | Same pattern |

**Total exposure if genuinely duplicate:** unchanged from the original audit, ~1,950,000 so'm (3×250,000 + 6×200,000).

**Recommended question for Dave** (not answerable from the data alone): for these 9 students, does the July `payment_transactions` history contain exactly one real July payment, or two? If one — the manual row duplicates the backfill and should get a `createCorrection()` reversal. If two — no action needed, and the confusing 0073→0074/0075 saga was purely about test-data classification, unrelated to duplication.

**No writes performed** — table above is investigative only, per the read-only constraint on this phase.

## 5. Backup / PITR

**Still UNVERIFIED.** Checked `get_project()` via the Supabase MCP server this session — it returns only `id`/`region`/`database.version`/`status`, no backup or PITR configuration. No MCP tool in the available set exposes backup/retention settings. This requires a manual check of the Supabase Dashboard (Project → Database → Backups) — cannot be established through any tool available to this session.

## 6. Data integrity (re-check)

Re-ran the same read-only checks as the original audit: **140 rows**, `2026-04-01`–`2026-08-18`, 0 null amounts, 0 null `student_id`, 0 orphaned student references. No new anomalies beyond the 9 pairs already tracked and the already-closed `0064`/`0070` corrections. No evidence found of any row being overwritten (no `updated_at` column exists to detect this either way — noted as a standing limitation, not a new finding).

## 7. Build

**Pass.** `npm run build` completed clean (10.46s, standard chunk-size warnings only, unrelated to this change).

## 8. Files changed

- `docs/PAYMENT-SAFETY-AUDIT-2026-08-19.md` (new, prior session)
- `docs/PAYMENT-HARDENING-2026-08-19.md` (new, this file)
- `supabase/migrations/0169_payment_transactions_append_only_rls.sql` (new, **not applied**)
- `supabase/migrations/0170_payment_reminder_candidates_revoke_anon.sql` (new, **not applied**)

No other files touched. Pre-existing unrelated WIP (`src/pages/Rankings.jsx`, `src/utils/badges.js`, `supabase/migrations/0168_legacy_bulk_class_points_bridge.sql`, all already modified/staged before this session started) was left untouched — confirmed via `git status` before and after this work.

## 9. Production status

**NOT DEPLOYED.** Neither migration has been applied to production (no `apply_migration` call was made). No commit, no push. Awaiting explicit approval to apply `0169`/`0170`, and awaiting Dave's answer on the 9 AMBIGUOUS duplicate pairs before any correction is written.
