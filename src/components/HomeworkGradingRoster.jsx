// HomeworkGradingRoster.jsx
// Pure display/input component for grading one homework item against a
// student roster. No business logic here - status/score/feedback writes
// go through the same setHomeworkStatusForStudent setter callers already
// use; calculation of grading state (graded/needsGrading/notSubmitted)
// and file resolution stay the responsibility of the caller.

import { Paperclip, Image as ImageIcon } from 'lucide-react';

const STATUS_OPTIONS = ['Assigned', 'Submitted', 'Graded'];

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
        return (
          <div key={s.id} className="rounded-xl bg-white p-3 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-semibold text-ink">{s.real_name}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      gradingState === 'graded'
                        ? 'bg-brand-50 text-brand-600'
                        : gradingState === 'needsGrading'
                          ? 'bg-active/10 text-active'
                          : 'bg-ink/5 text-ink/40'
                    }`}
                  >
                    {gradingState === 'graded' ? statusLabels.Graded : gradingState === 'needsGrading' ? t('needsGrading') : t('notSubmitted')}
                  </span>
                </div>
                {current.answer_file_url && (
                  <button
                    onClick={() => onOpenFile(current.answer_file_url)}
                    className="mt-1 flex items-center gap-1 text-xs text-brand-500 hover:underline"
                  >
                    <Paperclip size={11} /> {current.answer_file_name || t('studentSubmissionDefault')}
                  </button>
                )}
                {filesOf(s.id).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {filesOf(s.id).map((f, i) => (
                      <button
                        key={f.id}
                        onClick={() => onOpenFile(f.file_url)}
                        className="flex items-center gap-1 text-xs text-brand-500 hover:underline"
                      >
                        <ImageIcon size={11} /> {t('imageN', { n: i + 1 })}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={current.status}
                  onChange={(e) => onSetStatus(s.id, e.target.value, current.score, current.feedback)}
                  className="rounded-lg border border-ink/10 px-2 py-1.5 text-sm"
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
                  className="w-24 rounded-lg border border-ink/10 px-3 py-1.5 text-right text-sm"
                />
              </div>
            </div>
            {graded && (
              <input
                defaultValue={current.feedback || ''}
                key={`${s.id}-${current.feedback || ''}`}
                onBlur={(e) => {
                  if (e.target.value !== (current.feedback || '')) {
                    onSetStatus(s.id, 'Graded', current.score, e.target.value || null);
                  }
                }}
                placeholder={t('feedbackPlaceholder')}
                className="mt-2 w-full rounded-lg border border-ink/10 px-3 py-1.5 text-sm"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
