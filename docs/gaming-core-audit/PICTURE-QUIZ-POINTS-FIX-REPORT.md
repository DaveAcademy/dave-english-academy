# PICTURE QUIZ POINTS FIX REPORT

Verdict: **PICTURE QUIZ POINTS — FIXED AND VERIFIED**

Date: 2026-09-09
Scope: the production bug where a completed Picture Quiz appeared to award far more academy points than the core game-points rules allow, and where the results screen mislabeled the raw game Score as if it were academy points.

---

## 1. Executive Summary

The reported symptom — "the game displays 100 points, but this is NOT the academy-points reward" — had two parts:

1. **Award logic bug (backend).** `submit_game_round` only inserted a `game_points_transactions` row inside
   the `if v_leveled_up` block, and level-up requires a **full + perfect** round (the `20260920000003`
   advancement gate). A Picture Quiz the student **completed but did not perfect** (e.g. 8/10 = 80%,
   `pass=true`) therefore produced `leveled_up=false` and **zero** academy points. The student still saw a
   big unlabeled `80` — or, on a perfect replayed / already-advanced level, a big unlabeled `100` — read as
   "points."
2. **Display mislabel (frontend).** `PictureQuiz.jsx` rendered `result.score` (0–100) as the large
   hero number with no caption whenever `game_points_awarded === 0`, so the raw game score was presented as
   if it were the academy-points reward.

**Fix (confirmed by Dave, 2026-09-08):** a Picture Quiz **completed pass** (full round submitted, ≥70%
correct) now awards academy points like any other level reward: tier base for `picture_quiz`
(`very_easy` = 5) + 5 if perfect = **5 or 10**, never more. Fail and incomplete rounds award 0. The game
performance score (up to 100) remains a separate number and is now explicitly labeled.

The change is a single guarded `elsif` inside the award block of `submit_game_round`, limited to
`p_game_type = 'picture_quiz'`. The other 9 games are byte-identical to the pre-fix body (verified by
line-level diff). Anti-farming (one banked row per student/game/level via
`uniq_game_points_student_game_level`) is preserved.

---

## 2. Root Cause

- **Award gate was level-up, not completion.** In `submit_game_round` (live body = migration
  `20260920000004`), academy points were inserted only when `v_leveled_up = true`; the level-up gate
  (migration `20260920000003`) requires `v_words_total = v_round_size AND v_words_correct = v_words_total`.
- **Consequence:** any completed-but-imperfect picture_quiz round (70–99%) passed but awarded 0 points.
- **Amplifier:** perfect picture_quiz rounds on an already-advanced level (or replayed) award 0 by design
  (`on conflict ... do nothing` on the unique index) yet still show `score = 100`, which the unlabeled UI
  displayed as a points-like big number.

Live reproduction (student 1, run 0027, inside `BEGIN…ROLLBACK`): partial 8/10 submit →
`pass: true, score: 80, leveled_up: false, game_points_awarded: 0, game_points_total: 10760`.

---

## 3. Fix

### 3.1 Backend — migration `20260920000006_picture_quiz_points_on_completed_pass.sql`

`CREATE OR REPLACE` of the 3-arg `submit_game_round`, built on the exact live body
(source-dumped via `pg_get_functiondef` and diffed equal to migration `20260920000004`). Award block now:

```sql
if v_leveled_up then
    -- unchanged: existing award for all 10 games on full+perfect level-up
    ...
elsif p_game_type = 'picture_quiz'
        and v_round_level is not null
        and v_round_size is not null
        and v_words_total = v_round_size
        and v_pass then
    -- NEW: any completed picture_quiz pass (full round, >=70%) banks the same award
    --  game_tier_bonus(very_easy)=5  (+5 if perfect => max 10)
    insert into public.game_points_transactions (...) on conflict (student_id, game_type, level) do nothing
    returning points into v_points_awarded;
end if;
```

Design points:
- **Completed pass** = full round submitted (`v_words_total = v_round_size`) **and** `v_pass`
  (≥70% correct — the universal pass rule already used by the function).
- **Partial passes award 5**, perfect rounds award **10**; the award value formula is identical to the
  existing level-up award, so nothing new is invented.
- **All other 9 games** (word_scramble, vocabulary_quiz, word_match, speed_challenge, word_builder,
  sentence_scramble, word_detective, grammar_battle, hangman) still award **only** on `leveled_up`,
  byte-identical to before (the `elsif` is guarded by `p_game_type = 'picture_quiz'`).
- **Anti-farming preserved:** the `on conflict (student_id, game_type, level) do nothing` + unique index
  still banks each level once. A later perfect round on an already-banked level does **not** override the
  banked 5 (matches the historical ledger, e.g. prior picture_quiz level rows banked at 5 non-perfect).
- `v_round_level is not null` guard added so a NULL level can never produce a row bypassing the unique index.

### 3.2 Frontend — `src/features/games/pages/PictureQuiz.jsx`

When `game_points_awarded === 0`, the hero number now renders the score **with a "Score" caption**
(existing `score` translation key, already present in en/uz `game.json`), so a raw 100 can never be read
as academy points. When points ARE awarded, the existing amber "+N Game Points" caption is unchanged.

---

## 4. Test Matrix (live, post-fix)

All checks run against the **live production function** — first inside `BEGIN…ROLLBACK` to validate the
migration before apply, then again after deployment. Test identity: student 5 (Davlat - Daniel), whose
picture_quiz level 1 and hangman level 1 were unbanked, answers built from real round content.

| # | Case | Expected | Actual | Result |
|---|---|---|---|---|
| T1 | picture_quiz perfect 10/10 (unbanked lvl 1) | 10 pts, level 1→2 | 10 pts, score 100, level 1→2 | PASS |
| T2 | picture_quiz completed pass 8/10 (lvl 2) | **5 pts, NOT 80, no level-up** | 5 pts, score 80, no level-up | PASS |
| T3 | picture_quiz fail 5/10 | 0 pts | 0 pts, pass=false | PASS |
| T4 | picture_quiz incomplete 3/10 (all correct) | 0 pts, no level-up | 0 pts, no level-up | PASS |
| T5 | replay same consumed round | rejected | "This round is invalid or has already been submitted" | PASS |
| T6 | perfect round on **already-banked** level 2 | leveled_up but 0 bonus pts (anti-farm) | leveled_up=true, now lvl 3, 0 pts | PASS |
| T7 | hangman 8/10 completed pass (regression) | **0 pts** (only picture_quiz changed) | 0 pts, pass=true, score 80 | PASS |
| T8 | hangman 10/10 (regression) | awarded on level-up | 15 pts, leveled_up=true | PASS |

**Regression proof for the other 9 games:** line-level `Compare-Object` of the new migration versus
`20260920000004` shows the only body differences are the added `elsif picture_quiz` award block (and its
`v_round_level is not null` guard). T7/T8 confirm hangman's live behavior is unchanged.

---

## 5. Applied to Production

- Migration `20260920000006` applied live:
  `supabase db query --linked --file 20260920000006_picture_quiz_points_on_completed_pass.sql`
  (run via a copy at a no-space temp path). Verified the new award `elsif` is present in the live
  function via `pg_get_functiondef` after apply.
- Recorded in `supabase_migrations.schema_migrations` (`version = '20260920000006'`, name null — same
  convention as the other applied-but-untracked gaming-core migrations).
- Full 8-check matrix re-run against live **after** apply AND **after** deployment — all PASS.

### 5.2 Deployment

Standard rule applied (`docs/DEPLOYMENT.md`): **no direct `vercel --prod`.** The commit containing
`PictureQuiz.jsx` + the migration files was pushed, then deployed via
`npm run deploy:production` (disposable worktree reset to `origin/release/dashboard-redesign`, commit
`6a7c0584`).

- Live deployment URL: `dave-english-academy-repautl0s-student-management-system2.vercel.app`
  ("Ready in 37s"), serving alias `dave-english-academy.vercel.app`.
- Live frontend verified: index chunk `index-UmgT-bNM.js` references PictureQuiz chunk
  `PictureQuiz-DyYOf8f4.js`; the chunk contains the new `s("score")` caption under the raw-score branch,
  i.e. the display fix is live.

---

## 6. Historical Wrong Awards — NOT Modified

Consistent with the audit's scope rules, **no historical transactions, sessions, or balances were
changed or re-credited.** The banking rule is append-only per (student, game_type, level). Rows banked
under the old behavior (e.g. perfect rounds that banked 10, or levels banked at 0 because a student never
re-perfected after the full+perfect gate) remain exactly as they are. Re-crediting the past would require
a separate, explicitly-authorized correction migration.

---

## 7. Known Residual Notes

- A level banked at 5 via a completed-but-imperfect pass will not later auto-upgrade to 10 when the
  student eventually perfects it — the unique index banks once, matching the pre-existing ledger model.
  This is intentional (anti-farm) and was confirmed with Dave as part of the "5 on any completed pass"
  decision.
- The other nine game result screens share the same raw-score-when-zero-awarded display pattern
  (`WordScramble.jsx:197`, `Hangman.jsx:237`, `WordMatch.jsx:181`, `VocabularyQuiz.jsx:110`). They are
  **not** changed here — their backend awards still require a full+perfect level-up, so the same
  score-vs-points confusion can in principle occur for them; flagged for a future one-line follow-up if
  desired.
- Deployment note: the interactive `[y/N]` confirm in `deploy-production.sh` needs a real TTY; running it
  under this session's tooling required injecting stdin. No script change was made.

---

## 8. Artifacts

- `supabase/migrations/20260920000006_picture_quiz_points_on_completed_pass.sql` — the fix (applied + committed).
- `src/features/games/pages/PictureQuiz.jsx` — display label fix (committed + deployed).
- Local evidence files (run 0027 partial repro; 0028b perfect/incomplete/replay; 0030 live state;
  0035 live function def vs 0004 diff; 0036 regression candidate selection; 0038 game-level candidates;
  0040/0041 round shapes; 0043 test matrix; 0050 post-deploy re-run).