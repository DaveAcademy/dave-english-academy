// placementModel.js - display-only helpers shared by the placement pages.
// IMPORTANT: this is NOT the scoring authority. All adaptive selection,
// grading, and placement computation happen server-side (migration
// 20261121000100). These constants mirror the server contract for display
// and are asserted to match it in tests/placement-engine.test.mjs.

// CEFR ladder: index 0 = level 1 (A1) ... index 5 = level 6 (C2).
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function cefrLabel(level) {
  if (!level || level < 1 || level > 6) return '—';
  return CEFR_LEVELS[level - 1];
}

// CEFR -> academy group level (A / A1 / B / C), mirroring
// placement_recommended_academy_level(). A recommendation only - group
// changes remain an explicit admin/teacher action.
export const ACADEMY_LEVEL_MAP = { 1: 'A', 2: 'A1', 3: 'B', 4: 'B', 5: 'C', 6: 'C' };

export function recommendedAcademyLevel(level) {
  return ACADEMY_LEVEL_MAP[level] || null;
}

// Objective sections in the server's fixed rotation order (listening is
// excluded: device-dependent TTS made it unfair - see docs/PLACEMENT_TEST.md).
export const OBJECTIVE_SKILLS = ['grammar', 'vocabulary', 'reading'];

// Review rubric dimensions per teacher-assessed skill (each scored 0-3).
export const WRITING_RUBRIC = ['task_completion', 'grammar_control', 'vocabulary_range', 'coherence'];
export const SPEAKING_RUBRIC = ['intelligibility', 'grammar_control', 'vocabulary_range', 'fluency_coherence'];

// Status translation helpers (keys live in locales/<lang>/placement.json).
export function reviewStatusKey(status) {
  switch (status) {
    case 'pending':
      return 'reviewStatus.pending';
    case 'insufficient_evidence':
      return 'reviewStatus.insufficientEvidence';
    case 'reviewed':
      return 'reviewStatus.reviewed';
    default:
      return 'reviewStatus.pending';
  }
}

export function confidenceKey(confidence) {
  switch (confidence) {
    case 'high':
      return 'confidence.high';
    case 'medium':
      return 'confidence.medium';
    default:
      return 'confidence.low';
  }
}

export function attemptStatusKey(status) {
  switch (status) {
    case 'in_progress':
      return 'attemptStatus.inProgress';
    case 'submitted':
      return 'attemptStatus.submitted';
    case 'reviewed':
      return 'attemptStatus.reviewed';
    case 'expired':
      return 'attemptStatus.expired';
    default:
      return 'attemptStatus.inProgress';
  }
}

// Badge tone by attempt status, following the shared pill conventions.
export function attemptStatusTone(status) {
  switch (status) {
    case 'reviewed':
      return 'text-emerald-700 bg-emerald-50';
    case 'submitted':
      return 'text-brand-700 bg-brand-50';
    case 'expired':
      return 'text-ink/50 bg-ink/[0.06]';
    default:
      return 'text-amber-700 bg-amber-50';
  }
}
