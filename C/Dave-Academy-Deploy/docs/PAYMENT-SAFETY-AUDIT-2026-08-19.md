# Payment System Safety Audit — 2026-08-19

Read-only audit. No writes, no migrations applied, no production data modified.

## 1. Executive conclusion

**Yes, with two real gaps to close.** `payment_transactions` is a well-designed append-only ledger (insert-only application code, positive-amount check constraint, correction-via-reversal-row pattern actually followed in practice — see `0064`/`0070`/`0073-0079`). History cannot be lost through the UI: there is no delete path anywhere in the app. But two things fall short of what the codebase's own documented design intent promises:

1. **The database does not itself enforce append-only.** The `payment_transactions_admin_all` RLS policy is `FOR ALL` (`is_admin()`), which permits `UPDATE`/`DELETE`, not just `SELECT`/`INSERT`. This contradicts `docs/DATABASE.md` §3's claim that ledger tables grant "SELECT + INSERT only, no UPDATE/DELETE policy for any role" — that statement is true for `point_transactions` but **false for `payment_transactions`**. Today only the app's discipline (insert-only calls in `storageBridge.js`) keeps history intact, not the schema.
2. **9 rows are near-certain duplicate payments** (same student/amount/date, one `source='migration'` backfill row + one `source='manual'` admin-entry row, both dated 2026-07-01, entered ~6 hours apart on 2026-08-01) — see §6. Nobody reversed them; they currently inflate July collections by ~1,950,000 so'm.

Everything else — RLS read boundaries, backup posture (partially unverifiable), migration bookkeeping — is sound or already flagged/tracked elsewhere.

## 2. Architecture

`Payments.jsx` (admin UI) → `storageBridge.js` (`recordPayment()`, `createCorrection()`, both **insert-only**) → Supabase PostgREST → `public.payment_transactions` (RLS-gated). Reads: `getPaymentTimeline()` (raw ledger rows) and `get_student_payment_status()` (derived status/balance, `SECURITY DEFINER`, admin/self-only). `Reports.jsx` and `Dashboard.jsx` both read the ledger directly — confirmed current, no lingering boolean-`payments` dependency (`docs/PAYMENTS.md` §2). Reminders (`get_payment_reminder_candidates()`) layer on top, read-only.

Authoritative table: **`public.payment_transactions`** (migration `0054`). The legacy `public.payments` boolean-grid table still exists as a frozen compatibility snapshot (write path removed 2026-08-01 per prior audit) — not a second source of truth, just dead weight until formally retired.

## 3. Data integrity

| Can a payment be… | Answer | Evidence |
|---|---|---|
| Duplicated | **Yes, no DB guard** | No unique constraint on `(student_id, amount, paid_at, transaction_type)`; UI-level `disabled` flag during submit is the only defense. 9 live duplicate rows found — see §6. |
| Overwritten | **Possible at the schema level, not observed in data** | `payment_transactions_admin_all` is `FOR ALL`; app never calls `.update()`. No `updated_at`/audit trail exists to detect a silent edit if one ever happened. |
| Deleted | **Possible at the schema level, not observed in data** | Same policy permits `DELETE`; app never calls it. No soft-delete/audit column. |
| Orphaned | **No** | `student_id` is `NOT NULL` + `FK ... ON DELETE CASCADE`; live check found 0 orphaned rows. |
| Corrupted (bad amount) | **Partially guarded** | `amount > 0` (or `transaction_type = 'correction'` for negative reversals) is enforced. No magnitude cap (unlike `point_transactions`, which got a `±1000` CHECK in `0154`) — a typo like an extra zero is not caught. |

Row-level check (2026-08-19): 140 rows, `2026-04-01`–`2026-08-18`, 0 null amounts, 0 null `student_id`, 0 orphans, 2 transaction types in current data (`monthly` 116 rows / +25,752,000; `correction` 24 rows / −752,000).

## 4. Security (RLS/permissions)

- **Read:** admin full read; a student can read only their own rows (`is_own_student()`). No cross-student leak path found.
- **Write (INSERT):** admin only, via `is_admin()` (checks `profiles.role = 'administrator'`, `SECURITY DEFINER`, `search_path` pinned — sound).
- **Write (UPDATE/DELETE):** technically open to admin at the RLS layer (see §1, finding P-1) — not exercised by any app code path found.
- **Anon/unauthenticated:** cannot read or write `payment_transactions` directly (RLS blocks; table-level grants are Postgres/Supabase's standard broad default, meaningless without a matching RLS policy, which admin-only here provides).
- **`get_payment_reminder_candidates()` RPC is directly callable by `anon`** (`has_function_privilege('anon', ..., 'execute')` = true, confirmed live) — a regression from the documented intent (`0056`'s comment: "no reason for a money-related endpoint to be reachable pre-auth"). Root cause: `0083_reminder_candidates_last_sent_at.sql` did `DROP FUNCTION` + recreate (which re-triggers Supabase's default anon/authenticated grant) and only re-revoked from the `public` pseudo-role, not from `anon` directly — unlike its sibling fix in `0087` for `get_student_payment_status`, which correctly revokes from both. **Not currently exploitable for data exposure**: the function's first statement is `if not is_admin() then raise exception 'Unauthorized'`, so an anonymous caller gets an error, not student names/telegram IDs/amounts. It is a defense-in-depth gap, not an active leak.

## 5. Recovery / backups

**UNVERIFIED** — not checkable from the tools available this session (no filesystem/dashboard access to Supabase's Backups settings, and PITR/backup config isn't exposed via SQL or the `execute_sql`/`list_*` MCP tools used here). Needs manual confirmation in the Supabase dashboard (Project → Database → Backups):
- Whether the project is on a plan with Point-in-Time Recovery, and its retention window.
- Whether daily backups are enabled and their retention.
- Whether any restore has ever been tested.
- Whether there's an independent export/archive of `payment_transactions` outside Supabase (none found in the repo — no `pg_dump` cron, no export script targeting this table beyond the generic `backup.js`/`exportAllData` admin-triggered snapshot, which is manual/on-demand, not scheduled).

## 6. Production findings (concrete numbers)

- **140** `payment_transactions` rows, date range **2026-04-01 to 2026-08-18**.
- **0** null amounts, **0** null `student_id`, **0** orphaned student references.
- **9 duplicate-candidate pairs** (18 rows), all dated `paid_at = 2026-07-01`, all `transaction_type='monthly'`: one row per pair is `source='migration'` (the one-time `0057` legacy backfill, inserted `2026-08-01 12:19:48`) and the other is `source='manual'` (admin-entered `2026-08-01` between `18:03` and `18:06`, `created_by` the same admin profile for all 9). Affected students: ids 1, 2, 3, 9, 16, 17, 18, 19, 21. Combined amount: **1,950,000 so'm** (3×250,000 + 6×200,000). Reads as the admin re-entering July payments manually without realizing the backfill migration had already captured them, in one ~3-minute session — not reversed since. **Not auto-corrected by this audit per the no-writes rule; flagging for Dave to confirm and reverse via `createCorrection()` if genuinely duplicate.**
- No other duplicate patterns, no null/invalid amounts, no suspicious backdated timestamps beyond the known/already-documented `0070`/`0073-0079` one-off corrections.

## 7. Risk table

| Finding | Severity | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| `payment_transactions_admin_all` RLS is `FOR ALL`, permitting UPDATE/DELETE on the ledger | 🟠 High | `pg_policy` live check; migration `0054` | History could be silently altered/deleted by any admin session (compromised or mistaken), with no DB-level trail — contradicts the ledger's own "never edit, always reverse" design principle | Split the policy: keep `INSERT`+`SELECT` for admin, drop `UPDATE`/`DELETE` (mirror `point_transactions`'s actual policy shape). If an admin ever needs to fix a truly malformed row, that should go through a manual, logged, one-off SQL statement — not standing app-level permission. |
| 9 likely-duplicate payment rows (~1.95M so'm) | 🟠 High | §6, live query | Overstates collected revenue for 9 students in July | Dave reviews the 9 pairs; if confirmed duplicate, reverse via `createCorrection()` (preserves history, doesn't delete) |
| `get_payment_reminder_candidates()` executable by `anon` | 🟡 Medium | `has_function_privilege` live check; `0083` vs `0087` diff | No active data exposure (internal `is_admin()` check blocks it) but breaks the documented grant-level defense-in-depth policy | `revoke execute on function public.get_payment_reminder_candidates() from anon;` (one-line migration, matches the `0087` pattern) |
| No CHECK on `payment_transactions.amount` magnitude | 🟡 Medium | schema inspection | A data-entry typo (extra zero) isn't caught, unlike `point_transactions` (`±1000` cap added `0154`) | Add a sane upper bound once Dave confirms a reasonable ceiling (largest real fee × small multiplier) |
| No server-side duplicate-submission guard | 🟡 Medium | schema + `storageBridge.js`/`Payments.jsx` review | Only a UI `disabled` flag prevents double-click/double-submit; a network retry or two tabs could still double-insert | Optional: a short-window duplicate-insert trigger guard, same pattern as `point_transactions`'s `prevent_duplicate_point_transaction()` (`0162`) |
| Backup/PITR posture | ⚪ UNVERIFIED | not checkable via available tools | Unknown recovery ceiling if the DB is ever corrupted | Confirm in Supabase dashboard; this is the single most important unresolved item in this audit |
| Legacy `public.payments` table still present | 🟢 Low | `docs/PAYMENTS.md` | No drift risk (write path removed), but latent confusion/clutter | No action needed now; retire once `Reports.jsx`/`backup.js` fully deprecate it (already tracked) |

## 8. Recommended fixes (only what's genuinely necessary)

1. Tighten `payment_transactions_admin_all` to `INSERT`+`SELECT` only (drop implicit `UPDATE`/`DELETE`).
2. `revoke execute on function public.get_payment_reminder_candidates() from anon;`
3. Dave reviews and (if confirmed) reverses the 9 duplicate July rows.
4. Confirm backup/PITR settings in the Supabase dashboard — not a code change, just needs to be looked at and recorded.

Everything else in this audit is informational or already tracked elsewhere (`docs/DATABASE.md` §8 deferred work). No redesign needed — the ledger model and correction-via-reversal pattern are sound and actually followed.

## 9. Deployment status

No deployment. No migrations applied. No production writes performed during this audit.
