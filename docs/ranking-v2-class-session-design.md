# Ranking V2 — Phase 4: Class Session Architecture

Status (2026-08-15): **Implemented, deployed, currently paused for Week/Month display.** Schema (`class_group`, `class_session`, `point_transactions.class_session_id`) and all three RPCs in §10 shipped as migrations 0137–0139. See "Rollback status" at the end of this doc before touching any of it further.

Supersedes the technical assumptions in `ranking-audit.md`/`ranking-v2-plan.md` (both stale, baselined at migration 0028). Builds on the 2026-08-15 audit series and the confirmed product decision: **only manually-entered points (Rankings.jsx Add/Deduct, `category_key` in `bonus`/`penalty`) drive the ranking ledger going forward.** Exam/homework/achievement automatic point payouts remain disabled; those events can still exist as academic data but do not silently move the leaderboard.

---

## 1. What constitutes a class session

A **class session** is one teaching event: a specific **group** (within a level) meeting on a specific calendar date. It is the atomic unit the ranking system scores against — not a weekday, not a level+date pair, and **not a teacher**.

Evidence from the audit rules out inferring sessions from `(level, lesson_date)` alone: multiple distinct `awarded_by` values routinely appear for the same level+date. The first draft of this design resolved that by keying on `(level, session_date, teacher_id)` — rejected on review, because teacher and class are different concepts: a session can be co-taught by two teachers, and one teacher can run multiple groups at the same level on the same day. Using teacher identity as class identity would silently fragment a single co-taught session into two, or silently merge two different groups a wandering teacher happens to run back-to-back.

The correct identity is **group**, not teacher. `awarded_by` (the teacher) stays as metadata on the point transaction — who awarded it — never as part of what defines the session itself.

## 2. Representing Tue/Thu/Sat

Do **not** hardcode a weekday pattern. The actual class calendar drifted across the audit window (Wed/Fri/Sun → Tue/Thu/Sat → near-daily during correction week) and no `schedule`/`timetable` table exists to declare an authoritative pattern. `class_session.session_date` is the sole source of truth; weekday is a display-only derived value (`to_char(session_date, 'Dy')`), never a filter condition. Weekly/monthly views enumerate whatever sessions actually exist in the window — 3 in a normal week, 11–13 in a normal month, fewer around holidays — never assumed counts.

## 3. `class_group` and `class_session` tables (new)

`group_name` on `point_transactions` is free text, populated only on baseline rows — it cannot safely anchor identity, historically or going forward. A real group entity is needed:

```
class_group
  id            bigint identity PK
  level         text NOT NULL          -- A, A1, B, C
  name          text NOT NULL          -- e.g. "A1 - Evening", display label, admin-editable
  active        boolean NOT NULL DEFAULT true
  created_at    timestamptz NOT NULL DEFAULT now()
```

```
class_session
  id            bigint identity PK
  class_group_id bigint NOT NULL REFERENCES class_group(id)
  session_date  date NOT NULL
  opened_by     uuid NOT NULL REFERENCES profiles(id)  -- who explicitly created this session record (§4)
  created_at    timestamptz NOT NULL DEFAULT now()
  UNIQUE (class_group_id, session_date)
```

`level` is available on a session via `class_group.level` — not duplicated on `class_session` itself, so a group can't drift level without an explicit model change. Teacher(s) running a session are not modeled on `class_session` at all; they're visible per-transaction via `point_transactions.awarded_by`, which already supports multiple teachers touching one session without contradiction.

**Every level needs at least one `class_group` row before this ships** — for levels that in practice have exactly one group, that's a single row (e.g. "Level C - Main"), so the model doesn't force complexity where none exists.

`point_transactions` gains:
```
ALTER TABLE point_transactions ADD COLUMN class_session_id bigint NULL REFERENCES class_session(id);
```
Nullable, additive, no rewrite of existing rows required by the column itself (population is a separate backfill step, see §5). No historical `point_transactions` row is deleted, reversed, or mutated in value — only this new FK is populated where confidently possible.

## 4. How manual point transactions attach to a session

A point award does not, by itself, prove a class happened. Rejected approach: auto-creating a `class_session` as a side effect of the first Add/Deduct click that day — that turns the ranking system into a session generator driven by button presses, exactly the invisible-machinery problem this project exists to remove.

Instead, session creation is an **explicit, separate act** from awarding points:
1. The teacher/admin selects (or the UI defaults to, with visible confirmation) a `class_group` and `session_date` — "Level A1 - Evening, today" — as a distinct step, e.g. opening the Rankings award panel for a group prompts "Start today's class session?" the first time, rather than silently materializing one.
2. Once a `class_session` exists for that `(class_group_id, session_date)`, all point awards entered against that group/date attach to it — regardless of which teacher enters them, since `awarded_by` is transaction-level metadata, not session identity.
3. Multiple teachers awarding into the same group/date session is now correct behavior (co-teaching), not a collision to be split apart.
4. One teacher running two different groups on the same date correctly produces two different sessions, because identity is keyed on group, not teacher.

This requires `class_group` to exist and be selected before scoring — which is a real product/UX change to Rankings.jsx (a group picker), not just a backend addition. Flagging that explicitly since it's the one piece of this design with user-facing workflow impact beyond "a new view."

## 5. Historical transactions that can't be confidently assigned

- **`baseline_migration`** rows: never assigned. Definitionally a one-time catch-up, not a class event.
- **`is_reversal=true`** rows: inherit the `class_session_id` of the transaction they reverse (via `reversed_transaction_id`), never assigned based on their own `created_at`/`lesson_date` (audit confirmed reversal `lesson_date` is the reversal action date, not the original class date — using it directly would misattribute the correction to the wrong session).
- **`exam` / `homework` / `achievement_bonus`** rows: these are pre-policy-change automatic awards, already reversed out of the ranking ledger per the 08-15 cleanup. They are **not** eligible for session assignment and are excluded from Class/Weekly/Monthly views by construction (their `category_key` disqualifies them, independent of whether a session could theoretically be inferred).
- **`bonus` / `penalty`** rows (manual, pre-V2): **not backfilled into sessions at all.** Since `class_group` doesn't exist yet historically and `group_name` on old rows is unreliable free text, there is no safe way to retroactively assign a group — even a `(level, lesson_date)`-unique row can't be assumed to belong to a specific group that didn't exist as a modeled entity yet. All pre-V2 manual rows keep `class_session_id NULL` permanently. They remain fully counted in Overall/lifetime totals (ledger is authoritative and unchanged) and excluded from Class/Weekly/Monthly session-based views, with the UI saying so explicitly (e.g. "X points from before class tracking started, included in your overall total") rather than silently omitting them with no explanation.

No fabricated `class_session` row is ever created just to make a historical count look complete. This mirrors the reconciliation rule already applied to the missing prod migrations.

## 6. Monthly structure (12-class model)

Monthly view for a level = every `class_session` with `level = p_level` and `session_date` within the calendar month, ordered by date, one column per session, using the actual date as the header (not "Class 1..N" as a label — dates are the label, count is whatever it is). No hardcoded 12; a month with 11 or 13 sessions renders 11 or 13 columns.

## 7. Weekly aggregation

Weekly view = every `class_session` with `level = p_level` and `session_date` within the selected week window, same academy week-boundary logic already established (`week_bounds` helper in `0023`, Asia/Tashkent-local). Typically 3 sessions; the UI does not assume 3 — it lists whatever sessions exist. Week total = signed sum of that student's `bonus`+`penalty` points across those sessions' transactions.

## 8. Monthly aggregation

Same mechanism at month grain, using `month_bounds`. Monthly total = signed sum across all that month's session transactions for the student. Deductions flow through as negative values naturally — no separate "penalty" bucket, no repeat of the old bonus-only bug, because the query is category-filtered to `bonus`/`penalty` (i.e., "manual") as a set, not to a single category.

## 9. Promotion / group-movement behavior

- A session's level is fixed via its `class_group.level` at the time the session happened — a session belongs to the level it was held under, permanently. No historical session is rewritten when a student promotes, and `class_group` rows are never retroactively reassigned to a different level.
- Class/Weekly/Monthly views query sessions for the student's **current** level only, matching the existing population rule (`s.level = p_level AND s.status = 'Active'`) — unchanged from current policy, this doc does not touch it.
- Overall/lifetime points remain the full ledger sum, level-agnostic, carrying forward across promotion exactly as `0129` already established. This doc does not change that either.
- Known open inconsistency (not fixed here, per your instruction): `finalize_recognition_winner` still filters by level while the leaderboard doesn't. Session-based Class/Weekly/Monthly views as designed here will inherit the **leaderboard's** behavior (level-agnostic sum, current-level population), which will still disagree with Recognition's per-period totals for promoted students until Recognition is separately reconciled.

## 10. Schema/RPC/UI shape (final design summary)

**Schema**: `class_group` + `class_session` tables (§3) + `point_transactions.class_session_id` FK (§3). That's the entire schema delta — no other table changes.

**RPCs** (extend/reuse existing, per prior finding that the current RPCs already do most of the right cohort-membership work):
- `get_class_leaderboard(p_level, p_session_id)` — new. Per-student manual point total for one session.
- `get_weekly_class_leaderboard(p_level, p_week_start)` — new. Enumerates sessions in the week, returns a matrix: student × session columns + week total, using `rank()` for ties like the existing functions.
- `get_monthly_class_leaderboard(p_level, p_month_start)` — new. Same shape at month grain.
- `get_group_leaderboard`/`get_student_ranking_summary` — extend to optionally return the `class_session`-backed breakdown alongside existing lifetime/period totals, rather than being replaced; Overall points continue to come from these exactly as today.
- All three new RPCs restrict to `category_key IN ('bonus','penalty')` and join through `class_session`, inheriting the existing `s.level = p_level AND s.status = 'Active'` population rule. Existing RLS/teacher-level-scoping (`0131-0136` teacher-auth batch) applies unchanged since these are new read paths under the same authorization model, not new write paths.

**UI**:
- Rankings.jsx (admin): add Week/Month view toggle rendering the matrix from the new RPCs; level/week/month selectors as already scoped in the original spec.
- MyRanking.jsx / MyProgress.jsx (student): show Class Points (per session, dated) separately from Overall Points, with the "points from before class tracking" note from §5 where applicable, so students see exactly why the two numbers differ — this directly satisfies your original complaint about invisible machinery.

## 11. Stop point

This is the complete Phase 4 design (revised per review: group-based session identity replaces teacher-based; session creation is explicit, not award-triggered). No migration file, RPC body, or frontend component has been written. Await approval before proceeding to implementation, and the reconciled `PROD_RECONCILED_*.sql` files from the earlier migration-reconciliation pass remain uncommitted and unapplied pending your separate review of that reconstructed historical evidence.

### Open question carried forward
`class_group` must exist and be populated (at least one row per level, more where concurrent groups are real) before any session can be created — this is real setup data entry, not inferred from existing rows. Need to confirm with Dave: how many actual concurrent groups exist per level today, so the initial `class_group` seed list is accurate rather than guessed.

## 12. Rollback status (2026-08-15) — READ BEFORE TOUCHING THIS ARCHITECTURE

**This is a temporary rollback of one display path, not a decision to abandon this design.** Do not delete, redesign, or "clean up" `class_session`/`class_group`/`get_class_leaderboard`/`get_weekly_class_leaderboard`/`get_monthly_class_leaderboard` because they look unused — they are intentionally dormant, waiting on real adoption.

**What happened:** Rankings.jsx's Week/Month tabs were wired to `get_weekly_class_leaderboard()`/`get_monthly_class_leaderboard()` (§10) before the session-opening workflow (§4) was ever actually used day-to-day. Every historical `point_transactions` row has `class_session_id = NULL` — zero exceptions, checked directly against production. Both RPCs only sum points joined through a real `class_session`, so with nothing to join against they returned `month_total = 0` / `week_total = 0` for every student, on every level, while the real ledger held (and holds) correct data throughout. Confirmed live in production before the fix: `get_monthly_class_leaderboard()` for Level A1 returned all 8 active students at `month_total = 0`.

**What was reverted, and what wasn't:**
- Rankings.jsx Week/Month → back to `get_group_leaderboard()` (ledger-based), matching All Time and matching `MyRanking.jsx` (which was never wired to the session path and was never affected by this bug).
- Rankings.jsx Class tab → **unchanged**, still `get_class_session()` + `get_class_leaderboard()`. That view is meaningless without a real session and has no ledger-based equivalent to fall back to.
- Schema, RPCs, migrations 0137–0139 → **unchanged**. Nothing was dropped, disabled, or backfilled. `class_session_id` was deliberately **not** backfilled onto historical rows (per §5 — there is no safe way to retroactively assign a group to a pre-V2 transaction).

**Conditions to re-enable Week/Month on the session path** (do not flip this back until *all* of these hold):
1. The session-opening workflow (§4) has been used in real, ordinary classroom operation — not a manual test — for enough consecutive weeks that most/all levels have a real `class_session` for most/all of their actual class dates in a given week/month.
2. Spot-check: for a representative level and a representative recent week, `get_weekly_class_leaderboard()`'s sum for at least one real student is non-zero and matches what that student actually earned that week per the ledger.
3. No level is being left out — a level whose teacher hasn't adopted session-opening yet would show that level's Week/Month as empty again the moment the switch is flipped academy-wide, recreating this exact incident for that level specifically. Either every level has adopted it, or the switch happens per-level rather than globally.
4. Dave has actually used the Class tab a few times and confirmed it behaves as expected in real use (this was explicitly deferred rather than tested with a manufactured test point - see the 2026-08-15 conversation).

**Until then:** Week/Month stays on the ledger. This is not a regression to "fix" later by re-flipping the switch on a schedule - it's gated on real adoption evidence, checked directly against production data before changing, the same way this incident itself was diagnosed.
