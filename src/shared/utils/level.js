// level.js
// Level is derived entirely from a student's existing Academy Points - the
// only scoring system in the app. No XP, no currency, no new table: this is
// pure arithmetic over the `points` value already loaded by the dashboard
// (get_group_leaderboard / getLeaderboard). Uncapped - there is no ceiling
// level.

const POINTS_PER_LEVEL = 100;

export function calculateLevel(points) {
  const safePoints = Math.max(0, points || 0);
  return Math.floor(safePoints / POINTS_PER_LEVEL) + 1;
}

// Progress toward the *next* level: how far into the current 100-point
// band the student is, both as a raw point count and a 0-100 percent for
// ring/bar fills. pointsToNextLevel is always in (0, 100] - a student who
// just crossed a threshold (pointsIntoLevel === 0) has the full 100 to go,
// not 0.
export function calculateLevelProgress(points) {
  const safePoints = Math.max(0, points || 0);
  const level = calculateLevel(safePoints);
  const pointsIntoLevel = safePoints % POINTS_PER_LEVEL;
  const pointsToNextLevel = POINTS_PER_LEVEL - pointsIntoLevel;
  const percent = Math.round((pointsIntoLevel / POINTS_PER_LEVEL) * 100);

  return {
    level,
    nextLevel: level + 1,
    pointsIntoLevel,
    pointsPerLevel: POINTS_PER_LEVEL,
    pointsToNextLevel,
    percent,
  };
}
