// ExamResultsView.jsx
// Read-only counterpart to ExamGradingRoster for a Completed/Closed exam -
// same roster/card layout and status pills, but scores and feedback render
// as plain text instead of live-editable inputs, so a closed exam doesn't
// look like it's still waiting on the teacher. No score writes happen here;
// grading a closed exam again requires the caller to explicitly switch to
// ExamGradingRoster (see Exams.jsx's "Edit grades" toggle).

import { Paperclip } from 'lucide-react';

export default function ExamResultsView({ examMaxScore, students, answerOf, onOpenFile, t }) {
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
                </div>
                {submitted && (
                  <button
                    onClick={() => onOpenFile(answer.answer_file_url)}
                    className="mt-1 flex items-center gap-1 text-xs text-brand-500 hover:underline"
                  >
                    <Paperclip size={11} /> {answer.answer_file_name || t('studentAnswerDefault')}
                  </button>
                )}
                {answer.feedback && <p className="mt-1 text-xs text-ink/60">{answer.feedback}</p>}
              </div>
              <p className="flex-shrink-0 text-sm font-bold text-brand-500">
                {graded ? t('scoreOutOfMax', { score: answer.score, max: examMaxScore }) : t('notGraded')}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
