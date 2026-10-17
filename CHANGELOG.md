# Changelog

## v1.1 – Administrator Dashboard

### Features added
- Administrator Dashboard: academy-wide analytics computed entirely from data the app already loads.
  - Stat cards: active students, attendance rate, payment collection %, homework completion %.
  - Student growth chart (last 6 months).
  - Income overview chart (last 6 months).
  - Exam performance (average score across graded entries).
  - Top students panel (by points).
  - Monthly statistics table (attendance marks, exams given, homework assigned, collected, per month).

### Database prerequisites
- `points` column on `public.students` (migration `0008_add_student_points.sql`).
- `get_leaderboard()` redefined to read `students.points` (migration `0008_add_student_points.sql`).
- `students_view` (migration `0012_db_enforced_financial_protection.sql`), which `listStudents()` reads from.
- All three were found missing or incorrectly applied on the live database during this release cycle and were re-applied and independently re-verified (column existence, view column list, anonymous-access behavior) before this dashboard could be verified against real data.

### Verification performed
- Clean build.
- Runtime verified against the live database via the dev server: real data rendered (active student count, attendance rate, payment collection %, growth/income charts, monthly statistics table).
- Zero console errors.

### Known limitations
- None specific to this release — verified under an actual administrator session, which is the only role this dashboard renders for.

## v1.2 – Teacher Dashboard

### Features added
- Teacher Dashboard:
  - Attendance widget (today's Present/Late/Absent counts + this month's attendance rate).
  - Homework widget (assigned/awaiting grading/graded counts).
  - Exam statistics widget (total exams, awaiting grading, average score).
  - Students needing attention widget (5 lowest attendance rates this month).

### Security notes
- The component contains no references to `payments` or `monthly_fee` (confirmed by full-file inspection).
- Financial information is not queried by the Teacher Dashboard component.

### Verification performed
- Build passed.
- Runtime passed (zero console errors).
- Widget calculations verified against live production data (e.g. real attendance records for the current day/month; homework and exam tables confirmed genuinely empty in this environment, so their "no data" states are correct rather than a fetch failure).

### Known limitation
- Teacher-specific rendering was not verified under an actual teacher account because no teacher credentials were available. Widget calculations and runtime behavior were verified using live production data and code inspection.

## v1.3 – Student Dashboard

### Added
- Student Dashboard (`PortalHome.jsx`):
  - Personal Progress header: points, rank, this month's attendance rate, exam average.
  - Attendance panel (this month's Present/Late/Absent counts).
  - Homework panel (awaiting-submission/submitted/graded counts).
  - Certificates panel (count + short preview list).
  - Ranking panel (top-3 leaderboard preview, student's own row highlighted if present).
  - Pre-existing Upcoming Lessons list preserved unchanged.

### Changed
- Extracted the `Panel` card component (previously defined inline inside `Dashboard.jsx`) into its own file, `src/components/Panel.jsx`, so both `Dashboard.jsx` and `PortalHome.jsx` can share it. Confirmed via diff to be a pure extraction with no logic change.

### Fixed
- None — this release is purely additive plus the component extraction noted above.

### Security
- No references to `payments` or `monthly_fee` anywhere in the file (confirmed by full-file grep).
- Own-data scoping (a student only ever sees their own attendance, homework, certificates, and ranking context) is enforced entirely by RLS already in place before this release: `students_self_read` (migration `0003`) and the self-scoped read policies on `attendance`/`exam_scores`/`homework_status`/`certificates` (migration `0009`). This PR adds or modifies no RLS policy.
- `App.jsx` routing gates `PortalHome` to `role === 'student'` only — administrators and teachers never render this component, as a second layer of assurance independent of the component's own logic.

### Database
- No new migration. Relies entirely on the pre-existing, unmodified RLS policies listed above.

### Verification
- Clean build.
- Zero console errors.
- Widget data cross-checked against live production data: the `certificates` table is genuinely empty in this environment, matching the "No certificates yet" fallback rather than indicating a fetch failure; `get_leaderboard()` independently verified returning real point values.
- Administrator Dashboard re-checked and confirmed still rendering correctly with live data after this merge, as a regression check.

### Known Limitations
- Student-specific rendering was not verified under an actual student account because no student credentials were available. Own-data scoping was verified via code inspection and the underlying RLS policies rather than a live student session — the same limitation pattern as v1.2's teacher-account gap.
