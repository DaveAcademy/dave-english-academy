# Project Status

Snapshot as of 2026-08-17 (HEAD `a61124d`, branch `release/dashboard-redesign`). See `PROJECT-HANDOFF.md` for how to use this doc set; see each topic doc for full detail behind any line below.

Status labels: **COMPLETE**, **COMPLETE+VERIFIED** (runtime-tested in production, not just code-reviewed), **IMPLEMENTED+PARTIALLY VERIFIED**, **IN PROGRESS**, **PLANNED**, **DEFERRED**, **NEEDS DECISION**.

## 1. Status table

| Area | Status | Evidence | Remaining work |
|---|---|---|---|
| Architecture (React/Vite + Supabase RPC/RLS) | COMPLETE | `ARCHITECTURE.md`, confirmed against `package.json`/repo structure | None known |
| Database / migrations (151 numbered + 6 `PROD_RECONCILED_*`) | COMPLETE | `DATABASE.md`; migration-ledger reconciliation passes done | Achievement-engine schema still not a committed numbered migration; a few latent RLS gaps (`files`, `curriculum_progress`) |
| Curriculum (12 lessons live of a 100-lesson target) | IN PROGRESS | `CURRICULUM.md`; 12/100 lesson teaching instances built | 100-lesson expansion is a written proposal only, not inserted; needs Dave's approval |
| Admin system (students/groups/attendance/exams/homework/reports/certificates) | COMPLETE | `ADMIN-SYSTEM.md`; all pages exist and routed | `PaymentEngineTest.jsx` production-status unresolved; no reversal UI beyond session-local undo |
| Payments (ledger + Telegram reminders) | COMPLETE | `PAYMENTS.md`; ledger confirmed, reminder candidate flow confirmed | Whether reminder sends are truly scheduled vs. admin-triggered-only not fully resolved |
| Gaming — 9 games, server-authoritative | COMPLETE+VERIFIED | `GAMING-SYSTEM.md`; replay protection, curriculum gating, no P0s across 2 audits | Ongoing content/balance tuning |
| Game Level Progression (0149-0151) | IMPLEMENTED+PARTIALLY VERIFIED | Grammar Battle Level 1→2 pass path runtime-verified 2026-08-17 via direct RPC call (server path + persistence + UI-resume confirmed); full human-paced UI playthrough of the timer not verified; anti-skip server enforcement (0150) not line-by-line audited | Runtime-verify at least one Family V and one Family C game the same way; audit 0150's enforcement logic directly |
| Game ranking (Top 5, personal records, ties) | COMPLETE+VERIFIED | `GAMING-SYSTEM.md` §9; two display bugs found and fixed, then verified live | "Highest level reached" additive leaderboard view not built (Q9 ranking-conflict fix) |
| Game Points (separate currency from Class Points) | PLANNED | No `game_points` column/table/reference found anywhere in repo | Full product decision required before any schema work — see §5 |
| Badges / achievements | IN PROGRESS | Two disconnected systems confirmed: DB-backed `achievement_definitions`/`student_achievements` vs. frontend-only `computeBadges()` in `src/utils/badges.js`; achievement→points bridge deliberately paused | Schema reconciliation into a numbered migration; badge consolidation; both blocked on Dave's decisions |
| Class ranking (points ledger) | COMPLETE | `RANKING-SYSTEM.md`; ledger model, RLS, `rank()`-based ties all confirmed-current | One known-open UI rank-display spot (Rankings.jsx top table) to re-verify; Recognition tie-break wired to the wrong function |
| Deployment (release branch + gated script) | COMPLETE | `DEPLOYMENT.md`; root-cause of past incidents documented, gated `deploy:production` script in place | `scripts/deploy-production.sh` has an uncommitted local diff at doc time — review/commit or discard before trusting exact current behavior |

## 2. Completed systems

Core admin system; points ledger + class ranking (Ranking V2 core); payments ledger + Telegram reminders; teacher-authorization level-scoping (6 tables, 0131-0136); 9-game library with server-authoritative grading, replay protection, curriculum-grounded content; migration-ledger reconciliation (multiple rounds); documentation consolidation itself (`706d387`, this pass).

## 3. Implemented but partially verified

- **Game Level Progression** — see table above. This is the one active area where "implemented" and "fully verified" are deliberately not the same claim; do not round this up to COMPLETE+VERIFIED without a broader runtime pass across more games.
- Level Progression's server-side anti-skip enforcement (0150) — exists per spec, not independently re-audited line-by-line.

## 4. Current known issues (see topic docs for full detail)

- Two disconnected badge/achievement systems (`GAMING-SYSTEM.md`, `DATABASE.md`).
- "Day streak" label collision between attendance streak and lesson-completion streak — unfixed.
- No admin UI for achievement-rule configuration or bulk point-transaction reversal.
- Recognition (Student of the Week/Month) tie-break: correct function (`finalize_recognition()`) exists but is dead code; the page calls `finalize_recognition_winner()`, which has no tie-break.
- `get_leaderboard()` (0008) is dead, unscoped, still granted — low severity, flagged for removal, not yet dropped.
- No CHECK constraint on `point_transactions.points` magnitude.
- Achievement-engine schema (`achievement_definitions`/`student_achievements`/`student_metric_snapshots`) has no numbered local migration, only an untracked `PROD_RECONCILED_*` reconstruction.
- `PaymentEngineTest.jsx` production status (keep vs. remove) unresolved.
- `scripts/deploy-production.sh` has an uncommitted local modification at doc time — not made by any doc session, ownership/intent not established here.

## 5. Decisions still required from Dave

1. Level Progression pass thresholds, tier-band cutoffs (Family C), and length-cap/distractor bands (Family V) — see `docs/level-progression-specification-2026-08-17.md` §"Decisions Requiring Dave's Approval" (10 items, none yet approved for exact cutoffs beyond the already-shipped defaults in 0149-0151).
2. Whether/how a separate "Game Points" currency should exist, and whether it ever bridges into `point_transactions` (recommendation: never write directly into the existing ledger).
3. Whether the achievement→points bridge (paused 2026-08-15) stays paused permanently or resumes.
4. Badge consolidation approach — retire `computeBadges()` in favor of the DB-backed engine, or keep both with a defined split of responsibility.
5. 100-lesson curriculum expansion — approve or reject `docs/curriculum-plan-lessons-21-120-proposed.md` before any `curriculum_lessons` insert.
6. `PaymentEngineTest.jsx` — keep as an intentional diagnostic tool, or remove.
7. Whether/when Class Session (Ranking V2 Phase 4) Week/Month views re-enable — gated on real adoption evidence, not a date (see `RANKING-SYSTEM.md` §6 for the exact conditions).

## 6. Important technical risks

- **Deploy script drift**: `scripts/deploy-production.sh` has an uncommitted local diff outside any doc session's control — until resolved, don't assume the committed version is exactly what a deploy would run.
- **Runtime-verification discipline**: at least two production bugs in the gaming system were caught only by live testing, not code review. Any future "verified in production" claim across any system in this doc set should meet the same bar.
- **Migration ledger drift**: has diverged from production more than once historically; never run `supabase db push` without confirming ledger/production parity first.
- **Level-snapshot gap**: `game_sessions` has no academy-level snapshot at play time — a distinct, still-open item from Game Level Progression; do not bundle a fix for one into work on the other.

## 7. Planned work (not built, roadmap order)

See `ROADMAP.md` for the full breakdown and reasoning. In order: (1) broaden Level Progression runtime verification across more games, (2) additive "highest level reached" leaderboard view, (3) achievement schema reconciliation, (4) badge consolidation, (5) Game Points design decision, (6) badge→Game Points integration (only after #5), (7) ongoing game balance/content work.

## 8. Deferred work (explicit decision, not oversight)

Points-pause (achievement→points bridge); academy-level snapshot gap on `game_sessions`; server-side streak persistence; Class/Weekly/Monthly ranking re-enable on the `class_session` path; level-scoped RLS extension to `files`/`curriculum_progress` (latent, low urgency — only 2 all-level teachers exist); 100-lesson curriculum expansion (awaiting approval).

## 9. Recommended next development sessions

1. Broaden Level Progression runtime verification (one Family V game, one more Family C game, logged-in UI where feasible) — do not re-verify Grammar Battle again, that's settled.
2. Achievement schema reconciliation — commit `PROD_RECONCILED_achievement_engine_schema.sql` as a proper numbered migration, or confirm it's sufficient as-is.
3. Badge system consolidation — but only after Dave decides the approach (§5.4).
4. "Highest level reached" additive leaderboard view (Q9 fix) — explicitly additive, don't touch the existing verified score-ranking RPC.
5. Resolve the `scripts/deploy-production.sh` uncommitted diff (review, commit, or discard) before it causes deploy-behavior confusion.
