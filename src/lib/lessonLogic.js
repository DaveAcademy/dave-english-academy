// lessonLogic.js
// Shared, pure helpers for Lesson Hub V2's progress model. Kept in one place
// so MyLessons.jsx, LessonHub.jsx and the portal home all derive the same
// unlock/status from the same rules - see migrations 0093/0094 for the SQL side.
//
// Unlock rule (mirrors can_read_lesson_pdf):
//   * legacy lessons (no curriculum link) are always unlocked (level check
//     is the only gate, enforced server-side),
//   * curriculum lesson 1 is always unlocked,
//   * a lesson is unlocked once the teacher's per-level pace has reached
//     it (current_lesson_number), or
//   * the student has completed the immediately previous lesson.
// A per-level hard ceiling (max_available_lesson, migration 0095) overrides
// all of the above - a student can never open lessons past their level's cap
// (A: 20, B: 40, C: 50). Locked is a UI state only - the storage RLS policy
// is the real boundary.

export const LESSON_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};

// Teacher's whole-class coverage for a level (0 when no row exists yet).
export function teacherPaceFor(curriculumProgress, level) {
  return curriculumProgress.find((p) => p.level === level)?.current_lesson_number ?? 0;
}

// Hard per-level ceiling: a student can never open lessons past this number,
// regardless of teacher pace or their own completion. Mirrors the
// curriculum_progress.max_available_lesson column, which can_read_lesson_pdf
// (migration 0095) enforces server-side. 100000 = effectively no cap, so a
// missing row or column keeps today's behaviour.
export function lessonCapFor(curriculumProgress, level) {
  return curriculumProgress?.find((p) => p.level === level)?.max_available_lesson ?? 100000;
}

// Map lesson_number -> progress row for the curriculum lessons the student
// has any progress on. Non-curriculum lessons are skipped (they have no
// stable position to key progression by).
export function progressByLessonNumber(lessonProgress, lessons) {
  const map = {};
  for (const l of lessons) {
    const n = l.curriculum_lessons?.lesson_number;
    if (n == null) continue;
    const row = lessonProgress.find((p) => p.lesson_id === l.id);
    if (row) map[n] = row;
  }
  return map;
}

export function isLessonUnlocked(lesson, pace, progressByNum, cap = 100000) {
  const n = lesson?.curriculum_lessons?.lesson_number;
  if (n == null) return true; // legacy
  if (n > cap) return false; // per-level ceiling
  if (n <= 1) return true; // lesson 1 always unlocked
  if (n <= pace) return true; // teacher's class coverage
  return progressByNum[n - 1]?.status === LESSON_STATUS.COMPLETED; // completed prev unlocks next
}

// UI status for a lesson: 'locked' overrides everything, otherwise it's the
// student's stored status (not_started / in_progress / completed).
export function lessonStatusFor(lesson, pace, progressByNum, cap = 100000) {
  const unlocked = isLessonUnlocked(lesson, pace, progressByNum, cap);
  if (!unlocked) return 'locked';
  const n = lesson?.curriculum_lessons?.lesson_number;
  return progressByNum[n]?.status ?? LESSON_STATUS.NOT_STARTED;
}

// The next lesson the student should open: the first curriculum-ordered
// lesson that is unlocked and not completed. Returns the lesson row or null
// when everything is done.
export function nextUnfinishedLesson(lessons, pace, progressByNum, filter, cap = 100000) {
  const ordered = [...lessons]
    .filter(filter || (() => true))
    .sort((a, b) => {
      const an = a.curriculum_lessons?.lesson_number;
      const bn = b.curriculum_lessons?.lesson_number;
      if (an != null && bn != null) return an - bn;
      if (an != null) return -1;
      if (bn != null) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  return ordered.find((l) => isLessonUnlocked(l, pace, progressByNum, cap) && progressByNum[l.curriculum_lessons?.lesson_number]?.status !== LESSON_STATUS.COMPLETED) || null;
}

// Lesson streak from completion timestamps: consecutive calendar days with
// at least one completed lesson, counted backward from today (a streak is
// kept alive if the most recent completion was today or yesterday).
export function completionStreak(progressRows) {
  const days = new Set(
    progressRows
      .filter((r) => r.status === LESSON_STATUS.COMPLETED && r.completed_at)
      .map((r) => new Date(r.completed_at).toISOString().slice(0, 10))
  );
  if (days.size === 0) return 0;
  const dayKey = (d) => d.toISOString().slice(0, 10);
  let cursor = new Date();
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor))) return 0; // streak already broken
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
