# Project Rule: Master Curriculum (Permanent)

Dave English Academy uses one permanent master curriculum of exactly 100
lessons. This rule consolidates and is authoritative over the more detailed
rules below - if anything below ever conflicts with this, this wins.

- Lessons are numbered 1-100 with no gaps.
- Every numbered lesson is a real teaching lesson - workshop and
  speaking-circle lessons are real curriculum lessons and stay numbered.
- Review sessions, tests, exams, speaking assessments, and revision weeks
  are teacher-scheduled events, not curriculum lessons - they never consume
  a lesson number.
- Lesson numbers are permanent once published (has a `lessons` row + PDF).
  Never renumber.
- Difficulty increases smoothly across five 20-lesson bands: 1-20
  Foundation, 21-40 Elementary, 41-60 Pre-Intermediate, 61-80 Strong A2,
  81-100 Beginning B1. Full spec: `docs/lesson-hub-four-skill-progression.md`.
- The curriculum document (`docs/curriculum-plan-lessons-21-120-proposed.md`
  once approved) is the master source of truth for what each lesson number
  is - do not invent lesson topics that aren't in it.
- `curriculum_lessons` rows are inserted only for lessons actually being
  built, in approved batches - never bulk-insert all 100 rows up front.
- Every newly built lesson must be verified immediately (not batched to
  later) for: curriculum number, PDF, vocabulary, Lesson Hub integration,
  ordering, progression, and design consistency.

# Project Rule: Report Token and Performance Issues

Continuously monitor for anything that unnecessarily increases context usage,
token consumption, development time, or complexity. If you notice any of the
following, **stop and report it before continuing**:

- Files that have become excessively large and should be split.
- Duplicate logic that should be shared.
- Repeated prompts or investigations caused by poor project structure.
- Components, utilities, or APIs doing unnecessary work.
- Database queries that are inefficient or likely to become a bottleneck.
- Multiple RPC calls that should be batched.
- Circular dependencies or architectural issues.
- Legacy code increasing maintenance cost.
- Large generated files or logs consuming unnecessary context.
- Repeated browser testing that could be automated.
- Any workflow causing excessive token usage.
- Any design decision likely to increase future development cost.

When reporting an issue, include:

1. Problem
2. Why it increases token usage, complexity, or performance cost
3. Recommended solution
4. Priority — Critical / High / Medium / Low
5. Whether to fix now or defer

Do not silently work around these issues — surface them so we can decide
whether to fix before continuing. Avoid premature optimization: if an issue
is insignificant at the academy's current size, say so and defer rather than
interrupting development.

# Project Rule: Verify Each Lesson Immediately After Completion

After a curriculum lesson's PDF is attached and vocabulary is added, run a
verification pass immediately - do not batch verification across multiple
lessons. For the lesson just completed, confirm:

1. The `lessons` row exists and its `curriculum_lesson_id` resolves to the
   intended curriculum lesson number.
2. `pdf_path`/`pdf_name` are set and the storage object exists at that path.
3. `lesson_vocabulary` count matches what was intended for that lesson (flag
   if it doesn't, don't assume it's fine).
4. The lesson opens correctly in the Lesson Hub (PDF loads, vocabulary
   displays).

Report any discrepancy found immediately, in the same turn, rather than
noting it for a later batch check.

# Project Rule: Lesson Hub Four-Skill Progression

Curriculum difficulty and lesson structure must evolve gradually across the
100-lesson curriculum (every number 1-100 is a real teaching lesson, no
reserved Review/Test slots, no gaps - workshop/speaking-circle lessons count
as real lessons), not use one fixed template everywhere - see
`docs/lesson-hub-four-skill-progression.md` for the full band-by-band spec
(1-20 foundation, 21-30 adds reading, 31-40 adds listening, 41-60 balanced
four skills, 61-80 intermediate, 81-100 confident communication/real-world).
Read that file before building any new lesson. Never redesign earlier
lessons to match later ones - earlier lessons are intentionally simpler.

# Project Rule: Lesson PDF Design Lock (Critical)

The design used in Lessons 1-8, 13, 34, 56, 73 (and 11 onward) is the
official, locked Dave English Academy lesson template - not a starting
point. `lesson-template.css` (shared stylesheet, same file every lesson
links to) must never be modified for a single lesson: typography, colors,
header/footer, margins, activity-box/vocab-table/section layout, and overall
page balance are fixed across all 100 lessons.

Only two things vary per lesson:
1. Educational content (title, vocabulary, grammar, reading, listening,
   speaking, writing, practice activities) - scaled per
   `docs/lesson-hub-four-skill-progression.md`.
2. The per-lesson inline `<style>` block's corner-illustration SVG (the
   "signature world" - e.g. sun/cloud for greetings, globe/flag for
   countries) - same mechanism, position, size, and wash-gradient technique
   every time, just a different topic-matched icon.

Before finishing any new lesson PDF, compare it side-by-side with Lesson 1 or
13. If someone could tell at a glance they came from different templates, it
fails and must be rebuilt against the locked template - never redesign to
"improve" it without Dave explicitly requesting a full-curriculum redesign.

# Project Rule: Curriculum Validation Before Building a Lesson

Before creating any new lesson, first identify which curriculum band it
belongs to (1-20, 21-40, 41-60, 61-80, 81-100 - see
`docs/lesson-hub-four-skill-progression.md`). Then verify:

- The lesson's difficulty matches that band.
- The lesson introduces only the skills allowed for that stage (don't add
  Reading/Listening before their band, don't skip a skill that band requires).
- The lesson is only slightly more difficult than the previous lesson.
- The lesson keeps the approved PDF design without visual changes (locked
  template rule above).

If any check fails, revise the lesson before considering it complete - don't
move on to the next lesson with a known-failing check.

# Project Rule: Curriculum Continuity

Before creating lesson N:
1. Review lesson N-1.
2. Identify what students already know.
3. Introduce only a small amount of new material - roughly one new grammar
   point and one new vocabulary theme.
4. Reuse previous vocabulary and grammar throughout the lesson to reinforce
   learning.
5. Avoid introducing multiple unrelated concepts in a single lesson.

Every lesson should feel like the natural continuation of the previous one,
not a standalone worksheet.

# Project Rule: Published Lesson Numbers Are Permanent

Once a curriculum lesson has been published (has a `lessons` row with a PDF
attached), never change its `curriculum_lessons.lesson_number` or move it to
a different curriculum position. If content needs improvement, edit the
lesson in place - Lesson 34 must always stay Lesson 34. Homework, exams, and
vocabulary all reference lessons by number, so renumbering silently breaks
those references.
