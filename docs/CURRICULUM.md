# Curriculum

## 1. Data model (confirmed-current)

```
curriculum_lessons  (the numbered curriculum slot, 1-100 target — see §3)
       |
       v
lessons              (a teaching instance: PDF, vocabulary, attached to one curriculum_lesson_id)
       |
       v
lesson_vocabulary    (938 active words academy-wide, ~10-12 per taught lesson)
```

- `curriculum_lessons` is the authoritative curriculum slot list — title, month, type (`normal`/`workshop`/`speaking`/legacy `review`/`test`), grammar/vocabulary theme.
- `lessons` is a teaching instance: one row per curriculum slot once it has been actually built (PDF attached, vocabulary loaded). `group_name`/`level` are null on shared lessons — Levels A/B/C use the same teaching instance where content is shared.
- `lesson_vocabulary` rows resolve 1:1 to a `lessons.id`; no orphaned rows found in the most recent integrity snapshot (`docs/lesson-hub-snapshot-2026-08-05.md`).
- `student_lesson_progress` / `curriculum_progress` track per-student advancement; these are the tables the "unlocked lesson" gating functions (`student_unlocked_lesson_number()`) read.

**Legacy system, explicitly retired (historical-only):** a pre-curriculum per-group lesson set (`lessons` ids 35, 37, 40-50, e.g. "Lesson 33 - Have/Has") existed before the `curriculum_lessons` model and is no longer treated as a parallel system to reconcile against, per an explicit 2026-08-05 decision. Their PDFs remain orphaned in Storage; not being cleaned up as part of routine work.

## 2. Levels and groups

Academy levels are CEFR-style bands: **A1, A, B, C** (confirmed from `students.level`/`point_transactions.level` check constraints and `teacher_group_assignments`). These are **not** the same concept as "game level" (the 1-100+ per-game progression counter introduced by migrations 0149-0151) — the two are explicitly documented as distinct and must not be conflated (see `GAMING-SYSTEM.md`).

Groups (`class_group`, Ranking V2) exist within a level — e.g. "A1 - Evening" — and are the unit a class session is scoped to.

## 3. Lesson numbering — current state vs. proposed

**Implemented / live (confirmed-current):** 12 lessons have a full teaching instance (PDF + vocabulary) as of the most recent snapshot: curriculum-lesson numbers 1-8, 13, 34, 56, 73. Curriculum-lesson rows exist (27 rows) for numbers up through the low 20s plus a handful of anchor lessons further out (34, 44, 56, 61, 71, 72, 73), but most of 21-100 has no `curriculum_lessons` row yet.

**Proposed / not yet implemented:** `docs/curriculum-plan-lessons-21-120-proposed.md` is a **planning document only** — a full 100-lesson continuous curriculum design (bands: 1-20 Foundation A0→A1, 21-40 Elementary A1, 41-60 Pre-Intermediate strong A1, 61-80 Strong A2, 81-100 Beginning B1). It has **not** been inserted into `curriculum_lessons`; nothing here is confirmed-current. Existing anchor lessons (34, 44, 56, 61, 71, 72, 73) and already-published lessons (1-8, 11-18) are designed to keep their exact numbers unchanged if/when this plan is approved and executed.

Per this proposal: reviews/tests/quizzes become teacher-scheduled events, not curriculum lesson numbers — the old model of reserved "Review"/"Test" slots (e.g. old-numbering lessons 9-10, 19-20) is retired in favor of every number 1-100 being a real teaching lesson.

## 4. Four-skill progression rule (permanent, confirmed-current as a standing content rule)

Documented in `docs/lesson-hub-four-skill-progression.md` and treated as a permanent authoring rule for all future lesson content:

| Lessons | Skills added |
|---|---|
| 1-20 (Foundation) | Vocabulary, grammar, pronunciation, speaking, simple exercises, short writing — no dedicated Reading/Listening yet |
| 21-30 | + Reading (50-100 word passage, 3-5 comprehension questions) |
| 31-40 | + Listening (audio via QR/external link, not embedded in PDF) |
| 41-60 | Balanced four skills every lesson: warm-up, vocabulary, grammar, reading, listening, speaking, writing, homework |
| 61-80 | Increased complexity across all sections, more independent English use |
| 81-100 | Authentic/real-world English, longer readings, integrated multi-skill tasks, projects/presentations by lesson 100 |

Hard rule: never make a sudden jump in difficulty between consecutive lessons; visual design/PDF layout is locked and never changes with content difficulty (see `CLAUDE.md` Design Lock rule referenced in that doc — not verified in this pass, referenced as-is).

## 5. Exams / reviews / gating

- Exams (`exams`/`exam_scores`) and homework (`homework`/`homework_status`) are separate from curriculum lesson rows — they do not consume a `curriculum_lessons` number under the proposed 100-lesson model, and already don't under the current partial-fill state.
- Curriculum gating (which lessons/vocabulary/game content a student can access) is computed server-side, unlock-number-based, and reused identically across the lesson hub, vocabulary games, and content-bank games — see `student_unlocked_lesson_number()` in `DATABASE.md`. As of the 2026-08-17 audit, no active student is unlocked past Lesson 50 (max `curriculum_progress.max_available_lesson`: C=50, B=40, A=20, A1=10) — relevant context for why some game-level content bands (gated at Lesson 86) aren't yet reachable by any real student (**expected, not a bug** — see `GAMING-SYSTEM.md`).

## 6. Status summary

| Item | Status |
|---|---|
| `curriculum_lessons` → `lessons` → `lesson_vocabulary` model | confirmed-current, source of truth |
| Legacy per-group lesson rows | historical-only, retired |
| 12-lesson teaching-instance fill (1-8, 13, 34, 56, 73) | confirmed-current |
| Four-skill progression rule | confirmed-current (standing content rule) |
| 100-lesson full curriculum (21-100 mostly) | **planned**, awaiting approval, not inserted |
| Curriculum gating (`student_unlocked_lesson_number`) | confirmed-current, shared across lessons/games |
