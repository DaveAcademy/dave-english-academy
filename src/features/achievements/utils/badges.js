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
      emoji: '🏆',
      labelKey: 'badgeTop3Label',
      descriptionKey: 'badgeTop3Description',
      unlocked: rank != null && rank <= 3,
    },
    {
      id: 'lessons-complete',
      emoji: '🎓',
      labelKey: 'badgeLessonsCompleteLabel',
      descriptionKey: 'badgeLessonsCompleteDescription',
      unlocked: lessonsCompleted >= 20,
    },
    {
      id: 'rising-star',
      emoji: '⭐',
      labelKey: 'badgeRisingStarLabel',
      descriptionKey: 'badgeRisingStarDescription',
      unavailable: true,
    },
    {
      id: 'student-of-week',
      emoji: '👑',
      labelKey: 'badgeStudentOfWeekLabel',
      descriptionKey: 'badgeStudentOfWeekDescription',
      unavailable: true,
    },
    {
      id: 'student-of-month',
      emoji: '🌟',
      labelKey: 'badgeStudentOfMonthLabel',
      descriptionKey: 'badgeStudentOfMonthDescription',
      unavailable: true,
    },
  ];
}

// Compute game-specific badges from game data.
export function computeGameBadges({ gameSessions, gamePoints, gameLevels }) {
  if (!gameSessions && !gamePoints) return [];

  const totalSessions = (gameSessions || []).length;
  const totalPoints = (gamePoints || 0);
  const levels = gameLevels || [];
  const maxLevel = levels.reduce((max, l) => Math.max(max, l.best_level_reached || 1), 1);

  return [
    {
      id: 'first-game',
      emoji: '🎮',
      labelKey: 'badgeFirstGameLabel',
      descriptionKey: 'badgeFirstGameDescription',
      unlocked: totalSessions >= 1,
    },
    {
      id: 'first-perfect',
      emoji: '💯',
      labelKey: 'badgeFirstPerfectLabel',
      descriptionKey: 'badgeFirstPerfectDescription',
      unlocked: (gameSessions || []).some(s => s.words_correct === s.words_total && s.words_total > 0),
    },
    {
      id: 'game-5-rounds',
      emoji: '🎯',
      labelKey: 'badgeGame5RoundsLabel',
      descriptionKey: 'badgeGame5RoundsDescription',
      unlocked: totalSessions >= 5,
    },
    {
      id: 'game-25-rounds',
      emoji: '🎪',
      labelKey: 'badgeGame25RoundsLabel',
      descriptionKey: 'badgeGame25RoundsDescription',
      unlocked: totalSessions >= 25,
    },
    {
      id: 'game-100-rounds',
      emoji: '🏟️',
      labelKey: 'badgeGame100RoundsLabel',
      descriptionKey: 'badgeGame100RoundsDescription',
      unlocked: totalSessions >= 100,
    },
    {
      id: 'game-points-50',
      emoji: '💰',
      labelKey: 'badgeGamePoints50Label',
      descriptionKey: 'badgeGamePoints50Description',
      unlocked: totalPoints >= 50,
    },
    {
      id: 'game-points-200',
      emoji: '🏦',
      labelKey: 'badgeGamePoints200Label',
      descriptionKey: 'badgeGamePoints200Description',
      unlocked: totalPoints >= 200,
    },
    {
      id: 'game-points-500',
      emoji: '👑',
      labelKey: 'badgeGamePoints500Label',
      descriptionKey: 'badgeGamePoints500Description',
      unlocked: totalPoints >= 500,
    },
    {
      id: 'level-5',
      emoji: '🔓',
      labelKey: 'badgeLevel5Label',
      descriptionKey: 'badgeLevel5Description',
      unlocked: maxLevel >= 5,
    },
    {
      id: 'level-10',
      emoji: '🔓',
      labelKey: 'badgeLevel10Label',
      descriptionKey: 'badgeLevel10Description',
      unlocked: maxLevel >= 10,
    },
    {
      id: 'level-25',
      emoji: '🏅',
      labelKey: 'badgeLevel25Label',
      descriptionKey: 'badgeLevel25Description',
      unlocked: maxLevel >= 25,
    },
  ];
}
