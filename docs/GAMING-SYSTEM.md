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

**Known architectural tension (flagged, not resolved):** flat scoring doesn't reward difficulty/level, so a student grinding low levels can out-score a genuine high-level player on raw `max(score)`. Recommended fix (not built): an *additive* "highest level reached" view alongside the existing score leaderboard — explicitly not a change to the already-verified score-ranking RPC.

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
- Server-side enforcement: round-generator RPCs only ever serve content at the student's persisted `current_level` — a client cannot request an unearned level. **This was specified as non-negotiable in the design doc; confirm it against the actual `0150` RPC bodies before treating it as verified in a specific new session** — this doc pass read the schema migration (`0149`) in full and confirmed the RPC wiring migration (`0150`, 924 lines) exists and is the largest file in the range, but did not line-by-line audit its enforcement logic.
- `15e17ae` (current HEAD): fixed level-retry copy that incorrectly said "70% needed" for lives-based games (Grammar Battle) — a Level Progression UI bug, now fixed.
- **Grammar Battle pass-path — runtime-verified (2026-08-17):** Level 1→2 progression confirmed against production. A live test-student round was submitted through the production `submit_game_round()` RPC (same code path the UI calls) and returned `pass:true, leveled_up:true, current_level:2`; `game_level_progress` showed the persisted level; after a UI reload, GameCenter and Grammar Battle itself both opened directly at Level 2. **Method caveat:** the round answers were submitted via direct RPC call (impersonating the test student), not played through the UI, because Grammar Battle's 8-second-per-question timer couldn't be reliably beaten by browser automation. This verifies the server-side pass/persist/resume mechanism end-to-end; it is not a verification of a full human-paced UI playthrough of the timer itself.

### 7b. Approved future design elements NOT YET implemented / explicitly deferred

The full approved spec is `docs/level-progression-specification-2026-08-17.md`. Everything below is **planned**, not built, unless separately confirmed:

- A "highest level reached" leaderboard view (the Q9 ranking-conflict fix, §6 above) — additive, not built.
- Exact length-cap/distractor-band cutoffs for Family V beyond the length-cap mapping already in `0149` — the spec calls the 4-band structure "illustrative," not tied to real data thresholds the way Family C's tier sizes are.
- Level 101+ mechanics beyond the basic asymptotic-threshold idea (e.g. shrinking lives budget past L100 for Grammar Battle) — approved conceptually, exact mechanics not confirmed as implemented.
- The academy-level (CEFR) snapshot gap on `game_sessions` — explicitly a **different** "level" concept from game-level progression, explicitly **not** addressed by this work, and explicitly must stay a distinct open item (see `RANKING-SYSTEM.md`).

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

- Level Progression's server-side anti-skip enforcement is implemented per spec but not independently re-verified in this documentation pass (see §7a).
- Ranking-conflict (flat scoring doesn't reward level/difficulty) — flagged, unresolved, additive fix recommended.
- Family V length-cap/distractor bands beyond the basic length-cap mapping are the spec's own "illustrative, needs approval on exact cutoffs" language — do not treat the 4-band structure as finalized product design.
- Two disconnected badge systems exist elsewhere in the app (`achievement_definitions`/`student_achievements` vs. `src/utils/badges.js`'s `computeBadges()`) — game metrics bump `student_metric_snapshots`, which the DB-backed engine reads, but **no achievement currently keys off any of the game metric names** in the codebase searched this pass — the bump/evaluate wiring exists but is a dead end today, consistent with the points-pause status documented in `gamification-system-audit-2026-08-16.md`.

## 12. Game Points vs. Class Points (architectural intent — planned, NOT implemented)

**Verified this pass:** no `game_points` column, table, or reference exists anywhere in the repo (`src/`, `supabase/migrations/`). Game Points is a **planned/architectural intent only** — the roadmap concept is a separate points currency for gaming activity, distinct from Class Points (`point_transactions`, teacher/admin-controlled, manual awards only). The explicit design intent, carried forward from the gamification audit, is that badges/achievements must never auto-award Class Points directly — any future points-from-games mechanism should be a new, separate ledger/currency, not a write into `point_transactions`. Do not build a `game_points` write path into the existing points ledger without an explicit product decision — this would violate the standing "no direct points writes" rule that currently protects `point_transactions` integrity.

## 13. Security / abuse status (confirmed-current)

No P0s found across two audit passes (2026-08-15, and this documentation pass). Replay protection (`0141`) closed the one real P1 gap (unlimited repeat `submit_game_round` calls). Speed Challenge's client-supplied `elapsed_ms` is clamped server-side to [0,10000] and only affects a small bonus on an already-verified-correct answer — not an exploitable score vector. Teacher SELECT on `game_sessions`/`game_word_history` remains role-only (not level-scoped) — consistent with, not worse than, the broader teacher-authorization gap documented in `ARCHITECTURE.md`/`DATABASE.md`.
