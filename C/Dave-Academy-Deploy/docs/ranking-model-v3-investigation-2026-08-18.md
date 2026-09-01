# Ranking Model v3 — Investigation & Architecture Mapping (2026-08-18)

Scope: map Dave's finalized real-world scoring model (Point Components → Class Score →
Weekly Total → Monthly Total → Group Ranking) against the existing implementation.
**Investigation only — no DB or frontend changes made this session.**

---

## 1. Current architecture (confirmed-current)

- `point_transactions` — append-only ledger, single source of truth for Class Points.
  Only path in: `Rankings.jsx` → `awardPoints()`/`bulkAwardPoints()` (manual teacher/admin
  entry). **Homework, attendance, and exams do not feed this ledger** — deliberately
  removed in `0008` because the old automatic formula produced flat zeros for most
  students. `exam`/`homework`/`achievement_bonus` category rows that existed briefly in
  Aug 2026 were reversed out per Dave's 2026-08-15 instruction (`PROD_RECONCILED_*` files);
  confirmed-current policy: **only `bonus`/`penalty` (manual) categories drive the ledger.**
- `students.points` — trigger-maintained cache of the ledger sum, not directly writable.
- `get_group_leaderboard(level, period_type, period_start)` — main ranking RPC (week/month/
  all_time), level-scoped, `rank()`-based (ties handled correctly).
- **Class Session architecture already exists** (`0137`–`0139`, "Ranking V2 Phase 4"):
  `class_group` (one row per level today) + `class_session` (one row per group+date,
  created by an *explicit* "open session" action, never inferred) +
  `point_transactions.class_session_id` (nullable FK). Three RPCs ship this exactly:
  `get_class_leaderboard`, `get_weekly_class_leaderboard`, `get_monthly_class_leaderboard`
  — per-session, per-week, per-month totals, matrix-shaped (student × session), summed
  from real `class_session.session_date` rows, never an assumed Tue/Thu/Sat pattern.
  **Status: implemented and deployed, but dormant.** Every historical `point_transactions`
  row has `class_session_id = NULL` because the session-opening workflow (§4 of the design
  doc) was never adopted in day-to-day teaching. Rankings.jsx's Week/Month tabs were wired
  to these RPCs once, returned all-zero totals, and were reverted back to
  `get_group_leaderboard()`. Class tab alone still points at the session RPCs (harmless,
  just empty until sessions exist).
- **Exams**: separate tables (`exams`, `exam_scores`), never write to `point_transactions`.
  Already cleanly separated from Class Points — this part of the spec is already satisfied.
- **Homework/PDF prep**: `homework`, `homework_status`, `lesson_work` tables exist for
  submission/grading workflow, but **no 0–10 scoring concept and no points contribution**
  exists for either. There is no dedicated "PDF/pre-lesson preparation" table at all —
  `lesson_pdf_resources` (0032) is just resource storage, not a scored activity.
- **Games**: `game_sessions`/`game_level_progress`, fully separate "Game Points" currency is
  *designed and approved* (`docs/game-points-specification-2026-08-17.md`) but **not
  implemented** (no migration/RPC/frontend yet), and — critically — that spec explicitly
  keeps Game Points **out of Class Points by design** ("games do not write
  `point_transactions` at all — by design, the strongest mitigation against self-awarded
  points").

---

## 2. Specification vs. reality matrix

| Requirement | Existing implementation | Correct? | Change needed? |
|---|---|---|---|
| Class score per lesson (one finalized total) | `class_session`/`class_group` schema + `get_class_leaderboard()` exist and would produce exactly this | ⚠️ Partial | Schema done; needs real session-opening adoption + a UI to enter session-scoped points |
| Homework 0–10 → feeds class score | Homework tracked in `homework`/`homework_status`, **zero points linkage**, and automatic ledger writes are policy-disabled | ❌ Missing / conflicts with standing policy | Product decision required (see §4) |
| PDF/prep 0–10 → feeds class score | No PDF/prep scoring concept exists at all | ❌ Missing | New table/column + product decision |
| In-class performance points | This **is** what `bonus`/`penalty` manual awards already are | ✅ Correct | None — already the model |
| Game points → feeds class score | Game Points spec (approved, unbuilt) explicitly **excludes** Class Points feed by design | ❌ Conflicts with Dave's stated model | Direct product conflict — must be resolved with Dave (§4) |
| Bonuses/penalties | Manual `bonus`/`penalty` categories, immutable ledger, reversal-only corrections | ✅ Correct | None |
| Weekly aggregation from actual dates | `get_weekly_class_leaderboard()` sums real `class_session.session_date` rows in the week window — never assumes 3 fixed weekdays | ✅ Correct design | Dormant — needs adoption, not redesign |
| Monthly aggregation | Same, `get_monthly_class_leaderboard()`, real dates | ✅ Correct design | Dormant — needs adoption |
| Handles cancelled/holiday/late-join/schedule drift | By construction — sessions are only real, explicitly-opened dates; a month with 11 or 13 sessions renders that many | ✅ Correct design | None, once adopted |
| Exams distinguishable from class points | `exams`/`exam_scores`, never touches `point_transactions` | ✅ Correct | None |
| Traceability: Monthly → Weekly → Class → Components | Monthly/Weekly RPCs already return per-session breakdown; Class-level RPC returns per-student session total. **Component-level breakdown (homework/PDF/performance/games) does not exist** because those components don't feed the ledger yet | ⚠️ Partial | Depends on §4 resolution |
| Deterministic, backend-authoritative, no frontend array-order dependency | All ranking RPCs use `rank()` server-side; known historical array-index bugs were fixed/found stale on 2026-08-17 re-check | ✅ Correct | None |
| Auditability / immutable ledger / reversal-only corrections | `point_transactions` append-only, RLS blocks UPDATE/DELETE, reversal via `is_reversal`/`reversed_transaction_id` | ✅ Correct | None |

---

## 3. Historical data findings

- `point_transactions` has `student_id`, `level`, `category_key`, `points`, `reason`,
  `awarded_by`, `lesson_date`/`created_at`, `is_reversal`/`reversed_transaction_id`, and
  (since `0138`) a nullable `class_session_id`.
- **No historical row has `class_session_id` populated** — confirmed live in production
  (2026-08-15 check cited in `ranking-v2-class-session-design.md` §12).
- Per the design doc's own findings: **pre-V2 manual rows cannot be safely backfilled**
  into sessions. `class_group` didn't exist as a modeled entity when those rows were
  written, and the free-text `group_name` on old rows is unreliable — there is no
  trustworthy signal to reconstruct which group/session a historical award belonged to.
  This is a permanent limitation, not a to-do: old rows keep `class_session_id = NULL`
  forever, remain fully counted in lifetime/Overall totals, and are excluded from
  Class/Weekly/Monthly *session-scoped* views by construction.
- `exam`/`homework`/`achievement_bonus` category rows are explicitly excluded from
  session-based views by `category_key`, independent of any session-inference question.
- **Conclusion: historical class-level/weekly/monthly reconstruction for dates before
  session-tracking adoption is not possible from existing data**, and per Dave's standing
  rule, must not be invented. Weekly/Monthly totals for the *current* ledger-based system
  (`get_group_leaderboard`) remain correct and available; they're just not decomposable
  into per-class-session detail for the pre-adoption period.

---

## 4. Confirmed problems / open conflicts

1. **Direct policy conflict**: Dave's stated model requires homework (0–10), PDF prep
   (0–10), and games to compose the class score. The **current, deliberately-chosen**
   policy (confirmed twice: `0008` originally, and reaffirmed 2026-08-15) is that
   **only manual teacher/admin awards drive Class Points** — automatic homework/exam/
   game feeds were tried once, produced flat zeros for most students, and were turned
   off by explicit decision. The approved-but-unbuilt Game Points spec also explicitly
   keeps games out of Class Points "by design... the strongest mitigation against
   self-awarded points." **This needs an explicit new decision from Dave before any
   schema/RPC work starts** — it is not something this session can resolve by inspection,
   and building it without a reversed decision would silently violate two standing,
   deliberate policies.
2. **Class Session adoption gap**: the exact "actual class dates, not lesson-number
   assumption" architecture the spec asks for already exists (`0137`–`0139`) but has
   never been used in real operation — there is no session-opening workflow UI yet
   (design doc §4 flags this as real, unbuilt UX work), so zero real sessions exist.
3. **No PDF/prep scoring concept anywhere** — would be new schema regardless of the §4.1
   policy conflict's resolution.
4. **Homework has no points linkage** — same.
5. **Component-level traceability (Monthly → Weekly → Class → Homework/PDF/Performance/
   Games)** cannot exist until #1 is resolved, since only "Performance" (manual awards)
   currently has any points at all.

## 5. What is already correct (do not rebuild)

- Ledger model, RLS, immutability, reversal-based corrections — solid, don't touch.
- `rank()`-based tie handling across every ranking RPC — correct everywhere it was audited.
- Real-date-driven (not lesson-number-driven) weekly/monthly session grouping — this is
  precisely the "actual schedule, not Lesson 1-3 = Week 1" requirement, already designed
  and implemented at the schema/RPC layer.
- Exam/Class-Points separation — already clean.
- Deterministic, backend-computed rankings with no frontend-array-order dependency.

## 6. Recommended architecture (smallest clean path, pending §4 decision)

**Reuse, do not duplicate**, per the existing design:

```
point_transactions  (unchanged, still the ledger)
        ↓ (class_session_id, populated going forward only)
class_session / class_group   (0137-0139, already shipped)
        ↓
get_class_leaderboard()               → Class Score
get_weekly_class_leaderboard()        → Weekly Total
get_monthly_class_leaderboard()       → Monthly Total
get_group_leaderboard()               → Group Ranking (unchanged, ledger-based)
```

This is already the "smallest clean architecture" — the schema layer for
Class Score → Weekly → Monthly already matches Dave's diagram exactly. The only
missing pieces are:

a. **A session-opening UI** in Rankings.jsx (teacher/admin picks class_group + date before
   awarding points) — real, unbuilt product work, not a backend change.
b. **A decision on §4.1** — if homework/PDF/games are to feed the class score, the
   *mechanism* should still be "insert a `point_transactions` row with a session_id
   attached and a category_key that identifies the source" (reusing the existing ledger
   pattern), not a new parallel scoring table — but this requires Dave to explicitly
   reverse the "manual-only" policy first, since it was a deliberate fix for a real
   problem (flat-zero automatic scoring), not an oversight.
c. If PDF/prep scoring is wanted, it needs a small new table (`lesson_prep_scores` or
   similar) mirroring the `homework`/`exam_scores` pattern — genuinely new, since no such
   concept exists today. Only justified once (b) is decided.

**No new "weekly_totals"/"monthly_totals" materialized table is needed** — the RPCs
compute both correctly on read from existing structures, matching the "calculate, don't
manually type" requirement.

## 7. Implementation stages (only once §4.1 is decided by Dave)

1. Dave decision: which components feed Class Score (homework? PDF prep? games?) and
   whether the "manual-only" policy is being reversed or the new components are added
   as *additional* ledger-writing paths alongside manual awards (not a full reversal).
2. If PDF/prep scoring is approved: new table + admin UI to enter it (0–10), analogous to
   existing homework grading UI.
3. Build the session-opening UI (Rankings.jsx) — required regardless of §4.1's outcome,
   since it's the prerequisite for any session-scoped view to ever show non-zero data.
4. Wire whichever components are approved to insert `point_transactions` rows with
   `class_session_id` populated and a distinguishing `category_key` (e.g. `homework`,
   `prep`, `performance`, `game`), reusing the existing insert path, RLS, and duplicate
   guard (`0162`) rather than a new write mechanism.
5. Re-enable Rankings.jsx Week/Month on the session RPCs **only after** the adoption
   conditions in `ranking-v2-class-session-design.md` §12 are met (real sessions exist
   for most/all levels across multiple weeks, spot-checked against the ledger).
6. Build component-level traceability UI (Class Score → Homework/PDF/Performance/Games
   breakdown) once step 4 is live and category_key data exists to break down.

## 8. Dave approval required?

**Yes — before any implementation, on §4.1 specifically.** This is not a technical
ambiguity; it is a live conflict between the newly-stated spec and two deliberate,
documented prior decisions (`0008`, reaffirmed 2026-08-15). Everything else (session UI,
PDF/prep table) can proceed once that one decision is made.

## 9. Production/runtime limitations

- No safe test environment exists for RPC execution (no local Docker Supabase running, no
  preview branch created — would need Dave's cost approval); all verification this
  session was static (migrations/docs/code review), not runtime.
- Historical backfill of class sessions is **not possible** (§3) — this is a permanent
  data limitation, not a to-do.

## 10. Workstream status: **OPEN — blocked on Dave's §4.1 decision.**

Architecture mapping (Phase 1–3) is complete. Phase 4 recommendation is written and
requires no further investigation to act on once §4.1 is decided. No code was changed
this session.

---

## 11. §4.1 decision — RESOLVED 2026-08-18

Dave approves: **Homework + PDF prep + in-class performance + games + legitimate
bonuses/penalties all contribute to Class Score.** This reverses the 2026-08-15
manual-only policy. Mechanism stays as recommended in §6b: new `point_transactions`
rows per component, `class_session_id` populated, distinct `category_key` per source
(`homework`, `prep`, `performance`→reuse `bonus`/`penalty`, `game`). No parallel ledger.

**Correction to §2/§4 above**: the session-opening UI is **not** unbuilt — it already
shipped and is live in `Rankings.jsx` (`sessionLevel`/`sessionGroupId`/`sessionDate`/
`openClassSession()`/`getClassSession()`/`listClassGroups()`, committed, no working-tree
diff). Teachers can already open a `class_group`+date session and manual awards
(`categoryKey` = `bonus`/`penalty` only today) attach `class_session_id` when the
session's level matches. **"Performance" and "Bonuses/penalties" are therefore already
fully wired end-to-end** — nothing to build there. `category_key` has no CHECK
constraint (`0019`, plain `text`), so new values (`homework`, `prep`, `game`) need no
schema migration to introduce.

### Gap analysis (Phase 2)

| Component | Already works | Needs wiring | Needs new code |
|---|---|---|---|
| Class session (open/select) | ✅ shipped, live in Rankings.jsx | | |
| Performance (manual award → session) | ✅ shipped | | |
| Bonuses/penalties (+ dup guard `0162`) | ✅ shipped | | |
| Homework → Class Score | | Grading UI exists (`homework`/`homework_status`) but writes no points | Insert `point_transactions` row (`category_key='homework'`, capped 0–10, `class_session_id`) from the grading action |
| PDF prep → Class Score | | | No scoring concept exists at all — new 0–10 entry point needed (smallest: extend the session-award UI with a `prep` category, no new table required since it's just another ledger row) |
| Games → Class Score | | Game Points spec (approved, unbuilt) explicitly excludes ledger by design — needs explicit re-scope | RPC to write a capped, idempotent `game` category row per completed session, respecting `0141` replay guard |
| Weekly/Monthly ranking | ✅ RPCs correct, real-date-based | Currently reverted to `get_group_leaderboard()` in Rankings.jsx; re-point to session RPCs only after real session adoption data exists | |
| Teacher UI | Session-open + manual award UI shipped | Add homework/prep/game category entry points | |
| Student UI | Unaffected | | |

### Recommended smallest next step (not done this session — see Next Session Prompt)

1. **PDF prep**: cheapest — add a `prep` category option to the *existing* session-award
   flow in Rankings.jsx (same insert path, 0–10 client-side cap), no migration needed.
2. **Homework**: wire the existing grading action (wherever `homework_status` is set to
   graded) to also insert a `point_transactions` row, `category_key='homework'`, capped
   0–10, `class_session_id` from whatever session is open for that student's level/date
   — needs the grading UI to be session-aware, which it currently is not.
3. **Games**: blocked on a real product re-scope of the approved Game Points spec (which
   currently forbids this by design for anti-self-award reasons) — do not silently
   override that mitigation; needs its own explicit decision on how a game round result
   gets teacher-verified before it becomes a ledger row, or an automated cap/rate-limit
   replacing teacher verification.
4. Re-enable Week/Month tabs on the session RPCs only once sessions + the above categories
   are in real use across most levels (per original `ranking-v2-class-session-design.md` §12
   adoption bar).

Each of the three items is independently migratable/deployable; do not bundle them into
one migration.

## 12. Implementation — PDF Preparation + Homework (2026-08-18, this session)

Items 1 and 2 from §11's recommendation are now live. See `docs/RANKING-SYSTEM.md` §2b/§2c
for the full mechanism writeup; summary here for the workstream record.

**Files/migrations changed:**
- `supabase/migrations/0163_ranking_v3_homework_prep_categories.sql` (applied to prod)
- `src/pages/Rankings.jsx` — new "PDF Preparation" section (state + form + submit handler)
- `src/lib/storageBridge.js` — `getOpenSessionForLevel()`, `awardHomeworkPoints()`
- `src/lib/useAcademyData.js` — `setHomeworkStatusForStudent()` now calls
  `awardHomeworkPoints()` as a best-effort second step after a grade is saved

**What migration 0163 did, beyond the planned "add a category" work:** live schema
inspection before writing any code found production already carried remnants of an
earlier, untracked-locally attempt (`0121_homework_submission_points`, 2026-08-12) — a
*disabled* trigger that auto-awarded a flat 10 `homework` points on submission (wrong
event, wrong scale) and 4 real historical `homework`-category ledger rows it created.
The trigger was dropped (data integrity risk if ever re-enabled: same category_key and
same `points_transaction_id` column as the new mechanism, no `points_awarded` check of
its own — would have silently double-awarded). The 4 historical ledger rows were left
untouched (no-delete-history rule); their source `homework_status` rows no longer exist
in prod (see below), so the "backfill points_awarded for already-awarded rows" step in
0163 correctly matched 0 rows.

**Open finding — flagged, not resolved:** `homework`/`homework_status` are currently
**empty** in production (0 rows). The parallel "Submit Work" domain
(`lesson_work_submissions`) has 192 real rows. The task specified wiring the
`homework_status`/`HomeworkGradingRoster` grading flow specifically, which is what was
built and is live — but it may see zero real usage until/unless Dave confirms which
domain teachers actually use. Not redirected to the other domain without an explicit
decision (would be scope creep on this session's instructions).

**Verification performed:**
- `npm run build` — clean.
- Live schema/function inspection (Supabase MCP, read-only + the one gated
  `apply_migration` call): confirmed `point_categories` has `prep`/`homework` rows, the
  duplicate-guard trigger function now includes `'prep'`, `homework_status.points_awarded`
  exists, the stale trigger is gone, `get_class_leaderboard`/`get_weekly_class_leaderboard`/
  `get_monthly_class_leaderboard` sum `point_transactions` with no `category_key` filter
  (so the new categories need no RPC change), and the 4 historical `homework` rows are
  untouched (no reversals added).
- **Not performed (blocked, not fabricated):** no real teacher/student browser session
  was available to click through Add PDF Prep Points or grade a homework item end-to-end;
  no fake student/homework rows were created to force a runtime test, per the standing
  rule. Both flows are logically verified (build + live schema/RLS/trigger inspection)
  but not click-tested.

**Games:** untouched, as instructed — still blocked on Dave's explicit re-scope of the
approved (unbuilt) Game Points anti-self-award design.

**Workstream status: OPEN** — PDF prep and Homework are code-complete and live in
production, but (a) the empty-Homework-domain finding needs a decision from Dave, and
(b) neither new path has been runtime/browser-verified with a real session. Weekly/Monthly
re-adoption (§11 item 4) and Games (§11 item 3) remain future, separately-scoped work.

### Next Session Prompt (paste into a fresh session)

> Continue Dave English Academy Ranking Model V3. Read
> `docs/ranking-model-v3-investigation-2026-08-18.md` §11-§12 first — PDF Preparation and
> Homework are implemented and live in prod (migration `0163`, `Rankings.jsx`,
> `storageBridge.js`, `useAcademyData.js`). Do not rebuild them.
> Two things need Dave's input before more code:
> 1. **Homework domain choice**: production's `homework`/`homework_status` tables are
>    empty (0 rows); the separate `lesson_work_submissions` ("Submit Work") domain has
>    192 real rows. Confirm with Dave whether teachers actually use the Homework page at
>    all, or whether the Class Score homework hook should move to the Submit Work domain
>    instead (`awardLessonWorkPoints()` already exists there for a different category —
>    would need a parallel `homework`-category wiring, analogous to what was just built).
> 2. **Runtime verification**: neither PDF Prep nor Homework points have been exercised
>    through a real logged-in teacher/student browser session yet (blocked this session -
>    no session was available, and fabricating test students/homework was correctly
>    avoided). Do this first, before further ranking work, ideally with Dave present or a
>    real low-stakes classroom moment.
> Only after both are resolved: Games (blocked on Dave's anti-self-award re-scope, see
> §11 item 3) and re-pointing Rankings.jsx Week/Month to the session RPCs (§11 item 4,
> needs real adoption data first). Do not touch `src/utils/badges.js`. Apply any further
> migrations one at a time through the gated Supabase mechanism, with live schema
> verification after each.

---

## 13. Phase 1/3/4/5 verification (2026-08-18, follow-up session)

No code or schema changes this session — investigation and verification only.

### Homework domain resolution (Phase 1)

Confirmed live in production: `homework`/`homework_status` = 0 rows,
`lesson_work_submissions` = 192 rows, all `status='submitted'`, **0 rows ever
reviewed/graded** (the teacher review UI for it, `LessonWorkReviewRoster.jsx` in
`LessonHub.jsx`, exists and is wired to `awardLessonWorkPoints()`, but has never been
used in practice either).

`lesson_work_submissions` is **not** a "homework prepared before class" concept — it is
per-lesson practice-photo uploads, and migration `0103`'s header states the separation is
**deliberate**: *"intentionally separate from the existing Homework domain... nothing here
modifies any homework table or policy."* `LessonHub.jsx` (line ~513) reinforces this at the
call site: `categoryKey: 'other'` is used "rather than 'homework': lesson practice is
deliberately not part of the Homework domain." It also has no 0–10 grading concept (teacher
enters an uncapped point value) and does not attach `classSessionId`.

**Recommendation: keep the `homework_status` wiring as built, do not redirect to
`lesson_work_submissions`.** The built implementation matches the originally specified
domain exactly (title/due date, `HomeworkGradingRoster`, 0–10 clamp, session-attached,
claim-guarded) — it is correct, just unadopted. Redirecting "homework points" onto
`lesson_work_submissions` would silently override a second deliberate design boundary in
this codebase (same category of risk as the Games anti-self-award mitigation) and was not
done. **This is the one open decision for Dave**: either start using the Homework page
operationally, or explicitly approve collapsing the two domains (real scope, own session).

### Class Score model (Phase 2)

No redesign performed, per instructions — verified the existing `class_session` →
`get_class_leaderboard`/`get_weekly_class_leaderboard`/`get_monthly_class_leaderboard`
architecture (already live from `0137`–`0139`) sums `point_transactions` with **no
`category_key` filter**, confirmed live via `pg_get_functiondef`. Homework + PDF prep +
performance + bonus/penalty therefore compose into one Class Score per session exactly as
specified, once a session is open and each write attaches `class_session_id` — which the
prep and homework code paths already do (matching student level to the open session).
Lessons 11/12 (exams) already write to a fully separate `exams`/`exam_scores` schema, never
`point_transactions` — already correctly isolated.

### PDF Preparation verification (Phase 3)

All confirmed live and correct, read-only:
- 0–10 enforced client-side (`Rankings.jsx` blocks submit if `points > 10`); `homework`
  clamps server-adjacent via `Math.max(0, Math.min(10, ...))` in `useAcademyData.js`.
- Both attach `class_session_id` only when `openSession` exists **and** its level matches
  the student's level — never cross-level.
- Both insert through the one existing `point_transactions` ledger path (`awardPoints`/
  `awardStudentPoints`), no parallel table.
- Duplicate protection confirmed live: `point_transactions_prevent_duplicate` trigger
  (enabled) covers `bonus`/`penalty`/`prep` (120s identical-award window); `homework` uses
  the stronger unconditional `points_awarded IS NULL` claim guard instead — by design, not
  an oversight (see `0163`'s own comment).
- `point_transactions` RLS: only `pt_admin_insert` (`is_admin()`) and `pt_teacher_insert`
  (`is_teacher()` + matching `teacher_group_assignments` row) can insert — confirmed no
  student-insert policy exists. Students cannot self-award prep, homework, or any other
  category.
- Performance/Bonus/Penalty paths untouched by `0163` (only added the `prep` category seed
  row, the `homework_status` claim-guard columns, and one line to the duplicate-check
  trigger's category list).

**One nuance, not a defect — flag only:** "does not create points without an open class
session" is not strictly true for prep or homework, **by existing design**: exactly like
Performance/Bonus/Penalty already did before this work, an award with no matching open
session still inserts with `class_session_id = NULL` (counts toward lifetime/Overall and
Weekly/Monthly-via-`get_group_leaderboard` totals, just invisible to the dormant
session-scoped views). Consistent with all other categories; changing it would be a new,
separately-scoped behavior change.

### Runtime verification (Phase 4)

`npm run build` — clean, no errors/warnings beyond the pre-existing chunk-size notice.
Production schema/function/trigger/RLS verification performed above via live SQL
(read-only). **No logged-in teacher/student browser session was available this session —
UI click-through verification is blocked, not fabricated.** No test students, homework
rows, or point transactions were created.

### Games — smallest safe future architecture (Phase 5, investigation only)

Not implemented. Trade-offs for how a game result becomes a verified Class Score points
row without student self-award:

| Mechanism | How it works | Pros | Cons |
|---|---|---|---|
| Teacher manually re-enters points after seeing result | Teacher looks at student's score (in-app or verbally) and awards points via the existing session-award UI, `category_key='game'` | Zero new schema; reuses everything already shipped and audited above | Pure manual re-entry, no link between the actual game session row and the award — same trust model as a teacher just deciding a number, defeats the point of having verified `game_sessions` data |
| Teacher-confirmation on a specific `game_sessions` row | New "pending confirmation" queue: completed `game_sessions` rows surface to the teacher, one click inserts a capped `point_transactions` row referencing that specific session (idempotent, one award per `game_sessions.id`) | Directly traceable to the actual result; still requires a human in the loop (no auto-feed); natural idempotency key already exists (`game_sessions.id`) | New UI (teacher review queue) and a new unique constraint/claim-guard column, similar shape to `lesson_work_submissions`/`homework_status`'s claim pattern — real but small, scoped work |
| Fully server-verified auto-award | Grading function server-side re-derives the score from stored round data (not the client-submitted score) and auto-inserts a capped row, respecting the existing `0141` replay guard | No teacher workload; fastest path to "games count" | Requires each game's scoring logic to be fully re-computable server-side from stored inputs (not all 9 games necessarily store enough raw data for that today — unverified this session); reintroduces the exact automatic-feed shape that was already tried once for homework/exams and reversed for producing bad results — highest risk of quietly reintroducing a self-award or drift bug |
| Rate-limited/capped auto-award (no re-verification) | Auto-insert on completion, but capped per day/session and duplicate-guarded like `prep` | Cheapest to build (`0141` guard + duplicate trigger already exist) | Does not actually verify correctness of the score, only rate-limits abuse — weakest mitigation of the four, closest to what the approved Game Points spec already explicitly rejected for Class Points |

No mechanism was chosen. This table is the deliverable for Phase 5; implementation
remains blocked on Dave's explicit re-scope of the approved (unbuilt) Game Points
anti-self-award design, as instructed.

### Workstream status

**OPEN.** PDF Preparation and Homework: implementation confirmed correct and complete,
verified live in production (schema + build + code path), blocked only on browser
click-through (no session available) and on Dave's homework-domain-adoption decision
above. Class Score model: confirmed already correctly implemented, dormant pending real
session-opening adoption (pre-existing, unchanged finding). Games: investigation-only
deliverable (trade-off table above) complete; no implementation started, per instructions.

## Next Session Prompt (paste into a fresh session)

> Continue Dave English Academy Ranking Model V3, branch `release/dashboard-redesign`.
> Read `docs/ranking-model-v3-investigation-2026-08-18.md` §11 first (§4.1 is resolved:
> homework+PDF prep+performance+games+bonuses all feed Class Score; session-opening UI
> and performance/bonus wiring are already live — do not rebuild them).
> Remaining work, smallest-first, one migration/PR per item, verify against real (not
> fabricated) production data at each step:
> 1. PDF prep: add a `prep` category (0–10, capped client-side) to the existing
>    session-award insert path in `Rankings.jsx` — no new table, no migration.
> 2. Homework: find where `homework_status` gets set to graded, make that action
>    session-aware and insert one `point_transactions` row (`category_key='homework'`,
>    0–10 cap, `class_session_id`), guarding against double-insert on re-grade.
> 3. Games: blocked on a real decision — the approved Game Points spec deliberately
>    excludes ledger writes as an anti-self-award mitigation. Do not silently override
>    it; get an explicit call from Dave on how a game result becomes teacher-verified
>    before writing to `point_transactions`, respecting the `0141` replay guard.
> 4. Only after 1–3 are live in real teaching use across most levels: re-point
>    Rankings.jsx Week/Month tabs from `get_group_leaderboard()` to
>    `get_weekly_class_leaderboard()`/`get_monthly_class_leaderboard()`.
> Do not touch `src/utils/badges.js`. Do not build a second ranking ledger. Apply
> migrations only through the gated Supabase mechanism, one at a time, with production
> schema verification after each.
