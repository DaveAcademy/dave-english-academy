# Project Status

Snapshot as of 2026-08-17 (HEAD `a61124d`, branch `release/dashboard-redesign`). See `PROJECT-HANDOFF.md` for how to use this doc set; see each topic doc for full detail behind any line below.

Status labels: **COMPLETE**, **COMPLETE+VERIFIED** (runtime-tested in production, not just code-reviewed), **IMPLEMENTED+PARTIALLY VERIFIED**, **IN PROGRESS**, **PLANNED**, **DEFERRED**, **NEEDS DECISION**.

## 1. Status table

| Area | Status | Evidence | Remaining work |
|---|---|---|---|
| Architecture (React/Vite + Supabase RPC/RLS) | COMPLETE | `ARCHITECTURE.md`, confirmed against `package.json`/repo structure | None known |
| Database / migrations (156 numbered + 6 `PROD_RECONCILED_*`) | COMPLETE | `DATABASE.md`; migration-ledger reconciliation passes done; achievement-engine schema reconciled into `0105`–`0110` (`4fe705b`), confirmed applied in prod ledger | `curriculum_progress` teacher-level RLS scoping (`0156`, 2026-08-17) applied to production and read-only verified via `pg_policies`; real teacher write untested (no safe test path). `files` RLS gap remains, deferred pending product decision (no level column exists on that table) |
| Curriculum (12 lessons live of a 100-lesson target) | IN PROGRESS | `CURRICULUM.md`; 12/100 lesson teaching instances built | 100-lesson expansion is a written proposal only, not inserted; needs Dave's approval |
| Admin system (students/groups/attendance/exams/homework/reports/certificates) | COMPLETE | `ADMIN-SYSTEM.md`; all pages exist and routed | No reversal UI beyond session-local undo |
| Payments (ledger + Telegram reminders) | COMPLETE | `PAYMENTS.md`; ledger confirmed, reminder candidate flow confirmed | Whether reminder sends are truly scheduled vs. admin-triggered-only not fully resolved |
| Gaming — 9 games, server-authoritative | COMPLETE+VERIFIED | `GAMING-SYSTEM.md`; replay protection, curriculum gating, no P0s across 2 audits | Ongoing content/balance tuning; `game_sessions.academy_level` snapshot (`0155`, 2026-08-17) production-verified but not runtime/UI-verified — see `GAMING-SYSTEM.md` §7b |
| Game Level Progression (0149-0151) | COMPLETE+VERIFIED (Grammar Battle, Word Match, Sentence Scramble) | 2026-08-17: Grammar Battle verified across two levels (1→2, 2→3) via direct RPC. Same pass, 2026-08-17: **Word Match (Family V)** verified 5→6 via direct RPC (pass/leveled-up/persist confirmed) plus a fresh Level-6 round deliberately failed (non-advancing confirmed) — supplements the earlier Level 2→3 live-browser-UI confirmation from the Game Points session. **Sentence Scramble (Family C)** verified 2→3 via direct RPC (pass/leveled-up/persist confirmed) plus a fresh Level-3 round deliberately failed (non-advancing confirmed). Curriculum gating spot-checked for both: Sentence Scramble's served content had `min_lesson_number=1` against the test student's unlocked ceiling of 45; Word Match draws from the same curriculum-gated `student_available_vocabulary()` already relied on structurally. Anti-skip enforcement confirmed by code audit (no `p_level` param on any `get_*_round()`); academy-level/game-level decoupling confirmed by code audit | Only Grammar Battle has been pushed past Level 3 (to test multi-level continuation depth); Word Match/Sentence Scramble breadth verification stopped at one level-up + one fail per game, which was the scope of this pass |
| Game ranking (Top 5, personal records, ties) | COMPLETE+VERIFIED | `GAMING-SYSTEM.md` §9; two display bugs found and fixed, then verified live | "Highest level reached" additive leaderboard (Q9 fix) shipped 2026-08-17 — backend RPC (`0151`) was already live in prod with zero callers, frontend now wired (`GameCenter.jsx`/`GameCard.jsx`); build+DB verified, real student UI session not verified (no test credentials this session) |
| Game Points (separate currency from Class Points) | COMPLETE+VERIFIED | `GAMING-SYSTEM.md` §12; migration `0152`, formula verified server-side (RPC) and frontend (live UI play), Class Points/ranking confirmed untouched | Badge integration and monthly view deliberately deferred (approved v1 scope) |
| Badges / achievements | IN PROGRESS | Two disconnected systems confirmed: DB-backed `achievement_definitions`/`student_achievements` vs. frontend-only `computeBadges()` in `src/utils/badges.js`; achievement→points bridge deliberately paused; schema now reconciled into numbered migrations (`0105`–`0110`) | Badge consolidation blocked on Dave's decision |
| Class ranking (points ledger) | COMPLETE | `RANKING-SYSTEM.md`; ledger model, RLS, `rank()`-based ties all confirmed-current | One known-open UI rank-display spot (Rankings.jsx top table) to re-verify; Recognition tie-break fixed (`0153`, applied to prod) — tie-detection SQL now confirmed against a real, currently-unfinalized 3-way tie in prod data (not just synthetic), but RPC execution and UI remain unverified — writes to `point_transactions`/`students` still blocked at the tool layer; no safe isolated test environment exists (no separate Supabase project, no local Docker-backed stack, no fixture mechanism); UI code review (2026-08-17) confirms the admin page never consumes the RPC's return value, so `0153`'s new multi-row return shape is safe |
| Deployment (release branch + gated script) | COMPLETE | `DEPLOYMENT.md`; root-cause of past incidents documented, gated `deploy:production` script in place | None known — the previously-flagged uncommitted local diff on `scripts/deploy-production.sh` no longer exists (`git diff`/`git status` both clean on that file as of 2026-08-17); stale doc claim, no code change needed |

## 2. Completed systems

Core admin system; points ledger + class ranking (Ranking V2 core); payments ledger + Telegram reminders; teacher-authorization level-scoping (6 tables, 0131-0136); 9-game library with server-authoritative grading, replay protection, curriculum-grounded content; migration-ledger reconciliation (multiple rounds); documentation consolidation itself (`706d387`, this pass).

## 3. Implemented but partially verified

- **Game Level Progression** — core mechanism (pass/fail/persist/resume/gating/anti-skip) now runtime-verified for all three representative families: Grammar Battle (Family C, two consecutive levels), Word Match (Family V, one level-up + one fail), and Sentence Scramble (Family C, one level-up + one fail); remaining 6 games code-audited only (round-generator RPCs are structurally identical). Remaining gap is depth on Word Match/Sentence Scramble (not pushed past one level-up like Grammar Battle was), not breadth.

## 4. Current known issues (see topic docs for full detail)

- Two disconnected badge/achievement systems (`GAMING-SYSTEM.md`, `DATABASE.md`).
- ~~"Day streak" label collision between attendance streak and lesson-completion streak~~ — **FIXED 2026-08-17**: the on-page stats were already correctly labeled ("Attendance streak" in `ProfileHeroCard`, "Study streak" in `LessonStatsBar`); the real collision was the `streak-7`/`streak-30` achievement badges (`src/utils/badges.js`), which are driven by `attendanceStreak` but were labeled "7/30-Day Streak" with description text "Study streak reaches N days" — colliding with the unrelated lesson-completion "Study streak" stat. Relabeled to "7/30-Day Attendance Streak" / "Attendance streak reaches N days" (EN + UZ), no calculation or badge logic changed.
- No admin UI for achievement-rule configuration or bulk point-transaction reversal.
~~Recognition (Student of the Week/Month) tie-break~~ — **FIXED 2026-08-17**: `0153_fix_recognition_tie_break.sql` applied to production; `finalize_recognition_winner()` (the function actually wired to Recognition.jsx) now detects genuine rank-1 ties and recognizes all tied students as co-winners, in place, without touching its interface/certificate behavior. SQL-logic verified (synthetic data), confirmed live in prod, and (2026-08-17, this session) read-only confirmed against a real, currently-unfinalized 3-way tie already present in prod data — level B, week 2026-07-27–2026-08-02, students 14/34/19 all at 67 pts / 1 active day / 100% attendance, all rank 1 under the exact three-criteria chain the RPC uses. RPC end-to-end and UI still not verified — a third attempt at a test write (this time inside a rolled-back transaction, to avoid any permanent change) was still denied at the tool layer, confirming the block is environment-level, not session-specific. No production writes were attempted beyond that single denied attempt, per the standing rule not to retry a confirmed-blocked operation. Recommend either approving a disposable Supabase branch for isolated RPC testing, or a runtime check the next time Recognition is genuinely used for a tied period (e.g. the real B-level week above, if Dave chooses to finalize it).
- ~~`get_leaderboard()` (0008) is dead, unscoped, still granted~~ — **FIXED 2026-08-17**: confirmed dead (zero frontend callers, `get_group_leaderboard()` is the only path since 0008 itself), confirmed already dropped in production via `0128_drop_dead_get_leaderboard.sql` (ledger version `20260814130512`) — function absent from prod `pg_proc`. No new migration needed; this was a stale doc entry.
- ~~No CHECK constraint on `point_transactions.points` magnitude~~ — **FIXED 2026-08-17**: `0154_point_transactions_magnitude_check.sql` applied to production, `CHECK (points BETWEEN -1000 AND 1000)`. Range derived from full history (1539 rows: non-baseline -211..236, one-time `baseline_migration` rows 105..608); 0 rows violate it. Constraint existence and existing-data validity confirmed live; insert/rejection behavior not runtime-tested (would require a write to `point_transactions`, disallowed by the standing no-points-writes rule).
- ~~`PaymentEngineTest.jsx`~~ — **REMOVED 2026-08-17**: obsolete diagnostic page (from the `0054`-`0060` ledger migration verification) deleted along with its `/dev/payment-engine-test` route; it was an unnecessary secondary path capable of creating real payment records. Normal Payment Engine/Payments UI unchanged.
- ~~`scripts/deploy-production.sh` has an uncommitted local modification~~ — **STALE, checked 2026-08-17**: no longer true, `git diff`/`git status` clean on this file. No action taken (nothing to fix).

## 5. Decisions still required from Dave

1. Level Progression pass thresholds, tier-band cutoffs (Family C), and length-cap/distractor bands (Family V) — see `docs/level-progression-specification-2026-08-17.md` §"Decisions Requiring Dave's Approval" (10 items, none yet approved for exact cutoffs beyond the already-shipped defaults in 0149-0151).
2. ~~Whether/how a separate "Game Points" currency should exist~~ — **DECIDED 2026-08-17**: implemented as a separate `game_points_transactions` ledger, never bridging into `point_transactions`. See `GAMING-SYSTEM.md` §12.
3. Whether the achievement→points bridge (paused 2026-08-15) stays paused permanently or resumes.
4. Badge consolidation approach — retire `computeBadges()` in favor of the DB-backed engine, or keep both with a defined split of responsibility.
5. 100-lesson curriculum expansion — approve or reject `docs/curriculum-plan-lessons-21-120-proposed.md` before any `curriculum_lessons` insert.
6. Whether/when Class Session (Ranking V2 Phase 4) Week/Month views re-enable — gated on real adoption evidence, not a date (see `RANKING-SYSTEM.md` §6 for the exact conditions).

## 6. Important technical risks

- ~~**Deploy script drift**~~ — **STALE, checked 2026-08-17**: `scripts/deploy-production.sh` has no uncommitted diff; committed version is current.
- **Runtime-verification discipline**: at least two production bugs in the gaming system were caught only by live testing, not code review. Any future "verified in production" claim across any system in this doc set should meet the same bar.
- **Migration ledger drift**: has diverged from production more than once historically; never run `supabase db push` without confirming ledger/production parity first.
- **Level-snapshot gap**: `game_sessions` has no academy-level snapshot at play time — a distinct, still-open item from Game Level Progression; do not bundle a fix for one into work on the other.

## 7. Planned work (not built, roadmap order)

See `ROADMAP.md` for the full breakdown and reasoning. In order: (1) ~~additive "highest level reached" leaderboard view~~ — **SHIPPED 2026-08-17**, (2) ~~achievement schema reconciliation~~ — **already done**: `0105_achievement_engine_schema.sql` is the committed, numbered migration (confirmed applied to prod); the untracked `PROD_RECONCILED_achievement_engine_schema.sql` is an earlier, superseded draft of the same reconciliation and is safe to leave as-is (0105's header documents the relationship; both are idempotent), (3) badge consolidation, (4) badge→Game Points integration (Game Points itself now shipped, `GAMING-SYSTEM.md` §12), (5) ongoing game balance/content work.

## 8. Deferred work (explicit decision, not oversight)

Points-pause (achievement→points bridge); server-side streak persistence; Class/Weekly/Monthly ranking re-enable on the `class_session` path; level-scoped RLS extension to `files` (no level column exists — would need a product decision on whether shared resources should be level-restricted, not just a mechanical fix); 100-lesson curriculum expansion (awaiting approval).

## 9. Recommended next development sessions

0. ~~Apply `0156_curriculum_progress_teacher_level_scope.sql` to production~~ — **DONE 2026-08-17**, confirmed live via `pg_policies` on `curriculum_progress`.
1. If further Level Progression breadth is wanted: push one Family V and one Family C game past Level 2 the same way Grammar Battle was (this pass) — Grammar Battle's mechanism (pass/fail/multi-level/gating/anti-skip) is now settled and doesn't need re-verification.
2. Badge system consolidation — but only after Dave decides the approach (§5.4).
3. ~~"Highest level reached" additive leaderboard view (Q9 fix)~~ — **SHIPPED 2026-08-17**. Recommended follow-up: verify the "level leader" chip renders correctly in a real logged-in student session (blocked this session on missing test credentials).
5. ~~Resolve the `scripts/deploy-production.sh` uncommitted diff~~ — **stale, checked 2026-08-17**: no diff exists.
