# Ranking System

Class ranking (points-based, academy-wide feature) vs. game ranking (Game Center leaderboards) are **separate systems** sharing only the `rank()` window-function convention. This doc covers class ranking in depth; see `GAMING-SYSTEM.md` §9 for game-specific leaderboards.

## 1. Class ranking — source of truth

`point_transactions` (append-only ledger, `0019`) is the single record of every point ever awarded. `students.points` is a trigger-maintained cache (`refresh_student_points_cache()`), not directly editable — the `UPDATE` grant on that column is revoked academy-wide, admins included. The only way to change a student's total is inserting a ledger row. See `DATABASE.md` §3 for the RLS mechanics.

**Standing rule: never write to `point_transactions`/rankings directly outside the existing award UI/RPCs.** Dave manages all point changes personally.

## 2. How points are awarded (confirmed-current)

Only path: `Rankings.jsx` → `awardPoints()`/`bulkAwardPoints()` in `storageBridge.js` → INSERT into `point_transactions`. Three workflows: Quick Points (increment buttons), Detailed/Advanced Award (category + free-text reason), Bulk Award (per-group). Attendance, homework, and exams **do not** feed the ledger — this was deliberately removed (`0008`) because the old automatic formula produced flat zeros for most students; those pages still function independently.

## 3. Class ranking vs. game ranking — explicit distinction

| | Class ranking | Game ranking |
|---|---|---|
| Source | `point_transactions` ledger | `game_sessions` / `game_level_progress` |
| Scope | Level-scoped (A/A1/B/C), week/month/all-time | Per-game, per-student |
| Write path | Manual award by teacher/admin only | `submit_game_round()`, fully automatic, server-graded |
| Currency | "Class Points" | Game score (flat per-correct); "Game Points" as a separate currency is **planned, not implemented** — see `GAMING-SYSTEM.md` §12 |
| Never auto-feeds | Games do not write `point_transactions` at all (by design — the strongest mitigation against self-awarded points) | N/A |

## 4. Personal records / Top 5 / ties

- Class leaderboards use `rank()` (not `row_number()`) in every RPC — genuinely tied students share a rank number, next rank skips accordingly. This is correct in every RPC that was ever audited.
- **known-issue-fixed / known-issue-open, UI-level (mixed):** rank display was historically inconsistent across the app even though the underlying SQL was always correct — several surfaces rendered array index instead of `row.rank`. Status per surface, from the 2026-07 ranking audit and subsequent Ranking V2 work:
  - Rankings.jsx Level Leaderboard, class-by-class grid, PortalHome hero — always correct (`row.rank`).
  - Rankings.jsx main "top" table (pooled-all-levels, array-index rank) — **known-issue-open at audit time**, Ranking V2 plan calls for deleting this table entirely in favor of the Level Leaderboard; verify current code before assuming still open.
  - MyRanking.jsx medal color — **known-issue-fixed** (Ranking V2 plan item: `medal(i)` → `medal(row.rank - 1)`); Game Center's equivalent bug (`d5ca5a2`) is **known-issue-fixed** separately.
- Recognition (Student of the Week/Month) tie-break: **known-issue-fixed** (`0153_fix_recognition_tie_break.sql`, applied to production 2026-08-17). `finalize_recognition()` (0023) has the correct tie chain but was never swap-compatible with the Recognition page's admin-choose-a-candidate workflow — it has no `student_id` parameter, issues no certificate, and returns a different shape. Rather than reroute the page to it, `finalize_recognition_winner()` (the function actually wired to `Recognition.jsx`) was extended in place: it keeps its exact interface, admin-selection semantics, and certificate issuance, and adds the same rank()-based tie detection (points desc, active_days desc, attendance rate desc) as `finalize_recognition()`. When the admin's chosen student is genuinely tied for rank 1, every tied student is recognized as a co-winner (own award row + own certificate); otherwise behavior is unchanged from before. Verification: the added tie-detection SQL was checked against literal synthetic data for clear-winner/2-way/3-way/lower-rank-tie cases (all correct) and the deployed function body was confirmed live in production (`prosrc` contains the new logic). Full RPC end-to-end and UI verification were **not** performed — the environment blocked all test writes to `students`/`point_transactions`, even inside rolled-back transactions, in two separate sessions.

## 5. Rank calculation — key RPCs

- `get_group_leaderboard(level, period_type, period_start)` — main engine, used by Rankings, MyRanking, PortalHome, Recognition candidates.
- `get_student_ranking_summary(student_id)` — one student's lifetime/week/month points + ranks.
- `finalize_recognition_winner(...)` — recomputes the period total server-side from the ledger, never trusts a client-supplied value.

`all_time` scope was historically inconsistent (ranked off the cross-level cache while week/month joined on snapshot level) — fixed per the Ranking V2 plan (`0029`-era) to rank off `sum(point_transactions.points) where pt.level = p_level`, same pattern as week/month. **known-issue-fixed** — verify against current `get_group_leaderboard` body if a new session needs certainty.

## 6. Class Session architecture (Ranking V2 Phase 4) — status: implemented but display-path paused

Schema (`class_group`, `class_session`, `point_transactions.class_session_id`) and RPCs (`get_class_leaderboard`, `get_weekly_class_leaderboard`, `get_monthly_class_leaderboard`) shipped as migrations `0137`-`0139`. **Do not delete or "clean up" these objects** — they are intentionally dormant pending real adoption, not dead code.

**What happened:** Rankings.jsx's Week/Month tabs were wired to the session-based RPCs before the session-opening workflow was used in real day-to-day operation. Every historical `point_transactions` row has `class_session_id = NULL`, so the session-based RPCs returned 0 for every student on every level. **Reverted:** Week/Month → back to `get_group_leaderboard()` (ledger-based). **Not reverted:** Class tab (still session-based, meaningless without a real session but has no ledger fallback), schema/RPCs/migrations 0137-0139 (all unchanged, nothing dropped or backfilled).

**Conditions to re-enable** (all must hold): the session-opening workflow has been used in real ordinary operation for enough consecutive weeks that most/all levels have real sessions for most/all actual class dates; a spot-check confirms a real student's weekly RPC sum matches the ledger; every level has adopted it (or the switch is per-level, not global); Dave has used the Class tab and confirmed it behaves as expected.

Historical (pre-V2) manual point rows are **never** backfilled with a `class_session_id` — there is no safe way to retroactively assign a group to a row from before groups existed as a modeled entity. They remain fully counted in lifetime totals, excluded from Class/Weekly/Monthly session views, with the UI stating why.

## 7. Known architectural concerns

- **Level-snapshot gap (open):** `game_sessions` has no *academy*-level snapshot at play time, which affects the existing score ranking's level/group scoping for any student who changes academy level mid-history. This is explicitly a **different** "level" concept from Game Level Progression (see `GAMING-SYSTEM.md` §7c) — both remain open, distinct items; do not silently bundle a fix for one into work on the other.
- **Recognition/leaderboard inconsistency for promoted students:** `finalize_recognition_winner` filters by level while the general leaderboard doesn't cleanly handle cross-level history the same way — flagged, not reconciled.
- **No bounds check on award magnitude** — see `DATABASE.md` §7.
- **No admin-facing reversal/undo UI beyond a session-local, own-last-award-only undo** — bulk/historical correction still requires manual re-entry.

## 8. Status summary

| Item | Status |
|---|---|
| Ledger model, RLS, triggers | confirmed-current, correct, not touched by any pending work |
| `rank()`-based tie handling in SQL | confirmed-current, correct everywhere |
| UI rank-display consistency | mixed — several historical bugs fixed, at least one (Rankings.jsx top table) flagged open at last audit, verify before assuming fixed |
| Class Session architecture | implemented, deployed, Week/Month display deliberately paused pending adoption |
| Recognition tie-break | known-issue-fixed (`0153`, applied to prod 2026-08-17; SQL-logic + DB-deployment verified, RPC/UI not verified — see §4) |
| Level-snapshot gap | known-issue-open, explicitly deferred |
| Reversal/undo | partially implemented (session-local only) |
