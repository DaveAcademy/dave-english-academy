# Dave English Academy — Project Handoff

**This file is the primary entry point for every new AI session on this project.** Read it first, before touching code or any other doc. It routes you to the right topic doc and states the standard session workflow; it deliberately does not duplicate the detail that lives in the topic docs themselves.

Then read the topic doc(s) you need: `PROJECT-STATUS.md`, `ARCHITECTURE.md`, `DATABASE.md`, `CURRICULUM.md`, `GAMING-SYSTEM.md`, `RANKING-SYSTEM.md`, `ADMIN-SYSTEM.md`, `PAYMENTS.md`, `DEPLOYMENT.md`, `ROADMAP.md`. These eleven files supersede the 26+ dated audit/spec docs that preceded them — those older files are **not deleted** and remain useful as historical detail/evidence, but this set is the canonical reference going forward.

## 0. Task type → read

| If the task is about... | Read |
|---|---|
| "What's the current state of the project / what's done / what's next" | `PROJECT-STATUS.md` |
| Stack, RLS/RPC patterns, frontend↔backend boundary, data flows | `ARCHITECTURE.md` |
| Schema, migrations, RLS detail, RPC inventory, DB production rules | `DATABASE.md` |
| Lessons, curriculum numbering, four-skill progression, vocabulary | `CURRICULUM.md` |
| Any of the 9 games, level progression, content banks, records/leaderboards | `GAMING-SYSTEM.md` |
| Class points, ledger, Rankings.jsx, class-session, recognition/tie-break | `RANKING-SYSTEM.md` |
| Admin pages, students/groups/attendance/reports | `ADMIN-SYSTEM.md` |
| Payments ledger, Telegram reminders | `PAYMENTS.md` |
| Shipping to production, deploy script, past outage causes | `DEPLOYMENT.md` |
| Prioritization, what's next, what's deferred/planned | `ROADMAP.md` |

## Standard workflow for a new session

1. Read this file (`PROJECT-HANDOFF.md`), then the one or two topic docs the task actually touches — not the whole set.
2. If Graphify (or an equivalent architecture/dependency-navigation tool) is available, use it to trace RPC/table/component relationships instead of a manual file sweep.
3. Inspect only the code relevant to the task — this doc set exists so you don't need to re-read the whole repo to get oriented.
4. Do one focused task. Flag adjacent issues instead of fixing them inline (see rule 7 below).
5. Runtime-test when the change is deploy/production-facing — static code/SQL review does not count as verification (see rule 4 below).
6. Commit.
7. Update the relevant doc(s) if the change altered status, added a known issue, or closed one — small, targeted edits, not rewrites.
8. Close the session with a clear statement of what shipped and what's still open.

**Historical session transcripts (~90 dated dev sessions) are archival-only.** Ordinary development should rely on the repo, `git log`, and this canonical doc set — not on reconstructing old conversations. If something important would be lost by never reading those transcripts again, it belongs in this doc set instead; that is the standard this documentation is held to.

Status labels used throughout this doc set: **confirmed-current** (repo-verified), **planned**, **historical-only**, **known-issue-open**, **known-issue-fixed**, **unverified-assumption**.

---

## 1. Project identity

Dave English Academy is a single-operator English-language school management system: student/group/curriculum administration, attendance, payments, exams/homework, a points-based ranking system, and a 9-game vocabulary/grammar practice suite ("Game Center"), plus a parallel student-facing portal. One person (Dave) wears every operational role (admin, teacher-support, product decision-maker); prioritize work by "hours saved for Dave," not enterprise completeness (**confirmed-current**, `dave-academy-single-operator-model` prior-session decision, consistent with actual repo structure).

Repo: `C:\Dave Academy`. Production branch: `release/dashboard-redesign` (HEAD at doc time `15e17ae`). `main` does **not** reflect production — see `DEPLOYMENT.md`.

## 2. Tech stack (confirmed-current, from `package.json`)

- React 18.3 + Vite 5, `react-router-dom` 6
- `@supabase/supabase-js` 2.110 — Postgres + Auth + Storage + RLS + RPC (SECURITY DEFINER functions)
- `i18next` / `react-i18next` — EN/UZ localization
- `vite-plugin-pwa` — PWA/service worker present
- Tailwind CSS
- `jspdf`, `jspdf-autotable`, `pdf-lib`, `pdfjs-dist` — PDF generation (certificates, reports, lesson PDFs)
- Deploy: Vercel, via a custom gated script (`scripts/deploy-production.sh`, `npm run deploy:production`) — never bare `vercel --prod`. See `DEPLOYMENT.md`.

## 3. Product structure

| Area | Doc | One-line status |
|---|---|---|
| Students, groups, levels, attendance, admin dashboard | `ADMIN-SYSTEM.md` | Implemented, stable |
| Curriculum, lessons, 100-lesson plan, four-skill progression | `CURRICULUM.md` | Foundation live; 100-lesson expansion is a proposal, not yet inserted |
| Exams, homework | `ADMIN-SYSTEM.md`, `CURRICULUM.md` | Implemented; grading verified end-to-end |
| Payments | `PAYMENTS.md` | Ledger-based, implemented; Telegram reminders implemented |
| Points / class ranking | `RANKING-SYSTEM.md` | Implemented (ledger model); UI/UX defects documented, some fixed |
| Gaming system (9 games) | `GAMING-SYSTEM.md` | Implemented, deployed, server-authoritative; Level Progression newly shipped (0149-0151) |
| Badges / achievements / gamification | `GAMING-SYSTEM.md` §Points, `docs/gamification-system-audit-2026-08-16.md` | Partially implemented — two disconnected badge systems, points-bridge paused |
| Architecture / infra | `ARCHITECTURE.md` | Confirmed-current |
| Database schema/RPCs | `DATABASE.md` | Confirmed-current |
| Deployment process | `DEPLOYMENT.md` | Confirmed-current, updated this pass |

## 4. Important technical rules (standing, cross-cutting)

1. **Never write to `point_transactions` or `students.points`/rankings directly.** Dave manages all point changes personally through the existing UI/RPCs. This includes not "fixing" ranking data via ad hoc writes.
2. **No unauthorized student-data deletion.** Never hard-delete student, payment, or academic records.
3. **Never rewrite an already-applied migration.** If prod schema needs correction, write a new corrective migration (see the `PROD_RECONCILED_*` convention in `DATABASE.md`) — don't edit history.
4. **Runtime verification required before claiming production behavior correct.** Static code/SQL review is not sufficient to mark a deploy/verify task PASS — confirmed standing rule after two bugs in the gaming/leaderboard work were caught only by live testing (see `GAMING-SYSTEM.md` known-issues).
5. **Migration ledger discipline.** Do not run `supabase db push` without first confirming ledger/production parity for the affected range — historical divergence has happened more than once (see `DATABASE.md` §Migration conventions).
6. **Reference `.claude/skills/` before duplicating process rules.** Correction to a prior pass of this doc: the directory **does exist** — `.claude/skills/` contains 12 skills (`architecture-token-health-monitor`, `business-rules-guardian`, `code-cleanup-assistant`, `database-safety-auditor`, `dave-academy-development-standards`, `feature-completion-checker`, `performance-watcher`, `project-memory-guardian`, `release-checklist`, `security-auditor`, `translation-auditor`, `ui-consistency-auditor`). Confirmed present via directory listing on 2026-08-17. Check it before adding new process/standards rules anywhere in this doc set.
7. **Keep sessions focused and token-efficient.** One job per session where possible; audit-before-modify for anything touching production data or shipped behavior; flag adjacent issues instead of fixing them inline.

## 5. Current status

### Completed
- Core admin system: students, groups, levels, attendance, exams, homework, certificates, reports.
- Points ledger + class ranking (Ranking V2 core: level-scoped periods, undo, all-time consistency).
- Payments ledger (`payment_transactions`) with Telegram reminder workflow.
- Gaming system: 9 games, curriculum-grounded content, server-authoritative grading, replay protection, adaptive/level-driven difficulty, Top-5 leaderboard + personal records.
- Game Level Progression (migrations 0149-0151): persistent per-(student, game) level cursor, deployed.
- Teacher-authorization level-scoping across 6 tables (migrations 0131-0136).
- Migration-ledger reconciliation passes (multiple rounds; see `DATABASE.md`).

### In progress / recently shipped, unverified in full
- Level Progression's server-side enforcement of level access (client cannot request an unearned level) — implemented per migration 0150; confirm against `GAMING-SYSTEM.md` for exact verification status.
- Level-retry copy fix for lives-based games (`15e17ae`, HEAD).

### Planned (not built)
- Game Points as a currency separate from Class Points (architectural intent only — no `game_points` column/table found in the schema this pass).
- Badge system consolidation (two disconnected badge mechanisms today — DB-backed `student_achievements` vs. frontend-only `computeBadges()`).
- Achievement schema reconciliation into local migration history (schema currently prod-only for `achievement_definitions`/`student_achievements`/`student_metric_snapshots`, mirrored by a `PROD_RECONCILED_achievement_engine_schema.sql` file sitting untracked at doc time).
- Ranking-conflict fix: flat per-correct game scoring doesn't reward level/difficulty — recommended fix is an additive "highest level reached" view, not a change to existing score ranking.
- 100-lesson curriculum expansion (`docs/curriculum-plan-lessons-21-120-proposed.md` — proposal only, not inserted into `curriculum_lessons`).

### Deferred (explicit decision, not oversight)
- Points-pause: achievement→points bridge deliberately paused by owner request (2026-08-15); permanence undecided.
- Academy-level snapshot gap on `game_sessions` (a ranking-scoping gap distinct from game-level progression) — explicitly flagged, not fixed, in both the ranking audit and the level progression spec.
- Streak persistence (currently recomputed client-side each render, not stored).
- New beginner game (e.g. Picture Vocabulary) — idea only, see `ROADMAP.md`.

### Known issues (see topic docs for detail)
- Two disconnected badge/achievement display systems (`GAMING-SYSTEM.md`).
- "Day streak" label collision between attendance streak and lesson-completion streak (`docs/dashboard-v3-progress-studio-spec.md` era finding — unfixed at doc time).
- No admin UI for achievement-rule configuration or point-transaction reversal beyond a session-local undo.
- Class/Weekly/Monthly ranking on the `class_session` path is rolled back to the ledger-based path pending real adoption of the session-opening workflow (`RANKING-SYSTEM.md`).

## 6. Immediate roadmap summary

See `ROADMAP.md` for the full breakdown. In order: (1) verify Level Progression end-to-end at runtime [next session's first job per prior close-out note], (2) game ranking improvements (level-reached view), (3) achievement schema reconciliation, (4) badge consolidation, (5) Game Points design decision, (6) game balance/content work, (7) possible new beginner game.
