// ExamGradingRoster.jsx
// Pure display/input component for grading one exam item against a
// student roster. No business logic here - score/feedback writes go
// through the same setExamScoreForStudent setter callers already use;
// submitted/graded state and file resolution stay the caller's job.

import { Paperclip } from 'lucide-react';

export default function ExamGradingRoster({ examMaxScore, students, answerOf, onOpenFile, onSetScore, t }) {
  return (
    <div className="space-y-2">
      {students.map((s) => {
        const answer = answerOf(s.id);
        const submitted = !!answer.answer_file_url;
        const graded = answer.score != null;
        return (
          <div key={s.id} className="rounded-xl bg-white p-3 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-semibold text-ink">{s.real_name}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      submitted ? 'bg-active/10 text-active' : 'bg-ink/5 text-ink/40'
                    }`}
                  >
                    {submitted ? t('submitted') : t('notSubmitted')}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      graded ? 'bg-brand-50 text-brand-600' : 'bg-ink/5 text-ink/40'
                    }`}
                  >
                    {graded ? t('graded') : t('notGraded')}
                  </span>
                </div>
                {submitted && (
                  <button
                    onClick={() => onOpenFile(answer.answer_file_url)}
                    className="mt-1 flex items-center gap-1 text-xs text-brand-600 hover:underline"
                  >
                    <Paperclip size={11} /> {answer.answer_file_name || t('studentAnswerDefault')}
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                max={examMaxScore}
                defaultValue={answer.score ?? ''}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== '' && Number(val) !== answer.score) {
                    onSetScore(s.id, Number(val), answer.feedback ?? null);
                  }
                }}
                placeholder={t('scorePlaceholder')}
                className="w-24 rounded-lg border border-ink/10 px-3 py-1.5 text-right text-sm"
              />
            </div>
            {graded && (
              <input
                key={`${s.id}-${answer.feedback || ''}`}
                defaultValue={answer.feedback || ''}
                onBlur={(e) => {
                  if (e.target.value !== (answer.feedback || '')) {
                    onSetScore(s.id, answer.score, e.target.value || null);
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
