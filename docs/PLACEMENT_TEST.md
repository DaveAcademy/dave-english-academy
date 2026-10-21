# CEFR Placement Test

Placement testing for Dave English Academy: estimates a student's English
proficiency on the CEFR ladder (A1-C2) and produces a **recommendation**.
It is deliberately isolated from regular Exams, Homework, Games, Attendance,
and Payments - separate tables, RPCs, routes, and locale namespace.

## Status of the estimate

Three distinct states are maintained, and the UI never blurs them:

| State | Meaning |
| --- | --- |
| **Preliminary** (`submitted`) | Computed automatically from the four objective skills (grammar, vocabulary, reading, listening). Shown to the student as "Preliminary". |
| **Teacher-reviewed** (`reviewed`) | A teacher (scoped to the student's group level) or administrator has confirmed or adjusted the level with a recorded reason. |
| **Insufficient evidence** (`insufficient_evidence`) | Too few questions were answered (or the skill spread is too wide / no evidence at all). The attempt is flagged for teacher review instead of inventing precision. |

Nothing in this system moves a student between groups. The recommendation
is recorded; group changes remain an explicit action in Group Management.

## Database (migrations 20261121000000/0100/0200)

- `placement_questions` - the bank. RLS: **admin-only**. Answer keys and
  explanations never reach a client during an active attempt; staff receive
  them only for submitted/reviewed attempts via `get_placement_attempt`.
- `placement_attempts` - one active attempt per student (partial unique
  index), server-set 1-hour deadline, frozen `asked_question_ids` order.
- `placement_answers` - one row per asked question, graded server-side.
- `placement_reviews` - one review per attempt (upsert on re-review):
  reviewer, rubric scores, final level, mandatory reason.

There are **no INSERT/UPDATE/DELETE RLS policies for students or teachers**
on any placement table - every write goes through a SECURITY DEFINER RPC,
which validates ownership, attempt state, deadline, and question-was-asked.
Teacher reads are scoped with the established `teacher_group_assignments`
level-assignment pattern (migration 0131): a teacher sees attempts only for
students whose group level they teach; administrators see everything.

Duplicate-submission protection: advisory locks
(`placement_start:<student>`, `placement_submit:<attempt>`), a partial
unique index on active attempts, idempotent `submit_placement_attempt`
(replays the stored result), and an attempts cap (5) re-checked under lock.

## Adaptive engine (`get_next_placement_question`)

v1 is an intentionally simple, deterministic heuristic - **not** a validated
psychometric model:

- Skills run in a fixed rotation: grammar -> vocabulary -> reading ->
  listening. Within a skill the ladder position is 1 (A1) .. 6 (C2).
- Entry level: A1 (1) - the easiest questions first; the ladder adapts upward.
- After each answer: `estimate = clamp(ENTRY + round(net / 2), 1, 6)` where
  `net = correct - incorrect` and skipped counts as incorrect. Dividing by 2
  damps a single lucky/unlucky answer.
- Selection: first unused published item at the estimated level (ties by
  id); nearest-level fallback keeps the test running when a level runs dry.
- Stop rule per skill: at least 4 questions asked **and** the estimate has
  been unchanged across the last two consecutive answers (stability), or 7
  asked. Maximum 28 objective questions overall - termination is
  guaranteed.
- Re-entrant: a reload or lost connection re-serves the last unanswered
  question instead of a new one; interrupted attempts resume exactly.
- When the objective phase completes, one writing prompt and two speaking
  prompts are attached at the provisional (median) level.

Constants live in one place (`placement_*()` SQL functions) and are mirrored
by `src/features/placementTest/lib/placementModel.js` (display only) and
asserted in `tests/placement-engine.test.mjs`.

## Scoring model (`submit_placement_attempt`)

- Per skill: **difficulty-weighted percentage** - a correct item contributes
  its CEFR index as weight; wrong/skipped items contribute their weight to
  the denominator only. A raw average would let easy items overstate a
  strong student; weighting makes higher-level evidence count more.
- Skill level via fixed thresholds: <35 -> A1, <50 -> A2, <65 -> B1,
  <80 -> B2, <92 -> C1, else C2. Provisional, not calibrated.
- Overall: **conservative median** of the four skill levels (floored). The
  median resists one outlier skill dominating the result.
- Confidence: skill spread <= 1 band -> high; 2 -> medium; >= 3 -> low.
- Insufficient evidence: fewer than 12 answered objective questions, or no
  skill evidence at all -> `insufficient_evidence` + low confidence.
- Skipped/unanswered questions count as **incorrect** (explicit, prevents
  gaming by skipping hard items).
- Strongest/weakest skills are reported with per-skill percentages.
- CEFR -> academy group recommendation: 1->A, 2->A1, 3..4->B, 5..6->C.

## Writing and speaking

These skills are **not** auto-scored - multiple-choice answers cannot
measure productive skills:

- **Writing**: the student writes in-app; the teacher scores four rubric
  dimensions 0-3 (task completion, grammatical control, vocabulary range,
  coherence) in the review dashboard.
- **Speaking**: the student sees the topics; a teacher conducts a short
  live assessment and scores four dimensions 0-3 (intelligibility,
  grammatical control, vocabulary range, fluency & coherence), marking the
  assessment as conducted. No client request can fabricate a speaking or
  writing score.

## Teacher review dashboard (`/placement-review`)

Search by name; filter by group, estimated CEFR, and review status. The
detail view shows per-skill evidence, every answer with server-side
correctness, answer keys and explanations (post-submit, staff only), the
writing response, and the speaking topics. The teacher confirms or adjusts
the level (mandatory reason) and can see previous attempts of the student
in the list. RLS enforces the same scope server-side.

## Known limitations (documented, accepted for v1)

- The thresholds and the adaptive walk are heuristics, not calibrated
  psychometrics. A deliberately inconsistent or coached student can shift
  the preliminary result; the teacher-review gate exists for exactly this.
- Listening items are read aloud with browser speech synthesis. The audio
  transcript travels in the (keyless) payload, so a determined student with
  developer tools could read it - listening evidence is therefore no
  stronger than reading evidence. A hosted-audio replacement can drop in
  behind the same schema later.
- The question bank is modest (4-5 items per level per objective skill).
  Adaptive selection falls back to nearest levels when a level runs dry;
  growing the bank improves precision.
- The CEFR mapping of individual items is by author judgment; item
  difficulty has not been empirically validated. Review the bank before
  relying on fine distinctions between neighbouring levels.
