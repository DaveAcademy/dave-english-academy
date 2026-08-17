# Database

Supabase/Postgres. See `ARCHITECTURE.md` for how RLS/RPCs fit the overall system. This doc covers schema, migration conventions, and DB-specific production rules.

## 1. Migration numbering & conventions (confirmed-current)

- Sequential numbered files: `0001_schema.sql` ... `0151_game_level_leaderboard.sql` — **151 numbered files, current head**.
- **`PROD_RECONCILED_*` files** are a separate, deliberate category: corrective/reconciliation migrations documenting schema that was applied directly to production (via MCP `apply_migration`, not `supabase db push`) in an earlier session and never captured as a numbered local file. They are `create table if not exists` / `create or replace function` guarded so re-applying is a no-op. Six such files exist at doc time. `PROD_RECONCILED_achievement_engine_schema.sql` (an untracked, superseded duplicate of the same tables) is one of them, but the achievement-engine schema itself is now captured properly as numbered migrations `0105_achievement_engine_schema.sql`–`0110` (committed `4fe705b`, applied to the prod ledger as `20260810055447_0105_achievement_core_schema` onward) — see §7. See `docs/migration-reconciliation-2026-08-15.md` for the methodology.
- **Never rewrite an already-applied migration file.** If prod needs a schema correction, write a new numbered (or `PROD_RECONCILED_`) migration — do not edit history in place. This rule exists because of at least one documented incident where an unrecorded-ledger migration would have been silently re-run and regressed a live function (`docs/migration-ledger-and-rls-repair-plan.md` §2, "the `db push` footgun").
- **Ledger/production parity has diverged more than once historically** (documented repair passes: 2026-07-25 for 0024-0028, 2026-08-15 for the payment/ranking/gaming range). **known-issue-open (latent, not currently blocking):** local migration files 0029+ have at points been untracked in the prod ledger per prior-session notes; do not run `supabase db push` in a fresh session without first re-confirming ledger/production parity for the affected range using `supabase migration list --linked`.

## 2. Major tables (confirmed-current, by domain)

**Students/academic core:** `students`, `groups`/`class_group` (V2), `attendance`, `exams`, `exam_scores`, `homework`, `homework_status`, `lesson_work`, `certificates`, `certificate_templates`.

**Curriculum:** `curriculum_lessons` (the numbered 1-100 curriculum slot), `lessons` (a teaching instance/PDF attached to a curriculum slot), `lesson_vocabulary` (938 active words academy-wide), `student_lesson_progress`, `curriculum_progress`. See `CURRICULUM.md` for the full relationship and current fill status.

**Payments:** `payment_transactions` (ledger, migration `0054`), payment-reminder tables from `0081_payment_reminders_foundation.sql`. See `PAYMENTS.md`.

**Points/ranking:** `point_transactions` (append-only ledger, `0019`), `point_categories` (`0018`), `class_group`/`class_session` (Ranking V2, `0137`-`0138`), `recognition_awards`, `recognition_reopen_log`, `certificate_templates`. See `RANKING-SYSTEM.md`.

**Gaming (0111-0151):** `game_sessions`, `game_word_history`, `game_rounds` (replay-protection token table, `0141`), `game_content_bank` (100-item content banks for the 3 grounded games), `game_level_progress` (`0149` — per-student-per-game level cursor). See `GAMING-SYSTEM.md`.

**Gamification (schema prod-only, reconciled 2026-08-16):** `achievement_definitions`, `student_achievements`, `student_metric_snapshots`.

## 3. RLS principles (confirmed-current)

- **Ledger tables (`point_transactions`, `payment_transactions`) are append-only by construction:** RLS grants SELECT + INSERT only, no UPDATE/DELETE policy for any role — Postgres rejects those verbs outright regardless of role. Corrections happen via a new reversal row (`is_reversal`/`reversed_transaction_id` columns), never by editing history.
- **`students.points` is not client-writable.** Column-level `UPDATE` grant on `students` is revoked academy-wide and re-granted per-column, excluding `points`/`id`/`created_at`. The only path to change it is inserting a `point_transactions` row, which a trigger (`refresh_student_points_cache`) then sums into the cache.
- **Teacher scoping:** `is_teacher()` alone (role-only, no level/group scope) was the pattern on ~15 tables until the 2026-08-14 remediation (migrations 0131-0136) added level-based scoping via `teacher_group_assignments` to the 6 highest-sensitivity tables (exam_scores, homework, lesson_work, student_lesson_progress, attendance, certificates). `curriculum_progress`'s UPDATE policy is scoped the same way as of `0156_curriculum_progress_teacher_level_scope.sql` (2026-08-17) — its `level` column is a direct match against `teacher_group_assignments.level`, no join needed; SELECT stays open (`using (true)`), unchanged. **Applied to production 2026-08-17** (migration `20260817153027_0156_curriculum_progress_teacher_level_scope`); `pg_policies` confirmed the UPDATE `qual`/`with_check` now require the `teacher_group_assignments` match for teachers while admin stays unrestricted and SELECT is untouched. Real teacher write behavior not runtime-tested (no safe test path this session). **known-issue-open (latent):** `files` has no level column at all (it's a general admin/teacher resource library — lesson PDFs, cert templates, general media — not tied to a level or student), so it can't be scoped by mirroring this pattern; giving it a level dimension would be a product decision (should shared resources even be level-restricted?), not a mechanical fix. Real exposure on both remains low (only 2 teachers exist, both all-level, at the time of the audit).
- **Student self-read** uses `is_own_student(student_id)`, a SECURITY DEFINER helper, rather than a raw `profile_id` subquery — this was itself the subject of an RLS hardening pass (`0024`/`0028`, see `docs/migration-ledger-and-rls-repair-plan.md`) after a documented over-broad column grant on `students.profile_id` was found and closed.
- **Points/achievements RLS was already correctly level/group-scoped** even before the 2026-08-14 remediation — not part of that gap.

## 4. Important RPCs (representative, not exhaustive — see `ARCHITECTURE.md` §4 for the pattern)

| RPC | Purpose |
|---|---|
| `get_group_leaderboard(level, period_type, period_start)` | Main ranking engine — week/month/all-time, `rank()`-based ties |
| `get_student_ranking_summary(student_id)` | One student's lifetime/week/month points + ranks |
| `finalize_recognition_winner(...)` | Student of the Week/Month award, recomputes points server-side, never trusts client value |
| `submit_game_round(game_type, answers)` | Shared grading RPC for all 9 games — re-validates every answer |
| `get_<game>_round()` (per game) | Curriculum-gated content selection for one game |
| `get_game_best_records(...)` | Personal-record / leaderboard RPC for Game Center |
| `evaluate_achievements(student_id)` | Server-side achievement rule evaluation, reads `student_metric_snapshots` |
| `student_unlocked_lesson_number()` / `student_available_vocabulary()` | Curriculum-gating primitives reused by lessons, exams, and every game |
| `get_payment_reminder_candidates()` | Telegram reminder candidate list, see `PAYMENTS.md` |

## 5. Production DB rules (standing)

1. **Never write to `point_transactions` or `students.points`/rankings directly** — Dave manages all point changes personally through existing UI/RPCs. This applies to Claude sessions and to any tooling with prod write access.
2. **Never rewrite an already-applied migration** — see §1.
3. **Runtime verification required** before claiming a DB-affecting change is correct in production — static SQL/migration review has produced false-positive "verified" claims at least twice in gaming-system work (an adaptive-difficulty tier-scale bug and an unlocked-lesson join bug, both caught only by live testing — see `GAMING-SYSTEM.md`).
4. **Do not run `supabase db push`** without first confirming ledger/production parity (`supabase migration list --linked`) for the full range being pushed.
5. Corrective migrations for confirmed prod drift use the `PROD_RECONCILED_*` naming convention (see §1), not edits to the original file.

## 6. Gaming-related DB objects — detail (migrations 0141-0151)

| Migration | Adds |
|---|---|
| `0141_game_round_replay_protection` | `game_rounds` token table — closes the previously-flagged P1 (unlimited repeat `submit_game_round` calls could farm `game_sessions`/achievements) |
| `0142_five_new_games` | Schema/content plumbing for the 5 newly-added games (9-game library total) |
| `0143_adaptive_difficulty_engine` | `adaptive_difficulty_tier()` — accuracy-history-driven difficulty signal for the 3 content-bank games (now superseded as the *driver* by level-based difficulty per 0149, but not dropped — still callable) |
| `0144_grounded_game_content` | `game_content_bank` seeded with curriculum-grounded content (300 items across the 3 games) |
| `0145_curriculum_and_difficulty_round_filtering` | Filters rounds by unlocked lesson + difficulty tier; includes fallback-broadening logic reused later by the Level Progression spec |
| `0146_fix_unlocked_lesson_number_level_join` | Fix for an unlocked-lesson join bug, caught by runtime testing (**known-issue-fixed**) |
| `0147_game_best_records_leaderboard` | Personal-records / leaderboard schema + RPC |
| `0148_fix_game_best_records_ambiguous_student_id` | Fix for an ambiguous-column bug in the 0147 RPC, caught by runtime testing (**known-issue-fixed**) |
| `0149_game_level_progression_schema` | `game_level_progress` table (per-student-per-game `current_level`/`best_level_reached`), nullable `level` column on `game_rounds`/`game_sessions`, `game_level_to_tier()`/`game_level_to_length_cap()` mapping functions |
| `0150_game_level_progression_wiring` | Wires level-driven difficulty into all 9 games' round-generator RPCs (924 lines — the largest migration in the range) |
| `0151_game_level_leaderboard` | Level-aware leaderboard additions |

`game_level_progress` RLS: admin full access, teacher SELECT (role-only, not level-scoped — same latent gap pattern as §3), student self-SELECT via `is_own_student()`.

## 7. Known DB issues

- ~~Achievement-engine schema had no numbered local migration~~ — **resolved**: `0105_achievement_engine_schema.sql`–`0110` (committed `4fe705b`) reconstruct `achievement_definitions`/`student_achievements`/`student_metric_snapshots` plus `bump_student_metric`/`evaluate_achievements`, and are confirmed applied in the prod migration ledger (`20260810055447` onward). The untracked `PROD_RECONCILED_achievement_engine_schema.sql` is now a redundant (harmless, idempotent) duplicate of a subset of 0105 and can be deleted whenever convenient — not required.
- ~~`get_leaderboard()` (from `0008`) remains defined and `GRANT`ed~~ — **FIXED**: `0128_drop_dead_get_leaderboard.sql` dropped it; confirmed applied in prod migration ledger (`20260814130512`) and confirmed absent from `pg_proc` in production (2026-08-17). Zero frontend callers existed at drop time; all leaderboard reads go through the level-scoped `get_group_leaderboard()` (0023).
- ~~No CHECK constraint on `point_transactions.points` magnitude~~ — **FIXED 2026-08-17**: `0154_point_transactions_magnitude_check.sql` added `CHECK (points BETWEEN -1000 AND 1000)`, applied to production. Range covers full observed history (non-baseline rows -211..236, one-time `baseline_migration` rows 105..608) with headroom; 0 of 1539 existing rows violated it. Constraint existence and existing-data validity verified live; insert/rejection behavior not runtime-tested (blocked by the no-points-writes rule in §5.1) — a typo like `500` for `5` is still not caught unless it also breaches ±1000.
- Reversal mechanism (`is_reversal`/`reversed_transaction_id` on `point_transactions`) exists in schema but is only exercised via the session-local undo added in Ranking V2 Phase 2 — bulk/admin-side reversal UI is still **planned**, not built.
- ~~`finalize_recognition()` (the tie-break-correct recognition function) is dead code — the page calls `finalize_recognition_winner()` instead, which has no tie-break and forces `is_co_winner = false`~~ — **STALE, superseded 2026-08-17**: `0153_fix_recognition_tie_break.sql` (applied to production) redefined `finalize_recognition_winner()` itself to detect ties and set `is_co_winner` correctly — this entry described the pre-`0153` state and was never updated when that migration landed. `finalize_recognition()` (`0023`) remains separately dead/unused, which is a harmless naming leftover, not a bug. See `RANKING-SYSTEM.md` for current status.

## 8. Deferred DB work

- Level-scoped RLS extension to remaining role-only-gated tables — `curriculum_progress` done and applied to production in `0156` (2026-08-17); `files` deferred pending a product decision on whether shared resources should be level-restricted at all. Low urgency, latent risk only.
- Backfilling `class_session_id` onto historical `point_transactions` rows — explicitly ruled out as unsafe (no reliable historical group identity); pre-V2 manual rows keep `class_session_id NULL` permanently by design.
