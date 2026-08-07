# Dave English Academy — Ranking & Points System Audit

**Scope:** read-only. No code changed.
**Source of truth:** `C:\Dave Academy` @ `release/dashboard-redesign` (commit `0eb7f33`) — the branch that actually ships to production.
**Production DB:** `npx supabase migration list` confirms migrations **0001–0028 all applied remotely**. Everything below is live behavior, not just repo intent.

Sections 1–8 are **verified facts** read directly from code. Section 9 is **verified behavior plus my inference about intent**. Section 10 is a **proposal only** — nothing to be implemented until Dave confirms the rules.

---

## 1. Current ranking rules (verified)

**The ledger is the source of truth.**

- `public.point_transactions` (migration `0019`) is the single record of every point ever awarded.
- `students.points` is **not** an editable field. It is a trigger-maintained cache (`0020`): after every insert into the ledger, `refresh_student_points_cache()` sets `students.points = SUM(points) for that student across the entire ledger`.
- The database **revokes `UPDATE` on `students` table-wide** from `authenticated` and re-grants it column-by-column on everything *except* `points`, `id`, `created_at`. Administrators included. There is no path left to change a student's total other than inserting a ledger row.
- The ledger is **append-only by construction**: `point_transactions` has RLS enabled with **only SELECT and INSERT policies** — no UPDATE policy and no DELETE policy for any role. Postgres rejects those commands outright. Corrections are meant to be a new reversal row (`is_reversal = true`, `reversed_transaction_id → original`).

**Per-row fields that matter for ranking:**

| Field | Behavior |
|---|---|
| `points` | `numeric`, may be positive or negative. No min/max constraint. |
| `level` | `'A'|'B'|'C'`, **snapshotted at award time**, not derived. |
| `lesson_date` | `date`. Defaults to `(now() at time zone 'Asia/Tashkent')::date`. This — not `created_at` — is what weekly/monthly aggregation buckets on. |
| `is_baseline` | Marks the one-time legacy-total migration row. Excluded from all week/month math. |
| `category_key` | Free text, plus optional FK `category_id` → `point_categories`. |
| `awarded_by` | Required unless `is_baseline` (CHECK constraint). |

**Authorization:**

- **Admin** — may award for any level (`pt_admin_insert`).
- **Teacher** — may award only for levels they hold a `teacher_group_assignments` row for (`0017`, seeded with every existing teacher → all three levels, to be narrowed by an admin afterward). Enforced in RLS, not just UI.
- **Two independent enforcement layers.** RLS `WITH CHECK` only verifies the teacher is assigned to the *value* in `point_transactions.level`. A `BEFORE INSERT` trigger (`validate_point_transaction_level`) separately verifies that value matches the target student's *actual* `students.level`, for everyone including admin. Both must pass.
- **Student** — SELECT on their own rows only, via the `is_own_student()` SECURITY DEFINER helper.

---

## 2. The `+3` feature (verified)

**There is no `+3` feature in the domain sense.** It is a raw magnitude button with no semantics attached.

**Origin — a single hardcoded frontend constant:**

`src/pages/Rankings.jsx:34`
```js
const QUICK_DELTAS = [1, 3, 5];
```

Rendered at `Rankings.jsx:402` (desktop table) and `Rankings.jsx:464` (mobile cards), both via `QUICK_DELTAS.slice(1)` — i.e. the array's `1` is drawn by a separate dedicated `<Plus>` icon button, and `slice(1)` renders literal **`3`** and **`5`** text buttons.

**What a `+3` click actually writes** (`quickAdjust`, `Rankings.jsx:88-105`):

```
student_id     = the clicked student
level          = student.level
category_key   = 'bonus'            // because delta > 0
category_id    = bonus category id  // looked up from point_categories
points         = 3
reason         = 'Quick manual adjustment via Rankings'   // fixed string
awarded_by     = current user
lesson_date    = DB default → today, Asia/Tashkent
```

**Consequences:**

- Not configurable from the database. `point_categories` has no row with `default_points = 3`. The value `3` exists nowhere except this JS array.
- Carries no category meaning — everything lands in `bonus`.
- Every `+3` in every student's history reads identically: `🎁 Bonus — "Quick manual adjustment via Rankings"`.

---

## 3. The `+5` feature (verified)

**Mechanically identical to `+3`** — same `QUICK_DELTAS` array, same `quickAdjust()`, same `bonus` category, same fixed reason string. The only difference is `points = 5`.

**Notable collision.** `point_categories` as seeded by migration `0018` gives `default_points = 5` to **six** different categories:

| key | name | default_points |
|---|---|---|
| attendance | Attendance | **5** |
| homework | Homework | 10 |
| participation | Participation | **5** |
| speaking | Speaking | **5** |
| vocabulary | Vocabulary | **5** |
| exam | Test/Exam | 8 |
| behavior | Behavior | **5** |
| bonus | Bonus | **5** |
| penalty | Penalty | **-5** |
| other | Other | 0 |

So a quick `+5` and a Detailed Award of "Speaking +5" produce ledger rows that differ **only** in `category_key` and `reason`. Since the quick path is documented in the code as "the fast path for ordinary classroom use", the overwhelming majority of real point traffic is expected to land in `bonus` with a generic reason — making category-based reporting largely empty.

> **Unverified:** I could not read production row data for `point_categories`. An admin may have edited `default_points` or deactivated categories since `0018` seeded them (the table has a full admin RLS policy). The table above is the seeded default, not a confirmed production read.

---

## 4. Every place points can be awarded (verified — exhaustive)

Grep across `src/` and `supabase/` for `point_transactions` / `awardStudentPoints` / `bulkAwardStudentPoints` returns **exactly one page** that writes points: `src/pages/Rankings.jsx`. It offers three workflows, all landing in the same ledger via `storageBridge.js` `awardPoints()` / `bulkAwardPoints()`.

| # | Path | Location | Category | Points | Reason |
|---|---|---|---|---|---|
| 1 | **Quick Points** (primary) | `Rankings.jsx:88` `quickAdjust()` — buttons at `:383` (−1), `:393` (+1), `:402` (+3/+5) desktop; `:447/:457/:464` mobile | `bonus` if `> 0`, `penalty` if `< 0` | `-1`, `+1`, `+3`, `+5` | fixed `'Quick manual adjustment via Rankings'` |
| 2 | **Detailed / Advanced Award** (collapsed) | `Rankings.jsx:122` `submitAward()` | admin-picked from `point_categories`; selecting one prefills `default_points` (`:116`) | any finite non-zero number, freely overridable, **no bounds check** | free text, optional (`null` if blank) |
| 3 | **Award Class Points** (bulk, collapsed) | `Rankings.jsx:199` `submitBulk()` | `bonus`/`penalty` by sign | per-student value, or "fill all" applied to a level/group | fixed `'Bulk class points via Rankings'` |
| 4 | **Baseline migration** (one-time, DB only) | migration `0021` | `baseline_migration`, `is_baseline = true` | each student's legacy `students.points` at cutover | `'Migrated baseline from legacy points total'` |

**Where points are explicitly *not* awarded.** Attendance, homework, exams, and lessons **do not touch the ledger at all**. Migration `0008` deliberately removed the old automatic formula (`src/utils/points.js` + the original `get_leaderboard()`), because "the old formula depended on the Lessons/Exams/Homework features, which see little real use — so points were showing as flat 0 for almost everyone." Those tables and pages still exist and work; they simply no longer feed ranking.

**Asymmetry:** quick buttons offer `+1 / +3 / +5` but only `−1`. There is no `−3` or `−5`.

---

## 5. How points are stored and calculated (verified)

```
point_transactions  (append-only ledger, the truth)
        │
        │ AFTER INSERT trigger: refresh_student_points_cache()
        ▼
students.points     (cache = SUM of ALL that student's rows —
                     every level, including the baseline row)
```

- **Lifetime total** = `students.points` = unfiltered `SUM(points)` for the student. **Includes** the baseline row. **Not** filtered by level.
- **Period totals** are computed live from the ledger, never from the cache — `SUM(points) WHERE lesson_date BETWEEN start AND end AND NOT is_baseline AND pt.level = <level>`.
- Reversal rows (`is_reversal`) are ordinary negative rows and **are** included in every sum. Correct — but see §9(e): nothing in the codebase ever sets `is_reversal` or `reversed_transaction_id`.
- Indexes: `point_transactions (student_id)` and `(level, lesson_date)`.

---

## 6. Weekly / monthly / all-time ranking calculation (verified)

### Period boundaries — `week_bounds()` / `month_bounds()` (`0023`)

```sql
week_bounds(d)  → date_trunc('week', d),  + 6 days     -- Monday .. Sunday
month_bounds(d) → date_trunc('month', d), + 1 month - 1 day  -- calendar month
```

Both take a plain `date`. Because `lesson_date` is already stamped in the academy's local calendar day (Asia/Tashkent), no further timezone conversion happens. Exposed to the client read-only via `get_period_bounds()` (`0025`) — the frontend never computes period boundaries itself.

### `get_group_leaderboard(p_level, p_period_type, p_period_start)` (`0023`)

The main engine. Used by Rankings' *Level Leaderboard*, MyRanking, PortalHome, and Recognition's candidate list.

**`all_time` branch** — a completely different code path from week/month:
```sql
select s.id, s.real_name, s.points,
       rank() over (order by s.points desc)
from students s
where s.level = p_level and s.status = 'Active'
```
Reads the **cache**. Returns `NULL` for `prev_points`, `prev_rank`, `rank_change`, `attendance_rate`.

**`week` / `month` branches:**
```sql
left join point_transactions pt
       on pt.student_id = s.id
      and pt.level = p_level          -- snapshot level, not current level
where s.level = p_level and s.status = 'Active'
  and pt.lesson_date between v_start and v_end
  and not pt.is_baseline
```
- `LEFT JOIN` + `coalesce(..., 0)` → students with zero points in the period are **included**, at 0.
- The **previous** equivalent period is computed identically (`v_start - 7` for week; `v_start - 1 day` for month) to produce `rank_change = prev_rank − current_rank` (positive = moved up).
- `attendance_rate` = `(Present + Late) / total × 100`, rounded to 1dp, over the same date range — but joined on `s.level = p_level`, the student's **current** level.

### `get_student_ranking_summary(p_student_id)` (`0023`)

Returns all three figures at once for one student: `lifetime_points` (from cache), `week_points`, `month_points`, and `level_rank_all_time` / `level_rank_week` / `level_rank_month`. Same formulas as above. Authorization: admin, or a teacher assigned to that student's level, or the student themselves.

### `get_my_point_history()` (`0023`)

Student-facing, deliberately narrowed — no `awarded_by`, no `category_key`/`category_id`, no `attendance_id`. Baseline rows are relabeled `"Starting Points" 🌱`. Ordered `lesson_date desc, created_at desc`.

### The Rankings page's *top* table — a fourth, separate calculation

`Rankings.jsx:75-80` does **not** call any RPC:
```js
students.filter(s => s.status === 'Active')
        .sort((a,b) => b.points - a.points || a.real_name.localeCompare(b.real_name))
```
This is **all levels pooled together**, sorted client-side on the cache, with rank rendered as the **array index `i + 1`** (`:374`, `:432`). It coexists on the same page with the level-scoped, `rank()`-based Level Leaderboard further down.

### `get_leaderboard()` (`0008`) — dead

Still defined and granted in the database; unscoped (every active student, every level, no ranking). `getLeaderboard()` is still exported at `storageBridge.js:545` but **has no callers** in `src/`. PortalHome's comments confirm it was deliberately replaced by `get_group_leaderboard(me.level, 'all_time')`.

---

## 7. How ties are handled (verified)

**In SQL — correctly, everywhere.** Every RPC uses `rank()`, not `row_number()`. Genuinely tied students share a rank number and the next rank skips accordingly.

**In the UI — inconsistently:**

| Surface | Rank source | Tie behavior |
|---|---|---|
| Rankings → Level Leaderboard, all-time table (`:709`) | `row.rank` | ✅ correct |
| Rankings → class-by-class grid (`classRows`, `:303`) | `row.rank` from `board` | ✅ correct — comment explicitly says this avoids "a false #1/#2 split from array position" |
| PortalHome hero (`:112`) | `row.rank` | ✅ correct — comment explicitly rejects array index |
| MyRanking leaderboard (`:211`) | `row.rank` for the **number**, array index `i` for the **medal color** | ⚠️ two tied students show the same rank number in differently-colored badges |
| **Rankings → main top table** (desktop `:374`, mobile `:432`) | **array index `i + 1`** | ❌ invents a false ordering; ties broken arbitrarily by `real_name` alphabetical |

**Recognition tie-breaks — two functions, and the one with the tie-break chain is never called:**

- `finalize_recognition()` (`0023`) implements the documented chain:
  ```sql
  rank() over (order by total_points desc, active_days desc, coalesce(rate,0) desc)
  ```
  where `active_days = count(distinct lesson_date) filter (where points > 0)`. All students surviving at `rnk = 1` are inserted as **co-winners** (`is_co_winner = true`). Requires `total_points > 0`. **Grep confirms no caller anywhere in `src/`.**

- `finalize_recognition_winner()` (`0025`, redefined in `0027`) is what the Recognition page actually calls. It takes an explicit admin-chosen `p_student_id`, has **no tie-break logic at all**, and hardcodes `is_co_winner = false`.

---

## 8. How Student of the Week/Month uses ranking data (verified)

**Page:** `src/pages/Recognition.jsx`, admin-only, English-only by design.

**Flow:**

1. `getPeriodBounds('week' | 'month')` → authoritative period start/end from the server.
2. For each of levels A, B, C: `getGroupLeaderboard(level, periodType, bounds.period_start)`.
3. Candidates = `.filter(r => Number(r.points) > 0).slice(0, 5)` — top 5 positive scorers per level.
4. Admin clicks a winner → `finalize_recognition_winner(award_type, level, period_type, period_start, period_end, student_id, reason?)`.

**What the RPC does, in one transaction:**

- `is_admin()` check.
- Validates `award_type ∈ {student_of_week, student_of_month}`, `level ∈ {A,B,C}`, and that `period_type` matches `award_type`.
- Validates the student exists, is `Active`, and their level matches `p_level`.
- **Recomputes** the student's period points from the ledger — never trusts a client-supplied value:
  ```sql
  sum(points) where student_id = ? and level = ? and lesson_date between ? and ? and not is_baseline
  ```
- If a `final` row already exists for that `(award_type, level, period)`: requires a non-empty `p_reason`; flips existing rows to `status = 'superseded'` (never deletes); **deletes the previous winner's certificate** (added in `0027`, so a now-incorrect winner isn't left holding a certificate); logs `reopen_and_refinalize` to `recognition_reopen_log`.
- Otherwise logs `finalize`.
- Inserts a `certificates` row titled `"Student of the Week"` / `"Student of the Month"`.
- Inserts the `recognition_awards` row (`status = 'final'`, `is_co_winner = false`, `certificate_id` linked).

**Revoke** (`revoke_recognition_award`, `0027`): admin-only, reason required, only a currently-`final` row. Sets `status = 'revoked'`, clears and deletes the certificate, logs `revoke`.

**Storage** (`0022`): `recognition_awards` has a partial unique index on `(award_type, level, period_start, period_end, student_id) WHERE status = 'final'`, so superseded/revoked rows never block re-awarding. Readable by anyone signed in (hall of fame). **No insert/update/delete policy exists for `authenticated`** — the SECURITY DEFINER functions are the only write path. `award_type` already accepts `most_improved`, `best_attendance`, `best_homework`, `best_behavior` — schema room exists, but no function computes them.

**Student view:** MyRanking fetches `getRecognitionAwards(me.id)` and renders award badges with per-type icons.

---

## 9. Technically correct, but likely not what the academy intends

Each item states verified behavior first, then why I flag it. The "why" is my inference and needs Dave's confirmation.

**(a) The all-time board mixes levels into a level-scoped ranking.**
`students.points` sums the student's rows across **every** level. `get_group_leaderboard(..., 'all_time')` then ranks by that value *within* a single level. A student promoted A → B carries every point earned in Level A into Level B's all-time board, competing against students who only ever earned points in B. Week/month don't have this problem — they join on `pt.level`. So all-time and week/month answer structurally different questions while being presented as three tabs of one leaderboard.

**(b) The Rankings page shows two contradictory rankings simultaneously.**
The top table pools all levels, ranks by array index, and breaks ties alphabetically. The Level Leaderboard below it is level-scoped and uses `rank()`. A teacher looking at one page can read two different rank numbers for the same student.

**(c) `lesson_date` can never be set — backdating is impossible.**
Migration `0019`'s stated rationale is explicitly that "a teacher may record Monday's class on Tuesday and the points must stay Monday's, not silently move." But **no code path anywhere passes `lesson_date`** — `awardPoints()` and `bulkAwardPoints()` omit it entirely, so it always takes the DB default of *today*. The designed capability exists in the schema and is unreachable from the product. Any catch-up entry silently lands in the wrong week, and near a Sunday/Monday or month boundary it lands in the wrong ranking period entirely.

**(d) `+3` and `+5` are magnitudes with no meaning.**
No category, no reason, no rule distinguishes them. A student's history shows a wall of identical `🎁 Bonus — "Quick manual adjustment via Rankings"` entries. Neither the student, nor a parent, nor an admin reviewing later can tell what a `+5` was for. If the academy has an actual rulebook (e.g. "+3 homework complete, +5 excellent speaking"), none of it is encoded — and the fast path teachers are steered toward is the one that captures the least.

**(e) Mistakes are effectively permanent and the correction mechanism is unbuilt.**
The ledger is correctly immutable, and `is_reversal` / `reversed_transaction_id` exist for corrections — but **no code anywhere sets either field**. There is no reversal UI. With only a `−1` quick button, undoing a mis-clicked `+5` on the fast path takes five clicks, each writing a separate `penalty` row, permanently polluting that student's visible history with five entries that look like punishments.

**(f) Category reporting is structurally undermined.**
The quick path — explicitly designed as the primary workflow — writes everything to `bonus`/`penalty`. The nine other categories are only reachable through a form that is collapsed by default. Category analytics will therefore reflect the rare case, not the common one.

**(g) Baseline asymmetry makes all-time un-auditable.**
Baseline rows are excluded from week/month (correct — that amount wasn't earned in any particular period) but included in the all-time cache. All-time is therefore "opaque legacy total + ledger", not "the ledger". Defensible as a cutover decision; worth an explicit decision now about whether it should stay that way permanently.

**(h) Mixed level basis within a single leaderboard row.**
Points join on `pt.level` (snapshot at award time); `attendance_rate` in the same row joins on `s.level` (current). For a student who changed level mid-period, the two numbers on one row describe different populations.

**(i) All-time renders two permanently empty columns.**
`get_group_leaderboard` returns `NULL` for `rank_change` and `attendance_rate` on the `all_time` branch, but `Rankings.jsx` renders both columns unconditionally — always `—`.

**(j) The approved recognition tie-break is dead code.**
`finalize_recognition()` implements the documented chain (points → active days → attendance) and produces genuine co-winners. The Recognition page calls `finalize_recognition_winner()` instead, which has no tie-break and forces `is_co_winner = false`. So the tie policy that was designed and approved is not the policy in effect; in practice ties are resolved by whichever name the admin happens to click. `recognition_awards.is_co_winner` is presently always `false` in production data.

**(k) Recognition candidates are truncated to 5.**
`.slice(0, 5)` after filtering `points > 0`. A tie at rank 1 involving 6+ students would be silently cut off. Low likelihood, but it is a correctness cliff rather than a graceful degradation.

**(l) Inconsistent active-student filtering between the two recognition functions.**
`finalize_recognition_winner()` requires the student be `Active`. `finalize_recognition()`'s `period_totals` CTE reads `point_transactions` with no join to `students`, so it applies **no status filter** — a student deactivated mid-period could be auto-selected. Currently harmless only because that function is never called.

**(m) No bounds on award magnitude.**
`points` is `numeric` with no CHECK constraint. The Detailed and bulk forms validate only `Number.isFinite(points) && points !== 0`. A typo of `500` instead of `5` is accepted, immediately reshapes every leaderboard, and cannot be deleted — only offset by a second row.

**(n) No award volume controls.**
No per-day cap, no per-teacher-per-student limit, no review workflow. A single teacher can arbitrarily inflate one student. The audit trail (`awarded_by`) exists, but nothing surfaces it — `get_my_point_history()` deliberately hides `awarded_by`, and there is no admin-facing "who awarded what" view.

**(o) `get_leaderboard()` remains exposed.**
Dead in the frontend, still `GRANT`ed to `authenticated` in the database, still unscoped across all levels.

**(p) `penalty` has `default_points = -5` but there is no `−5` quick button.**
The configured negative magnitude and the available negative control disagree.

---

## 10. Proposed correction plan — PROPOSAL ONLY

> Nothing below is verified fact. This is a suggested direction and a set of questions. **No implementation until Dave confirms the intended rules.**

### 10.0 Questions Dave must answer first

These determine everything else; I'd rather not guess at any of them.

1. **What do `+3` and `+5` actually mean at the academy?** Are they meant to be fixed magnitudes for a teacher to apply at discretion, or shorthand for specific behaviors? If the latter, what is the real rulebook?
2. **Is the intended ranking per level, per group, or academy-wide?** Currently level-scoped in the RPCs and academy-wide in the page's top table.
3. **Should all-time carry points earned at a previous level?** (Reset on promotion, or follow the student?)
4. **Should attendance / homework / exams contribute points again?** `0008` removed this because those features were unused. Is that still true?
5. **Ties for Student of the Week/Month — co-winners, or must there be exactly one?** If exactly one, what is the tie-break order?
6. **Should teachers be able to backdate an award?** Or is "today only" the intended discipline?
7. **Should there be a daily cap** on points one teacher can award one student?

### 10.1 Bugs I'd fix regardless of the answers (no rule change implied)

| Fix | Files |
|---|---|
| Rankings top table: use `get_group_leaderboard` (or at minimum compute a real `rank()` with ties) instead of array index; decide level-scoped vs. pooled per Q2 | `src/pages/Rankings.jsx:75-80, 374, 432` |
| MyRanking: drive medal color from `row.rank`, not array index `i` | `src/pages/portal/MyRanking.jsx:211-220` |
| Hide `Change` / `Attendance` columns on the all-time tab | `src/pages/Rankings.jsx:~700-730` |
| Add `status` filter to `finalize_recognition()`'s `period_totals`, or delete the function if it will never be used | new migration |
| Drop or restrict `get_leaderboard()`; remove `getLeaderboard()` from `storageBridge.js` | new migration + `src/lib/storageBridge.js:545` |
| Add a sanity CHECK on `point_transactions.points` (e.g. `between -100 and 100`) plus matching client validation | new migration + `Rankings.jsx` |

### 10.2 Changes that depend on the answers

- **If `+3`/`+5` should be meaningful (Q1):** replace the hardcoded `QUICK_DELTAS` array with quick-award *presets* driven by `point_categories` — an admin-editable set of `(category, points, label)` rows. The quick buttons then write a real category and a real reason, category reporting becomes meaningful, and Dave can retune values without a deploy. This is the change I'd most strongly recommend; it addresses 9(d) and 9(f) together.
- **If all-time should be level-scoped (Q3):** either change the all-time branch to sum the ledger with `pt.level = p_level` rather than reading the cache, or keep the cache as a true lifetime figure and relabel the tab honestly. Interacts with the baseline question in 9(g).
- **If corrections need to be undoable (regardless):** build an "undo last award" / "reverse this transaction" action that inserts a proper `is_reversal` row with `reversed_transaction_id` set, and render reversed pairs as struck-through rather than as fresh penalties. The schema already supports this fully; only the UI and one bridge function are missing.
- **If backdating is wanted (Q6):** add an optional date picker to the award forms and pass `lesson_date` through `awardPoints()` / `bulkAwardPoints()`. The schema and all aggregation logic already handle this correctly — this is a frontend-only change, roughly the cheapest high-value fix on this list.
- **If ties must produce co-winners (Q5):** either wire the Recognition page to `finalize_recognition()`, or extend `finalize_recognition_winner()` to accept multiple student ids in one call.

### 10.3 Suggested sequencing

1. Dave answers §10.0.
2. Land §10.1 (behavior-preserving bug fixes) as one small PR — safe to do while rules are still being decided.
3. Redesign the quick-award model per the answers to Q1/Q2 — the largest change, likely one migration plus `Rankings.jsx`.
4. Reversal UI + backdating.
5. Recognition tie policy.

### 10.4 Verification gaps in this pass

- Could not read production **row** data. `point_categories.default_points` may have been edited since `0018` seeded it; `teacher_group_assignments` contents unknown; whether any `is_reversal` rows exist in production is unconfirmed (no code writes them, so almost certainly none).
- Migration `0027` was, per `0028`'s own comments, **applied to production ad hoc rather than through a migration file** — so at least one historical drift between file and database is documented. `migration list` reports 0027 as present remotely, but that only proves the version row exists.

---
---

# Part II — Production usage evidence, interaction audit, implementation plan

Second pass. Gained read access to the production database (`usqzcsoolkbuxyiiawmx`), which closed the row-data gap from §10.4 and **changed the conclusion**. Sections A–C are verified; section D is a proposal. **This supersedes §10.**

## A. Production usage of `+3` and `+5` — the decisive finding

System went live **2026-07-22**; data covers 2026-07-22 → 2026-07-24 (3 days), 35 active students, **1 distinct awarder**.

Quick-bar clicks, grouped by student **and** day (`reason = 'Quick manual adjustment via Rankings'`):

| Button | Student-days used | Avg clicks per student-day | Max | Total clicks |
|---|---|---|---|---|
| **+5** | 34 | **16.8** | **29** | **571** |
| +3 | 15 | 1.1 | 2 | 16 |
| +1 | 12 | 1.5 | 3 | 18 |
| **−1** | 17 | **5.4** | **24** | 91 |

**This is not a points system being used as designed. It is a number being dialled in by hand.**

- The operator taps **+5 an average of 16.8 times in a row on one student in one day**, peaking at **29 consecutive taps**. Nobody awards a "bonus" 29 times in a day. They are incrementing toward a target total because there is no way to type one.
- **−1 averages 5.4 consecutive taps** — the exact signature of "undo a mis-clicked +5", which costs five taps because no undo and no −5 exist (§9e, §9p). Max 24 consecutive taps to claw back 24 points.
- **+3 is effectively dead**: 16 clicks total across the entire lifetime of the system, versus 571 for +5.

The workflow generated **696 quick rows in 3 days** where the semantic intent was perhaps a few dozen awards. A student's history page is a wall of up to 29 identical `🎁 Bonus +5 — "Quick manual adjustment via Rankings"` entries for a single day, which is worthless to a student, a parent, or an admin.

**Reframe:** the defect is not that `+3`/`+5` are the wrong magnitudes. It is that **an increment-button model was built for what is actually an amount-entry task.** Re-tuning the numbers would not fix this; it would just change the tap count.

### Workflow split (all non-baseline rows)

| Reason | Rows | Points | Note |
|---|---|---|---|
| `Quick manual adjustment via Rankings` | 696 | 2830 | 93% of all rows — the quick bar |
| `Manual adjustment via Rankings page` | 37 | 592 | **String not present in current code** — legacy path, pre-dates the current quick bar |
| `Bulk class points via Rankings` | 15 | 15 | Bulk used once, +1 to 15 students |
| `TEST … (will reverse)` + `Reversal of TEST …` | 11 | 0 | Leftover test rows in production, net zero |
| `Excellent homework this week` / null | 2 | 20 | The Detailed form, used twice |

The Detailed Award form — the only path that records a real category and reason — has been used **twice**. `point_categories` in production is **byte-identical to the `0018` seed**: no admin has ever tuned a value or deactivated a category. The category system is, in practice, unused.

### Latent vs. active defects (settled by data)

| §9 finding | Production status |
|---|---|
| 9(a) cross-level all-time contamination | **Latent.** `students_spanning_levels = 0` — no student has changed level yet. Real, but not yet biting. |
| 9(c) backdating impossible | **Latent.** `lesson_date <> created_at::date` in 0 rows — nobody has needed catch-up entry in 3 days. |
| 9(e) reversal mechanism unused | **Confirmed dead.** `is_reversal = 0` rows, `reversed_transaction_id = 0` rows. Even the manually-inserted "Reversal of TEST…" rows are plain negative rows with the flag unset — the mechanism was not used even by the person who built it. |
| 9(j) co-winners never produced | **Confirmed.** 9 recognition rows, `is_co_winner = 0`. |

## B. Interaction defects (verified in code)

Every quick click runs: `quickAdjust` (`Rankings.jsx:88`) → `awardStudentPoints` (`useAcademyData.js:140`) → one INSERT → **full `listStudents()` refetch** (`select * from students_view`) → `setStudents`. Two serialized round-trips per click, no optimistic update.

- **B1 — the list reorders under the operator's finger.** `ranked` (`Rankings.jsx:75-80`) is a `useMemo` sorted `points desc`. Every award re-sorts the table, so the awarded student jumps. **At 571 +5 taps in 3 days, this happened 571 times.** Combined with no undo and an append-only ledger, a reorder-induced mis-tap is permanent. This is very likely a direct cause of the −1 spam.
- **B2 — no undo.** Only −1 is available; reversing +5 costs five taps and leaves five `penalty` rows that a student sees as five punishments.
- **B3 — the Level Leaderboard goes stale on every award.** `board` (`:241-254`) and `classTransactions` (`:264-282`) depend only on `[boardLevel, boardPeriod]`. Awarding does not refetch them. The top table updates while the level-scoped board below — the meaningful one — shows pre-award numbers until a tab is switched.
- **B4 — the error banner never clears.** `setError('')` appears nowhere outside the `useState` initializer (`useAcademyData.js:31`). One transient failure pins a red banner at `Rankings.jsx:348` for the rest of the session, through every later success.
- **B5 — failure is invisible on the fast path.** `quickAdjust` is `try/finally` with no `catch`; the rethrow becomes an unhandled rejection. The only signal is the top-of-page banner — off-screen on mobile. A failed +5 looks exactly like a successful one.
- **B6 — the number beside the buttons is the lifetime cache** (`:392`, `:454`), including baseline and other levels, while the ranking those taps affect is the weekly board further down.
- **B7 — full-table refetch per click**, which is what makes B1 visible.

## C. Root cause

One sentence: **the quick bar models "adjust by a fixed step" when the actual task is "record an amount", and every supporting defect (tap spam, −1 undo spam, unreadable history, dead categories, list churn) follows from that.**

## D. Implementation plan — PROPOSAL, not yet approved

Architecture preserved throughout: `point_transactions`, the `students.points` cache trigger, all RLS policies, and every existing RPC are **untouched**. No migration cleanup, no RLS work, no deployment changes. Phases 1–2 are frontend-only.

### Phase 1 — amount entry (the actual fix)

Replace the increment buttons in the quick bar with a single amount control per row:

- A small number input plus **one-tap presets** for the values that carry meaning. One interaction = **one** ledger row, whatever the amount.
- Keep the existing `awardPoints()` signature and payload shape exactly as-is — only the value being passed changes.
- Retire `QUICK_DELTAS` (`Rankings.jsx:34`). Retire `+3` outright — production says 16 clicks lifetime.
- Add a negative amount path so a correction is one action, not five.

Expected effect: ~696 rows over 3 days collapses to roughly the number of real awards, and student history becomes readable.

**Files:** `src/pages/Rankings.jsx` (`:34`, `:88-105`, `:380-420`, `:445-475`).

### Phase 2 — interaction fixes (independent of any rule decision)

| # | Fix | Location |
|---|---|---|
| 1 | Freeze row order while awarding — sort by a `displayOrder` id snapshot, recomputed on mount / level / period change or an explicit "Re-sort" control. Fixes **B1**. | `Rankings.jsx:75-80` |
| 2 | Optimistic local update, reconcile on response, roll back on failure. Fixes the stall and **B7**. | `Rankings.jsx:88-105` |
| 3 | Per-row undo writing a **proper** reversal — `is_reversal = true`, `reversed_transaction_id` set. Needs `awardPoints()` to return the new id (`.select('id').single()`). `get_my_point_history()` already exposes `is_reversal` as `is_correction`, so the student view renders it as a correction, not a punishment. Fixes **B2** and activates the dead mechanism from 9(e). | `Rankings.jsx`, `storageBridge.js:80` |
| 4 | Add an award counter to the `board` / `classTransactions` dependency arrays. Fixes **B3**. | `Rankings.jsx:241-254, 264-282` |
| 5 | Clear `error` at the start of each successful mutation. Fixes **B4**. | `useAcademyData.js` |
| 6 | Inline per-row success/failure feedback instead of the top banner. Fixes **B5**. | `Rankings.jsx:88-105` |
| 7 | Show the period figure beside the input, or label the lifetime number as "total". Fixes **B6**. | `Rankings.jsx:392, 454` |

### Phase 3 — categories (**blocked on Dave**)

Only worth doing if Dave wants awards to carry meaning. Production shows the category system is entirely unused, so this is a real product question, not a cleanup task.

- **Option A (zero migration):** a sticky category selector above the quick bar; the amount control writes the selected `category_id`/`category_key` and a derived reason. Pure `Rankings.jsx`.
- **Option B (one small migration):** add nullable `quick_order integer` to `point_categories`; categories with a non-null value render as presets using their own `name`/`icon`/`default_points`. Existing RLS already covers the new column. Lets Dave retune values and meanings from the admin UI with no deploy.

**Recommendation: Option B**, but only after Phase 1 proves the amount-entry model in real classroom use.

### Phase 4 — deferred

Latent items with no current production impact: level-scoped all-time (9a), the top table's index-based ranking (9b), backdating (9c), the dead tie-break function (9j). Worth fixing, not urgent — and 9(a)/9(c) become urgent the moment a student changes level or someone needs a catch-up entry.

### Open question for Dave

**What should one tap actually record?** Production shows +5 tapped up to 29 times on one student in one day, so the current answer is "an arbitrary increment". Phase 1 assumes the intent is "type the amount you mean". If instead there is a real rulebook (e.g. +5 speaking, +10 homework), say so — that changes Phase 1's preset list and promotes Phase 3 ahead of Phase 2.
