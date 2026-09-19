# Gamification System Audit & Roadmap (2026-08-16)

**Status: AUDIT / ARCHITECTURE / ROADMAP DOCUMENT — not an implementation spec.** No code, migrations, or database state were modified while producing this document.

Scope: points, rankings integration, achievements, streaks/badges, and the gamified student portal (PortalHomeV3). Ranking V2 internals and the Game Center (4 games) were already audited in prior sessions and are treated here only as dependencies/integration points, not re-audited.

## A. Current-state audit

| System | Exists? | Location | Current behavior | Data source | Status |
|---|---|---|---|---|---|
| Points | Yes | `point_transactions` table, `awardPoints()`/`bulkAwardPoints()` in [storageBridge.js](src/lib/storageBridge.js#L86-L139), UI in [Rankings.jsx](src/pages/Rankings.jsx#L187-L263) | Manual award/deduct by admin/teacher (level-scoped), plus achievement-triggered inserts server-side; immutable ledger, corrections via reversal rows | `point_transactions` → `students.points` cached via trigger | **Implemented** |
| Leaderboards | Yes | Ranking V2 (already deployed, audited separately) | Server RPC-computed, level-scoped, lifetime ranking | `point_transactions` | **Implemented** |
| Student rankings | Yes | `PortalHomeV3.jsx:114-154`, `Rankings.jsx` | Reads Ranking V2 RPCs; old academy-wide `get_leaderboard()` dropped (0128) | Ranking V2 RPCs | **Implemented** |
| Achievements | Partial | `achievement_definitions`/`student_achievements` (schema not in local migrations — prod-only, ledger divergence), evaluator in `0127_secure_achievement_evaluator.sql` | Rules unlock badge rows server-side; **point-award bridge deliberately paused 2026-08-15** per owner request | DB tables + trigger evaluator | **Partially implemented** (badges unlock, points paused) |
| Badges | Yes, but split | (a) DB `student_achievements` (server, points-paused) — (b) `src/utils/badges.js` `computeBadges()` (frontend-only, no persistence) | Two disconnected badge systems; 3 badge types explicitly marked `unavailable: true` in code because backend state doesn't exist | Mixed — DB for (a), client-computed stats for (b) | **Partially implemented / duplicated** |
| XP | No | — | Not found anywhere in `src/pages/portal/` or `src/components/` | — | **Missing** |
| Levels (game-mechanic) | No | — | Only CEFR levels (A1/A2/B1...) exist; no game-progression "level" concept | — | **Missing** (not to be confused with CEFR level) |
| Streaks | Partial | `PortalHomeV3.jsx` `currentPresentStreak()` (lines 104-111) | Attendance streak, computed client-side from real attendance records each render, not persisted/stored | Client computation over `attendance` table | **Partially implemented** (real data, but recomputed, not stored) |
| Rewards | No | — | No reward mechanism beyond points/badges themselves | — | **Missing** |
| Challenges/Quests | No | — | Not found | — | **Missing** |
| Progress | Yes | `MyProgress.jsx`, `curriculum_progress` | Real curriculum/lesson progress tracking, pre-existing and stable | `curriculum_progress`, `student_lesson_progress` | **Implemented** |
| Student stats | Yes | `PortalHomeV3.jsx` dashboard stats | Real, live-wired (points, rank, attendance, exam/homework stats) | Multiple real tables | **Implemented** |
| Competition | Yes | Rankings/leaderboard | Ranking V2 provides this | Ranking V2 | **Implemented** |
| Recognition | Yes | Certificates/Recognition system (audited separately, shipped) | Monthly recognition/certificate generation | `recognition`-related tables | **Implemented** |

## B. Architecture map

```
Point origin (manual award, exam/homework/lesson-work grading, class-session bulk award)
  → awardPoints()/bulkAwardPoints() [storageBridge.js] — single client-side write path
  → point_transactions (immutable ledger: awarded_by, reason, lesson_date, is_reversal)
       ↳ level-match trigger enforces transaction.level == student's actual level
  → students.points (DB-trigger-maintained cache, 0020)
  → Ranking V2 RPCs (level-scoped lifetime leaderboard — external dependency, not re-audited)
  → display: Rankings.jsx, PortalHomeV3.jsx, MyProgress.jsx

Achievement evaluation (server-side, evaluate_achievements/_evaluate_achievements_internal, 0127)
  → reads student_metric_snapshots (bumped by Game Center + other systems)
  → unlocks student_achievements rows
  → [POINT-AWARD STEP: REMOVED 2026-08-15, per owner request — badges unlock with no points]

Badges shown to students (PortalHomeV3 BadgeShelf)
  → computeBadges() [src/utils/badges.js] — entirely separate, frontend-only rule engine
  → recomputed from already-loaded dashboard stats every render, not persisted
  → NOT the same system as student_achievements above (two parallel, disconnected badge mechanisms)

Streak shown to students
  → currentPresentStreak() computed client-side from attendance records, every render
```

Ranking V2 and Game Center are both stable dependencies read from this map, not modified by it.

## C. Problems / risks, ranked by severity

1. **P1 — Two disconnected badge/achievement systems.** The DB-backed `achievement_definitions`/`student_achievements` engine (server-evaluated, previously points-linked) and the frontend-only `computeBadges()` in `badges.js` are entirely separate mechanisms showing badges to the same student in the same UI. This is confusing to reason about and a real duplication-of-truth risk if either is extended independently.
2. **P1 — Achievement schema missing from local migrations.** `achievement_definitions`, `student_achievements`, `student_metric_snapshots` have no CREATE TABLE in the repo's migration history — same pattern as the previously-flagged migration-ledger divergence, now confirmed to affect gamification tables specifically, not just payments. Any future schema change to these tables risks the same reconciliation pain already experienced with payments.
3. **P2 — Silent points-paused inconsistency.** Achievement code paths (trigger wiring, `bonus_points` column, UI badge-unlock animation) are all still live even though the actual point award was removed 2026-08-15. A badge visibly "unlocks" with zero reward — intentional per owner, but reads as a bug to anyone unaware of the pause, including future maintainers.
4. **P2 — No admin UI for achievement configuration or correction.** Achievement rules are migration/DB-seeded only; there's no way to review, adjust, or audit them from the app. Point corrections rely on manually re-entering reversal rows through the same award UI — no dedicated one-click "undo" affordance.
5. **P3 — Streaks recomputed, not stored.** Not a correctness bug (data source is real), but means no historical streak record exists to build streak-based rewards on top of later.

No P0s: the points ledger itself is immutable, audited, RLS-correct, and has no client-manipulation vector found.

## D. Target gamification model

**Core (keep/improve, do not redesign):**
- **Points** — Keep as-is. The ledger model (immutable, audited, reversal-based corrections) is correct and shouldn't change. Improve: give admins a proper one-click reversal UI instead of manual re-entry.
- **Rankings** — Keep. Owned by Ranking V2, already deployed and stable; not this system's concern.
- **Progress** — Keep. Already solid, curriculum-linked.
- **Achievements** — Improve, don't rebuild. The server-side engine and ledger-based point bridge are sound architecture — the problem is the *second*, disconnected badge system layered on top in the frontend, not the DB engine itself.

**Potential future layers — assessed against what the academy actually needs, not a generic gamification checklist:**
- **XP** — Do not build. Points already serve this role; adding a parallel XP currency would be a second source of truth for the same concept.
- **Streaks** — Add later, once persisted server-side (currently client-computed only — persisting is a small, well-scoped follow-up, not urgent).
- **Challenges/Quests** — Add later, only if a concrete pedagogical use case emerges (e.g. "complete this week's homework + attend all classes"). Not justified as a green-field feature right now.
- **Badges** — Improve: consolidate onto the one existing DB-backed engine; retire or fold in `computeBadges()`'s useful rules (attendance/homework/exam-based) as server-evaluated achievement definitions instead of a parallel client computation.
- **Rewards (beyond points)** — Do not build yet. No evidence of demand; points+recognition already serve the reward role at this academy's scale.
- **Seasonal events / competitions beyond ranking** — Do not build. Disproportionate to the academy's size; Ranking V2's monthly cycle already covers this need.

## E. Prioritized roadmap

**Phase 0 — Foundation**
1. Reconcile `achievement_definitions`/`student_achievements`/`student_metric_snapshots` schema into local migrations (same remediation pattern already used for the payment/migration-ledger divergence). Problem: schema drift risk on next change. Benefit: safe to modify achievements going forward. Complexity: Medium (schema archaeology, no logic change). Dependency: none. Priority: **P1**. Backend/schema work: yes.
2. Decide and document the intended state of the points-pause: is it permanent, or should the achievement→points bridge be re-enabled once trustworthy? (Product decision, not code — but blocks Phase 1 badge consolidation from knowing whether to re-wire points.) Priority: **P1**. No schema work.

**Phase 1 — Core gamification**
3. Consolidate the two badge systems onto the DB-backed achievement engine; retire `computeBadges()`'s parallel logic or migrate its rules into `achievement_definitions` rows. Problem: duplicated/inconsistent badge sources. Benefit: one trustworthy badge system, easier to extend. Complexity: Medium. Dependency: Phase 0 item 1 (schema reconciled first). Priority: **P1**. Backend/schema work: yes (new achievement_definitions rows) + frontend (swap `computeBadges()` for a real data read).
4. Build a proper admin reversal/correction UI for `point_transactions` (one-click reversal instead of manual re-entry), and a minimal achievement-definitions review UI. Problem: current correction workflow is manual and error-prone (already caused at least one real incident, per the double-submit guard comment). Benefit: less teacher/admin friction, fewer manual-entry mistakes. Complexity: Medium. Dependency: none. Priority: **P1**.

**Phase 2 — Engagement**
5. Persist streaks server-side (attendance streak currently recomputed client-side each render). Problem: no historical record, can't build streak-based rewards without one. Benefit: enables future streak-based recognition without re-deriving it. Complexity: Low-Medium. Dependency: none. Priority: **P2**.
6. Once Game Center's replay-protection (migration 0141) is deployed and verified, re-evaluate whether/how game-derived achievement metrics should feed the (now-consolidated) badge system. Problem: games already bump metrics that achievements could read, but the bridge to points is currently paused academy-wide. Benefit: closes the loop the Game Center was originally built toward. Complexity: Low (config, not new architecture). Dependency: Game Center deploy gate session (separate, already scheped) + Phase 0/1 above. Priority: **P2**.

**Phase 3 — Advanced gamification**
7. Challenges/quests, if a concrete pedagogical use case is identified later. Priority: **P3 / Do not build now**.
8. XP, seasonal events beyond Ranking V2's existing monthly cycle. Priority: **Do not build**.

## F. Recommended next development session

**Phase 0, item 1: reconcile the achievement schema into local migrations.**

This is the single right next step because every other roadmap item — badge consolidation, points-pause decision, admin correction UI — either touches or depends on tables that currently don't officially exist in the migration history. Fixing this first is low-risk (it's a documentation/reconciliation exercise, not new logic, following the exact playbook already used for the payment-ledger divergence) and unblocks everything downstream without committing to any product decision yet (like whether points-pause is permanent).

No implementation was started in this session, per the stated audit-only boundary.
