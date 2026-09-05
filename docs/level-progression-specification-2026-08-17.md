# Dave English Academy — Level Progression Specification

Status: **DRAFT — awaiting Dave's approval. No implementation has begun.**
Baseline: the completed 9-game architecture audit (this session's transcript / `ranking_audit_report.md` predecessor session). No migrations, RPCs, or frontend code were touched to produce this document.

---

## Section A — Product definitions

These definitions are used consistently everywhere below.

| Term | Definition |
|---|---|
| **Round** | One playthrough of a game's existing `get_*_round()` → answer → `submit_game_round()` cycle. Item count is whatever each game already uses today (6–10 items, or a lives-based attempt for Grammar Battle). Unchanged by this spec. |
| **Level** | A persistent, numbered progression state (1, 2, 3, … 100+) for one `(student, game_type)` pair. **One Level = one Round**, using that game's existing native round size. This is the single most important modeling decision in this document — see "Why one round per level" below. |
| **Session** | The existing `game_sessions` row: one completed (submitted) Round. Under this spec, a session is *also* tagged with which Level it was an attempt at. |
| **Complete a level** | Submit a Round for that level and meet the level's pass condition (defined per game family below). |
| **Fail a level** | Submit a Round for that level and *not* meet the pass condition. |
| **Progress** | `current_level` (the next level available to attempt) advances by exactly one when a level is completed. |
| **Replay** | Re-attempting a level the student has already completed (`level < current_level`, or `level == current_level` after a fail). Never decreases `current_level` or `best_level_reached`. |
| **Finish the game** | There is no hard finish. Level 100 is a milestone, not an end state (see Q10 for all games). |

### Why one Round = one Level (not "several rounds per level")

Considered and rejected: bundling multiple rounds into one level (e.g., "Level 3 = 3 rounds"). Rejected because:
- It multiplies the persistence/state complexity (mid-level partial progress) for no clear product benefit — Dave's own goal is "Level 1 → Level 2 → … → Level 100," not "sub-round 2 of 3 within Level 7."
- It would require *more* new state to build (a round-within-level counter), not less.
- The existing round sizes (6–10 items, ~20 for Grammar Battle) are already a reasonable "unit of work" — turning each into its own level number directly solves "8 questions → Replay" with the smallest possible change: reuse the existing round exactly as-is, just make it *count toward something permanent*.

This satisfies the brief's constraint against "1 content item = 1 level" (rejected) and against "1 round = 1 level with no real pass/fail gate" (also rejected — see Q2/Q3 below, a level is not just a relabeled round, it has a real completion requirement, a stored outcome, and a permanent effect on `current_level`).

---

## The two-family split

The 9 games split into two architecturally distinct families. Forcing one identical model onto both would be the "numbered stickers on the existing system" outcome Dave explicitly warned against — so this spec treats them as genuinely different, while sharing everything that *can* honestly be shared (see Section 7).

- **Family V (6 vocabulary games):** Word Scramble, Vocabulary Quiz, Word Match, Speed Challenge, Word Builder, Listening Challenge. Draw from the shared 938-word `lesson_vocabulary` pool (~10–12 words/lesson), curriculum-gated, currently ramped by a crude 3-bucket global exposure heuristic in `pick_game_words()`.
- **Family C (3 grounded/content-bank games):** Sentence Scramble, Word Detective, Grammar Battle. Draw from `game_content_bank`, 100 items each, 5 fixed difficulty tiers (very_easy 20 / easy 20 / medium 25 / hard 20 / very_hard 15), curriculum-gated via `min_lesson_number`, currently ramped by `adaptive_difficulty_tier()` (accuracy-history-driven).

### The core mechanism shared by both families: two independently-capped difficulty dimensions

This is the central idea of the recommended architecture, so it's stated once here rather than repeated 9 times below.

> **Content-window** (which items are curriculum-eligible) is capped by the student's unlocked lessons — exactly as today, never weakened. **Challenge-bar** (the pass threshold: required accuracy, time pressure, distractor count) is capped by *level number*, not by curriculum.

These two dimensions normally rise together as level number increases. But when a student's curriculum unlock is behind their level number (a fast-improving Level-60 player who is still only unlocked through Lesson 20), **content-window plateaus at the curriculum ceiling while challenge-bar keeps climbing** on the same, already-unlocked, already-safe content. This is the direct, non-hacky answer to Q11 (insufficient content) for every game: levels never run out of legal content to serve, and curriculum safety is never weakened to fill a level.

---

## Twelve questions, answered per game

### Family V — shared answers (Word Scramble, Vocabulary Quiz, Word Match, Speed Challenge, Word Builder, Listening Challenge)

**Q1 — What is one level?** One Round, using each game's existing size (Word Scramble 8, Vocabulary Quiz 8, Word Match 6, Speed Challenge 10, Word Builder 8, Listening Challenge 8) — unchanged.

**Q2 — How does the student progress?** Pass condition: **≥70% correct** in the round (a simple, uniform bar across Family V — no game-specific reason found to differ). On pass, `current_level += 1`.

**Q3 — What happens on failure?** `current_level` does not advance. The student may immediately retry the *same* level (a fresh round is generated from the same content-window/challenge-bar). Failure never touches `best_level_reached`, never deletes or degrades any existing personal-best score, never affects ranking. No lockout, ever — a student can always drop down and replay any level they've already passed.

**Q4 — How does difficulty increase?** Level number maps to a **length-cap / distractor-quality band**, replacing today's global cross-game exposure-count heuristic (`pick_game_words()`'s `<15 / <40 / else` buckets) with an explicit, per-game, level-driven signal: shorter/more-common words and easier distractors at low levels, longer words and closer/harder distractors at high levels. Recommended banding (illustrative, needs Dave's approval on exact cutoffs): Levels 1–20 short/common words only, 21–40 moderate length, 41–70 no length cap + harder distractors, 71–100 no cap + closest-meaning distractors + (Speed Challenge only) tighter time limits.

**Q5 — Curriculum interaction?** Content-window = words from currently-unlocked lessons (via `student_available_vocabulary()`, unchanged query). A student can keep advancing `current_level` (challenge-bar keeps rising) even while curriculum-limited; the *content* they see stops getting new words once they've exhausted their unlocked lessons' vocabulary, but the *round* still gets harder (stricter pass %, tighter time) using words they've already legitimately unlocked. Never serves a word from a locked lesson, at any level.

**Q6 — Content selection?** Same `pick_game_words()`-style query as today (curriculum-gated random pick), parameterized by the level's length-cap/distractor band instead of the global exposure counter. Dynamic, not pre-authored per level.

**Q7 — Completed levels?** Fully replayable at any time, any number of times. Replaying does not change `current_level` or `best_level_reached`. Replaying *can* still improve the student's personal-best score (unaffected by this spec — `submit_game_round`'s existing `is_new_best` logic is untouched).

**Q8 — Scoring model (performance only, not Game Points)?** Unchanged: existing per-correct point value (10, or 10+speed-bonus for Speed Challenge). This spec does not change point values — see the Q9 flag below for why that matters.

**Q9 — Records/rankings interaction?** **Flagged conflict, not resolved here** (ranking RPC changes are out of scope this session): points-per-correct are currently flat regardless of difficulty, so a student grinding Level 1 can out-score a genuine Level 90 player on raw `max(score)`. See "Unresolved decisions" below — recommended fix is additive (a *new* "highest level reached" view alongside the existing score leaderboard), not a change to the existing, already-verified ranking RPC.

**Q10 — After Level 100?** No hard ceiling. Levels 101+ reuse the top challenge-bar band (no length cap, hardest distractors, tightest time) and keep raising the pass threshold asymptotically (e.g., 70% → 75% → 80%, capped somewhere reasonable) rather than requiring new content. Adding more vocabulary later automatically enriches every level that draws from the affected lesson range — no migration needed for existing students' progress.

**Q11 — Insufficient content?** Resolved by the two-dimension model above: content-window plateaus at the curriculum ceiling, challenge-bar keeps climbing on repeated (already-seen) words. Repetition is explicit and expected once curriculum is the limiting factor — not hidden from the student.

**Q12 — UX?** Current level number + "Level N of 100+" progress framing, locked/unlocked state N/A (levels are sequential, not a pick-any map, so nothing to show as "locked" beyond "not reached yet"), pass/fail result on the existing results screen, "Level Complete → Level N+1" transition message, existing personal-best/Top-5/rank/next-target block (unchanged, per game), explicit "Replay Level N" option for any already-passed level.

---

### Family C — shared answers (Sentence Scramble, Word Detective)

*(Grammar Battle is genuinely different — see its own subsection below.)*

**Q1 — What is one level?** One Round, existing native size (Sentence Scramble 6, Word Detective 8).

**Q2 — Progress?** ≥70% correct in the round → `current_level += 1`. Same uniform bar as Family V; no reason found for these two games specifically to differ from it.

**Q3 — Failure?** Identical rule to Family V: no advance, immediate same-level retry, no effect on `best_level_reached`, personal-best, or ranking, no lockout.

**Q4 — Difficulty increase?** Level number directly selects the difficulty **tier** (replacing `adaptive_difficulty_tier()`'s accuracy-history-driven signal — see the explicit flag below). Recommended banding, using the existing 20/20/25/20/15 tier sizes: **Levels 1–20 → very_easy, 21–40 → easy, 41–65 → medium, 66–85 → hard, 86–100 → very_hard.** (Band widths matched loosely to each tier's item count so a ~6–8-item round doesn't exhaust a tier's pool too quickly within its band — needs Dave's confirmation on exact cutoffs.)

**Q5 — Curriculum interaction?** Content-window = `min_lesson_number <= student_unlocked_lesson_number()`, exactly as today (unchanged query, unchanged safety guarantee). Within a level's tier band, only curriculum-unlocked items are eligible. If the tier's unlocked-subset is too thin for a full round, the *existing* `0145` fallback-broadening logic (widen to adjacent stages, matching the current `get_sentence_scramble_round()`/`get_word_detective_round()` fallback) is reused unchanged. If even the broadened pool is too thin, the challenge-bar-only fallback (Q11) applies instead of ever reaching into a locked lesson.

**Q6 — Content selection?** Same tier-and-curriculum-filtered random pick as today, just driven by the level's mapped tier instead of the invisible adaptive signal.

**Q7 — Completed levels?** Same replay rule as Family V.

**Q8 — Scoring?** Unchanged: flat 10 points/correct regardless of tier (same Q9 flag applies).

**Q9 — Ranking?** Same conflict and same recommendation as Family V.

**Q10 — After Level 100?** No ceiling. Levels 101+ stay in the very_hard band, and the pass threshold keeps climbing (same asymptotic idea as Family V) rather than requiring new content items. Adding new very_hard items later enriches levels 86+ automatically.

**Q11 — Insufficient content?** Two-dimension model applies identically: tier band (content-window) plateaus at the curriculum ceiling; challenge-bar (pass %) keeps rising on the same, already-unlocked tier content. **Concretely today**: no active student is unlocked past Lesson 50 (max `curriculum_progress.max_available_lesson` currently: C=50, B=40, A=20, A1=10) — meaning **no current student can reach the true content-window for levels 86–100 (`very_hard`, gated at Lesson 86) yet.** This is expected and correct, not a bug: those students' level *number* can still climb past 85 via the challenge-bar-only mechanism on `hard`-tier content, without ever touching `very_hard`'s ungated-grammar-adjacent items early.

**Q12 — UX?** Same pattern as Family V, plus (optional, needs approval) a visible tier label per level ("Level 43 · Medium") since these games already surface a difficulty concept to the student in a way vocabulary games don't.

### Grammar Battle — individually, all 12 questions

Grammar Battle is lives-based and mixes all 5 tiers into one ~20-item round *by design* (existing `0145` behavior: `v_limits` biases the mix toward the adaptive tier while always including every stage). This is fundamentally not "N items from one tier," so it needs its own answers.

1. **One level?** One Round = one lives-based attempt (the existing mixed-tier pool, ~20 items, ends early on life-loss).
2. **Progress?** Pass = **survive to the round's natural end without losing all lives** (not an accuracy percentage — the existing lives mechanic *is* the pass/fail signal). `current_level += 1` on survival.
3. **Failure?** Losing all lives before the round ends = fail. No advance, immediate retry, no effect on best/ranking/lockout — same non-punitive rule as every other game.
4. **Difficulty increase?** Level number sets the **mix bias** (`v_limits`) directly instead of `adaptive_difficulty_tier()` — low levels bias heavily toward very_easy/easy (generous mix, e.g. today's `very_easy` preset `[8,6,4,2,1]`), high levels bias toward hard/very_hard (today's `very_hard` preset `[1,2,3,6,9]`). The existing 5 presets already map cleanly to 5 level-bands (1–20/21–40/41–65/66–85/86–100, same as Family C).
5. **Curriculum interaction?** Unchanged: every item in the mixed pool still individually respects `min_lesson_number <= unlocked`, regardless of level-driven mix bias.
6. **Content selection?** Same mixed-tier union-of-limits query as today, level-driven mix instead of adaptive-driven mix.
7. **Completed levels?** Same replay rule as every other game.
8. **Scoring?** Unchanged: flat 10/correct. Same Q9 flag.
9. **Ranking?** Same conflict/recommendation.
10. **After Level 100?** No ceiling — levels 101+ keep the `very_hard`-biased mix and can additionally tighten the lives budget (fewer starting lives) as the challenge-bar dimension, rather than requiring new content.
11. **Insufficient content?** Same two-dimension resolution; concretely, no current student can reach the true `very_hard` mix weighting's full content-window yet (same Lesson-86 gate as Family C), so levels 86+ currently run on a `hard`-biased mix in practice until curriculum catches up — expected, not a bug.
12. **UX?** Lives indicator (existing) + level number + "Level Complete" on survival, matching the other 8 games' framing despite the different pass mechanic.

---

## Section 7 — Cross-game comparison

| | Level = | Pass condition | Difficulty driver | Content-window cap | Challenge-bar dimension | Replay |
|---|---|---|---|---|---|---|
| Word Scramble / Vocab Quiz / Word Match / Speed Challenge / Word Builder / Listening Challenge | 1 round (existing size) | ≥70% correct | Level → length-cap/distractor band | Unlocked-lesson vocabulary | Pass % / distractor closeness / (Speed Challenge) time | Always allowed, no side effects |
| Sentence Scramble / Word Detective | 1 round (existing size) | ≥70% correct | Level → tier (very_easy…very_hard) | `min_lesson_number` | Pass % (asymptotic past L100) | Always allowed, no side effects |
| Grammar Battle | 1 lives-based round | Survive round (no life loss) | Level → tier mix bias | `min_lesson_number` per item | Lives budget (past L100) | Always allowed, no side effects |

### What's shared across all 9
- One round = one level (no new "unit of work" concept invented).
- `current_level` / `best_level_reached` persistence shape.
- Two-dimension difficulty (content-window capped by curriculum; challenge-bar uncapped, level-driven).
- No lockouts, ever — failure is never punitive beyond "try again."
- Replay of completed levels never affects `current_level`, `best_level_reached`, or existing personal-best/ranking mechanics.
- No hard ceiling at Level 100.
- Content-window computed live at round-fetch time (never snapshotted), so curriculum unlocks and future content additions apply automatically with zero migration.

### What genuinely differs
- **Pass condition**: accuracy-percentage (8 games) vs. lives-survival (Grammar Battle) — a real mechanical difference, not cosmetic.
- **Difficulty vocabulary**: discrete tiers (Family C) vs. continuous length-cap/distractor bands (Family V) — because their underlying content models differ (100-item curated bank vs. 938-word pool with no tier metadata).
- **Round shape**: fixed-length (8 games) vs. variable-length/early-exit (Grammar Battle).

---

## Section 8 — Edge-case stress test

1. **Tie** (two students, same score): unaffected — the existing score-ranking `rank()`/tie convention is untouched by this spec. If a level-reached leaderboard is added later (see Q9 recommendation), it should use the identical `rank()` + earliest-reached-at tiebreak convention already established.
2. **Perfect score, repeatedly**: passes trivially every time; `current_level` advances normally; replaying a passed level for a better personal-best score remains possible indefinitely; at Level 100+, perfect scores keep advancing the level number (no ceiling) even though content may repeat.
3. **Repeated failure at one level**: `current_level` never advances past it; unlimited retries; the student can still freely replay any lower already-passed level; no record or ranking damage; no game-over/dead-end state.
4. **Lesson unlock increases mid-progression**: since content-window is computed live (not snapshotted per level), the very next round fetched at any level automatically gains access to the newly-unlocked content — no backfill, no re-sync, no special-casing needed.
5. **Student promotion between academy levels/groups**: game-level progression (`current_level`, `best_level_reached`) is explicitly independent of academy level/group and is untouched by promotion. **Important distinction, stated explicitly so it isn't conflated with the new game-level column**: this does *not* resolve the separate, already-flagged (ranking-audit) gap that `game_sessions` has no *academy*-level snapshot at play time, which affects the *existing score ranking's* level/group scoping. That is a different "level" (academy level, A/A1/B/C) from the one this spec introduces (game level, 1–100+). Both remain open, distinct items — do not fix either silently.
6. **Insufficient content at a given level**: resolved by design (two-dimension model) — never a dead end, content-window plateaus, challenge-bar keeps climbing, repetition is expected and non-hidden once curriculum is the limiting factor.
7. **Student attempts to skip ahead / manipulate frontend state**: **must be enforced server-side, not implemented in this session.** Flagged explicitly for the implementation phase: `get_*_round()` (or a new level-aware wrapper) must validate any requested level against the student's persisted `current_level` — never trust a client-supplied level number to serve content beyond what's been earned. Replaying an already-passed lower level must be a distinct, explicitly-allowed server-side operation, not "any level the client asks for."
8. **Multiple devices**: automatically correct by construction — progression lives server-side (new table, RLS-scoped, `SECURITY DEFINER` RPC access like every other game table), never in `localStorage` as the source of truth. Implementation note for later: the frontend must always re-fetch current level from the server on load, never trust a locally cached value as authoritative.
9. **Interrupted session (browser closed mid-round)**: no change from today's existing behavior — a round is only recorded once `submit_game_round()` succeeds; an abandoned round's `game_rounds` token (from the existing `0141` replay-protection table) simply goes unconsumed and expires unused. The student resumes by starting that level fresh next time; no partial-level state to persist or resume, by design (matches "one round = one level" — there is no partial level, only complete or not-yet-attempted).
10. **Future content expansion**: because content-window is computed live from `game_content_bank`/`lesson_vocabulary` at round-fetch time rather than pre-generated per level, adding new items to any tier/lesson immediately becomes available to every level drawing from that band — zero migration, zero effect on any student's existing `current_level`/`best_level_reached`.

---

## Section 14 — Recommended Level Progression Architecture

**One Level = one existing Round**, gated by a persistent per-`(student, game_type)` `current_level`/`best_level_reached` state, with difficulty driven by two independently-capped dimensions: a curriculum-safe **content-window** (unchanged from today's gating) and an uncapped, level-driven **challenge-bar**.

**Why this fits the existing architecture:** it reuses every existing content-selection query, every existing tier/curriculum-gating rule, and the entire existing `submit_game_round()`/grading/replay-protection pipeline completely unchanged. The only new concept is "which level is this round for, and did completing it earn the next one" — everything else the games already do stays exactly as it is.

**Why it solves "8 questions → Replay":** the round the student just played was always going to end at ~8 questions — that was never the problem. The problem was that finishing it led nowhere. This spec makes finishing it lead to Level N+1, permanently, without changing the round itself.

**Why it scales to 100+ without 900 hand-authored levels:** levels are a formula (level number → tier/band + curriculum filter), evaluated live against the existing content pools, not a stored per-level content list. Levels 101+ need no new content at all — they extend the top band's challenge-bar.

**Why it works across all 9 games despite their real differences:** the shared skeleton (round=level, two-dimension difficulty, live content-window, no lockouts, replay-safe) accommodates Grammar Battle's lives-based pass condition and Family C's discrete tiers vs. Family V's continuous bands without forcing either into an ill-fitting shape.

**What must stay shared:** the persistence shape, the two-dimension difficulty principle, the no-lockout/replay-safe rules, live (never snapshotted) content-window computation.
**What must stay game-specific:** exact pass condition (accuracy % vs. lives-survival), exact difficulty-band cutoffs, exact challenge-bar mechanics (time/accuracy/distractor/lives, per game).

**Curriculum safety preserved:** content-window is the *same query* every game already uses (`student_unlocked_lesson_number()` / `min_lesson_number` / `student_available_vocabulary()`), never weakened, never bypassed — the challenge-bar dimension exists specifically so no level ever needs to reach past it.

**Existing rankings preserved (with one explicitly flagged, unresolved conflict):** `submit_game_round`, `game_sessions`, and `get_game_best_records()` are untouched by this design. The one real tension — flat scoring doesn't reward difficulty, so raw score no longer cleanly represents "how far has this student progressed" once levels exist — is named explicitly below rather than silently patched, because fixing it would mean touching the already-verified ranking RPC, which is out of scope this session.

**Why it avoids unnecessary complexity:** no new content-authoring burden (reuses the 100-item banks and 938-word pool exactly as they are), no per-level database rows to hand-write, no change to grading, no change to ranking, one new small persistence table plus one new nullable column.

---

## Decisions Requiring Dave's Approval

Nothing below has been implemented or silently decided. Implementation does not begin until these are resolved:

1. **Pass threshold**: is ≥70% correct the right uniform bar for the 8 accuracy-based games, or should it vary by game/level?
2. **Family C / Grammar Battle tier-band cutoffs**: approve or adjust the proposed 1–20/21–40/41–65/66–85/86–100 mapping to the existing 5 tiers.
3. **Family V length-cap/distractor bands**: approve or adjust the proposed 4-band structure (currently illustrative, not tied to real data thresholds the way Family C's tier sizes are).
4. **Retiring `adaptive_difficulty_tier()` as the difficulty driver** in favor of explicit level-driven difficulty for the 3 grounded games + Grammar Battle. This changes already-shipped, already-verified behavior (the personal accuracy-adaptive ramp) — needs an explicit yes, not an assumption.
5. **The ranking conflict (Q9)**: flat per-correct scoring doesn't reward difficulty/level. Recommended resolution is additive (new "highest level reached" view, existing score-based Top 5/rank untouched) — needs approval on whether that's the right fix, and whether it's this-session-adjacent or a fully separate future task.
6. **Level 101+ challenge-bar mechanics**: approve the "asymptotic pass-threshold increase" / "shrinking lives budget" idea, or specify an alternative.
7. **Persistence shape**: one new table (`current_level`, `best_level_reached` per student/game) plus one new nullable `level` column on `game_sessions` — confirm this is the right minimal shape before it's built.
8. **Server-side enforcement of level access (edge case 7)**: confirm this is required before any frontend work begins (recommended: yes, non-negotiable, but stated here for explicit sign-off since it's new authorization surface).
9. **UX**: approve the "Level N of 100+", pass/fail messaging, and per-level tier label (Family C only) framing, or redirect it.
10. **Academy-level snapshot gap (edge case 5)**: confirm this stays explicitly out of scope for the *next* implementation session too, rather than being bundled in "since we're touching levels anyway."

**This document ends the design-only session. No migrations, RPCs, or frontend code were written.**
