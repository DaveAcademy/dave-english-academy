// progressAnalytics.js
// Pure computation for the Progress Analytics Dashboard section
// (Dashboard.jsx). Deliberately reuses, rather than reimplements, the
// per-student lesson math already established by lessonLogic.js/Reports.jsx
// ("Lesson Progress" report) and the attendance-rate formula from
// utils/attendance.js (same one Class Health uses) - see the Reports.jsx
// 'lessonProgress' case and Dashboard.jsx classHealth block this mirrors.
//
// All inputs are the arrays already loaded once by useAcademy() - no
// queries happen in this file, so filtering/sorting here never refetches.

import {
  LESSON_STATUS,
  teacherPaceFor,
  lessonCapFor,
  progressByLessonNumber,
  lessonStatusFor,
  nextUnfinishedLesson,
} from '../../lib/lessonLogic';
import { attendanceRate } from '../../utils/attendance';

// ---- Status thresholds (documented here as the single source of truth) ----
//
// Per-student "composite" = average of the three metrics that exist among
// {lesson progress %, homework %, attendance %} (exam average is shown as a
// column but deliberately excluded from status, per spec - status is only
// lesson progress + homework + attendance). Mirrors Dashboard.jsx's
// classHealth composite (avg of the metrics that exist, null-skipped), just
// scoped to one student and without the exam term.
//
// On Track: composite >= ON_TRACK_MIN and not flagged At Risk.
// Behind:   composite in [BEHIND_MIN, ON_TRACK_MIN) and not flagged At Risk.
// At Risk:  independent of the composite score - triggered when at least
//   AT_RISK_FLAG_THRESHOLD of these four flags are true:
//     - attendance < POOR_ATTENDANCE_MAX
//     - homework   < POOR_HOMEWORK_MAX
//     - lesson progress < LOW_PROGRESS_MAX
//     - no recorded activity in >= STALE_ACTIVITY_DAYS days (or never active
//       and enrolled at least NEW_STUDENT_GRACE_DAYS days ago - a student
//       who joined yesterday and hasn't started yet hasn't "fallen behind",
//       they just haven't started; a never-active student is only stale once
//       they've had a fair chance to become active)
//   Any single one of these alone (e.g. one mildly-low metric) is NOT enough
//   to flag At Risk - the spec explicitly calls for a combination, not one
//   mild factor. Two or more together is the bar.
export const ON_TRACK_MIN = 75;
export const BEHIND_MIN = 50;
export const POOR_ATTENDANCE_MAX = 60;
export const POOR_HOMEWORK_MAX = 60;
export const LOW_PROGRESS_MAX = 30;
export const STALE_ACTIVITY_DAYS = 14;
export const NEW_STUDENT_GRACE_DAYS = 7;
export const AT_RISK_FLAG_THRESHOLD = 2;

function daysSince(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86400000);
}

// Per-student visible lessons: same rule Reports.jsx uses - a lesson is
// "visible" to a student if it's unassigned (legacy/global), matches their
// group, or matches their level.
function visibleLessonsFor(student, lessons) {
  return lessons.filter((l) => (!l.group_name && !l.level) || l.group_name === student.group_name || l.level === student.level);
}

// Builds one row per active student with every Progress Analytics column,
// plus the raw flags/composite used to derive status. Single pass over the
// already-fetched arrays; no N+1 queries.
export function buildStudentProgressRows({ students, attendance, exams, examScores, homeworkStatus, lessons, curriculumProgress, lessonProgress }) {
  const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));

  const attendanceByStudent = attendance.reduce((acc, a) => {
    (acc[a.student_id] ||= []).push(a);
    return acc;
  }, {});
  const homeworkByStudent = homeworkStatus.reduce((acc, h) => {
    (acc[h.student_id] ||= []).push(h);
    return acc;
  }, {});
  const examScoresByStudent = examScores.reduce((acc, sc) => {
    (acc[sc.student_id] ||= []).push(sc);
    return acc;
  }, {});
  const lessonProgressByStudent = lessonProgress.reduce((acc, p) => {
    (acc[p.student_id] ||= []).push(p);
    return acc;
  }, {});

  const active = students.filter((s) => s.status === 'Active');

  return active.map((s) => {
    // ---- Lesson progress (reuses lessonLogic, same rules as the portal
    // and the Reports.jsx Lesson Progress report) ----
    const visible = visibleLessonsFor(s, lessons);
    const pace = teacherPaceFor(curriculumProgress, s.level);
    const cap = lessonCapFor(curriculumProgress, s.level);
    const studentProgressRows = lessonProgressByStudent[s.id] || [];
    const progressByNum = progressByLessonNumber(studentProgressRows, visible);
    let completed = 0;
    let inProgress = 0;
    for (const l of visible) {
      const st = lessonStatusFor(l, pace, progressByNum, cap);
      if (st === LESSON_STATUS.COMPLETED) completed += 1;
      else if (st === LESSON_STATUS.IN_PROGRESS) inProgress += 1;
    }
    const total = visible.length;
    const progressPct = total > 0 ? Math.round((completed / total) * 100) : null;
    const next = nextUnfinishedLesson(visible, pace, progressByNum, undefined, cap);
    const currentLessonNumber = next?.curriculum_lessons?.lesson_number ?? null;
    const currentLessonLabel = next ? next.topic || next.curriculum_lessons?.title || 'Untitled' : total > 0 && completed === total ? 'All complete' : '—';

    // ---- Homework % (Submitted or Graded / total assigned) ----
    const hwRows = homeworkByStudent[s.id] || [];
    const hwDone = hwRows.filter((h) => h.status === 'Submitted' || h.status === 'Graded').length;
    const homeworkPct = hwRows.length > 0 ? Math.round((hwDone / hwRows.length) * 100) : null;

    // ---- Attendance % (all-time, same Present=1/Late=0.5/Absent=0 formula
    // as classHealth/attendance.js, just unscoped from "this month" since
    // this table is a standing roster view, not a monthly snapshot) ----
    const attRows = attendanceByStudent[s.id] || [];
    const attendancePct = attendanceRate(attRows);

    // ---- Exam average (score / max_score, same formula as classHealth) ----
    const scRows = (examScoresByStudent[s.id] || []).filter((sc) => sc.score != null);
    const examAvgPct =
      scRows.length > 0
        ? Math.round((scRows.reduce((sum, sc) => sum + Number(sc.score) / (examsById[sc.exam_id]?.max_score || 100), 0) / scRows.length) * 100)
        : null;

    // ---- Last activity: most recent of an attendance mark or a lesson-
    // progress touch (homework_status has no timestamp column to use) ----
    const lastAttendanceDate = attRows.length > 0 ? attRows.map((a) => a.date).sort().at(-1) : null;
    const lastLessonTouch = studentProgressRows.length > 0 ? studentProgressRows.map((p) => p.updated_at).filter(Boolean).sort().at(-1) : null;
    const candidates = [lastAttendanceDate, lastLessonTouch].filter(Boolean);
    const lastActivity = candidates.length > 0 ? candidates.reduce((a, b) => (new Date(a) > new Date(b) ? a : b)) : null;
    const lastActivityDays = daysSince(lastActivity);
    const enrolledDays = daysSince(s.created_at);

    // ---- Status ----
    const metrics = [progressPct, homeworkPct, attendancePct].filter((v) => v != null);
    const composite = metrics.length > 0 ? Math.round(metrics.reduce((sum, v) => sum + v, 0) / metrics.length) : null;

    const flagAttendance = attendancePct != null && attendancePct < POOR_ATTENDANCE_MAX;
    const flagHomework = homeworkPct != null && homeworkPct < POOR_HOMEWORK_MAX;
    const flagProgress = progressPct != null && progressPct < LOW_PROGRESS_MAX;
    // Never-active students are only "stale" once they've had a fair chance
    // to become active (NEW_STUDENT_GRACE_DAYS) - otherwise every brand-new
    // student would flag stale on day one. Students with SOME activity keep
    // the plain STALE_ACTIVITY_DAYS rule regardless of enrollment date.
    const flagStale =
      lastActivityDays == null ? enrolledDays == null || enrolledDays >= NEW_STUDENT_GRACE_DAYS : lastActivityDays >= STALE_ACTIVITY_DAYS;
    const flagCount = [flagAttendance, flagHomework, flagProgress, flagStale].filter(Boolean).length;

    const isAtRisk = flagCount >= AT_RISK_FLAG_THRESHOLD;
    const isBehind = !isAtRisk && (composite == null || composite < ON_TRACK_MIN);
    const status = isAtRisk ? 'at_risk' : isBehind ? 'behind' : 'on_track';

    const atRiskReasons = [];
    if (isAtRisk) {
      if (flagAttendance) atRiskReasons.push(`${attendancePct}% attendance`);
      if (flagHomework) atRiskReasons.push(`${homeworkPct}% homework`);
      if (flagProgress) atRiskReasons.push(`${progressPct}% lesson progress`);
      if (flagStale) atRiskReasons.push(lastActivity ? `no activity in ${lastActivityDays} days` : 'no recorded activity');
    }

    return {
      id: s.id,
      name: s.real_name,
      level: s.level,
      currentLessonNumber,
      currentLessonLabel,
      lessonCap: cap >= 100000 ? null : cap,
      progressPct,
      lessonsCompleted: completed,
      lessonsInProgress: inProgress,
      lessonsTotal: total,
      homeworkPct,
      attendancePct,
      examAvgPct,
      lastActivity,
      lastActivityDays,
      composite,
      status,
      atRiskReasons,
    };
  });
}

export function summarizeProgress(rows) {
  const avg = (key) => {
    const vals = rows.map((r) => r[key]).filter((v) => v != null);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  return {
    avgProgress: avg('progressPct'),
    avgHomework: avg('homeworkPct'),
    avgAttendance: avg('attendancePct'),
    avgExam: avg('examAvgPct'),
    onTrack: rows.filter((r) => r.status === 'on_track').length,
    behind: rows.filter((r) => r.status === 'behind').length,
    atRisk: rows.filter((r) => r.status === 'at_risk').length,
  };
}

export function levelBreakdown(rows, levels) {
  const avg = (list, key) => {
    const vals = list.map((r) => r[key]).filter((v) => v != null);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  return levels.map((level) => {
    const group = rows.filter((r) => r.level === level);
    return {
      level,
      count: group.length,
      avgProgress: avg(group, 'progressPct'),
      avgHomework: avg(group, 'homeworkPct'),
      avgAttendance: avg(group, 'attendancePct'),
      avgExam: avg(group, 'examAvgPct'),
    };
  });
}

// Sparse map of lesson_number -> student count, only for numbers with >= 1
// student currently on them (via currentLessonNumber - same value shown in
// the "Current lesson" column), so the UI can render only occupied slots
// instead of 100 rows.
export function lessonDistribution(rows) {
  const counts = {};
  for (const r of rows) {
    if (r.currentLessonNumber == null) continue;
    counts[r.currentLessonNumber] = (counts[r.currentLessonNumber] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([lessonNumber, count]) => ({ lessonNumber: Number(lessonNumber), count }))
    .sort((a, b) => a.lessonNumber - b.lessonNumber);
}
