// QuestionRenderer.jsx
// Renders a single homework question based on its type

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2, X, ChevronUp, ChevronDown, Languages,
  BookOpen, PenTool, Target, Sparkles, List, MessageSquare,
  PenSquare, ChevronLeft, ChevronRight, Mic, Keyboard, Eye, EyeOff
} from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { useAuth } from '../../../lib/AuthContext';
import {
  listHomeworkQuestions,
  submitHomeworkAnswer,
  getHomeworkStageProgress,
  ensureHomeworkStageProgress,
  checkHomeworkStageCompletion,
  autoGradeHomeworkAnswerById,
  listHomeworkAnswers,
} from '../../../lib/db';

const STAGE_CONFIG = {
  vocabulary: { icon: BookOpen, label: 'Vocabulary', color: 'brand', subtitle: 'Vocabulary practice' },
  grammar: { icon: PenTool, label: 'Grammar', color: 'amber', subtitle: 'Grammar structures' },
  practice: { icon: Target, label: 'Practice', color: 'emerald', subtitle: 'Practice tasks' },
  review: { icon: Sparkles, label: 'Review', color: 'violet', subtitle: 'Review & quiz' },
};

const QUESTION_TYPE_CONFIG = {
  multiple_choice: { icon: List, label: 'Multiple Choice' },
  matching: { icon: MessageSquare, label: 'Matching' },
  fill_blank: { icon: PenSquare, label: 'Fill in the Blank' },
  translation: { icon: Languages, label: 'Translation' },
  sentence_creation: { icon: PenTool, label: 'Sentence Creation' },
  short_answer: { icon: MessageSquare, label: 'Short Answer' },
  ordering: { icon: List, label: 'Ordering' },
  reading_comprehension: { icon: BookOpen, label: 'Reading Comprehension' },
};

const STAGE_ORDER = ['vocabulary', 'grammar', 'practice', 'review'];

function QuestionRenderer({ question, answer, studentId, onAnswer, isSubmitting, isReview, autoGrade, t }) {
  if (!studentId) return null;
  if (!question) return null;

  const [submitting, setSubmitting] = useState(false);
  const [graded, setGraded] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [showResult, setShowResult] = useState(false);

  // Connect grading result to UI - read is_correct from answer data
  useEffect(() => {
    if (!studentId || !question || !answer) return;

    // Objectively auto-graded types: multiple_choice, matching, fill_blank, translation, ordering
    if (answer?.answer_data?.is_correct !== undefined) {
      setCorrect(answer?.answer_data?.is_correct);
      setShowResult(true);
    } else if (
      // Subjectively manually-graded types: sentence_creation, short_answer, reading_comprehension
      // These have is_correct === undefined from the backend
      answer?.answer_data?.is_correct === undefined &&
      showResult === false
    ) {
      // Show "submitted for manual grading" for subjective types
      setShowResult(true);
    }
  }, [answer, studentId]);

  // Render based on question type
  switch (question.question_type) {
case 'matching': {
      const left = question.question_data?.left || [];
      const right = question.question_data?.right || [];
      const correctPairs = question.question_data?.correct_pairs || [];

      if (left.length === 0 || right.length === 0) {
        return (
          <p className="text-sm text-ink/40 text-center py-4">No matching items defined</p>
        );
      }

      // Build UI: students click left then right to create pairs
      const selectedLeft = answer?.answer_data?.selected_left;
      const selectedRight = answer?.answer_data?.selected_right;

      return (
        <div className="space-y-3">
          {/* Left items */}
          <div className="space-y-2">
            {left.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  selectedLeft === idx
                    ? 'bg-brand-50 text-brand-700 ring-brand-100' :
                    'bg-ink/5 text-ink/60'
                }`}
                onClick={() => {
                  if (!submitting) {
                    setAnswers(prev => ({
                      ...prev,
                      [question.id]: {
                        ...prev[question.id]?.answer_data,
                        answer_data: {
                          ...prev[question.id]?.answer_data?.answer_data,
                          selected_left: selectedLeft === idx ? null : idx,
                        },
                      },
                    }));
                    onAnswer(question.id, {
                      answer_data: {
                        ...prev[question.id]?.answer_data?.answer_data,
                        selected_left: selectedLeft === idx ? null : idx,
                      },
                    });
                  }
                }}
                role="button"
tabIndex={1}
              >
                <span className={selectedLeft === idx ? 'font-bold text-brand-700' : 'text-ink/60'}>
                  {item}
                </span>
              </div>
            ))
          </div>

          {/* Right items */}
          <div className="space-y-2">
            {right.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  selectedRight === idx
                    ? 'bg-brand-50 text-brand-700 ring-brand-100' :
                    'bg-ink/5 text-ink/60'
                }`}
                onClick={() => {
                  if (!submitting && selectedLeft !== null) {
                    setAnswers(prev => ({
                      ...prev,
                      [question.id]: {
                        ...prev[question.id]?.answer_data,
                        answer_data: {
                          ...prev[question.id]?.answer_data?.answer_data,
                          selected_right: selectedRight === idx ? null : idx,
                          pairs: [
                            ...(prev[question.id]?.answer_data?.answer_data?.pairs || []),
                            selectedRight === idx
                              ? [...(prev[question.id]?.answer_data?.answer_data?.pairs || []).filter(p => p[0] !== selectedLeft && p[1] !== idx)]
                              : [...(prev[question.id]?.answer_data?.answer_data?.pairs || []), [selectedLeft, idx]],
                        ],
                      },
                    }));
                    onAnswer(question.id, {
                      answer_data: {
                        ...prev[question.id]?.answer_data?.answer_data,
                        selected_right: selectedRight === idx ? null : idx,
                        pairs: [
                          ...(prev[question.id]?.answer_data?.answer_data?.pairs || []),
                          selectedRight === idx
                            ? [...(prev[question.id]?.answer_data?.answer_data?.pairs || []).filter(p => p[0] !== selectedLeft && p[1] !== idx)]
                            : [...(prev[question.id]?.answer_data?.answer_data?.pairs || []), [selectedLeft, idx]],
                        ],
                      },
                    });
                  }
                }}
                role="button"
                tabIndex={1}
              >
                <span className={selectedRight === idx ? 'font-bold text-brand-700' : 'text-ink/60'}>
                  {item}
                </span>
              </div>
            ))
              {/* Auto-grading feedback: only for objectively gradable types */}
          {/* For matching, check if answer has pairs and compare with correctPairs */}
          {showResult && answer?.answer_data?.pairs !== undefined && correctPairs.length > 0 && (
            <div className="mt-2 pt-2 border-t border-ink/10">
              {answer?.answer_data?.pairs.length === correctPairs.length &&
                answer?.answer_data?.pairs.every((p, i) => {
                  const [pi0, pi1] = p;
                  const [ci0, ci1] = correctPairs[i];
                  return pi0 === ci0 && pi1 === ci1;
                }) ? (
                  <p className="text-sm text-emerald-700">Correct!</p>
                ) : (
                  <p className="text-sm text-red-600">Incorrect</p>
                )
              )}
            </div>
          )}

          {/* Show correct pairs when incorrect */}
          {showResult && correctPairs.length > 0 && (
            <div className="mt-2 pt-2 border-t border-ink/10">
              <p className="text-sm text-ink/70">The correct pairs are:</p>
              {correctPairs.map((pair, cIdx) => (
                <div key={cIdx} className="flex items-center gap-1">
                  <span className="text-sm font-medium text-ink/70">{String.fromCharCode(65 + pair[0])}</span>
                  <span className="text-xs text-ink/50">↔</span>
                  <span className="text-sm font-medium text-ink/70">{String.fromCharCode(97 + pair[1])}</span>
                </div>
              ))}
            </div>
          )}

          {showResult && answer?.answer_data?.pairs === undefined && correctPairs.length > 0 && (
            <div className="mt-2 pt-2 border-t border-ink/10">
              <p className="text-sm text-ink/70">Submitted for manual grading</p>
            </div>
          )}
        </div>
      );
    }

    case 'multiple_choice': {
      const options = question.question_data?.options || [];
      const correctIndex = question.question_data?.correct_index ?? 0;

      if (options.length === 0) {
        return (
          <p className="text-sm text-ink/40 text-center py-4">No options defined for this multiple choice question</p>
        );
      }

      return (
        <div className="space-y-3">
          {options.map((option, idx) => (
            <div
              key={idx}
              className={`inline-flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                answer?.answer_data?.selected_index === idx
                  ? 'bg-brand-50 text-brand-700 ring-brand-100' :
                  answer?.answer_data?.selected_index !== null && showResult && !correct
                    ? 'bg-red-50 text-red-600 ring-red-100' :
                    'bg-ink/5 text-ink/60'
              }`}
              onClick={() => {
                if (!submitting) {
                  setAnswers(prev => ({ ...prev, [question.id]: { selected_index: idx } }));
                  onAnswer(question.id, { selected_index: idx });
                }
              }}
              role="button"
              tabIndex={1}
              aria-label={t(`question:mc_option_${idx}`, defaultValue: `Option ${idx + 1}`)}
            >
              <span className={answer?.answer_data?.selected_index === idx ? 'font-bold text-brand-700' : 'text-ink/60'}>
                {idx + 1}. {option}
              </span>
            </div>
          ))}
          {showResult && (
            <div className="mt-2 pt-2 border-t border-ink/10">
              {correct !== null ? (
                correct ? (
                  <p className="text-sm text-emerald-700">Correct!</p>
                ) : (
                  <p className="text-sm text-red-600">Incorrect</p>
                )
              ) : null}
              {correct === false && (
                <p className="text-xs text-ink/50">The correct answer was option {correctIndex + 1}</p>
              )}
            </div>
          )}
        </div>
      );
    }

    case 'fill_blank': {
      const template = question.question_data?.template || '';
      const expectedAnswers = question.question_data?.answers || [];

      return (
        <div className="space-y-3">
          <p className="text-sm text-ink/70">
            {template}
          </p>
          <div className="space-y-2">
            {expectedAnswers.map((expected, idx) => (
              <div key={idx} className="rounded-lg border border-ink/10 bg-white px-3 py-2">
                <label className="sr-only">Your answer for blank {idx + 1}</label>
                <input
                  type="text"
                  value answerData?.answers?.[idx] || ''
                  onChange={(e) => {
                    const newAnswer = {
                      ...answer?.answer_data,
                      answers: answer?.answer_data?.answers || [],
                    };
                    newAnswer.answers[idx] = e.target.value;
                    setAnswers(prev => ({ ...prev, [question.id]: newAnswer }));
                  }}
                  className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  placeholder={`Blank ${idx + 1}`}
                  aria-label={`Your answer for blank ${idx + 1}`}
                />
              </div>
            ))}
          </div>
          {showResult && correct !== null && (
            <div className="mt-2 pt-2 border-t border-ink/10">
              {correct ? (
                <p className="text-sm text-emerald-700">Correct!</p>
              ) : (
                <p className="text-sm text-red-600">Incorrect</p>
              )}
            </div>
          )}
        </div>
      );
    }

    case 'translation': {
      const sourceText = question.question_data?.source_text || '';
      const targetText = question.question_data?.target_text || '';
      const direction = question.question_data?.direction || 'en2uz';

      return (
        <div className="space-y-3">
          <p className="text-sm text-ink/70">{sourceText}</p>
          <textarea
            value answerData?.answer || ''
            onChange={(e) => {
              setAnswers(prev => ({ ...prev, [question.id]: { answer: e.target.value } }));
            }}
            className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 min-h-[80px]"
            placeholder={t(`question:translation_placeholder_${direction}`, defaultValue: 'Enter your translation here...')}
            aria-label={t(`question:translation_prompt_${direction}`, defaultValue: `Translate to ${direction === 'en2uz' ? 'Uzbek' : 'English'}`)}
          />
          {showResult && correct !== null && (
            <div className="mt-2 pt-2 border-t border-ink/10">
              {correct ? (
                <p className="text-sm text-emerald-700">Correct!</p>
              ) : (
                <p className="text-sm text-red-600">Incorrect</p>
              )}
            </div>
          )}
        </div>
      );
    }

    case 'sentence_creation': {
      const prompt = question.question_data?.prompt || '';
      const requiredWords = question.question_data?.required_words || [];

      return (
        <div className="space-y-3">
          <p className="text-sm text-ink/70">{prompt}</p>
          <textarea
            value answerData?.sentence || ''
            onChange={(e) => {
              setAnswers(prev => ({ ...prev, [question.id]: { sentence: e.target.value } }));
            }}
            className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 min-h-[100px]"
            placeholder={t(`question:sentence_placeholder`, defaultValue: 'Write your sentence here...')}
            aria-label={t(`question:sentence_prompt`, defaultValue: 'Write a sentence using the required words...')}
          />
          {showResult && correct !== null && (
            <div className="mt-2 pt-2 border-t border-ink/10">
              {correct ? (
                <p className="text-sm text-emerald-700">Correct!</p>
              ) : (
                <p className="text-sm text-red-600">Incorrect</p>
              )}
            </div>
          )}
        </div>
      );
    }

    case 'short_answer': {
      return (
        <div className="space-y-3">
          <p className="text-sm text-ink/70">
            Provide a concise answer to the question.
          </p>
          <textarea
            value answerData?.answer || ''
            onChange={(e) => {
              setAnswers(prev => ({ ...prev, [question.id]: { answer: e.target.value } }));
            }}
            className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 min-h-[80px]"
            placeholder={t(`question:short_answer_placeholder`, defaultValue: 'Your answer here...')}
            aria-label={t(`question:short_answer_prompt`, defaultValue: 'Your concise answer...')}
          />
          {showResult && correct !== null && (
            <div className="mt-2 pt-2 border-t border-ink/10">
              {correct ? (
                <p className="text-sm text-emerald-700">Correct!</p>
              ) : (
                <p className="text-sm text-red-600">Incorrect</p>
              )}
            </div>
          )}
        </div>
      );
    }

    case 'ordering': {
      const items = question.question_data?.items || [];

      if (items.length === 0) {
        return (
          <p className="text-sm text-ink/40 text-center py-4">No items defined for this ordering question</p>
        );
      }

      return (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                answer?.answer_data?.order?.includes(idx)
                  ? 'bg-brand-50 text-brand-700' :
                  'bg-ink/5 text-ink/60'
              }`}
              onClick={() => {
                if (!submitting) {
                  const newOrder = answer?.answer_data?.order || [];
                  newOrder[idx] = idx;
                  setAnswers(prev => ({ ...prev, [question.id]: { order: newOrder } }));
                  onAnswer(question.id, { order: newOrder });
                }
              }}
              role="button"
              tabIndex={1}
            >
              <span className={answer?.answer_data?.order?.includes(idx) ? 'font-bold text-brand-700' : 'text-ink/60'}>
                {item}
              </span>
            </div>
          ))}
          {showResult && correct !== null && (
            <div className="mt-2 pt-2 border-t border-ink/10">
              {correct ? (
                <p className="text-sm text-emerald-700">Correct!</p>
              ) : (
                <p className="text-sm text-red-600">Incorrect</p>
              )}
            </div>
          )}
        </div>
      );
    }

    case 'reading_comprehension': {
      const passage = question.question_data?.passage || '';
      const questions = question.question_data?.questions || [];

      if (!passage && questions.length === 0) {
        return (
          <p className="text-sm text-ink/40 text-center py-4">No passage or questions defined</p>
        );
      }

      return (
        <div className="space-y-3">
          {/* Passage */}
          {passage && (
            <div className="rounded-lg border border-ink/10 bg-white p-4 mb-4">
              <p className="text-sm text-ink/70">{passage}</p>
            </div>
          )}

          {/* Questions */}
          {questions.map((q, qIdx) => (
            <div key={q.id || qIdx} className="space-y-2">
              <p className="text-sm font-medium text-ink/70">
                {q.question || `Question ${qIdx + 1}`}
              </p>
              {q.type === 'mc' && q.options && q.options.length > 0 && (
                <div className="space-y-2">
                  {q.options.map((option, optIdx) => (
                    <div
                      key={optIdx}
                      className={`inline-flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                        answer?.answer_data?.answers?.[qIdx]?.selected_index === optIdx
                          ? 'bg-brand-50 text-brand-700 ring-brand-100' :
                          'bg-ink/5 text-ink/60'
                      }`}
                      onClick={() => {
                        if (!submitting) {
                          const newAnswers = answer?.answer_data?.answers || [];
                          newAnswers[qIdx] = { selected_index: optIdx };
                          setAnswers(prev => ({ ...prev, [question.id]: { answers: newAnswers } }));
                          onAnswer(question.id, { answers: newAnswers });
                        }
                      }}
                      role="button"
                      tabIndex={1}
                    >
                      <span className={answer?.answer_data?.answers?.[qIdx]?.selected_index === optIdx ? 'font-bold text-brand-700' : 'text-ink/60'}>
                        {option}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {q.type === 'sa' && (
                <textarea
                  value answer?.answer_data?.answers?.[qIdx]?.answer || ''
                  onChange={(e) => {
                    const newAnswers = answer?.answer_data?.answers || [];
                    newAnswers[qIdx] = { answer: e.target.value };
                    setAnswers(prev => ({ ...prev, [question.id]: { answers: newAnswers } }));
                  }}
                  className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 min-h[60px]"
                  placeholder={t(`question:reading_comprehension_sa_placeholder`, defaultValue: 'Your answer here...')}
                  aria-label={t(`question:reading_comprehension_sa_prompt`, defaultValue: 'Your short answer...')}
                />
              )}
            </div>
          ))}
          {showResult && correct !== null && (
            <div className="mt-2 pt-2 border-t border-ink/10">
              {correct ? (
                <p className="text-sm text-emerald-700">Correct!</p>
              ) : (
                <p className="text-sm text-red-600">Incorrect</p>
              )}
            </div>
          )}
        </div>
      );
    }

    default:
      return (
        <p className="text-sm text-ink/40 text-center py-4">Unsupported question type: {question.question_type}</p>
      );
  }
}

export function QuestionRendererWrapper({ question, answer, studentId, onAnswer, isSubmitting, isReview, autoGrade, t }) {
  if (!studentId) return null;
  return null;
}

export function StageContent({ stage, stageQuestions, answers, studentId, submitting, onAnswer, t }) {
  if (stageQuestions.length === 0) {
    return (
      <p className="text-sm text-ink/40 text-center py-4">No questions yet for this stage</p>
    );
  }

  return (
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
  );
}

export { STAGE_CONFIG, STAGE_ORDER };