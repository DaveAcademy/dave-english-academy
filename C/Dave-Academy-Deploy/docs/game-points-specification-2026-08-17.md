# Game Points Specification (APPROVED — awaiting implementation session)

Status: **all §18 business decisions approved by Dave, 2026-08-17. Still nothing implemented** — no migration, RPC, or frontend change has been made. This document is now the locked reference for the implementation session; do not re-litigate the decisions in §18 without a new explicit reason.

## 1. Purpose

Give students an automatic, gaming-performance-based points currency ("Game Points") that reflects how well/how much they play the 9 games — separate from Class Points (manual, Dave-controlled, classroom/lesson-based). Game Points is the third leg of the gaming system, alongside the existing per-round Score and the existing Score-based Ranking.

## 2. Current architecture (confirmed-current, from `0147`-`0151` and `GAMING-SYSTEM.md`/`RANKING-SYSTEM.md`)

- `game_sessions(student_id, game_type, score, words_correct, words_total, level, played_at, ...)` — one row per completed round, written only by `submit_game_round()` (`security definer`, no student INSERT policy). This is the sole source of truth for what happened in a round.
- `game_rounds(id, student_id, game_type, level, vocabulary_ids, consumed_at)` — the served round; `consumed_at` prevents replay/double-submission (0141 replay protection).
- `game_level_progress(student_id, game_type, current_level, best_level_reached)` — one row per student+game, server-enforced cursor (0149-0151, verified this pass — see prior session). `current_level` never skips; `best_level_reached` never decreases.
- `get_game_best_records()` (0147, fixed 0148) — per-game personal-best `score`, ranked (`rank()`, tie-aware) **within the student's own academy level cohort** (`students.level` = A/B/C), not globally.
- `is_new_best` — computed inline in `submit_game_round()` as `v_score > coalesce(max(prior score for this game_type), -1)`, returned in the RPC response, not stored as a column.
- `bump_student_metric(student_id, metric_key, count)` — already called at the end of every `submit_game_round()` with a per-game metric key (e.g. `game_grammar_battle_correct`) and the round's `words_correct`. Feeds `student_metric_snapshots`, which the DB-backed achievement engine (`achievement_definitions`/`student_achievements`) reads. **No achievement currently keys off any game metric** — the wiring exists, the consumer side is a dead end today.
- Class Points (`point_transactions`): immutable ledger rows, `student_id, level(A/B/C), category_id, category_key, points, created_at` — never written to by gaming code, and this must stay true.
- No `game_points` table, column, or reference exists anywhere in the repo (confirmed by search, both this pass and the prior docs-consolidation pass).

## 3. Current scoring audit (per-round, from `submit_game_round()` in `0150`)

Two scoring branches exist today, both flat (not level- or difficulty-weighted):

**Branch A — 6 vocabulary-pool games** (`word_scramble`, `vocabulary_quiz`, `word_match`, `speed_challenge`, `word_builder`, `listening_challenge`):
- Per correct answer: 10 points, or 5 if a hint was used.
- Speed Challenge additionally adds `round(5 * (1 - elapsed_ms/10000))` (0-5 bonus, elapsed_ms clamped server-side to [0,10000] — not client-exploitable beyond the bonus itself).
- Pass condition: ≥70% correct.

**Branch B — 3 content-bank games** (`sentence_scramble`, `word_detective`, `grammar_battle`):
- Per correct answer: flat 10 points, no hint mechanic.
- `grammar_battle` is lives-based (3 lives, 8s/question timer): pass condition is "reached the end of the server-minted round" rather than 70% accuracy; score is still 10/correct, so a lives-based near-perfect run scores similarly to an accuracy-based one, but a Grammar Battle round can end early (fewer questions attempted) on a life-loss, capping the ceiling score. `words_total` in `game_sessions` reflects however many questions were actually attempted before ending, not the round's full designed size — this matters for point-per-attempt comparisons.
- Sentence Scramble/Word Detective: standard ≥70% accuracy pass.

**Universal facts across all 9 games:**
- Score is never client-trusted — every answer is server-re-validated against `game_content_bank`/`student_available_vocabulary()` inside the RPC.
- Round size is level-driven (`game_level_to_tier`/`game_level_to_length_cap`, 0149) but **not point-value-driven** — a Level 1 round and a Level 90 round pay the same 10 points per correct answer today. This is the documented "ranking-conflict" known issue in `GAMING-SYSTEM.md` §7/§11.
- Failure never writes negative score, never advances level, never blocks retry (no lockout, no cooldown).
- Replay protection (0141) prevents re-submitting the same `game_rounds` row, but a student can request unlimited new rounds at their current level — nothing currently limits repeat play at an already-passed level.

## 4. Nine-game comparison

| Game | Items/round (level-driven) | Correct-answer def. | Failure def. | Speed measurable? | Streak? | Lives? | Score comparable across games? |
|---|---|---|---|---|---|---|---|
| Word Scramble | length-capped pool, ~8+ | exact spelling match | <70% accuracy | no | no | no | yes (10/correct, ±hint) |
| Vocabulary Quiz | same | Uzbek translation match | <70% | no | no | no | yes |
| Word Match | same | Uzbek translation match | <70% | no | no | no | yes |
| Speed Challenge | same | Uzbek translation match | <70% | **yes** (elapsed_ms bonus) | no | no | no — has a bonus the others don't |
| Word Builder | same | exact spelling match | <70% | no | no | no | yes |
| Listening Challenge | same | Uzbek translation match (audio) | <70% | no | no | no | yes |
| Sentence Scramble | tier-sized (20-25/tier) | exact word-order match | <70% | no | no | no | yes (10/correct) |
| Word Detective | tier-sized | wrong-word index + correction match | <70% | no | no | no | yes |
| Grammar Battle | tier-sized (up to 21 at L1) | MCQ correct option | **3 lives exhausted** | implicit (8s/question timer forces speed) | UI shows "best streak" (client-side display only, not a scored field) | **yes (3)** | partially — same 10/correct, but round can truncate early, and the timer creates an implicit speed requirement the other 8 games don't have |

**Farming risk:** every game can be replayed at the *same* level indefinitely (once passed, a new round at the next level is served, but nothing stops replaying to accumulate more `game_sessions` rows / more raw score at a level already passed). This is the central anti-farming problem Game Points design must solve — Score/ranking already tolerates this because ranking only cares about `max(score)` per game, not accumulation. **Any Game Points formula that sums per-round output verbatim inherits an unlimited farming vector unless explicitly constrained (§8).**

## 5. Game Points definition (proposed)

Game Points = a persistent, lifetime, automatically-accumulating measure of **genuine gaming progress and skill**, distinct from:
- **Game Score** — the raw per-round number already stored in `game_sessions.score`. Ephemeral, per-round, already exists, unchanged by this spec.
- **Game Ranking** — the existing `max(score)`-based, academy-level-cohort-scoped leaderboard (`get_game_best_records()`). Unchanged by this spec.

Game Points sits above both: it is not a leaderboard input (that stays score-based, per Dave's explicit "do not redesign the ranking system" instruction) and it is not a per-round number (that stays as Score). It answers "how much real progress has this student made across all gaming, over time" — closer in spirit to `best_level_reached` than to `score`.

## 6. Recommended scoring formula (proposed, needs approval)

**Core principle: reward progress events, not raw per-answer volume.** This directly defuses the farming problem in §4/§8 by construction, rather than needing a bolt-on anti-farming filter.

Proposed formula, awarded once per **qualifying event**, not accumulated per answer:

```
Game Points awarded on a submit_game_round() call, IF AND ONLY IF it results in leveled_up = true
  (i.e. this was a genuine, first-time pass of the student's current level for this game)

  base_points = 10 (flat, independent of game — see §7 for why NOT per-answer)
  + level_tier_bonus:  tier('very_easy')=0, 'easy'=2, 'medium'=5, 'hard'=8, 'very_hard'=12
      (reuses game_level_to_tier() for Family C games directly;
       for the 6 vocabulary-pool games, derive an equivalent tier from
       game_level_to_length_cap() — cap=6 -> 'easy'-equivalent, cap=9 ->
       'medium'-equivalent, uncapped -> 'hard'-equivalent, since those
       games don't have a 5-tier structure today)
  + perfect_bonus: +5 if words_correct = words_total (this round, this level)
```

No points for: failed rounds, replays of an already-passed level (`level < current_level` at submit time), or any per-answer accumulation. This means Game Points only grows when `best_level_reached` grows — i.e., Game Points and `best_level_reached` are **monotonically linked**, which is deliberately the simplest possible anti-farming property: a student cannot increase Game Points without also increasing genuine progression, and genuine progression is already server-enforced (0149-0151) to be non-skippable and curriculum-safe.

**Why flat 10 base + tier bonus, not fully proportional to level number:** a purely `level * k` formula would make Level 100 worth 100x Level 1, which over-rewards students who are simply further along a fixed curriculum track (which is capped by curriculum unlock, not skill) versus students who play more games well. The tier bonus (5 bands) rewards genuine difficulty increase without an unbounded multiplier. **This weighting is a judgment call and should be flagged for approval, not treated as settled** (see §18).

## 7. Difficulty/level treatment

- Tier bonus (above) is the only difficulty signal, deliberately coarse (5 bands) rather than continuous, to avoid over-fitting Game Points to the exact tier-cutoff numbers in `0149`, which `GAMING-SYSTEM.md` already flags as "illustrative, not finalized" for the Family V games.
- Level number itself is **not** used directly in the formula (only the tier it maps to) — this avoids Game Points inheriting the same "flat scoring doesn't reward difficulty" critique currently open against `game_sessions.score`, while still not creating an unbounded per-level multiplier.
- Level 100+ (no content ceiling per design) reuses the top tier band (`very_hard` / cap-uncapped) indefinitely — Game Points formula is stable there by construction (§14 covers this explicitly).

## 8. Failure/replay rules

- Failed round (`pass = false`): **0 Game Points**, always. Matches existing "failure never advances anything" principle already established for Level Progression.
- Replaying an **already-passed** level (`p_round.level < current_level` at submit time — possible today since nothing stops requesting a lower-level round... **actually, confirm this against `0150`**: the round-generators always serve `current_level`, never a lower one, so a "replay an old level" round cannot currently be requested through the normal flow. The only way to accumulate multiple sessions at the same level is repeatedly failing/passing at the *current* level before it advances, or re-attempting after already advancing generates a round at the *new* current_level, not the old one.) — **this changes the anti-farming analysis**: farming is actually already constrained by the existing level-progression enforcement, because a student cannot request the same level twice after passing it. The realistic farming vector is narrower than initially assumed: repeatedly attempting (and failing or passing) the *current* level. Since only `leveled_up = true` awards points (§6), repeated failed attempts at the current level award 0 every time, and once it's passed, the next round is a *new* level — so there is no way to re-earn points for a level already banked. **This is a strong structural anti-farming property, not a policy that needs separate enforcement code.**
- Improving a personal-record score on an *already-passed* level: **0 Game Points** under this proposal (no `leveled_up` event) — flagged as an explicit open question in §18, since some product intuition says score improvement should count for something.

## 9. Personal-record rules

- `is_new_best` (existing, `submit_game_round()` return value) is **not** wired into Game Points under this proposal — a new best score on a replayed round does not, by itself, indicate new progress (student could be re-playing an easy already-passed level with a lucky fast run). Flagged for approval in §18: if Dave wants personal-record improvement to count, it needs its own small bonus, separately gated against the same farming concern (e.g., only the first `is_new_best` per level, ever).

## 10. Ranking relationship

Game Points is explicitly **not** a ranking input. `get_game_best_records()` stays score-based and per-game, unchanged. A student with high Game Points (broad progress across many games) and a student with a high single-game score (deep mastery of one game) are answering different questions, and conflating them would violate Dave's "do not redesign the ranking system" instruction. If a future "Game Points leaderboard" is wanted, it is a **separate, additive** ranking view — not a change to `get_game_best_records()`.

## 11. Badge relationship

- Per project intent, badges *may* contribute to Game Points (not the reverse, and never to Class Points).
- Recommended: a badge contributes a flat, badge-specific point value, awarded exactly once, at the moment `student_achievements` gets a new row for that student+badge (the existing DB-backed achievement engine already has an insert-once model — reuse it rather than building new dedup logic).
- **This is currently moot in practice**: `GAMING-SYSTEM.md` confirms no achievement currently keys off any game metric (the achievement→points bridge is paused, and no achievement definition references `game_*_correct` metrics). Wiring badge→Game Points today would have zero live effect until the separately-tracked badge/achievement reconciliation work (already on the roadmap, §5 of `PROJECT-STATUS.md`) happens. **Recommend deferring badge integration to that future session rather than half-building it here.**

## 12. Anti-farming rules

Summarized from §6/§8: the "only `leveled_up=true` events earn points" rule is the entire anti-farming mechanism, and it is structurally sound because:
1. A round can only be requested at the student's exact `current_level` (server-enforced, 0150, code-audited).
2. Passing advances `current_level` by exactly 1 (never more), so each level can be "banked" for points exactly once.
3. Failing awards 0 and doesn't change `current_level`, so repeated failure attempts can be repeated forever with zero Game Points gained each time — not farmable, just wasted effort with no payoff.

No additional cooldown, rate-limit, or per-day cap is proposed, because the mechanism above already makes the theoretical maximum Game Points a student can ever have (at a given point in time) equal to a deterministic function of `best_level_reached` across all 9 games — there is no repeatable-forever loop to rate-limit.

## 13. Lifetime/monthly model

Recommend **lifetime-only** Game Points for v1, no monthly reset/decay:
- The monotonic link to `best_level_reached` (which itself never decreases) makes a "reset" semantically strange — it would reset a number tied to permanent progress.
- A monthly *gaming activity* ranking (distinct from lifetime Game Points, e.g. "most levels passed this month") is a reasonable future additive feature, but is a **separate, new concept** from lifetime Game Points, not a variant of it. Flagged as future scope, not part of this specification.

## 14. Edge-case results (formula stress-test)

| Case | Result under proposed formula |
|---|---|
| Perfect score, first pass of a level | base(10) + tier_bonus + perfect_bonus(5) |
| Zero score (fail) | 0 |
| Failed level, retried, then passed | 0 on fails, full award on the one passing attempt |
| Repeated successful attempts at same level | Impossible — level already advanced after first pass, next round is a new level |
| Replaying an old (already-passed) level | Impossible via normal flow — round-generator only ever serves `current_level` |
| Improving a personal record on an old level | 0 (no `leveled_up` event) — flagged §9/§18 |
| Tying another student (score) | No effect — Game Points doesn't read rank |
| Overtaking another student (score) | No effect — same reason |
| Extremely fast completion (Speed Challenge) | No speed-based Game Points bonus proposed (speed already rewarded in Score; double-rewarding it in Game Points would make Speed Challenge disproportionately farmable relative to the other 8 games) |
| Extremely slow completion | No penalty (matches existing Score behavior for all games except Speed Challenge) |
| Level 1 | base + tier_bonus(0, very_easy) + perfect_bonus if applicable = 10-15 |
| Level 50 | mid-tier bonus (likely 'medium' or 'hard' depending on game family) |
| Level 100 | top-tier bonus (12), same as Level 101+ |
| Level 101+ | identical award to Level 100 — formula is stable indefinitely, no special-casing needed |
| Different round sizes across games | Irrelevant to the formula — award is per-level-passed, not per-question |
| Grammar Battle losing lives (partial round, then fail) | 0, same as any other failed round |
| Grammar Battle passing (survives to round end) | Full award, same shape as accuracy-based games |
| Badge unlocked | +badge's flat value, once (§11) — deferred, not built this session |
| Badge already unlocked | 0 additional (insert-once on `student_achievements` already prevents duplicate rows) |
| Academy-level promotion (A→B) | No effect — confirmed structurally decoupled (no `students.level` reference in Level Progression code, and Game Points formula never reads it either) |
| Newly unlocked curriculum content | No direct effect on Game Points; indirectly, a wider curriculum window may let a student's *content-window* catch up to their *level number* on the 3 content-bank games (per the existing "insufficient content" design, `GAMING-SYSTEM.md` §8) — no special handling needed, existing gating already covers it |

No exploitable vector was found under this formula given the constraints already enforced by the existing Level Progression system (0149-0151).

## 15. Recommended architecture

- **No new RPC needed for computation** — the natural point is inside `submit_game_round()`, immediately after the existing `leveled_up` determination (0150, ~line 888 area), since all needed inputs (`p_game_type`, `v_round_level`, tier, `words_correct = words_total`) are already in scope there.
- **New table needed**: a small immutable ledger, e.g. `game_points_transactions(id, student_id, game_type, level, points, reason, created_at)` — deliberately mirroring the existing `point_transactions` immutable-row pattern (§2) rather than inventing a new pattern, but **a physically separate table**, never touching `point_transactions` (hard requirement, restated from the project's standing "no direct Class Points writes" rule).
- A `students.game_points_total` denormalized column (or a `game_points_balances` summary table) is optional — recommend **deriving the total from the ledger via a read RPC** (`get_student_game_points()`) rather than maintaining a mutable running total, to avoid a second source of truth that can drift, consistent with how `point_transactions`/Class Points already work.
- Badge integration (§11): if/when built, a badge award would insert a `game_points_transactions` row with `reason = 'badge:<badge_key>'`, gated by the existing `student_achievements` insert-once constraint — no new dedup mechanism needed.
- **No frontend or ranking changes are implied by this architecture** — Game Points would be a new, additive read surface (e.g. a number on the student's profile/portal), not a replacement for anything currently displayed.

### 15a. Why a separate ledger, not `point_transactions` reuse (justification, not assumed)

Dave flagged this as something to actually argue, not wave through. Answering each point directly:

- **Why can't the existing `point_transactions` pattern be reused safely?** It can't be *reused as the same table* — `point_transactions.level` is a `check (level in ('A','B','C'))` constraint on **academy level**, and the whole table is protected by the project's standing rule "never write to `point_transactions`/rankings directly, Dave manages all point changes personally" (`dave-academy-no-points-writes-rule`, restated in `PROJECT-HANDOFF.md` §4.1). Writing Game Points into that table would be a direct violation of that rule and would silently blend an automatic feed into a manually-curated ledger Dave audits by hand. The *pattern* (immutable append-only rows, a category/reason column, derive totals by summing) is worth reusing — the *table* is not, by explicit standing constraint, independent of any architecture-quality argument.
- **Do we actually need a separate ledger, or could this be columns on `game_sessions`?** A ledger is preferable to adding a `points_awarded` column to `game_sessions` because `game_sessions` already has a row per *round* (including failed/replayed rounds that award 0), which conflates "every game session" with "every points-earning event" — a ledger where a row only exists *when points are actually awarded* is a cleaner audit trail (every row = one real reward, no need to filter `where points_awarded > 0` everywhere downstream) and matches how `point_transactions` itself works (a row per award, not a row per possible-award-opportunity).
- **How will duplicate level-completion rewards be prevented?** By the same mechanism that already prevents duplicate level advancement: `submit_game_round()` only sets `leveled_up = true` once per level (the round-generator can't re-serve an already-passed level — code-audited, prior session). If the Game Points insert happens in the *same transaction* as the level-advance write (both inside `submit_game_round()`, one PL/pgSQL function, one implicit transaction), a level can physically not advance twice, so a Game Points row for that level can physically not be inserted twice. This is a database-transactional guarantee, not an application-level check that could be bypassed by a retry.
- **What happens if a transaction succeeds but the UI fails?** Because the points insert lives inside `submit_game_round()`'s existing transaction (alongside the level-advance and `game_sessions` insert, which already have this exact property today), a UI failure after the RPC call returns cannot cause a partial write — either the whole transaction committed (level advanced AND points awarded together) or none of it did (the client would see the RPC error and could safely retry, since the round is only marked `consumed_at` on success and retrying re-submits the same already-consumed round, which fails cleanly with "round already submitted" — the existing, already-verified behavior). No new failure mode is introduced.
- **Can Game Points be recalculated/audited later?** Yes, by construction: since the ledger is immutable, append-only, and each row is tagged with `student_id, game_type, level, reason, created_at`, a lifetime total is always `sum(points) where student_id = X`, recomputable from scratch at any time (e.g., after a formula change, to distinguish "points under formula v1" vs "v2" if `reason` or a `formula_version` column tags that). This is materially easier to audit than a mutable running-total column, which cannot be verified against history once written.
- **How will lifetime totals and rankings be derived?** Lifetime total: `sum(points)` via a read-only RPC (§15, `get_student_game_points()`), computed on read, not stored — no drift risk. Rankings: explicitly out of scope for Game Points itself (§10) — Game Points is not a ranking input under this proposal, so no ranking-derivation question actually needs answering for v1. If a future "Game Points leaderboard" view is approved, it would be a straightforward `group by student_id, order by sum(points) desc` over the same immutable ledger, additive to what exists.
- **What happens when we eventually add monthly Game Points?** The `created_at` column already present on every ledger row is sufficient to derive a monthly view later (`sum(points) where created_at >= date_trunc('month', now())`) with **zero schema change** — this is the concrete reason the recommendation is an immutable timestamped ledger rather than a mutable lifetime-only counter: the ledger shape already supports a monthly view being added later as a pure read-query change, not a data-migration.

## 16. Risks

- Formula weighting (tier bonus values, perfect bonus) is a genuine product judgment call with no objectively "correct" answer — treat as provisional until Dave approves specific numbers, not just the shape of the formula.
- The "only `leveled_up` events count" rule is a significant behavioral choice (no credit for score improvement, streaks, or speed) — some students/parents may expect points for effort/replay, not just first-time level passes. This is a product-fit risk, not a technical one.
- If badge integration is deferred (recommended, §11), Game Points launches without any badge contribution initially — acceptable but should be stated as a known v1 limitation, not silently implied as "complete."
- Family V (6 vocabulary-pool games) tier-equivalence mapping (§6) is inferred from `game_level_to_length_cap()`'s 3-band structure, not a native 5-band tier system — this is an approximation, not a like-for-like reuse of `game_level_to_tier()`, and should be explicitly reviewed.

## 17. Open decisions

All items previously listed here were resolved in §18 (2026-08-17): point values accepted as proposed, no personal-record bonus, badge integration deferred, monthly view deferred as future/separate scope. One item remains genuinely open, deliberately not blocking approval:

1. Whether Family V games need their own native 5-tier mapping instead of reusing the 3-band length-cap structure as an inferred equivalent (§6/§16) — an implementation-detail question the implementation session can resolve by direct inspection of `game_level_to_length_cap()`, not a business-rule decision requiring Dave's sign-off.

## 18. Explicit approval checklist — DECIDED 2026-08-17

All items below reviewed and approved by Dave, 2026-08-17. Locked for the implementation session; changing any of these later requires a new explicit decision, not a code-time judgment call.

- [x] **Game Point formula**: flat base (10) + tier bonus (0/2/5/8/12) + perfect bonus (5), awarded only on `leveled_up = true`. **Approved as proposed, no numeric changes.**
- [x] **Difficulty weighting**: 5-tier bonus band, reusing `game_level_to_tier()` for Family C and an inferred equivalent for Family V. **Approved.**
- [x] **Level weighting**: tier-based only, not a direct per-level multiplier. **Approved.**
- [x] **Replay rewards**: none — replays of the current level that fail earn 0; already-passed levels cannot be re-requested through normal flow. **Approved, confirms the "reward progression, not clicking" principle Dave stated explicitly.**
- [x] **Personal-record bonus**: **none.** Beating a personal best on an already-passed level earns zero Game Points — keeps the anti-farming property airtight per Dave's explicit preference.
- [x] **Badge rewards**: **deferred.** No badge→Game Points wiring in the implementation session; revisit only when the badge-reconciliation session consolidates the two disconnected badge systems (no live effect today regardless).
- [x] **Ranking rewards**: none — Game Points never feeds `get_game_best_records()` or any ranking RPC. **Approved, consistent with "do not redesign ranking."**
- [x] **Monthly vs. lifetime**: **lifetime-only for v1.** Ledger's `created_at` column supports a monthly view later as a pure read-query addition (§13/§15a) — no schema work now.
- [x] **Anti-farming policy**: structural (via level-progression enforcement, §12), no additional rate-limiting. **Approved.**
- [x] **One formula vs. per-game weighting**: one common formula for all 9 games. **Approved, no per-game special-casing.**
- [x] **Proposed database architecture**: new `game_points_transactions` immutable ledger table (physically separate from `point_transactions`, mirroring its pattern per §15a), computed inline in `submit_game_round()`'s existing transaction, totals derived via a read RPC (`get_student_game_points()`) rather than a mutable balance column. **Approved** — §15a's justification (duplicate-award prevention via same-transaction guarantee, partial-write safety, auditability, monthly-readiness) accepted without further challenge.

**All decisions locked. The implementation session should treat this checklist as final scope — build exactly this, not a reinterpretation of it. No migration, RPC, or frontend work has been done yet; that begins in a dedicated, narrowly-scoped implementation session.**
