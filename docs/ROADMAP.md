# Roadmap

Status labels as elsewhere in this doc set. This file does not authorize any of the "Planned"/"Future ideas" items as approved requirements — they're recorded here so the next session doesn't have to re-derive priority from scattered audit docs.

## Completed

- Core admin system (students, groups, attendance, exams, homework, certificates, reports).
- Points ledger + Ranking V2 core (level-scoped periods, undo, consistency fixes).
- Payments ledger + Telegram reminder workflow.
- Teacher-authorization level-scoping (6 tables, migrations 0131-0136).
- 9-game library, server-authoritative, curriculum-grounded content, replay protection (0141-0148).
- Game Level Progression (0149-0151) — deployed; see `GAMING-SYSTEM.md` §7 for exact current-vs-future scope.
- Migration-ledger reconciliation passes (multiple rounds).

## Current (this session's focus)

Documentation consolidation (this doc set) — replaces sprawling per-session audit docs with 10 canonical reference files. No code/schema/deploy changes made as part of this work.

## Next (recommended order, per prior close-out notes and this pass's synthesis)

1. **Runtime-verify Level Progression end-to-end** — a logged-in session testing actual level-up/fail/replay behavior across at least one game per family, not another static read-through. This was the explicit next-job note from the session that shipped `35fa46d`.
2. **Game ranking improvement** — build the additive "highest level reached" leaderboard view (Q9 from the Level Progression spec), leaving the existing score-based Top 5/rank untouched.
3. **Achievement schema reconciliation** — turn `PROD_RECONCILED_achievement_engine_schema.sql` into a proper committed, numbered migration (or confirm the existing reconciliation file is sufficient and commit it as-is). Unblocks everything below.
4. **Badge system consolidation** — retire or fold `src/utils/badges.js`'s `computeBadges()` into the DB-backed `achievement_definitions`/`student_achievements` engine so there's one badge source of truth, not two.
5. **Game Points design decision** — a product decision on whether/how a separate Game Points currency should exist alongside Class Points, and if so, how (or whether) it ever bridges into `point_transactions` (recommendation from prior audits: it should not write directly into the existing points ledger — see `GAMING-SYSTEM.md` §12).
6. **Badge→Game Points integration** — only relevant once item 5 is decided; do not build ahead of that decision.
7. **Game balance / content work** — ongoing tuning of difficulty bands, content-bank coverage, and vocabulary discipline per `docs/game-content-bank-standards-2026-08-16.md`.

## Deferred (explicit decision, not oversight)

- Points-pause (achievement→points bridge) — permanence undecided, owner-paused 2026-08-15.
- Academy-level snapshot gap on `game_sessions` — explicitly kept separate from Game Level Progression.
- Streak persistence (server-side, currently client-recomputed).
- Class/Weekly/Monthly ranking re-enable on the `class_session` path — gated on real adoption evidence, not a schedule (see `RANKING-SYSTEM.md` §6 for the exact conditions).
- Level-scoped RLS extension to remaining role-only tables (`files`, `curriculum_progress`) — latent risk, low urgency (only 2 all-level teachers exist).
- 100-lesson curriculum expansion — awaiting Dave's approval before any `curriculum_lessons` insert.

## Future ideas (not approved, not scoped — do not treat as requirements)

- A new beginner-friendly game, e.g. "Picture Vocabulary" — raised as an idea in the prior roadmap sequencing, not designed or scoped.
- Admin correction UI for point-transaction reversal beyond the current session-local undo.
- Admin UI for achievement-rule review/configuration.
- Wiring the Recognition page to the tie-break-correct `finalize_recognition()` function instead of the currently-called `finalize_recognition_winner()` (or extending the latter to support co-winners) — see `RANKING-SYSTEM.md` §4.

## Cross-references

Full detail behind every item above lives in the matching topic doc: `GAMING-SYSTEM.md`, `RANKING-SYSTEM.md`, `DATABASE.md`, `CURRICULUM.md`, `PAYMENTS.md`, `ADMIN-SYSTEM.md`, `DEPLOYMENT.md`. Start from `PROJECT-HANDOFF.md` for the overview.
