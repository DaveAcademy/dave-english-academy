# Ranking System v2 — Implementation Plan

Baseline: audit in this session (production DB `usqzcsoolkbuxyiiawmx`, migrations reconciled through `0028`). Not yet implemented — plan only.

## Confirmed decisions
- **all_time scope**: rank by `sum(point_transactions.points) where pt.level = p_level` (current-level only), same pattern as week/month. Baseline stays included. No production student is currently affected (verified: 0 students have transactions spanning >1 level), so this is a forward-safety fix, not a data correction.
- **Undo scope**: session-local, own-last-award only. Reverses only the transaction id just returned to that browser session; no DB lookup, no reach into history, no new RLS.
- **Dashboard "Top Students" panel**: confirmed intentionally school-wide (Top-5 admin highlight widget, capped at 5, distinct from the Rankings leaderboard). Left unchanged — not in scope.
- **Reports.jsx "Points" export**: has the same cross-level + index-rank pattern as the old Rankings table. Out of scope for this task (not part of the ranking audit's target pages) — flagged, not fixed.
- **−3/−5 buttons**: deferred. No existing teacher workflow calls for graduated penalties beyond the existing −1 and the `penalty` category's −5 default; adding buttons is a UI-only follow-up, not bundled here.

## 1. Ranking source of truth
- `src/pages/Rankings.jsx`: delete `ranked`/`awardableStudents`-driven top table (lines ~75-80, 356-480) that mixes levels and ranks by array index. Quick-award buttons move onto the existing Level Leaderboard rows (already level-scoped, already rank-based via `get_group_leaderboard`).
- Rank display everywhere in Rankings.jsx and MyRanking.jsx must read `row.rank` (already true for MyRanking's `medal(i)` call — **note**: MyRanking currently passes array index `i` to `medal()`/`medalText()`, not `row.rank`; fix to `medal(row.rank - 1)`).
- Dashboard.jsx: no change (confirmed school-wide, capped Top-5, doesn't claim to be "the" ranking).

## 2. Real-time refresh
- Add a `refreshKey` state in Rankings.jsx, bumped after `quickAdjust`, `submitAward`, `submitBulk` succeed.
- Add `refreshKey` to the dependency array of the `board` effect ([Rankings.jsx:241](src/pages/Rankings.jsx:241)) and the `classTransactions` effect ([Rankings.jsx:264](src/pages/Rankings.jsx:264)), so both refetch immediately after any award without a tab switch.

## 3. all_time consistency (migration required)
New migration `0029_ranking_alltime_level_scope.sql` (`create or replace function`, no table changes):
- `get_group_leaderboard`'s `all_time` branch: replace the `s.points`-based select with a `sum(pt.points) where pt.level = p_level` aggregate (same shape as the week/month CTEs, no period filter on `lesson_date`), still `left join` so zero-point students appear, still `rank() over (order by pts desc)`.
- Populate `attendance_rate` for `all_time` (lifetime attendance rate for that level, same CTE pattern as week/month but unbounded dates) instead of hardcoded `null`.
- `rank_change`/`prev_rank`/`prev_points` stay `null` for `all_time` — there's no meaningful "previous all_time" period; this is correct, not a bug.
- `get_student_ranking_summary`: `all_time_rank` CTE currently ranks by `s.points` (same inconsistency) — change to the same `pt.level = v_level` sum. `lifetime_points` return value (currently `s.points`) can stay as the true cross-level lifetime cache for display purposes (it's a different field from the rank), but the **rank** must come from the level-scoped sum to stay consistent with the leaderboard.

## 4. +3/+5 distinguishability
- `src/pages/Rankings.jsx` `quickAdjust`: replace fixed `reason: 'Quick manual adjustment via Rankings'` with `` `Quick ${delta > 0 ? '+' : ''}${delta}` `` (yields `Quick +1`, `Quick +3`, `Quick +5`, `Quick -1`).
- Verified safe: grepped every `.jsx`/`.js` file for the literal reason string and for `reason`-based filtering in `Reports.jsx` — nothing reads or filters on this text besides the write site itself. `finalize_recognition()` and `get_group_leaderboard()` aggregate on `points`/`lesson_date`/`is_baseline`, never on `reason` or `category_key` string content. No migration needed (`reason` is a free-text column already).
- Bulk award reason (`'Bulk class points via Rankings'`) left unchanged — not a quick-award button, no ask to change it.

## 5. Undo (session-local)
- `Rankings.jsx` `quickAdjust`: capture the `transactionId` returned by `awardStudentPoints()`/`db.awardPoints()` (already returned, unused today) into local state keyed by student id, e.g. `{ studentId, transactionId, delta, timestamp }`, holding only the single most recent award.
- New `undoLastAward()` calls `awardPoints({ studentId, level, categoryId, categoryKey, points: -delta, reason: 'Undo: Quick ...', awardedBy, isReversal: true, reversedTransactionId: transactionId })` — an ordinary insert already permitted by `pt_admin_insert`/`pt_teacher_insert` (same RLS path as any award, no new policy). Clear the pending-undo state after use or after a short TTL / on navigation.
- No DB change: `is_reversal`/`reversed_transaction_id` columns already exist ([0019](supabase/migrations/0019_ranking_point_transactions.sql:60)); `get_my_point_history()` already surfaces `is_reversal` as `is_correction` ([0023](supabase/migrations/0023_ranking_functions.sql:271)) so the student sees the correction, not a silent edit.
- Guard: undo button only renders for the exact `{studentId, transactionId}` still held in state — cannot target any other transaction, past session, or other user's award.

## 6. MyRanking / Dashboard
- MyRanking.jsx: fix `medal(i)`/`medalText(i)` → `medal(row.rank - 1)` (see §1). Everything else already RPC-driven and level-scoped — no other change.
- Dashboard.jsx: no change (§ decisions above).

## 7. Database safety
- No changes to `point_transactions`, `refresh_student_points_cache` trigger, RLS policies, or `validate_point_transaction_level` trigger — audit found no defect in any of them.
- One new migration file: `supabase/migrations/0029_ranking_alltime_level_scope.sql`, containing only `create or replace function public.get_group_leaderboard(...)` and `create or replace function public.get_student_ranking_summary(...)`, matching the existing `revoke/grant execute` lines already present for both (re-run, idempotent, no-op if unchanged).
- Verified next migration number is free: ledger currently ends at `0028`.

## 8. Production safety

**a. Files to change**
- `src/pages/Rankings.jsx` (remove cross-level table, refresh wiring, reason strings, undo)
- `src/pages/portal/MyRanking.jsx` (rank fix, one line)
- `supabase/migrations/0029_ranking_alltime_level_scope.sql` (new)

**b. DB objects changed**
- `public.get_group_leaderboard(text, text, date)` — `create or replace`
- `public.get_student_ranking_summary(bigint)` — `create or replace`

**c. Migration required**: yes, one new file, function-only (no DDL on tables, no data migration).

**d. Production data impact**: none to stored data. Verified via query that 0 students currently have transactions across multiple levels, so no currently-displayed rank or point total changes at deploy time. Effect is forward-only (protects future level-transfer students from a mis-scoped rank).

**e. Rollback**: `create or replace function` is trivially reversible — re-apply the prior function body (in `0023`) as a new migration if needed. No data was altered, so no backfill/rollback risk on the table side. Frontend changes are a normal revert of the commit.

**f. Verification plan**
- SQL: re-run the "students with transactions across >1 level" check after deploy (should still be 0) and spot-check `get_group_leaderboard(<level>, 'all_time')` output against a manual `sum(...) where level = ...` query for 2-3 students.
- UI: open Rankings as admin, click +5 on a student, confirm the Level Leaderboard row updates without switching tabs; confirm rank numbers match `rank` field on ties (use two students at Level A currently tied); click Undo immediately after an award, confirm the ledger shows both rows (`get_my_point_history` as that student) and the cached total returns to its pre-award value; reload the page and confirm Undo is no longer available for that same award.
- Confirm MyRanking's medal colors align with `rank`, not position, for a level with a real tie.
