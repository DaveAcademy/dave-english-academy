# Admin System

Confirmed admin functionality, based on `src/pages/*.jsx` (admin-facing pages, distinct from `src/pages/portal/*` which is student-facing).

## 1. Admin pages (confirmed-current, from repo listing)

| Page | Purpose |
|---|---|
| `Students.jsx` | Student management — CRUD, level/group assignment, status |
| `Attendance.jsx` | Attendance recording |
| `Exams.jsx` | Exam creation and score entry |
| `Homework.jsx` | Homework assignment tracking (admin aggregation view) |
| `LessonHub.jsx` / `Lessons.jsx` | Curriculum/lesson management |
| `Vocabulary.jsx` | Vocabulary management (`lesson_vocabulary`) |
| `Rankings.jsx` | Points award (Quick/Detailed/Bulk), Level Leaderboard, Class/Week/Month views — see `RANKING-SYSTEM.md` |
| `Recognition.jsx` | Student of the Week/Month workflow |
| `Payments.jsx` | Payment ledger management — see `PAYMENTS.md` |
| `PaymentEngineTest.jsx` | Payment-engine test/diagnostic page — **not confirmed whether this is dev-only or should be removed before further production polish; flagged, not investigated further this pass** |
| `Reminders.jsx` | Telegram payment-reminder workflow — see `PAYMENTS.md` |
| `Reports.jsx` | Cross-domain report export (attendance, payments, exams, homework, certificates) |
| `Certificates.jsx` | Certificate generation/management |
| `Dashboard.jsx` | Admin dashboard/overview |
| `FileManager.jsx` | File/attachment management |
| `Chat.jsx` | (present in repo; scope/status not investigated this pass) |
| `Settings.jsx` | Admin settings |

## 2. Student management

`Students.jsx` is the CRUD surface for `students` (real_name, level, group, status, Telegram chat linkage). `StudentForm.jsx` component handles the create/edit form and includes Telegram-ID collection (see `PAYMENTS.md`).

## 3. Groups / levels

Levels: A1, A, B, C (CEFR-style academy bands — distinct from "game level," see `GAMING-SYSTEM.md`/`CURRICULUM.md`). Groups (`class_group`, Ranking V2) exist within a level for class-session scoping — see `RANKING-SYSTEM.md` §6.

## 4. Attendance

`Attendance.jsx` records daily attendance; feeds `attendance_rate` calculations used in ranking-period display (joined on the student's *current* level, not the snapshot level used for points — a known minor inconsistency, see `RANKING-SYSTEM.md` §7) and in the attendance streak shown on the student portal (client-computed each render, not persisted).

## 5. Reports

`Reports.jsx` exports across 5 domains: attendance, payments, exams, homework, certificates. Payments export reads the ledger (`payment_transactions` via `paymentRows` state), **not** a boolean field — see `PAYMENTS.md` §4 for the explicit conflict-resolution note against a stale prior-session assumption.

## 6. Admin controls not yet built (flagged, not investigated exhaustively)

- No dedicated admin UI for achievement-rule configuration or review (rules are migration/DB-seeded only) — see `GAMING-SYSTEM.md`/`gamification-system-audit-2026-08-16.md`.
- No one-click point-transaction reversal UI beyond Ranking V2's session-local undo — see `RANKING-SYSTEM.md` §7.
- No admin-facing "who awarded what" view surfacing `awarded_by` on the points ledger (it's tracked, just not shown anywhere).

## 7. Status summary

All pages listed in §1 exist and are routed in `App.jsx`; this doc does not independently re-verify each page's internal correctness beyond what's covered in `RANKING-SYSTEM.md`/`PAYMENTS.md`/`CURRICULUM.md`. `PaymentEngineTest.jsx`'s production-readiness/removal status is an open question for a future session, not resolved here.
