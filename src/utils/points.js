// points.js
// The single source of truth for the Points formula, so Rankings.jsx and
// the student portal can never disagree about a student's score. These
// weights are a reasonable default (not something exactly specified) -
// change them here and every page that shows points updates together.

const ATTENDANCE_PRESENT = 2;
const ATTENDANCE_LATE = 1;
const EXAM_MAX_POINTS = 10;
const HOMEWORK_GRADED_MAX_POINTS = 5;
const HOMEWORK_SUBMITTED_POINTS = 1;

/**
 * @param {number} studentId
 * @param {{lessonAttendance: object[], examScores: object[], exams: object[], homeworkStatus: object[]}} data
 */
export function calculatePoints(studentId, { lessonAttendance, examScores, exams, homeworkStatus }) {
  const attendancePoints = lessonAttendance
    .filter((a) => a.student_id === studentId)
    .reduce((sum, a) => sum + (a.status === 'Present' ? ATTENDANCE_PRESENT : a.status === 'Late' ? ATTENDANCE_LATE : 0), 0);

  const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));
  const examPoints = examScores
    .filter((s) => s.student_id === studentId)
    .reduce((sum, s) => {
      const exam = examsById[s.exam_id];
      const maxScore = exam?.max_score || 100;
      return sum + (Number(s.score) / maxScore) * EXAM_MAX_POINTS;
    }, 0);

  // Homework scores are assumed to already be on a 0-100 scale (no
  // separate max_score column - homework was scoped as "simple").
  const homeworkPoints = homeworkStatus
    .filter((h) => h.student_id === studentId)
    .reduce((sum, h) => {
      if (h.status === 'Graded' && h.score != null) return sum + (Number(h.score) / 100) * HOMEWORK_GRADED_MAX_POINTS;
      if (h.status === 'Submitted') return sum + HOMEWORK_SUBMITTED_POINTS;
      return sum;
    }, 0);

  return Math.round((attendancePoints + examPoints + homeworkPoints) * 10) / 10;
}

/**
 * Ranks every active student by points, highest first.
 * @returns {{student: object, points: number}[]}
 */
export function rankStudentsByPoints(students, data) {
  return students
    .map((student) => ({ student, points: calculatePoints(student.id, data) }))
    .sort((a, b) => b.points - a.points || a.student.real_name.localeCompare(b.student.real_name));
}
