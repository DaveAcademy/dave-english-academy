// LessonWorkReviewRoster.jsx
// Pure display/input component for reviewing one lesson's practice-work
// submissions against the student roster - same shape as
// HomeworkGradingRoster.jsx, but for lesson_work_submissions. No business
// logic here: review/points writes go through the callbacks the caller
// (LessonHub.jsx) already wires to storageBridge.js.

import { Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';

export default function LessonWorkReviewRoster({
  students, submissionOf, filesOf, onOpenFile, onMarkReviewed, onAwardPoints, defaultPoints,
}) {
  return (
    <div className="space-y-2">
      {students.map((s) => (
        <RosterRow
          key={s.id}
          student={s}
          submission={submissionOf(s.id)}
          files={submissionOf(s.id) ? filesOf(submissionOf(s.id).id) : []}
          onOpenFile={onOpenFile}
          onMarkReviewed={onMarkReviewed}
          onAwardPoints={onAwardPoints}
          defaultPoints={defaultPoints}
        />
      ))}
    </div>
  );
}

function RosterRow({ student, submission, files, onOpenFile, onMarkReviewed, onAwardPoints, defaultPoints }) {
  const [feedback, setFeedback] = useState(submission?.feedback || '');
  const [points, setPoints] = useState(defaultPoints);
  const [busy, setBusy] = useState(false);

  const state = !submission ? 'notSubmitted' : submission.points_awarded != null ? 'awarded' : submission.status === 'reviewed' ? 'reviewed' : 'needsReview';

  const handleAward = async () => {
    setBusy(true);
    try {
      await onAwardPoints(submission, student, Number(points), feedback || null);
    } finally {
      setBusy(false);
    }
  };

  const handleMarkReviewedOnly = async () => {
    setBusy(true);
    try {
      await onMarkReviewed(submission, feedback || null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-white p-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold text-ink">{student.real_name}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                state === 'awarded'
                  ? 'bg-brand-50 text-brand-600'
                  : state === 'reviewed'
                  ? 'bg-active/10 text-active'
                  : state === 'needsReview'
                  ? 'bg-active/10 text-active'
                  : 'bg-ink/5 text-ink/40'
              }`}
            >
              {state === 'awarded'
                ? `Reviewed · +${submission.points_awarded}`
                : state === 'reviewed'
                ? 'Reviewed'
                : state === 'needsReview'
                ? 'Needs review'
                : 'Not submitted'}
            </span>
          </div>
          {files.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <button
                  key={f.id}
                  onClick={() => onOpenFile(f.file_url)}
                  className="flex items-center gap-1 text-xs text-brand-500 hover:underline"
                >
                  <ImageIcon size={11} /> Image {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        {submission && submission.points_awarded == null && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-16 rounded-lg border border-ink/10 px-2 py-1.5 text-right text-sm"
            />
            <button
              onClick={handleAward}
              disabled={busy || !points}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              Award points
            </button>
          </div>
        )}
      </div>

      {submission && submission.points_awarded == null && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Feedback (optional)"
            className="w-full rounded-lg border border-ink/10 px-3 py-1.5 text-sm"
          />
          {submission.status !== 'reviewed' && (
            <button
              onClick={handleMarkReviewedOnly}
              disabled={busy}
              className="whitespace-nowrap rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5 disabled:opacity-60"
            >
              Mark reviewed
            </button>
          )}
        </div>
      )}
      {submission?.feedback && submission.points_awarded != null && (
        <p className="mt-2 text-xs text-ink/50">Feedback: {submission.feedback}</p>
      )}
    </div>
  );
}
