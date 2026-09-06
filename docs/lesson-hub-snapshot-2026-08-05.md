# Lesson Hub Snapshot — 2026-08-05

Point-in-time export of the curriculum/lesson/vocabulary system, taken after
attaching the first 12 lesson PDFs. This is a **read-only snapshot** — no data
was changed to produce it. From this point on, per instruction, the current
`curriculum_lessons` → `lessons` → `lesson_vocabulary` model is treated as the
source of truth; the pre-curriculum "legacy" lesson rows are no longer
tracked as a parallel system (see Anomaly section).

## 1. curriculum_lessons (27 rows) joined to lessons + vocab count

| # | Title | Month | Type | lesson_id | PDF | vocab |
|--:|---|--:|---|--:|---|--:|
| 1 | Hello! Nice to Meet You | 1 | normal | 51 | Lesson_001_Hello_Nice_to_Meet_You.pdf | 12 |
| 2 | How Old Are You? | 1 | normal | 56 | Lesson_002_How_Old_Are_You.pdf | 12 |
| 3 | Colors All Around | 1 | normal | 57 | Lesson_003_Colors_All_Around.pdf | 12 |
| 4 | Classroom Language | 1 | normal | 58 | L4.pdf | 12 |
| 5 | Numbers 20-100 and More | 1 | normal | 59 | L5.pdf | 12 |
| 6 | Asking Questions - The Toolbox | 1 | normal | 60 | L6.pdf | 12 |
| 7 | Numbers & Colors Games Day | 1 | normal | 61 | L7.pdf | 6 |
| 8 | Speaking Circle: Introducing Yourself | 1 | normal | 62 | L8.pdf | 6 |
| 9 | Month 1 Review | 1 | review | — | — | — |
| 10 | Month 1 Test | 1 | test | — | — | — |
| 11 | Where Are You From? | 2 | normal | — | — | — |
| 12 | My Family | 2 | normal | — | — | — |
| 13 | Have / Has - Describing Possessions | 2 | normal | 52 | Lesson_013_Have_Has_Describing_Possessions.pdf | 12 |
| 14 | Days and Months | 2 | normal | — | — | — |
| 15 | Describing People - Adjectives | 2 | normal | — | — | — |
| 16 | All About Me - My Introduction | 2 | normal | — | — | — |
| 17 | Family Tree Workshop | 2 | normal | — | — | — |
| 18 | Speaking Circle: All About My Family | 2 | normal | — | — | — |
| 19 | Month 2 Review | 2 | review | — | — | — |
| 20 | Month 2 Test | 2 | test | — | — | — |
| 34 | Prepositions | 4 | normal | 53 | Lesson_034_Prepositions.pdf | 12 |
| 44 | How Many / How Much | 5 | normal | — | — | — |
| 56 | My Weekend | 6 | normal | 54 | Lesson_056_My_Weekend.pdf | 12 |
| 61 | Holidays and Celebrations | 7 | normal | — | — | — |
| 71 | Body Parts | 8 | normal | — | — | — |
| 72 | Health Problems | 8 | normal | — | — | — |
| 73 | At the Doctor's | 8 | normal | 55 | Lesson_073_At_the_Doctors.pdf | 12 |

12 of 27 curriculum lessons have a teaching instance + PDF + vocabulary.
4 are `review`/`test` type and correctly have no teaching-instance row
(per the "reviews/exams are not curriculum lessons" rule). The remaining 11
`normal` lessons (11, 12, 14–18, 44, 61, 71, 72) are legitimately not yet
taught — this is an expected gap, not a defect.

## 2. lessons table (12 rows total)

Every row now has a non-null `curriculum_lesson_id`, a `pdf_path`/`pdf_name`,
and matching vocabulary (see table above for ids/paths). `group_name`/`level`
are null on all of them — these are shared lessons (Level A/B/C use the same
teaching instance), consistent with the migration comment establishing this
convention.

## 3. lesson_vocabulary (132 rows total)

Distribution: 10 lessons × 12 words, 2 lessons (ids 61, 62 → curriculum
lessons 7, 8) × 6 words. No orphaned vocabulary rows — every row's
`lesson_id` resolves to an existing `lessons` row (verified directly, not
inferred from the FK constraint alone).

## 4. Integrity checks run (all clean)

- `lessons.curriculum_lesson_id` → `curriculum_lessons.id`: **0 broken refs**
- `lessons` with `curriculum_lesson_id is null`: **0 rows** (see anomaly below
  for why this is now 0 instead of 12)
- `lesson_vocabulary.lesson_id` → `lessons.id`: **0 orphaned rows**
- Vocabulary attached to a `review`/`test`/`activity`/`final_exam` curriculum
  lesson (would violate "reviews/exams aren't lessons"): **0 rows**
- Duplicate `curriculum_lesson_id` across multiple `lessons` rows (would mean
  two teaching instances claiming the same curriculum slot): **0 duplicates**
- Storage: all 12 `pdf_path` values have a matching object under
  `attachments/lesson-pdfs/<lesson_id>/` (confirmed via `storage ls`)

**No broken references or orphaned curriculum lessons found.**

## 5. Anomaly on record (unresolved, not part of this task)

Earlier in this session the `lessons` table held 24 rows: the 12 curriculum-
linked ones above, plus 12 legacy rows (ids 35, 37, 40–50 — the pre-curriculum
per-group lesson set, e.g. "Lesson 33 - Have/Has", "Lesson 44 - How Many How
Much", unrelated numbering to the new curriculum). Those 12 legacy rows are
now gone from the table (confirmed via raw `count(*)`, not a query/RLS
artifact). Their PDF files are still orphaned in Storage under
`lesson-pdfs/35,37,40-50/`.

Checked and ruled out as the cause:
- No tracked migration deletes from `lessons` (all curriculum-seeding
  migrations only `INSERT`, one with an explicit comment that the legacy rows
  are untouched).
- The API log window covering the 12 PDF uploads shows only `PATCH` calls to
  `/rest/v1/lessons`, no `DELETE`.

Root cause not identified (Postgres isn't logging plain DML here, only
migration DDL). Flagged for you to confirm separately; not touched further per
your instruction not to restore/recreate.

## Source of truth going forward

As instructed, `curriculum_lessons` → `lessons` → `lesson_vocabulary` is now
the authoritative model for lesson content. The legacy per-group lesson shape
is no longer treated as a parallel system to reconcile against.
