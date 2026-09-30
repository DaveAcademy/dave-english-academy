// websiteEngagement.js
// Website Engagement status - a separate dimension from the Academic
// Progress status in progressAnalytics.js (on_track/behind/at_risk).
// Academic Progress measures how a student is doing in class + homework +
// attendance; Website Engagement measures whether they use the site at all.
// A student can be On Track academically while Never Logged In, or Behind
// academically while actively completing lessons daily - both signals are
// kept, never merged into one.
//
// Reuses the per-student lesson rows already computed by
// buildStudentProgressRows (lessonsCompleted, lessonsTotal, lastActivity,
// lessonCap, currentLessonNumber/Label) - no lesson math is duplicated here,
// only login data (from get_student_login_info, migration 0102) is merged in.

export const WEBSITE_STATUS = {
  NEVER_LOGGED_IN: 'never_logged_in',
  LOGGED_IN_NO_LESSONS: 'logged_in_no_lessons',
  LEARNING: 'learning',
  UP_TO_DATE: 'up_to_date',
};

export const WEBSITE_STATUS_META = {
  [WEBSITE_STATUS.NEVER_LOGGED_IN]: { label: 'Never Logged In', tone: 'danger', emoji: '🔴' },
  [WEBSITE_STATUS.LOGGED_IN_NO_LESSONS]: { label: 'Logged In, No Lessons', tone: 'warning', emoji: '🟡' },
  [WEBSITE_STATUS.LEARNING]: { label: 'Learning', tone: 'info', emoji: '🔵' },
  [WEBSITE_STATUS.UP_TO_DATE]: { label: 'Up to Date', tone: 'success', emoji: '🟢' },
};

// progressRows: output of buildStudentProgressRows (active students only,
// one row per student with lessonsCompleted/lessonsTotal/lastActivity/etc.)
// loginInfoRows: output of listStudentLoginInfo() - [{ student_id,
// last_sign_in_at, account_created_at }]
export function buildWebsiteEngagementRows(progressRows, loginInfoRows) {
  const loginById = Object.fromEntries((loginInfoRows || []).map((r) => [r.student_id, r]));

  return progressRows.map((r) => {
    const login = loginById[r.id];
    const lastSignInAt = login?.last_sign_in_at ?? null;
    const hasLessonActivity = r.lessonsCompleted > 0 || r.lessonsInProgress > 0;
    const allAvailableCompleted = r.lessonsTotal > 0 && r.lessonsCompleted >= r.lessonsTotal;

    let websiteStatus;
    if (!lastSignInAt) websiteStatus = WEBSITE_STATUS.NEVER_LOGGED_IN;
    else if (!hasLessonActivity) websiteStatus = WEBSITE_STATUS.LOGGED_IN_NO_LESSONS;
    else if (allAvailableCompleted) websiteStatus = WEBSITE_STATUS.UP_TO_DATE;
    else websiteStatus = WEBSITE_STATUS.LEARNING;

    return {
      id: r.id,
      name: r.name,
      level: r.level,
      lastSignInAt,
      lastWebsiteActivity: r.lastActivity,
      lessonsCompleted: r.lessonsCompleted,
      lessonsAvailable: r.lessonsTotal,
      currentLessonNumber: r.currentLessonNumber,
      currentLessonLabel: r.currentLessonLabel,
      websiteStatus,
    };
  });
}

export function summarizeWebsiteEngagement(rows) {
  return {
    neverLoggedIn: rows.filter((r) => r.websiteStatus === WEBSITE_STATUS.NEVER_LOGGED_IN).length,
    loggedInNoLessons: rows.filter((r) => r.websiteStatus === WEBSITE_STATUS.LOGGED_IN_NO_LESSONS).length,
    learning: rows.filter((r) => r.websiteStatus === WEBSITE_STATUS.LEARNING).length,
    upToDate: rows.filter((r) => r.websiteStatus === WEBSITE_STATUS.UP_TO_DATE).length,
  };
}
