# curriculum_progress — migration 0093

The teacher's per-level pace table for Lesson Hub V2. This document records
why the migration exists, what production state it must reproduce, and how
to verify a fresh deployment matches.

## What the table is

One row per level (`A` / `B` / `C`). `current_lesson_number` is the
whole-class coverage the teacher sets on the admin **Lessons** page ("A is
on lesson N" → `advanceCurriculumProgress`). It feeds two consumers:

- **Storage RLS** — `can_read_lesson_pdf()` (`0094_student_lesson_progress.sql`)
  lets a student open any lesson up to their level's pace, then one more per
  completed lesson. This is the real security boundary for PDF access.
- **Client lock state** — `lessonLogic.js` mirrors the same rule so the
  portal shows accurate Locked / Open badges.

Schema (matches live exactly):

| column | type | default |
|---|---|---|
| `level` | `text` (PK) | — |
| `current_lesson_number` | `integer not null` | `0` |
| `updated_at` | `timestamptz not null` | `now()` |
| `updated_by` | `uuid` → `profiles(id)` | null |

RLS is enabled. Two policies: SELECT open (`true`); UPDATE admin/teacher only
(`is_admin() or is_teacher()`, same in `using` and `with check`). There are no
INSERT/DELETE policies, so those are denied for every non-owner role. Grants
mirror the dashboard-created live table (`all` on the table to
anon/authenticated/service_role) — RLS, not grants, is the boundary.

## Why this migration exists

`curriculum_progress` was created ad hoc in production (dashboard SQL editor)
and never had a migration, so a fresh deployment could not build it. The
`can_read_lesson_pdf()` function in the student-progress migration is
`LANGUAGE sql`, which **validates its relations at creation time** — creating
it on a DB without `curriculum_progress` fails with `42P01: relation does not
exist`. The pace table therefore has to exist before that migration runs.

## Why it is numbered 0093 (before the student-progress migration)

The student-progress migration was originally `0093`. To give
`curriculum_progress` a dedicated file that runs first, it is now
`0094_student_lesson_progress.sql` (renamed with `git mv`, history intact)
and this file is `0093_curriculum_progress.sql`. On a fresh deployment the
files apply in lexical order:

1. `0092_curriculum_lessons_seed_confirmed.sql`
2. **`0093_curriculum_progress.sql`** — creates the pace table, RLS, seed
3. `0094_student_lesson_progress.sql` — creates `student_lesson_progress` and
   defines `can_read_lesson_pdf()`, which can now resolve `curriculum_progress`

Code comments that named the student-progress migration "0093" were updated
to 0094 (`storageBridge.js`, `MyLessons.jsx`, `lessonLogic.js`).

## Seed — production parity

Production (2026-08-07, after the PDF-unlock bug fix) has all three levels at
`100`:

| level | current_lesson_number |
|---|---|
| A | 100 |
| B | 100 |
| C | 100 |

100 = every one of the 100 released curriculum lessons is open to students.
The migration seeds the same values with `on conflict (level) do nothing`, so
applying it to a live DB that already has rows is a no-op. To pace a class
tighter, lower the number per level on the admin Lessons page — the column
default for new rows is `0` (nothing released).

## Verifying a fresh deployment matches production

```sql
-- schema parity
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'curriculum_progress'
order by ordinal_position;

-- policy parity (expect: read/true, update/admin-or-teacher)
select polname, polcmd,
       pg_get_expr(polqual, polrelid)    as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy
where polrelid = 'public.curriculum_progress'::regclass;

-- seed parity (expect: 3 rows, all 100)
select * from curriculum_progress order by level;
```

## How a student's access follows the pace

With `current_lesson_number = 100`, `can_read_lesson_pdf()` returns true for
all 100 released lessons, the client shows them all unlocked, and every PDF
opens. Lowering a level to `N` re-locks everything above `N` for that level's
students (both server-side RLS and client badges), while completing a lesson
still unlocks the next one for that individual student.
