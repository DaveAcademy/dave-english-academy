// ExamResultsView.jsx
// Read-only counterpart to ExamGradingRoster for a Completed/Closed exam -
// same roster/card layout and status pills, but scores and feedback render
// as plain text instead of live-editable inputs, so a closed exam doesn't
// look like it's still waiting on the teacher. No score writes happen here;
// grading a closed exam again requires the caller to explicitly switch to
// ExamGradingRoster (see Exams.jsx's "Edit grades" toggle).

import { Paperclip } from 'lucide-react';

// Stats are derived from the already-loaded students/answerOf data passed in
// by the caller - no new query. `students` here is the full eligible roster
// for the exam (not filtered), so the header reflects the whole class even
// if a status filter is narrowing the list below it.
function StatsHeader({ examMaxScore, students, answerOf, t }) {
  const scores = students.map((s) => answerOf(s.id).score).filter((sc) => sc != null);
  const total = students.length;
  const graded = scores.length;
  const average = graded ? (scores.reduce((sum, sc) => sum + sc, 0) / graded).toFixed(1) : null;
  const highest = graded ? Math.max(...scores) : null;
  const lowest = graded ? Math.min(...scores) : null;
  const stat = (label, value) => (
    <div className="flex-1 min-w-[6rem] rounded-xl bg-white p-3 text-center shadow-card">
      <p className="text-lg font-bold text-ink">{value ?? '—'}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">{label}</p>
    </div>
  );
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {stat(t('statsTotal'), total)}
      {stat(t('statsGraded'), `${graded}/${total}`)}
      {stat(t('statsAverage'), average != null ? `${average} / ${examMaxScore}` : null)}
      {stat(t('statsHighest'), highest != null ? `${highest} / ${examMaxScore}` : null)}
      {stat(t('statsLowest'), lowest != null ? `${lowest} / ${examMaxScore}` : null)}
    </div>
  );
}

export default function ExamResultsView({ examMaxScore, students, allStudents, answerOf, onOpenFile, t }) {
  return (
    <div>
      <StatsHeader examMaxScore={examMaxScore} students={allStudents || students} answerOf={answerOf} t={t} />
      <div className="space-y-2">
      {students.map((s) => {
        const answer = answerOf(s.id);
        const hasFile = !!answer.answer_file_url;
        const graded = answer.score != null;
        // This is a read-only summary of a closed exam: whether a file was
        // uploaded is not meaningful here (Oral/Speaking exams never have
        // one - see MyExams.jsx - and a Written student can still be graded
        // without one), so the only status that matters is graded/not
        // graded, shown via the score column on the right. A file link is
        // still shown whenever one exists, purely as a convenience to open
        // it - it's not a status claim.
        return (
          <div key={s.id} className="rounded-xl bg-white p-3 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-semibold text-ink">{s.real_name}</p>
                  {!graded && (
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold text-ink/40">
                      {t('notGraded')}
                    </span>
                  )}
                </div>
                {hasFile && (
                  <button
                    onClick={() => onOpenFile(answer.answer_file_url)}
                    className="mt-1 flex items-center gap-1 text-xs text-brand-600 hover:underline"
                  >
                    <Paperclip size={11} /> {answer.answer_file_name || t('studentAnswerDefault')}
                  </button>
                )}
                {answer.feedback && <p className="mt-1 text-xs text-ink/60">{answer.feedback}</p>}
              </div>
              <p className="flex-shrink-0 text-sm font-bold text-brand-600">
                {graded ? t('scoreOutOfMax', { score: answer.score, max: examMaxScore }) : t('notGraded')}
              </p>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
