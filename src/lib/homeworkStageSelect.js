// homeworkStageSelect.js
// Pure helper: which homework stage should be displayed (expanded) after
// data loads. Prefers the parent-requested focus stage when it is usable;
// otherwise the first unlocked incomplete stage; otherwise the first
// incomplete stage (possibly locked — renders collapsed, honestly); else
// the first stage. Returns a stage id or null.
//
// Extracted from HomeworkStages.jsx so the selection rule is unit-testable.
// No React, no I/O.

export function stageStatus(progressMap, stageId) {
  return progressMap?.[stageId]?.status || 'not_started';
}

export function initialActiveStageId(stages, progressMap, focusStageKey) {
  const list = Array.isArray(stages) ? stages : [];
  if (list.length === 0) return null;
  const usable = (s) => stageStatus(progressMap, s.id) !== 'locked';
  if (focusStageKey) {
    const target = list.find((s) => s.stage_key === focusStageKey && usable(s));
    if (target) return target.id;
  }
  const firstOpen = list.find((s) => stageStatus(progressMap, s.id) !== 'completed' && usable(s));
  if (firstOpen) return firstOpen.id;
  const firstIncomplete = list.find((s) => stageStatus(progressMap, s.id) !== 'completed');
  const fallback = firstIncomplete || list[0];
  return fallback && fallback.id != null ? fallback.id : null;
}
