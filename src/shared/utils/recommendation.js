// recommendation.js
// Deterministic "What should I do next?" — pure function over already-loaded
// student data. No new tables, no ML, no side effects. Priority is real
// English learning, not gamification.
//
// Priority:
//   1. Incomplete lesson (curriculum-gated, unlocked)
//   2. Unfinished daily mission (has progress < target)
//   3. Pending homework
//   4. Vocabulary review (if vocab exists but mastery not done — presence check)
//   5. Game practice (always available fallback)
//

export function nextLearningAction({
  nextLesson,
  dailyMissions,
  homeworkPendingCount,
  hasVocab,
  t,
} = {}) {
  // 1. Incomplete lesson — most educationally meaningful
  if (nextLesson) {
    const num = nextLesson.curriculum_lessons?.lesson_number ?? null;
    return {
      key: 'lesson',
      to: `/my-lessons/${nextLesson.id}`,
      label: num ? `Continue Lesson ${num}` : 'Continue Lesson',
      reason: 'Your next curriculum lesson is waiting',
      priority: 1,
    };
  }

  // 2. Unfinished daily mission
  if (Array.isArray(dailyMissions) && dailyMissions.length > 0) {
    const unfinished = dailyMissions.find((m) => !m.completed);
    if (unfinished) {
      return {
        key: 'mission',
        to: '/my-progress',
        label: unfinished.name || 'Complete today’s mission',
        reason: `${unfinished.progress ?? 0}/${unfinished.target ?? '?'} — ${unfinished.description || ''}`.trim(),
        priority: 2,
        meta: unfinished,
      };
    }
  }

  // 3. Pending homework
  if (homeworkPendingCount > 0) {
    return {
      key: 'homework',
      to: '/my-homework',
      label: `${homeworkPendingCount} homework pending`,
      reason: 'Teacher-assigned work',
      priority: 3,
    };
  }

  // 4. Vocabulary review
  if (hasVocab) {
    return {
      key: 'vocab',
      to: '/my-vocabulary',
      label: 'Review vocabulary',
      reason: 'Keep words fresh',
      priority: 4,
    };
  }

  // 5. Game practice — always available
  return {
    key: 'game',
    to: '/games',
    label: 'Practice a game',
    reason: 'Fun English practice',
    priority: 5,
  };
}
