// HomeworkAnswerReview.jsx
// Teacher/admin review queue for homework Q&A answers that need a human
// decision (auto-grade returned NULL) plus recent manual grades. Reads and
// writes ONLY the existing homework_answers columns via storageBridge
// (listHomeworkAnswersForReview / gradeHomeworkAnswer). No new tables,
// RPCs, or policies; no points are awarded here (manual points stay in the
// existing award flow).

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import { listHomeworkAnswersForReview, gradeHomeworkAnswer } from '../../../lib/db';

const STAGE_LABEL = { vocabulary: 'Vocabulary', grammar: 'Grammar', practice: 'Practice', review: 'Review' };

function flatten(row) {
  const q = row.homework_questions || {};
  const stage = q.homework_stages || {};
  const hw = stage.homework || {};
  const lesson = hw.lessons || {};
  const num = lesson.curriculum_lessons?.lesson_number;
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.students?.real_name || '—',
    lessonRef: num != null ? `#${num}` : '',
    lessonTitle: lesson.topic || lesson.curriculum_lessons?.title || hw.title || '',
    homeworkId: hw.id,
    stageId: stage.id,
    stageLabel: STAGE_LABEL[stage.stage_key] || stage.title || 'Stage',
    questionId: q.id,
    questionType: q.question_type,
    questionText: q.question_text || '',
    questionData: q.question_data || {},
    explanation: q.explanation || '',
    answerData: row.answer_data || {},
    isCorrect: row.is_correct,
    autoGraded: row.auto_graded,
    submittedAt: row.submitted_at,
  };
}

function answerSummary(item) {
  const d = item.answerData;
  const qd = item.questionData;
  switch (item.questionType) {
    case 'multiple_choice': {
      const idx = d.selected_index;
      const opts = qd.options || [];
      return idx != null && opts[idx] != null ? `${idx + 1}. ${opts[idx]}` : '—';
    }
    case 'matching':
      return Array.isArray(d.pairs) && d.pairs.length > 0
        ? d.pairs.map((p) => `${(qd.left || [])[p[0]] ?? '?'} ↔ ${(qd.right || [])[p[1]] ?? '?'}`).join(' · ')
        : '—';
    case 'ordering':
      return Array.isArray(d.order) && d.order.length > 0
        ? d.order.map((i) => (qd.items || [])[i]).join(' ')
        : '—';
    case 'sentence_creation':
      return d.sentence || '—';
    case 'reading_comprehension':
      return Array.isArray(d.answers) && d.answers.length > 0
        ? d.answers.map((a) => a?.answer || '—').join(' · ')
        : '—';
    default:
      return d.answer || '—';
  }
}

function expectedSummary(item) {
  const qd = item.questionData;
  switch (item.questionType) {
    case 'multiple_choice': {
      const idx = qd.correct_index;
      return idx != null && (qd.options || [])[idx] != null ? `${idx + 1}. ${qd.options[idx]}` : '—';
    }
    case 'matching':
      return Array.isArray(qd.correct_pairs)
        ? qd.correct_pairs.map((p) => `${(qd.left || [])[p[0]] ?? '?'} ↔ ${(qd.right || [])[p[1]] ?? '?'}`).join(' · ')
        : '—';
    case 'translation':
      return qd.target_text || '—';
    case 'fill_blank':
      return qd.answer || '—';
    default:
      return '';
  }
}

function StatusPill({ isCorrect }) {
  if (isCorrect === true)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
        <CheckCircle2 size={11} /> Correct
      </span>
    );
  if (isCorrect === false)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600 ring-1 ring-red-100">
        <XCircle size={11} /> Incorrect
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
      <Clock size={11} /> Pending review
    </span>
  );
}

export default function HomeworkAnswerReview({ callerIsStaff }) {
  const [pending, setPending] = useState([]);
  const [graded, setGraded] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [gradingId, setGradingId] = useState(null);
  const [showGraded, setShowGraded] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pend, all] = await Promise.all([
        listHomeworkAnswersForReview({ pendingOnly: true, limit: 200 }),
        listHomeworkAnswersForReview({ pendingOnly: false, limit: 200 }),
      ]);
      setPending((pend || []).map(flatten));
      setGraded((all || []).filter((r) => r.is_correct != null).map(flatten).slice(0, 30));
    } catch (e) {
      setError('Could not load answers for review.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const handleGrade = async (item, isCorrect) => {
    if (!callerIsStaff || gradingId) return;
    setGradingId(item.id);
    setError(null);
    try {
      await gradeHomeworkAnswer({
        answerId: item.id,
        isCorrect,
        homeworkId: item.homeworkId,
        studentId: item.studentId,
        stageId: item.stageId,
        callerIsStaff: true,
      });
      await reload();
    } catch (e) {
      setError(e.message || 'Could not save the decision.');
    } finally {
      setGradingId(null);
    }
  };

  const renderRow = (item, isPendingList) => {
    const open = openId === item.id;
    return (
      <div key={item.id} className="rounded-xl border border-ink/10 bg-white shadow-card">
        <button
          onClick={() => setOpenId(open ? null : item.id)}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-ink">
              {item.studentName} <span className="font-medium text-ink/40">· {item.lessonRef} {item.lessonTitle}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-ink/50">
              {item.stageLabel} · {item.questionText}
            </span>
          </span>
          <StatusPill isCorrect={item.isCorrect} />
          {open ? <ChevronDown size={15} className="shrink-0 text-ink/40" /> : <ChevronRight size={15} className="shrink-0 text-ink/40" />}
        </button>
        {open && (
          <div className="space-y-2 border-t border-ink/5 px-3 py-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Question</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{item.questionText}</p>
            </div>
            <div className="rounded-lg bg-paper/60 px-3 py-2 ring-1 ring-ink/[0.04]">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Student answer</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm font-medium leading-relaxed text-ink">{answerSummary(item)}</p>
            </div>
            {expectedSummary(item) && (
              <div className="rounded-lg bg-brand-50/60 px-3 py-2 ring-1 ring-brand-100">
                <p className="text-[11px] font-bold uppercase tracking-wide text-brand-700/70">Expected</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-brand-800">{expectedSummary(item)}</p>
              </div>
            )}
            {item.explanation && <p className="text-xs text-ink/45">{item.explanation}</p>}
            {callerIsStaff && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => handleGrade(item, true)}
                  disabled={gradingId === item.id}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-active px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} /> {isPendingList ? 'Mark correct' : 'Change to correct'}
                </button>
                <button
                  onClick={() => handleGrade(item, false)}
                  disabled={gradingId === item.id}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-inactive px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <XCircle size={14} /> {isPendingList ? 'Mark incorrect' : 'Change to incorrect'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink/50">Written answers — manual review</h2>
      <p className="mb-2 text-xs text-ink/50">
        Answers the auto-grader could not decide. Mark each correct or incorrect — the student sees the result
        immediately and stage progress updates. No points are awarded here; use the existing award flow for points.
      </p>
      {loading && <p className="text-xs text-ink/40">Loading answers…</p>}
      {error && <p className="mb-2 text-xs font-semibold text-inactive">{error}</p>}
      {!loading && pending.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-ink/50 shadow-card">
          <Inbox size={15} className="text-ink/30" /> Nothing awaiting review.
        </div>
      ) : (
        <div className="space-y-2">{pending.map((item) => renderRow(item, true))}</div>
      )}
      {graded.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowGraded((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
          >
            {showGraded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Recently reviewed ({graded.length})
          </button>
          {showGraded && <div className="mt-2 space-y-2">{graded.map((item) => renderRow(item, false))}</div>}
        </div>
      )}
    </div>
  );
}
