// badges.js
// Badge unlock rules computed from data already loaded on the student
// dashboard - no new tables. Three requested badges (Student of the
// Week/Month, Rising Star) need backend state that doesn't exist yet
// (persisted weekly/monthly winners, historical point snapshots to diff
// against) - marked unavailable rather than faked.

export function computeBadges({ attendanceRate, attendanceStreak, homeworkTotal, homeworkDoneRate, examAvg, lessonsCompleted, rank }) {
  return [
    {
      id: 'perfect-attendance',
      emoji: '🏅',
      label: 'Perfect Attendance',
      description: '100% attendance this month',
      unlocked: attendanceRate === 100,
    },
    {
      id: 'homework-hero',
      emoji: '📚',
      label: 'Homework Hero',
      description: 'Every homework item done',
      unlocked: homeworkTotal > 0 && homeworkDoneRate === 100,
    },
    {
      id: 'exam-master',
      emoji: '📝',
      label: 'Exam Master',
      description: 'Average exam score ≥ 90%',
      unlocked: examAvg != null && examAvg >= 90,
    },
    {
      id: 'streak-7',
      emoji: '🔥',
      label: '7-Day Streak',
      description: 'Study streak reaches 7 days',
      unlocked: attendanceStreak >= 7,
    },
    {
      id: 'streak-30',
      emoji: '💎',
      label: '30-Day Streak',
      description: 'Study streak reaches 30 days',
      unlocked: attendanceStreak >= 30,
    },
    {
      id: 'top-3',
      emoji: '⭐',
      label: 'Top 3',
      description: 'Finish in the Top 3 (all-time ranking)',
      unlocked: rank != null && rank <= 3,
    },
    {
      id: 'lesson-explorer',
      emoji: '📖',
      label: 'Lesson Explorer',
      description: 'Finish 10 lessons',
      unlocked: lessonsCompleted >= 10,
    },
    { id: 'student-of-week', emoji: '👑', label: 'Student of the Week', description: 'Weekly winner', unavailable: true },
    { id: 'student-of-month', emoji: '🏆', label: 'Student of the Month', description: 'Monthly winner', unavailable: true },
    { id: 'rising-star', emoji: '🚀', label: 'Rising Star', description: 'Biggest monthly improvement', unavailable: true },
  ];
}
