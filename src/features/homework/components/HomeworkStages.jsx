// HomeworkStages.jsx
// Interactive four-stage homework (Vocabulary, Grammar, Practice, Review)
// for ONE standard lesson-homework row. Read-only until the student submits;
// answers persist in homework_answers, auto-graded where the question has an
// explicit key, otherwise left for teacher review. Points stay manual.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, BookOpen, PenTool, Target, Sparkles, Lock } from 'lucide-react';
import {
  listHomeworkStages,
  listHomeworkQuestions,
  listHomeworkAnswers,
  submitHomeworkAnswer,
  getHomeworkStageProgress,
  ensureHomeworkStageProgress,
  checkHomeworkStageCompletion,
  autoGradeHomeworkAnswerById,
} from '../../../lib/db';
import QuestionRenderer from './QuestionRenderer';
import { initialActiveStageId } from '../../../lib/homeworkStageSelect';

const STAGE_META = {
  vocabulary: { icon: BookOpen, iconClass: 'text-brand-500', label: 'Vocabulary' },
  grammar: { icon: PenTool, iconClass: 'text-amber-500', label: 'Grammar' },
  practice: { icon: Target, iconClass: 'text-emerald-500', label: 'Practice' },
  review: { icon: Sparkles, iconClass: 'text-violet-500', label: 'Review' },
};

export function HomeworkStages({ homeworkId, studentId, focusStageKey }) {
  const { t } = useTranslation(['homework']);
  const [stages, setStages] = useState([]);
  const [stageProgress, setStageProgress] = useState({});
  const [questions, setQuestions] = useState({});
  const [answers, setAnswers] = useState({});
  const [activeStage, setActiveStage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Latest requested focus stage, mirrored for the async loader below.
  // Read (not a dep) so a stage-button click never triggers a full reload —
  // the focus effect handles post-load activation without refetching.
  const focusKeyRef = useRef(focusStageKey);
  useEffect(() => {
    focusKeyRef.current = focusStageKey;
  }, [focusStageKey]);

  const loadData = useCallback(async () => {
    if (!homeworkId || !studentId) return;
    setLoading(true);
    setError(null);
    try {
      // Progress rows must exist before get/check can work.
      await ensureHomeworkStageProgress(homeworkId, studentId);
      const [stagesData, progressData] = await Promise.all([
        listHomeworkStages(homeworkId),
        getHomeworkStageProgress(homeworkId, studentId),
      ]);
      const list = stagesData || [];
      setStages(list);
      const progressMap = {};
      for (const p of Array.isArray(progressData) ? progressData : []) {
        if (p && p.stage_id != null) progressMap[p.stage_id] = p;
      }
      setStageProgress(progressMap);

      const qMap = {};
      for (const s of list) {
        try {
          qMap[s.id] = await listHomeworkQuestions(s.id);
        } catch {
          qMap[s.id] = [];
        }
      }
      setQuestions(qMap);

      const aMap = {};
      for (const s of list) {
        for (const q of qMap[s.id] || []) {
          try {
            const rows = await listHomeworkAnswers(studentId, q.id);
            if (rows && rows.length > 0) aMap[q.id] = rows[0];
          } catch {
            /* leave unanswered */
          }
        }
      }
      setAnswers(aMap);

      // Initial selection honors the requested focus stage when usable;
      // otherwise first unlocked incomplete, else first incomplete.
      // (A bare firstIncomplete pick could land on a locked stage and leave
      // the just-opened panel collapsed with no visible questions.)
      setActiveStage(initialActiveStageId(list, progressMap, focusKeyRef.current));
    } catch (e) {
      setError('Could not load practice questions.');
    } finally {
      setLoading(false);
    }
  }, [homeworkId, studentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadData();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  // When the parent asks to focus a specific stage (e.g. a "Quizzes" button
  // clicked on the lesson card), activate it once its data is loaded — but
  // respect locking; a locked stage is never opened early. Each key is applied
  // once, so later user-driven stage changes are not overridden on re-render.
  const appliedFocusRef = useRef(null);
  // A different homework row is a fresh context — allow its focus key to
  // apply even if an identical key was consumed for the previous homework.
  useEffect(() => {
    appliedFocusRef.current = null;
  }, [homeworkId]);
  useEffect(() => {
    if (!focusStageKey || stages.length === 0 || appliedFocusRef.current === focusStageKey) return;
    const target = stages.find((s) => s.stage_key === focusStageKey);
    if (target && stageProgress[target.id]?.status !== 'locked') {
      setActiveStage(target.id);
    }
    appliedFocusRef.current = focusStageKey;
  }, [focusStageKey, stages, stageProgress]);

  const handleAnswer = useCallback(
    async (questionId, answerData) => {
      if (!studentId) return;
      setSubmitting(true);
      setError(null);
      try {
        const saved = await submitHomeworkAnswer(studentId, questionId, answerData);
        setAnswers((prev) => ({ ...prev, [questionId]: saved }));
        try {
          await autoGradeHomeworkAnswerById(saved.id);
        } catch {
          /* manual-grade types return false — keep submitted state */
        }
        try {
          const rows = await listHomeworkAnswers(studentId, questionId);
          if (rows && rows.length > 0) setAnswers((prev) => ({ ...prev, [questionId]: rows[0] }));
        } catch {
          /* keep optimistic row */
        }
        const question = Object.values(questions).flat().find((q) => q.id === questionId);
        if (question) {
          const completed = await checkHomeworkStageCompletion(homeworkId, studentId, question.stage_id);
          const progress = await getHomeworkStageProgress(homeworkId, studentId);
          const progressMap = {};
          for (const p of Array.isArray(progress) ? progress : []) {
            if (p && p.stage_id != null) progressMap[p.stage_id] = p;
          }
          setStageProgress(progressMap);
          if (completed) {
            const current = stages.find((s) => s.id === question.stage_id);
            const next = stages.find((s) => s.stage_number === (current?.stage_number ?? 0) + 1);
            if (next) setActiveStage(next.id);
          }
        }
      } catch (e) {
        setError('Could not save your answer. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [studentId, homeworkId, questions, stages]
  );

  if (loading) return <p className="py-4 text-center text-sm text-ink/40">Loading practice questions…</p>;
  if (error && stages.length === 0) return <p className="py-4 text-center text-sm text-ink/40">{error}</p>;
  if (stages.length === 0) return <p className="py-4 text-center text-sm text-ink/40">No homework stages for this lesson yet.</p>;

  // Non-required stages with no questions carry no content — hide them
  // instead of showing a dead tile. Required-but-empty stages stay visible
  // with an honest empty state.
  const visibleStages = stages.filter((s) => (questions[s.id] || []).length > 0 || s.is_required !== false);
  const allCompleted =
    visibleStages.length > 0 && visibleStages.every((s) => stageProgress[s.id]?.status === 'completed');
  const answeredTotal = visibleStages.reduce((n, s) => n + (questions[s.id] || []).length, 0);
  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.values(answers).filter((a) => a && a.is_correct === true).length;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs font-semibold text-inactive">{error}</p>}
      {visibleStages.map((stage) => {
        const meta = STAGE_META[stage.stage_key] || { icon: BookOpen, iconClass: 'text-ink/40', label: stage.title };
        // Prefer the DB display title (Vocabulary → Sentences → Quizzes → Review); key map is fallback only.
        const stageLabel = stage.title || meta.label;
        const StageIcon = meta.icon;
        const progress = stageProgress[stage.id] || {};
        const status = progress.status || 'not_started';
        const stageQuestions = questions[stage.id] || [];
        const isActive = activeStage === stage.id;
        const isLocked = status === 'locked';
        const isCompleted = status === 'completed';
        const isReview = stage.stage_key === 'review';
        const answeredCount = stageQuestions.filter((q) => answers[q.id]).length;
        return (
          <div
            key={stage.id}
            className={`rounded-xl border bg-white p-3 shadow-card sm:p-4 ${
              isActive
                ? isReview
                  ? 'border-violet-300 ring-2 ring-violet-100'
                  : 'border-brand-300 ring-2 ring-brand-100'
                : isCompleted
                  ? 'border-active/20'
                  : 'border-ink/10'
            } ${isLocked ? 'opacity-70' : ''}`}
          >
            <button
              onClick={() => !isLocked && setActiveStage(isActive ? null : stage.id)}
              disabled={isLocked}
              className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
            >
              <span className="flex min-w-0 items-center gap-2">
                {isLocked ? <Lock size={16} className="shrink-0 text-ink/30" /> : <StageIcon size={18} className={`shrink-0 ${meta.iconClass}`} />}
                <span className="min-w-0">
                  <span className="block truncate font-display text-[15px] font-bold text-ink">{stageLabel}</span>
                  <span className="block text-xs text-ink/45">
                    {isLocked ? 'Locked — finish the previous stage' : isCompleted ? 'Completed' : `${answeredCount}/${stageQuestions.length} answered`}
                  </span>
                </span>
              </span>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
                isCompleted ? 'bg-active/10 text-active ring-active/20'
                : isLocked ? 'bg-ink/5 text-ink/40 ring-ink/10'
                : 'bg-brand-50 text-brand-700 ring-brand-100'
              }`}>
                {isCompleted && <CheckCircle2 size={11} />}
                {isLocked ? 'Locked' : isCompleted ? 'Done' : status === 'in_progress' ? 'In progress' : 'Start'}
              </span>
            </button>
            {isReview && !isCompleted && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-violet-600">
                <Sparkles size={12} aria-hidden /> {t('reviewFinalNote')}
              </p>
            )}
            {!isLocked && isActive && (
              <div className="mt-3 space-y-4 border-t border-ink/5 pt-3">
                {stageQuestions.length === 0 ? (
                  <p className="py-2 text-center text-sm text-ink/40">Questions for this stage are coming soon.</p>
                ) : (
                  stageQuestions.map((q) => (
                    <div key={q.id} className="rounded-lg border border-ink/[0.06] bg-paper/40 p-3">
                      <p className="mb-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-ink">{q.question_text}</p>
                      <QuestionRenderer
                        question={q}
                        savedAnswer={answers[q.id] || null}
                        onSubmit={handleAnswer}
                        submitting={submitting}
                      />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
      {visibleStages.length === 1 && visibleStages[0].stage_key === 'vocabulary' && (
        <p className="text-center text-xs text-ink/45">Sentences, Quizzes, and Review are not available for this lesson yet.</p>
      )}
      {allCompleted && (
        <div className="rounded-xl border border-active/20 bg-active/5 p-4 text-center">
          <CheckCircle2 size={22} className="mx-auto text-active" />
          <p className="mt-1 font-display text-base font-bold text-ink">Lesson practice complete!</p>
          <p className="mt-0.5 text-xs font-semibold tabular-nums text-ink/60">
            {t('completedDetail', { correct: correctCount, answered: answeredCount })}
            {answeredTotal > 0 ? ` · ${answeredCount}/${answeredTotal}` : ''}
          </p>
          <p className="mt-1 text-xs text-ink/55">{t('completedNext')}</p>
          <p className="text-xs text-ink/55">Great job — your teacher reviews written answers manually.</p>
        </div>
      )}
    </div>
  );
}

export default HomeworkStages;
