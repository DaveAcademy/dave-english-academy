# Gaming System Audit & Roadmap (2026-08-15)

**Status: AUDIT / ROADMAP DOCUMENT ONLY — not an implementation spec.**
No code, migrations, or database state were modified while producing this document.

Branch at time of audit: `release/dashboard-redesign` (clean except one pre-existing untracked file, `docs/ranking-v2-class-session-design.md`).

## 1. Current architecture

The "Gaming System" ("Game Center") is fully built and shipped, not just architected. It postdates the Word Scramble design note in memory — that architecture (server-side grading via RPC) was followed through and extended to three more games.

- Hub: `/games` → [GameCenter.jsx](src/pages/portal/GameCenter.jsx), nav entry in [PortalNav.jsx:33](src/components/PortalNav.jsx#L33)
- 4 games, each its own route/page:
  - Word Scramble — `/word-scramble` — [WordScramble.jsx](src/pages/portal/WordScramble.jsx)
  - Vocabulary Quiz — `/vocabulary-quiz` — [VocabularyQuiz.jsx](src/pages/portal/VocabularyQuiz.jsx)
  - Word Match — `/word-match` — [WordMatch.jsx](src/pages/portal/WordMatch.jsx)
  - Speed Challenge — `/speed-challenge` — [SpeedChallenge.jsx](src/pages/portal/SpeedChallenge.jsx)
- Routes registered [App.jsx:121-125](src/App.jsx#L121-L125)
- Frontend↔RPC glue: [storageBridge.js:1140-1219](src/lib/storageBridge.js#L1140-L1219)
- Migrations: `0111`–`0115`, `0118`–`0119` (complete set; `0120` is unrelated dictionary content)

Tables:
- `game_sessions` (0111): id, student_id (FK, cascade), game_type, score, words_correct, words_total, played_at. Indexed on `(student_id, played_at desc)`.
- `game_word_history` (0112): PK `(student_id, vocabulary_id)`, times_seen, times_correct, last_seen_at — plain exposure counter, no spaced-repetition scheduling.

RPCs (all SECURITY DEFINER):
- Word selection: `student_available_vocabulary()` → `pick_game_words()` → per-game `get_word_scramble_round`, `get_vocabulary_quiz_round`, `get_word_match_round`, `get_speed_challenge_round`
- Grading: single shared `submit_game_round(p_game_type, p_answers)` — re-validates every answer server-side against `lesson_vocabulary`, computes score, writes `game_sessions`, bumps `game_word_history`, calls `bump_student_metric()` then `evaluate_achievements()`.

## 2. Existing games/features

| Game | Mechanic | Skill practiced |
|---|---|---|
| Word Scramble | Unscramble letters into vocabulary word | spelling, recall |
| Vocabulary Quiz | Multiple choice EN↔UZ | recall, meaning recognition |
| Word Match | Match pairs (word ↔ translation) | recall, meaning recognition |
| Speed Challenge | Timed quiz, bonus for speed | recall + fluency/speed |

All four pull from the student's own lesson-scoped vocabulary via `student_available_vocabulary()`, so content is curriculum-aligned by construction, not hand-authored game content.

No grammar, listening, speaking, or reading comprehension games exist. Everything is vocabulary-recall in different UI shells.

## 3. Data flow

```
student → GameCenter.jsx → get_*_round() RPC → server picks words (student_available_vocabulary/pick_game_words)
        → student answers in-browser (state only, no persistence)
        → submit_game_round(game_type, answers) RPC
              re-validates every answer server-side
              writes game_sessions (score, words_correct/total)
              upserts game_word_history
              bump_student_metric(metric_key, words_correct)
              evaluate_achievements(student_id)
        → NO direct write to point_transactions or students.points
```

Points/ranking are not touched directly by games at all — see §6.

## 4. Security / abuse findings

| Severity | Finding | Evidence |
|---|---|---|
| **P1** | No replay/duplicate-submission protection. `submit_game_round` can be called repeatedly with no cooldown, attempt cap, or idempotency token — grading is honest per call, but nothing stops spamming rounds to inflate `game_sessions` history and repeatedly bump `game_word_history` / trigger `evaluate_achievements`. | No unique constraint, no rate limit found in 0111-0119 |
| **P2** | Teacher SELECT policies on `game_sessions`/`game_word_history` are unscoped by level/group (`is_teacher()` only) — consistent with the already-documented teacher-authorization gap (see prior audit memory), not a new issue. | migration 0111/0112 policy blocks |
| **P3** | `VocabularyQuiz.jsx` doesn't `useCallback` its handlers unlike the other 3 games — stylistic inconsistency, not a perf bug. | — |

No P0s. Scoring is fully server-validated (SECURITY DEFINER RPC re-checks every answer against `lesson_vocabulary`); there is no student INSERT policy on `game_sessions`, so a direct client `.insert()` with a forged score is rejected by RLS — the only write path is the RPC. Speed Challenge's client-supplied `elapsed_ms` is clamped server-side to [0,10000] and worth at most a small bonus on an already-verified-correct answer, so it isn't an exploitable score vector.

Points are **not** directly reachable from games at all (no game code touches `point_transactions`/`students.points`), which is the strongest possible mitigation against "students awarding themselves points" — but see §6, this also means the achievement bridge is currently a dead end.

## 5. Educational-value assessment

| Game | Verdict | Why |
|---|---|---|
| Word Scramble | **Keep** | Genuine spelling/recall retrieval practice, curriculum-scoped words |
| Vocabulary Quiz | **Keep** | Fast recognition practice, low friction |
| Word Match | **Improve** | Recognition-only, weakest retrieval demand of the four (matching is easier than recall) — fine as an easy-mode entry point but shouldn't be the main loop |
| Speed Challenge | **Keep** | Adds fluency/speed dimension on top of quiz mechanics, meaningfully different from Vocabulary Quiz |

All four are exclusively vocabulary-recall — there is no grammar, spelling-in-context, listening, speaking, or reading game. That's the biggest educational gap, not any single game's quality. None currently show visible difficulty progression across sessions (word selection doesn't appear to weight by `times_correct`/mastery in what was inspected) — `game_word_history` tracks exposure but nothing found wires it into harder/easier future rounds.

## 6. Gamification architecture

- Games write `game_sessions` + `game_word_history`, then call `bump_student_metric()` and `evaluate_achievements()`.
- **No achievement in the codebase currently keys off the four game metric names** (`game_words_scrambled_correct`, `game_vocabulary_quiz_correct`, `game_word_match_correct`, `game_speed_challenge_correct`) — the bump/evaluate wiring exists but appears to be a dead end today. Not verified against live DB rows, only migration/code search.
- Games never write `point_transactions` directly — by design, and correctly so per the standing "no direct points writes" rule.
- **Correct integration point**, if/when games should award points: define achievement rule rows keyed to the existing metric names, let `evaluate_achievements()` grant achievement-linked points through the existing achievement→points path. This requires no changes to Ranking V2 or to game code — only new achievement rule configuration (and P1 replay protection should land first, since achievements would otherwise be farmable, per §4).

## 7. Mobile / UX findings (static code review only — no live browser test performed)

- All four game screens use fluid Tailwind widths (`max-w-sm`, `sm:` breakpoints), no fixed pixel container widths found.
- Tap targets: quiz/speed-challenge options ≥52px, Word Match tiles ≥48px — both above the ~44px guideline.
- `WordScramble.jsx` letter tiles are fixed 48-56px boxes but wrap via `flex-wrap`, so long words shouldn't overflow horizontally.
- No unguarded `overflow-x` risk spotted in any of the four components.
- Caveat: this is code review, not verification at 320/375/390px in an actual browser/device.

## 8. Performance findings

- One RPC call to fetch a round, one RPC call to submit it — no per-question round trips.
- `GameCenter.jsx` fetches best-scores for all 4 games in parallel (`Promise.all`), not sequentially.
- Payloads are small (6-10 words/round).
- No refresh/interrupt handling: all round state is React component state only, nothing in `localStorage`/`sessionStorage` — a refresh mid-round silently loses progress (not a performance issue, but a UX gap worth noting here since it's state-management related).

## 9. Prioritized roadmap

**P0 — none found.** No blocking security/correctness issue exists today.

**P1 — should land before expanding the system**
1. **Replay/duplicate-submission protection on `submit_game_round`.**
   Problem: unlimited repeat calls inflate `game_sessions` and `game_word_history`, and would let achievements (once wired) be farmed.
   Affected: `submit_game_round` RPC (new migration), possibly a per-round nonce or a simple per-student-per-game cooldown window.
   DB impact: new migration, no destructive changes.
   Risk: low (additive).
   Complexity: **Low–Medium**.
   Dependency: should land *before* any achievement is wired to game metrics (item below), otherwise farming becomes a real incentive problem the moment points are on the line.

2. **Wire at least one achievement to the existing `bump_student_metric` game keys**, closing the dead-end noted in §6, so games actually connect to the Academy's gamification loop as originally intended.
   Depends on: replay protection (P1-1) landing first.
   Complexity: **Low** (config/data, not new architecture — achievement rule rows already have a mechanism via `evaluate_achievements`).

**P2 — after the core is solid**
3. Add difficulty progression: use `game_word_history.times_correct` to bias future round selection toward weaker words (mastery-aware selection) instead of flat random picks.
   Affected: `pick_game_words()` / `student_available_vocabulary()`.
   Complexity: **Medium**.
4. Add a lightweight admin surface for Game Center: at minimum a read-only view of `game_sessions` (currently only reachable via raw table access with no UI), since teacher-facing "reviewing suspicious scores" has literally nothing to look at today.
   Complexity: **Medium**.
5. Preserve in-progress round state (sessionStorage) so a refresh mid-round doesn't lose progress.
   Complexity: **Low**.

**P3 — polish / optional**
6. Add a grammar or listening game to diversify beyond pure vocabulary recall (biggest educational gap identified in §5) — this is a net-new game, scope it separately once the above are stable.
   Complexity: **High** (new game type end-to-end).
7. Standardize `VocabularyQuiz.jsx` handlers with `useCallback` to match the other three games (cosmetic consistency only).
   Complexity: **Low**.

## 10. Recommended next implementation task

**Build replay/duplicate-submission protection on `submit_game_round` (P1-1).**

This is the single highest-leverage next task because:
- **Security/correctness**: it's the one real gap found in an otherwise well-built server-authoritative system — closing it now is cheap; closing it after achievements/points are wired in is not.
- **Architectural stability**: it touches only the game RPC layer, zero interaction with Ranking V2 or Student Portal design work — fully isolated, safe to ship independently.
- **Future extensibility**: every other roadmap item (achievement wiring, difficulty progression, admin view) becomes safer once this exists, since farming is the shared risk underneath all of them.
- **Development effort**: Low–Medium — a single migration adding a cooldown or per-round idempotency check to an existing function, no schema redesign, no frontend changes required.
- **Educational value**: indirect but real — an ungated points/achievement path around a farmable metric would undermine the credibility of the whole rewards system once wired up.

This is a recommendation only — no implementation was started in this session per the stated boundaries.
