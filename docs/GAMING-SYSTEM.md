# Gaming System

The most detailed doc in this set. Covers all 9 games, architecture, content, difficulty, scoring, records/rankings, relevant RPCs/migrations, production status, and known issues. Cross-references `RANKING-SYSTEM.md` for the leaderboard/tie logic shared with the rest of the app.

## 1. Current status (confirmed-current)

Fully built and shipped, not just architected — reachable at `/games` (`GameCenter.jsx`), nav entry in `PortalNav.jsx`. 9 games, each its own route/page under `src/pages/portal/`. Server-authoritative throughout: no game writes a score the server didn't independently verify.

## 2. The 9 games

**Family V — 6 vocabulary games**, drawing from the shared 938-word `lesson_vocabulary` pool (~10-12 words/lesson), curriculum-gated:

| Game | File | Mechanic |
|---|---|---|
| Word Scramble | `WordScramble.jsx` | Unscramble letters into a vocabulary word |
| Vocabulary Quiz | `VocabularyQuiz.jsx` | Multiple choice EN↔UZ |
| Word Match | `WordMatch.jsx` | Match word↔translation pairs |
| Speed Challenge | `SpeedChallenge.jsx` | Timed quiz, speed bonus |
| Word Builder | `WordBuilder.jsx` | (added in the 5-new-games batch, `0142`) |
| Listening Challenge | `ListeningChallenge.jsx` | (added in the 5-new-games batch, `0142`) |

**Family C — 3 grounded/content-bank games**, drawing from `game_content_bank` (100 items each, 5 fixed difficulty tiers: very_easy 20 / easy 20 / medium 25 / hard 20 / very_hard 15), curriculum-gated via `min_lesson_number`:

| Game | File | Mechanic |
|---|---|---|
| Sentence Scramble | `SentenceScramble.jsx` | Reorder words into a correct sentence |
| Word Detective | `WordDetective.jsx` | Find and correct the one error in a sentence |
| Grammar Battle | `GrammarBattle.jsx` | Lives-based multiple-choice grammar quiz, mixed-tier pool |

Content authoring standards for the 3 Family C games are documented in `docs/game-content-bank-standards-2026-08-16.md` (target ≥100 items/game, 45/35/20 easy/medium/hard split, vocabulary-discipline rule: difficulty comes only from grammar, never obscure vocabulary).

## 3. Architecture / data flow

```
student -> GameCenter.jsx -> get_<game>_round() RPC
        -> server picks content:
             Family V: student_available_vocabulary() -> pick_game_words()
             Family C: min_lesson_number <= unlocked, filtered by tier
        -> student answers in-browser (local state only, no persistence)
        -> submit_game_round(game_type, answers) RPC
              re-validates every answer server-side against lesson_vocabulary / game_content_bank
              consumes a replay-protection token (game_rounds, 0141)
              writes game_sessions (score, level tag since 0149)
              upserts game_word_history
              bump_student_metric() -> evaluate_achievements()
        -> NO direct write to point_transactions or students.points
```

Frontend↔RPC glue: `src/lib/storageBridge.js`. Routes registered in `App.jsx`.

## 4. Content sources

| Family | Source | Size | Gating |
|---|---|---|---|
| V (6 games) | `lesson_vocabulary` | 938 active words | Currently-unlocked-lesson vocabulary via `student_available_vocabulary()` |
| C (3 games) | `game_content_bank` | 100 items/game × 3 games, 300 total (`0144`) | `min_lesson_number <= student_unlocked_lesson_number()`, tier-filtered |

Round size is unchanged by any of this work — Word Scramble 8, Vocabulary Quiz 8, Word Match 6, Speed Challenge 10, Word Builder 8, Listening Challenge 8, Sentence Scramble 6, Word Detective 8, Grammar Battle ~20 (lives-based, early exit).

## 5. Difficulty

Two mechanisms exist; **as of migrations 0149-0151, level number is the driver for all 9 games**, not the older per-game adaptive/exposure heuristics (which remain defined and callable but are no longer wired into round selection — confirmed-current per migration 0149's own header):

- **Family V:** level maps to a word-length cap (`game_level_to_length_cap()`: ≤20 → 6 chars, ≤40 → 9 chars, else uncapped) — same 3-bucket shape as the old `pick_game_words()` exposure heuristic, just level-driven instead of exposure-driven.
- **Family C + Grammar Battle:** level maps to a tier (`game_level_to_tier()`: ≤20 very_easy, ≤40 easy, ≤65 medium, ≤85 hard, else very_hard) — supersedes `adaptive_difficulty_tier()` (accuracy-history-driven) as the *driver*, per an explicit approval recorded in the spec (this was flagged as changing already-shipped behavior and required an explicit yes, not an assumption).

`adaptive_difficulty_tier()` and the old exposure-count heuristic in `pick_game_words()` are **not dropped** — kept callable for possible future use, just no longer wired into round generation.

## 6. Scoring / grading

Server-authoritative, unchanged by the Level Progression work: flat per-correct point value (10, or 10+speed-bonus for Speed Challenge), identical across difficulty tiers. There is no client-trusted score path — `submit_game_round()` re-validates every answer. `game_sessions` has no student INSERT policy; the RPC is the only write path.

**Known architectural tension (flagged, resolved 2026-08-17):** flat scoring doesn't reward difficulty/level, so a student grinding low levels can out-score a genuine high-level player on raw `max(score)`. Fix: an *additive* "highest level reached" view — see §7b for the full status (backend RPC already live in production; frontend wired this session).

## 7. Level Progression — current implementation vs. approved future design

**This section is the one place in this doc set where the current-vs-future distinction is load-bearing. Read both halves before assuming either is complete.**

### 7a. Current implementation (confirmed-current, migrations 0149-0151, deployed at `35fa46d`)

- `game_level_progress` table: one row per `(student_id, game_type)`, `current_level` (default 1, the next level to attempt) and `best_level_reached` (default 1, high-water mark, never decreases).
- **One Level = one existing Round** — no new "unit of work" was invented. Completing a round at the pass condition advances `current_level` by exactly one.
- Pass condition: ≥70% correct for the 8 accuracy-based games; survive-to-end (no life loss) for Grammar Battle.
- Failure never advances `current_level`, never touches `best_level_reached`, never affects ranking, and never locks the student out — same-level retry is always available.
- Content-window (curriculum safety) is **unchanged and never weakened** — still the exact same `student_unlocked_lesson_number()`/`min_lesson_number`/`student_available_vocabulary()` gating every game already used. Only the challenge-bar dimension (pass threshold / tier / length-cap / lives) is now level-driven.
- Nullable `level` columns added to `game_rounds` and `game_sessions` — pre-existing rows are `level = NULL` ("unleveled legacy session"), not backfilled.
- No hard ceiling at Level 100 — levels 101+ reuse the top band and keep the pass threshold climbing (asymptotically) rather than requiring new content.
- Server-side enforcement: round-generator RPCs only ever serve content at the student's persisted `current_level` — a client cannot request an unearned level. **Confirmed by direct code audit, 2026-08-17:** all nine `get_*_round()` functions in `0150` take zero client-supplied parameters — every one does `select current_level into v_level from public.game_level_progress` server-side and nothing else determines which level's content is served. There is no `p_level` argument anywhere in any round-generator signature, so a client literally cannot request an unearned level. **known-issue-fixed → verified**, not merely code-reviewed-and-trusted.
- `15e17ae` (current HEAD): fixed level-retry copy that incorrectly said "70% needed" for lives-based games (Grammar Battle) — a Level Progression UI bug, now fixed.
- **Grammar Battle — runtime-verified in production, 2026-08-17, two sessions:**
  - Session 1: Level 1→2. Correct-answer round submitted through production `submit_game_round()` RPC (impersonating the test student's `auth.uid()`), returned `pass:true, leveled_up:true, current_level:2`; persisted in `game_level_progress`; confirmed live in UI after reload (GameCenter tile and the game itself both opened at Level 2).
  - Session 2 (this pass): **continued progression** — a fresh Level-2 round submitted with deliberately wrong answers correctly returned `pass:false, leveled_up:false, current_level:2` (fail does not advance, confirmed server-side). A second fresh Level-2 round submitted fully correct returned `pass:true, leveled_up:true, current_level:3` — **progression continues past Level 2**, confirmed live in UI (`3-daraja` shown on reopen). **Curriculum gating at Level 3 spot-checked:** the Level-3 round's content had `max(min_lesson_number) = 42`, safely under the test student's unlocked ceiling of 45 — gating still holds as level climbs.
  - **Method caveat (both sessions):** round answers were submitted via direct RPC call, not played through the UI, because the 8-second-per-question timer couldn't be reliably beaten by browser automation (4 live UI attempts got 56-60% question accuracy before losing all 3 lives to click/read round-trip latency, not answer-reasoning errors). This verifies the server-side pass/fail/persist/resume/gating mechanism end-to-end across two consecutive levels; it is not a verification of a full human-paced UI playthrough of the timer itself.
- **Word Match (Family V) — breadth-verified in production, 2026-08-17:** test student 44, starting `current_level:5`. A fresh Level-5 round submitted fully correct via direct `submit_game_round()` RPC (impersonating `auth.uid()`) returned `pass:true, leveled_up:true, current_level:6`; persisted in `game_level_progress` (`best_level_reached:6`, confirmed by direct query). A second fresh round at the new Level 6 submitted with deliberately wrong answers returned `pass:false, leveled_up:false, current_level:6` (fail does not advance; persistence confirmed unchanged at 6). Curriculum gating not independently spot-checked this pass — Family V draws from the already curriculum-gated `student_available_vocabulary()`, which this round's Level-5/6 content came from. **Verification type: production RPC** (this pass). This supplements, and does not replace, the earlier **live-browser-UI** confirmation of Word Match Level 2→3 recorded under §12 Game Points below (results screen showed the level-up banner end-to-end for a non-Grammar-Battle game).
- **Sentence Scramble (Family C) — breadth-verified in production, 2026-08-17:** same test student 44, starting `current_level:2`. A fresh Level-2 round submitted fully correct via direct `submit_game_round()` RPC returned `pass:true, leveled_up:true, current_level:3`; persisted in `game_level_progress` (`best_level_reached:3`, confirmed by direct query). A second fresh round at the new Level 3 submitted with deliberately wrong word order returned `pass:false, leveled_up:false, current_level:3` (fail does not advance; persistence confirmed unchanged at 3). **Curriculum gating spot-checked:** the Level-2 round's content all had `min_lesson_number = 1`, safely under the test student's unlocked ceiling of 45. **Verification type: production RPC only** — no live-browser-UI playthrough performed for this game this pass.
- **Academy-level decoupling — confirmed by code audit, 2026-08-17:** neither `0149` (schema) nor `0150` (wiring) references `students.level` (the CEFR/academy level column) anywhere — game-level progression and academy-level promotion are structurally independent, not just by convention.

### 7b. Approved future design elements NOT YET implemented / explicitly deferred

The full approved spec is `docs/level-progression-specification-2026-08-17.md`. Everything below is **planned**, not built, unless separately confirmed:

- ~~A "highest level reached" leaderboard view (the Q9 ranking-conflict fix, §6 above)~~ — **DONE 2026-08-17**: `get_game_level_leaderboard()` (migration `0151`) was already live in production (confirmed via `pg_get_functiondef` matching source exactly, plus real multi-student data present across several games at level C), but had zero frontend callers — the backend existed and the UI simply never consumed it. This session wired it up: `getGameLevelLeaderboard()` (`src/lib/storageBridge.js`), fetched in `GameCenter.jsx` alongside the existing score-based `getGameBestRecords()` call, rendered as a second "level leader" chip on `GameCard.jsx` (Crown icon, distinct from the existing Trophy score-record chip) — purely additive, `get_game_best_records()`/the score leaderboard untouched. Build-verified (`npm run build` clean) and database-verified (RPC live, underlying data present); **not verified against a real logged-in student session** — no test-student credentials were available this session, so the rendered chip itself was not eyeballed in a browser.
- Exact length-cap/distractor-band cutoffs for Family V beyond the length-cap mapping already in `0149` — the spec calls the 4-band structure "illustrative," not tied to real data thresholds the way Family C's tier sizes are.
- Level 101+ mechanics beyond the basic asymptotic-threshold idea (e.g. shrinking lives budget past L100 for Grammar Battle) — approved conceptually, exact mechanics not confirmed as implemented.
- ~~The academy-level (CEFR) snapshot gap on `game_sessions`~~ — **FIXED 2026-08-17**: `0155_game_sessions_academy_level_snapshot.sql` applied to production. Adds nullable `game_sessions.academy_level text` (CHECK-scoped to `A`/`A1`/`B`/`C`), and `submit_game_round()` now captures `students.level` into it at the same select that already fetches `v_student_id`, on every new session. Existing 279 rows intentionally remain `NULL` (no backfill — same precedent as `0149`'s `level` column: a promoted student's older sessions must not silently be reattributed to their new level). Production-verified by direct query: column exists, constraint scoped correctly, RPC source contains the snapshot logic, historical-row count unchanged at 279/279 `NULL`. **Runtime/UI verification not performed this session** — the environment's permission classifier blocked the SQL-level student-impersonation technique used for prior runtime tests in this doc (see §12), and no real test-student login credentials were available; a live playthrough (or a future session with impersonation access) should still confirm `academy_level` populates correctly end-to-end before this is called fully verified. Distinct from `game_sessions.level` (0149, the game's own 1..100+ progression number) — not touched by this migration.

### 7c. Do not conflate

"Game level" (1, 2, 3, ... 100+, per student per game, from this system) is architecturally and terminologically distinct from "academy level" (A1/A/B/C, the CEFR-style cohort a student is enrolled in). The spec is explicit that promotion between academy levels/groups does not touch `current_level`/`best_level_reached`, and vice versa.

## 8. Curriculum gating and the "insufficient content" edge case

Resolved by design, not a bug: content-window (what's curriculum-legal) plateaus at the student's curriculum ceiling; challenge-bar (pass difficulty) keeps climbing on already-unlocked, already-safe content once curriculum is the limiting factor. Concretely, at spec time no active student was unlocked past Lesson 50, so no student can yet reach the true content-window for levels 86-100 (`very_hard`, gated at Lesson 86) — their level *number* can still climb past 85 via the challenge-bar mechanism on `hard`-tier content. This is expected and correct, not a defect.

## 9. Personal records, Top 5, ranking, ties

- `get_game_best_records()` (`0147`, fixed in `0148` for an ambiguous-column bug — **known-issue-fixed**) provides personal-best scores per game.
- Top 5 leaderboard + rank + "next target" on game results screens (`43b4194`).
- **known-issue-fixed:** Top 5 medal/rank display was keyed by array position, not true rank — fixed at `d5ca5a2`. This mirrors a defect class documented across the rest of the app in `RANKING-SYSTEM.md` (array-index-vs-`rank()` inconsistency) — check that doc before assuming any other leaderboard surface is safe from the same bug.
- **known-issue-fixed:** GameCenter's leaderboard fetch had no error handling — fixed at `66ce91d`.
- Ranking/tie mechanics reuse the same `rank()`-based convention as the rest of the ranking system (see `RANKING-SYSTEM.md`), not a separate implementation.

## 10. Production status / deploy history (confirmed-current, from commit log)

Newest first: `15e17ae` level-retry copy fix → `35fa46d` Level Progression (0149-0151) → `52eaa30` Level Progression spec (design only) → `66ce91d` leaderboard error handling fix → `d5ca5a2` medal/rank fix → `43b4194` Top 5 + rank + next target → `51bb001` ambiguous-column fix (0148) → `cc975ca` best-records leaderboard (0147) → `e670326` adaptive-tier-scale + unlocked-lesson-join fix → `5d96663` filter rounds by lesson/difficulty → `0583b74` ground content in curriculum → `4fe705b` 5 new games (9-game library) → `6f9b41b` replay protection (0141).

**Standing rule, confirmed twice in this exact system:** static SQL/migration review is not sufficient to mark a deploy "verified" — two bugs (tier-scale, unlocked-lesson join) were caught only by runtime testing, not code review. Any future Level Progression or gaming-system claim of "verified working in production" should be backed by an actual logged-in-session test, not a migration read-through.

## 11. Known issues (open)

- Ranking-conflict (flat scoring doesn't reward level/difficulty) — flagged, unresolved, additive fix recommended.
- Family V length-cap/distractor bands beyond the basic length-cap mapping are the spec's own "illustrative, needs approval on exact cutoffs" language — do not treat the 4-band structure as finalized product design.
- Two disconnected badge systems exist elsewhere in the app (`achievement_definitions`/`student_achievements` vs. `src/utils/badges.js`'s `computeBadges()`) — game metrics bump `student_metric_snapshots`, which the DB-backed engine reads, but **no achievement currently keys off any of the game metric names** in the codebase searched this pass — the bump/evaluate wiring exists but is a dead end today, consistent with the points-pause status documented in `gamification-system-audit-2026-08-16.md`.

## 12. Game Points vs. Class Points — IMPLEMENTED and runtime-verified (2026-08-17, migration `0152`)

Design: `docs/game-points-specification-2026-08-17.md` (all §18 decisions approved by Dave, 2026-08-17). Implemented same day.

**Formula:** `10 base + tier bonus (very_easy=0/easy=2/medium=5/hard=8/very_hard=12) + 5 perfect bonus`, awarded **only** on a genuine `leveled_up = true` event from `submit_game_round()` — never per-answer, never on failure, never on replay, never from personal records or ranking position. "Perfect" reuses the exact `words_correct = words_total` signal every game already computed pre-existing — no new performance definition was invented. One common formula across all 9 games; no per-game special-casing.

**Family V/Family C tier question — resolved by inspection, not guessed:** `game_level_to_tier(p_level)` (0149) takes only a level number, not a game type — it was already family-agnostic, just conventionally called only from the 3 content-bank round-generators. Reused as-is for all 9 games; no separate Family V tier mapping was needed or built.

**Architecture:** new `game_points_transactions` table — immutable, append-only, `unique(student_id, game_type, level)` as a hard DB-level duplicate-award guard (a given student+game+level can physically never appear twice, independent of the existing atomic level-advance `UPDATE ... WHERE current_level = v_round_level` that already made double-awarding structurally near-impossible). Physically separate from `point_transactions` — the Game Points insert and the level-advance write happen inside `submit_game_round()`'s single existing transaction, so a UI failure after the call returns cannot produce a partial write. Lifetime total is derived on read via `get_student_game_points()`, never a stored mutable column (same no-drift pattern as Class Points). Badge integration deliberately **not built** this pass (no achievement currently keys off any game metric — would be inert; deferred to the future badge-reconciliation session). No monthly reset — lifetime only; the ledger's `created_at` column supports a monthly view later as a pure read-query addition, no schema change needed.

**Runtime-verified this pass (real production data, real test-student session):**
- Grammar Battle Level 3→4, all-correct: `game_points_awarded: 15` (10 base + 0 tier[very_easy] + 5 perfect), `game_points_is_perfect: true` — matches formula exactly. Verified via direct RPC call (same method used for Level Progression verification — Grammar Battle's 8s timer still isn't beatable by browser automation).
- Grammar Battle Level 4, deliberately failed (2/21 submitted): `game_points_awarded: 0`, `game_points_total` unchanged, no ledger row — failure path confirmed.
- Grammar Battle Level 4, non-perfect pass (19/21 correct, all 21 submitted): `game_points_awarded: 10` (base only, no perfect bonus) — confirms the perfect-bonus gate works correctly, not just the pass/fail gate.
- Word Match (Family V) Level 2→3, all-correct via **live browser UI playthrough** (not RPC — Word Match has no timer): results screen showed `+15 O'yin ochkosi (Mukammal!)` correctly alongside the existing level-up banner and unaffected Top 5 leaderboard — confirms the formula, the tier-reuse decision, and the frontend all work end-to-end for a non-Grammar-Battle game.
- Re-submitting an already-consumed round correctly raises the pre-existing "already submitted" error rather than double-awarding — duplicate-submission protection confirmed (this reuses `game_rounds.consumed_at`, not new code).
- `get_student_game_points()` RPC confirmed returning the correct running total (40) matching `sum(points)` across both test events.
- Class Points (`point_transactions`) row count for the test student unchanged across the entire test session — confirmed by direct query, and architecturally guaranteed by code review (no `point_transactions` reference anywhere in `0152`).
- `get_game_best_records()` (ranking) unaffected — verified unchanged, and the function itself was never touched.

**Not built this pass (explicitly deferred, per approved spec §18):** badge→Game Points integration, monthly Game Points view, personal-record bonus, ranking-position bonus. None of these are bugs — they were approved as out-of-scope for v1.

## 13. Security / abuse status (confirmed-current)

No P0s found across two audit passes (2026-08-15, and this documentation pass). Replay protection (`0141`) closed the one real P1 gap (unlimited repeat `submit_game_round` calls). Speed Challenge's client-supplied `elapsed_ms` is clamped server-side to [0,10000] and only affects a small bonus on an already-verified-correct answer — not an exploitable score vector. Teacher SELECT on `game_sessions`/`game_word_history` remains role-only (not level-scoped) — consistent with, not worse than, the broader teacher-authorization gap documented in `ARCHITECTURE.md`/`DATABASE.md`.
