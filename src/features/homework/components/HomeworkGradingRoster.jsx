// HomeworkGradingRoster.jsx
// Bulk-review workflow for teacher grading of homework submissions.
// Supports: individual and bulk selection, bulk quality action,
// bulk scoring, and individual points awarding.
// All point awards go through awardHomeworkPoints() server-side.
// No direct point_transactions inserts from the frontend.

import { useState, useMemo, useCallback } from 'react';
import { Paperclip, Image as ImageIcon, Award, ShieldCheck, ShieldX, AlertCircle, CheckSquare, Square } from 'lucide-react';
import { levelToken } from '../../../lib/levels';

const STATUS_OPTIONS = ['Assigned', 'Submitted', 'Graded'];
const QUALITY_OPTIONS = ['pending_review', 'valid', 'invalid', 'corrected'];
const QUALITY_LABELS = {
  pending_review: 'Pending Review',
  valid: 'Valid',
  invalid: 'Invalid',
  corrected: 'Needs Correction',
};
const QUALITY_COLORS = {
  valid: { border: 'border-emerald-300', bg: 'bg-emerald-50', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  invalid: { border: 'border-red-300', bg: 'bg-red-50', text: 'text-red-800', badge: 'bg-red-100 text-red-700 ring-red-200' },
  corrected: { border: 'border-amber-300', bg: 'bg-amber-50', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700 ring-amber-200' },
  pending_review: { border: 'border-ink/10', bg: 'bg-white', text: 'text-ink/60', badge: 'bg-ink/5 text-ink/50 ring-ink/10' },
};

function displayName(s) {
  if (!s) return '';
  if (s.english_name && s.english_name !== s.real_name) return `${s.real_name} (${s.english_name})`;
  return s.real_name;
}

export default function HomeworkGradingRoster({
  homeworkId,
  awardedBy,
  students,
  statusOf,
  filesOf,
  gradingStateOf,
  onOpenFile,
  onSetStatus,
  onSetStatusBulk,
  onAwardPoints,
  onAwardPointsBulk,
  statusLabels,
  t,
}) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkScoreInput, setBulkScoreInput] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [bulkResults, setBulkResults] = useState(null);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === students.length) return new Set();
      return new Set(students.map((s) => s.id));
    });
  }, [students]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBulkResults(null);
  }, []);

  const selectedStudents = useMemo(() => students.filter((s) => selectedIds.has(s.id)), [students, selectedIds]);
  const selectedCount = selectedIds.size;
  const allSelected = selectedCount === students.length && students.length > 0;

  const selectedScores = useMemo(() => {
    const scoreSet = new Set();
    selectedStudents.forEach((s) => {
      const st = statusOf(s.id);
      scoreSet.add(st?.score);
    });
    return scoreSet;
  }, [selectedStudents, statusOf]);

  const canBulkSetQuality = selectedCount > 0;
  const canBulkSetScore = selectedCount > 0 && selectedStudents.every((s) => statusOf(s.id)?.score != null);
  const canBulkAwardPoints = selectedCount > 0 && selectedStudents.every((s) => {
    const st = statusOf(s.id);
    return st?.score != null && st?.submission_quality === 'valid' && st?.points_awarded == null;
  });

  const isValidQuality = (q) => QUALITY_OPTIONS.includes(q);

  const executePendingAction = async () => {
    setShowConfirm(false);
    if (!pendingAction) return;
    try {
      if (pendingAction.type === 'quality') {
        const updates = selectedStudents.map((s) => ({
          studentId: s.id,
          status: 'Graded',
          score: statusOf(s.id)?.score ?? 0,
          feedback: statusOf(s.id)?.feedback ?? '',
          submissionQuality: pendingAction.quality,
        }));
        const result = await onSetStatusBulk(homeworkId, updates);
        setBulkResults(result);
      } else if (pendingAction.type === 'score') {
        const score = parseInt(pendingAction.score);
        const updates = selectedStudents.map((s) => ({
          studentId: s.id,
          status: 'Graded',
          score: score,
          feedback: statusOf(s.id)?.feedback ?? '',
          submissionQuality: statusOf(s.id)?.submission_quality || 'valid',
        }));
        const result = await onSetStatusBulk(homeworkId, updates);
        setBulkResults(result);
      } else if (pendingAction.type === 'points') {
        const ids = selectedStudents.map((s) => s.id);
        const score = statusOf(selectedStudents[0]?.id)?.score ?? 0;
        const result = await onAwardPointsBulk(homeworkId, ids, score, 'Homework points awarded by teacher', awardedBy);
        setBulkResults(result);
      }
      setPendingAction(null);
    } catch (e) {
      // Error already handled in the callback
    }
  };

  const handleBulkQuality = (quality) => {
    if (!isValidQuality(quality) || selectedCount === 0) return;
    setBulkScoreInput('');
    setPendingAction({ type: 'quality', quality });
    setShowConfirm(true);
  };

  const handleBulkScore = () => {
    const score = parseInt(bulkScoreInput);
    if (isNaN(score) || score < 0 || score > 100 || selectedCount === 0) return;
    setPendingAction({ type: 'score', score });
    setShowConfirm(true);
  };

  const handleBulkAwardPoints = () => {
    if (!canBulkAwardPoints) return;
    const score = statusOf(selectedStudents[0]?.id)?.score ?? 0;
    setPendingAction({ type: 'points', score });
    setShowConfirm(true);
  };

  if (showConfirm && pendingAction) {
    const actionLabel = pendingAction.type === 'quality' ? `Set quality to "${pendingAction.quality}"` :
                         pendingAction.type === 'score' ? `Set score to ${pendingAction.score}/100` :
                         `Award ${pendingAction.score} points to ${selectedCount} student${selectedCount !== 1 ? 's' : ''}`;
    return (
      <div className="sticky top-0 z-30 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-lg" role="dialog" aria-modal="true">
        <p className="text-sm font-bold text-amber-900">{t('bulkConfirmTitle')}</p>
        <p className="mt-1 text-xs text-amber-800">{actionLabel}</p>
        <p className="mt-1 text-[10px] text-amber-700">{t('bulkAppliesTo', { count: selectedCount })}</p>
        <div className="mt-3 flex gap-2">
          <button onClick={executePendingAction} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700">{t('bulkApply')}</button>
          <button onClick={() => { setShowConfirm(false); setPendingAction(null); }} className="rounded-lg border border-ink/10 px-4 py-2 text-xs font-semibold text-ink/60">{t('bulkCancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {selectedCount > 0 && (
        <div className="sticky top-0 z-20 rounded-xl border border-brand-300 bg-brand-50 p-3 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button onClick={toggleSelectAll} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-semibold shadow-sm">
                {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                {allSelected ? t('bulkDeselectAll') : t('bulkSelectAll')}
              </button>
              <span className="text-xs font-bold text-brand-800">{t('bulkSelectedCount', { count: selectedCount })}</span>
              <button onClick={clearSelection} className="text-xs font-medium text-brand-600 hover:underline">{t('bulkClear')}</button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {canBulkSetQuality && (
                <>
                  <span className="text-[10px] font-bold text-brand-700">{t('bulkSetQuality')}</span>
                  {QUALITY_OPTIONS.map((opt) => (
                    <button key={opt} onClick={() => handleBulkQuality(opt)} className={`rounded px-2 py-1 text-[10px] font-bold shadow-sm ${QUALITY_COLORS[opt]?.badge || 'bg-white text-ink/60'}`}>{QUALITY_LABELS[opt]}</button>
                  ))}
                </>
              )}
              {canBulkSetScore && (
                <div className="flex items-center gap-1">
                  <input type="number" min="0" max="100" value={bulkScoreInput} onChange={(e) => setBulkScoreInput(e.target.value)} placeholder={t('scorePlaceholder')} className="w-16 rounded-lg border border-brand-200 px-2 py-1 text-xs text-center" />
                  <button onClick={handleBulkScore} className="rounded-lg bg-brand-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-brand-700">{t('bulkApply')}</button>
                </div>
              )}
              {canBulkAwardPoints && (
                <button onClick={handleBulkAwardPoints} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-brand-700">
                  <Award size={12} /> {t('bulkAwardPoints')}
                </button>
              )}
            </div>
          </div>
          {bulkResults && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">✓ {bulkResults.success.length} {t('bulkSuccessful')}</span>
              {bulkResults.failed.length > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">✗ {bulkResults.failed.length} {t('bulkFailed')}</span>
              )}
              {bulkResults.failed.map((f) => (
                <span key={f.studentId} title={f.error} className="text-red-600">{f.studentId}: {f.error}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {students.map((s) => {
          const current = statusOf(s.id);
          const graded = current.score != null;
          const gradingState = gradingStateOf(s.id);
          const fileCount = filesOf(s.id).length;
          const submissionQuality = current.submission_quality || 'pending_review';
          const hasAwardedPoints = current.points_awarded != null;
          const canAwardPoints = graded && submissionQuality === 'valid' && !hasAwardedPoints;
          const isSelected = selectedIds.has(s.id);
          const qColor = QUALITY_COLORS[submissionQuality] || QUALITY_COLORS.pending_review;
          return (
            <div key={s.id} className={`rounded-xl border bg-white p-3 shadow-card sm:p-4 ${graded ? 'border-brand-100' : fileCount > 0 ? 'border-active/20' : 'border-ink/[0.06]'} ${isSelected ? 'ring-2 ring-brand-400' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button onClick={() => toggleSelect(s.id)} className="flex items-center justify-center rounded bg-white p-0.5 shadow-sm hover:bg-brand-50" aria-label={`Select ${displayName(s)}`}>
                      {isSelected ? <CheckSquare size={14} className="text-brand-600" /> : <Square size={14} className="text-ink/30" />}
                    </button>
                    <p className="truncate font-semibold text-ink">{displayName(s)}</p>
                    {s.level && <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">{levelToken(s.level)}</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      gradingState === 'graded' ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-100' :
                      gradingState === 'needsGrading' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' :
                      'bg-ink/5 text-ink/40'
                    }`}>
                      {gradingState === 'graded' ? statusLabels.Graded : gradingState === 'needsGrading' ? t('needsGrading') : t('notSubmitted')}
                    </span>
                    {graded && <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white"><Award size={10} />{current.score}/100</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink/40">{fileCount > 0 ? `${fileCount} photo${fileCount === 1 ? '' : 's'}` : current.answer_file_url ? '1 file (legacy)' : 'No submission yet'}{current.submitted_at ? ` · ${new Date(current.submitted_at).toLocaleDateString()}` : ''}</p>
                  {current.answer_file_url && (
                    <button onClick={() => onOpenFile(current.answer_file_url)} className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50">
                      <Paperclip size={11} /> {current.answer_file_name || t('studentSubmissionDefault')}
                    </button>
                  )}
                  {fileCount > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {filesOf(s.id).map((f, i) => (
                        <button key={f.id} onClick={() => onOpenFile(f.file_url)} className="inline-flex items-center gap-1 rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs font-medium text-ink/70 shadow-sm hover:border-brand-200 hover:text-brand-600">
                          <ImageIcon size={11} /> {t('imageN', { n: i + 1 })}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <select value={current.status} onChange={(e) => onSetStatus(s.id, e.target.value, current.score, current.feedback, submissionQuality)} className="rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-xs font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Status">
                    {STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{statusLabels[opt]}</option>)}
                  </select>
                  <input type="number" min="0" max="100" defaultValue={current.score ?? ''} onBlur={(e) => { const val = e.target.value; if (val !== '' && Number(val) !== current.score) onSetStatus(s.id, 'Graded', Number(val), current.feedback, submissionQuality); }} placeholder={t('scorePlaceholder')} className="w-20 rounded-lg border border-ink/10 px-2 py-1.5 text-right text-sm font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" />
                  <p className="text-[10px] font-medium text-ink/30">{t('bulkManualPointsOnly')}</p>
                </div>
              </div>
              {graded && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select value={submissionQuality} onChange={(e) => onSetStatus(s.id, current.status, current.score, current.feedback, e.target.value)} className={`rounded-lg border px-2 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${qColor.border} ${qColor.bg} ${qColor.text}`} aria-label="Submission quality">
                    {QUALITY_OPTIONS.map((opt) => <option key={opt} value={opt}>{QUALITY_LABELS[opt]}</option>)}
                  </select>
                  {submissionQuality === 'valid' && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><ShieldCheck size={11} /> Valid</span>}
                  {submissionQuality === 'invalid' && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700"><ShieldX size={11} /> Invalid</span>}
                  {submissionQuality === 'corrected' && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700"><AlertCircle size={11} /> Needs Correction</span>}
                </div>
              )}
              {hasAwardedPoints && (
                <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand-50 border border-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-700">
                  <Award size={12} /> {t('pointsAwardedLabel', { points: current.points_awarded })}
                </div>
              )}
              {canAwardPoints && (
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => onAwardPoints(s.id, current.score, current.feedback)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    <Award size={14} /> Award {current.score} points
                  </button>
                  <p className="text-[10px] text-ink/30">{t('bulkTeacherAuthorizedOnly')}</p>
                </div>
              )}
              {graded && (
                <div className="mt-2">
                  <input defaultValue={current.feedback || ''} key={`${s.id}-${current.feedback || ''}`} onBlur={(e) => { if (e.target.value !== (current.feedback || '')) onSetStatus(s.id, 'Graded', current.score, e.target.value || null, submissionQuality); }} placeholder={t('feedbackPlaceholder')} className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" />
                  <p className="mt-1 text-[11px] text-ink/40">{t('feedbackVisibleMsg')}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}