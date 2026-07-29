// badges.js
// Badge unlock rules computed from data already loaded on the student
// dashboard - no new tables. Three requested badges (Student of the
// Week/Month, Rising Star) need backend state that doesn't exist yet
// (persisted weekly/monthly winners, historical point snapshots to diff
// against) - marked unavailable rather than faked.
//
// Returns labelKey/descriptionKey (dashboard-namespace translation keys)
// rather than literal text - this is a plain util with no access to
// useTranslation(), so the caller (BadgeShelf) resolves the actual text.

export function computeBadges({ attendanceRate, attendanceStreak, homeworkTotal, homeworkDoneRate, examAvg, lessonsCompleted, rank }) {
  return [
    {
      id: 'perfect-attendance',
      emoji: '🏅',
      labelKey: 'badgePerfectAttendanceLabel',
      descriptionKey: 'badgePerfectAttendanceDescription',
      unlocked: attendanceRate === 100,
    },
    {
      id: 'homework-hero',
      emoji: '📚',
      labelKey: 'badgeHomeworkHeroLabel',
      descriptionKey: 'badgeHomeworkHeroDescription',
      unlocked: homeworkTotal > 0 && homeworkDoneRate === 100,
    },
    {
      id: 'exam-master',
      emoji: '📝',
      labelKey: 'badgeExamMasterLabel',
      descriptionKey: 'badgeExamMasterDescription',
      unlocked: examAvg != null && examAvg >= 90,
    },
    {
      id: 'streak-7',
      emoji: '🔥',
      labelKey: 'badgeStreak7Label',
      descriptionKey: 'badgeStreak7Description',
      unlocked: attendanceStreak >= 7,
    },
    {
      id: 'streak-30',
      emoji: '💎',
      labelKey: 'badgeStreak30Label',
      descriptionKey: 'badgeStreak30Description',
      unlocked: attendanceStreak >= 30,
    },
    {
      id: 'top-3',
      emoji: '⭐',
      labelKey: 'badgeTop3Label',
      descriptionKey: 'badgeTop3Description',
      unlocked: rank != null && rank <= 3,
    },
    {
      id: 'lesson-explorer',
      emoji: '📖',
      labelKey: 'badgeLessonExplorerLabel',
      descriptionKey: 'badgeLessonExplorerDescription',
      unlocked: lessonsCompleted >= 10,
    },
    { id: 'student-of-week', emoji: '👑', labelKey: 'badgeStudentOfWeekLabel', descriptionKey: 'badgeStudentOfWeekDescription', unavailable: true },
    { id: 'student-of-month', emoji: '🏆', labelKey: 'badgeStudentOfMonthLabel', descriptionKey: 'badgeStudentOfMonthDescription', unavailable: true },
    { id: 'rising-star', emoji: '🚀', labelKey: 'badgeRisingStarLabel', descriptionKey: 'badgeRisingStarDescription', unavailable: true },
  ];
}
