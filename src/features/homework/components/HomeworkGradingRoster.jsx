// HomeworkGradingRoster.jsx
// Pure display/input component for grading one homework item against a
// student roster. No business logic here - status/score/feedback writes
// go through the same setHomeworkStatusForStudent setter callers already
// use; calculation of grading state (graded/needsGrading/notSubmitted)
// and file resolution stay the responsibility of the caller.

import { Paperclip, Image as ImageIcon, Award } from 'lucide-react';

const STATUS_OPTIONS = ['Assigned', 'Submitted', 'Graded'];

function displayName(s) {
  if (!s) return '';
  if (s.english_name && s.english_name !== s.real_name) return `${s.real_name} (${s.english_name})`;
  return s.real_name;
}

export default function HomeworkGradingRoster({
  students,
  statusOf,
  filesOf,
  gradingStateOf,
  onOpenFile,
  onSetStatus,
  statusLabels,
  t,
}) {
  return (
    <div className="space-y-2">
      {students.map((s) => {
        const current = statusOf(s.id);
        const graded = current.score != null;
        const gradingState = gradingStateOf(s.id);
        const fileCount = filesOf(s.id).length;
        return (
          <div key={s.id} className={`rounded-xl border bg-white p-3 shadow-card sm:p-4 ${graded ? 'border-brand-100' : fileCount > 0 ? 'border-active/20' : 'border-ink/[0.06]'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate font-semibold text-ink">{displayName(s)}</p>
                  {s.level && <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">{s.level}</span>}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      gradingState === 'graded'
                        ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-100'
                        : gradingState === 'needsGrading'
                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                          : 'bg-ink/5 text-ink/40'
                    }`}
                  >
                    {gradingState === 'graded' ? statusLabels.Graded : gradingState === 'needsGrading' ? t('needsGrading') : t('notSubmitted')}
                  </span>
                  {graded && <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white"><Award size={10} />{current.score}/100</span>}
                </div>
                <p className="mt-0.5 text-xs text-ink/40">{fileCount > 0 ? `${fileCount} photo${fileCount === 1 ? '' : 's'}` : current.answer_file_url ? '1 file (legacy)' : 'No submission yet'}{current.submitted_at ? ` · ${new Date(current.submitted_at).toLocaleDateString()}` : ''}</p>
                {current.answer_file_url && (
                  <button
                    onClick={() => onOpenFile(current.answer_file_url)}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                  >
                    <Paperclip size={11} /> {current.answer_file_name || t('studentSubmissionDefault')}
                  </button>
                )}
                {fileCount > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {filesOf(s.id).map((f, i) => (
                      <button
                        key={f.id}
                        onClick={() => onOpenFile(f.file_url)}
                        className="inline-flex items-center gap-1 rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs font-medium text-ink/70 shadow-sm hover:border-brand-200 hover:text-brand-600"
                      >
                        <ImageIcon size={11} /> {t('imageN', { n: i + 1 })}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <select
                  value={current.status}
                  onChange={(e) => onSetStatus(s.id, e.target.value, current.score, current.feedback)}
                  className="rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-xs font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label="Status"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {statusLabels[opt]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={current.score ?? ''}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val !== '' && Number(val) !== current.score) {
                      onSetStatus(s.id, 'Graded', Number(val), current.feedback);
                    }
                  }}
                  placeholder={t('scorePlaceholder')}
                  className="w-20 rounded-lg border border-ink/10 px-2 py-1.5 text-right text-sm font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                />
                <p className="text-[10px] font-medium text-ink/30">Manual points only</p>
              </div>
            </div>
            {graded && (
              <div className="mt-2">
                <input
                  defaultValue={current.feedback || ''}
                  key={`${s.id}-${current.feedback || ''}`}
                  onBlur={(e) => {
                    if (e.target.value !== (current.feedback || '')) {
                      onSetStatus(s.id, 'Graded', current.score, e.target.value || null);
                    }
                  }}
                  placeholder={t('feedbackPlaceholder')}
                  className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                />
                <p className="mt-1 text-[11px] text-ink/40">Feedback visible to student instantly. Be specific: what was good, what needs fix, why points were given.</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
