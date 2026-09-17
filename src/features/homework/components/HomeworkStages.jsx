// HomeworkStages.jsx
// 4-Stage Homework UI: Vocabulary, Grammar, Practice, Review

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2, X, ChevronUp, ChevronDown, Languages,
  BookOpen, PenTool, Target, Sparkles, List, MessageSquare,
  PenSquare, ChevronLeft, ChevronRight, Mic, Keyboard, Eye, EyeOff
} from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { useAuth } from '../../../lib/AuthContext';
import {
  listHomeworkStages,
  listHomeworkQuestions,
  submitHomeworkAnswer,
  getHomeworkStageProgress,
  ensureHomeworkStageProgress,
  checkHomeworkStageCompletion,
  autoGradeHomeworkAnswerById,
} from '../../../lib/db';
import { StageContent, QuestionRenderer, STAGE_CONFIG, STAGE_ORDER } from './QuestionRenderer';

export function HomeworkStages({ homeworkId, lessonId, isStudent, me, t }) {
  const { session } = useAuth();
  const { students } = useAcademy();
  const studentId = me?.id;
  const [stages, setStages] = useState([]);
  const [stageProgress, setStageProgress] = useState({});
  const [questions, setQuestions] = useState({});
  const [answers, setAnswers] = useState({});
  const [activeStage, setActiveStage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!homeworkId) return;
    setLoading(true);
    try {
      const [stagesData, progressData] = await Promise.all([
        listHomeworkStages(homeworkId),
        getHomeworkStageProgress(homeworkId, studentId),
      ]);
      setStages(stagesData || []);
      const progressMap = {};
      (progressData || []).forEach(p => { progressMap[p.stage_id] = p; });
      setStageProgress(progressMap);

      const questionsData = await Promise.all(
        (stagesData || []).map(s => listHomeworkQuestions(s.id))
      );
      const questionsMap = {};
      stagesData.forEach((s, i) => { questionsMap[s.id] = questionsData[i] || []; });
      setQuestions(questionsMap);

      if (studentId) {
        const stagesWithQuestions = stagesData.flatMap(s =>
          (questionsMap[s.id] || []).map(q => ({ stageId: s.id, question: q }))
        );
        for (const { stageId, question } of stagesWithQuestions) {
          const ans = await listHomeworkAnswers(studentId, question.id);
          if (ans.length > 0) {
            setAnswers(prev => ({ ...prev, [question.id]: ans[0] }));
          }
        }
      }

      const firstIncomplete = stagesData.find(s => {
        const p = progressMap[s.id];
        return p && p.status !== 'completed';
      }) || stagesData[0];
      setActiveStage(firstIncomplete?.id || null);
    } catch (e) {
      console.error('Failed to load homework stages:', e);
    } finally {
      setLoading(false);
    }
  }, [homeworkId, studentId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAnswer = useCallback(async (questionId, answerData) => {
    if (!studentId) return;
    setSubmitting(true);
    try {
      const saved = await submitHomeworkAnswer(studentId, questionId, answerData);
      setAnswers(prev => ({ ...prev, [questionId]: saved }));

      await autoGradeHomeworkAnswerById(saved.id);

      const graded = await listHomeworkAnswers(studentId, questionId);
      if (graded.length > 0) {
        setAnswers(prev => ({ ...prev, [questionId]: graded[0] }));
      }

      const question = Object.values(questions).flat().find(q => q.id === questionId);
      if (question) {
        const completed = await checkHomeworkStageCompletion(homeworkId, studentId, question.stage_id);
        if (completed) {
          const progress = await getHomeworkStageProgress(homeworkId, studentId);
          const progressMap = {};
          progress.forEach(p => { progressMap[p.stage_id] = p; });
          setStageProgress(progressMap);

          const currentStage = stages.find(s => s.id === question.stage_id);
          const nextStage = stages.find(s => s.stage_number === currentStage.stage_number + 1);
          if (nextStage) {
            setActiveStage(nextStage.id);
          }
        }
      }
    } catch (e) {
      console.error('Failed to submit answer:', e);
    } finally {
      setSubmitting(false);
    }
  }, [studentId, homeworkId, questions, stages]);

  if (loading) return <div className="text-center py-8 text-ink/40">Loading...</div>;
  if (!stages.length) return <div className="text-center text-ink/40 py-8">No stages found</div>;

  const stageComponents = stages.map(stage => {
    const config = STAGE_CONFIG[stage.stage_key];
    const progress = stageProgress[stage.id];
    const stageQuestions = questions[stage.id] || [];
    const isActive = activeStage === stage.id;
    const isLocked = progress?.status === 'locked';
    const isCompleted = progress?.status === 'completed';
    const isCurrent = progress?.status === 'in_progress';

    const answeredCount = stageQuestions.filter(q => answers[q.id]).length;
    const totalCount = stageQuestions.length;

    const stageContent = stageQuestions.length === 0 ? (
      <p className="text-sm text-ink/40 text-center py-4">No questions yet for this stage</p>
    ) : (
      <div className="space-y-3">
        {stageQuestions.map(question => (
          <div
            key={question.id}
            className="space-y-3 p-3 rounded-lg border border-ink/10 bg-white"
          >
            <p className="text-sm font-medium text-ink/70">
              {question.question_text}
            </p>
            <div className="text-sm text-ink/50">
              Question type: {question.question_type}
            </div>
          </div>
        ))}
      </div>
      ))

    const stageClassName = (
      'rounded-xl border bg-white p-4 shadow-card transition-all duration-300 ' +
      (isActive ? 'ring-2 ring-brand-400 border-brand-300' :
       isLocked ? 'opacity-50 border-ink/10' :
       isCompleted ? 'border-emerald-200 bg-emerald-50' :
       'border-ink/10')
    );

    return (
      <div
        key={stage.id}
        className={stageClassName}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <config.icon size={20} className={`text-${config.color}-500`} />
            <div>
              <h3 className="font-display text-lg font-bold text-ink">{config.label}</h3>
              <p className="text-xs text-ink/50">{config.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
              isLocked ? 'bg-ink/5 text-ink/40' :
              isCompleted ? 'bg-emerald-100 text-emerald-700' :
              isCurrent ? 'bg-brand-100 text-brand-700' :
              'bg-ink/5 text-ink/50'
            }`}>
              {isLocked ? <span className="text-[10px]">🔒</span> :
               isCompleted ? <CheckCircle2 size={11} /> :
               isCurrent ? <span className="text-[10px]">▶</span> :
               <span className="text-[10px]">⏳</span>}
              <span className="text-xs font-bold">
                {isLocked ? 'Locked' : isCompleted ? 'Completed' : isCurrent ? 'In Progress' : 'Not Started'}
              </span>
            </span>
            <span className="text-xs text-ink/50">{answeredCount}/{totalCount}</span>
          </div>
        </div>

{!isLocked && (
           <div className={`space-y-3 ${!isActive ? 'hidden' : ''}`}>
             {stageQuestions.length === 0 ? (
               <p className="text-sm text-ink/40 text-center py-4">No questions yet for this stage</p>
             ) : (
               <div className="space-y-3">
                 {stageQuestions.map(question => (
                   <div
                     key={question.id}
                     className="space-y-3 p-3 rounded-lg border border-ink/10 bg-white"
                   >
                     <QuestionRenderer
                       question={question}
                       answer={answers[question.id]}
                       studentId={studentId}
                       onAnswer={handleAnswer}
                       isSubmitting={submitting}
                       t={t}
                     />
                   </div>
                 ))}
               </div>
             )}
           </div>
         </div>
       );
    });

  return (
    <div className="space-y-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Homework: {homework?.title}</h2>
        <div className="text-xs text-ink/50">
          Due: {homework?.due_date ? new Date(homework.due_date).toLocaleDateString() : '—'}
        </div>
      </div>

      <div className="space-y-3">
        {stageComponents}
      </div>

      {stages.every(s => stageProgress[s.id]?.status === 'completed') && (
        <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
          <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-2" />
          <p className="font-display text-lg font-bold text-emerald-800">Homework Completed!</p>
          <p className="mt-1 text-sm text-emerald-700">All 4 stages completed. Great job!</p>
        </div>
      )}
    </div>
  );
}

export default HomeworkStages;