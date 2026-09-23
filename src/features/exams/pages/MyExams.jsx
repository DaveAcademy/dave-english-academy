// MyExams.jsx - premium exam portal
// Preserves: useAcademy (level filter, exams/examScores), getAttachmentUrl (viewing existing files),
// LessonSectionTabs, real exam data only (me.level), no auto-scoring.
// Adds: upcoming highlight, countdown, preparation status, previous scores hierarchy, clear CTA, mobile, animations.

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileCheck2, Download, Clock, Award, CalendarDays,
  TrendingUp, AlertTriangle, Timer, Sparkles, FileText, Link2,
} from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { getAttachmentUrl } from '../../../lib/db';
import LessonSectionTabs from '../../../components/lesson/LessonSectionTabs';
import { examTypeIcon } from '../../../utils/examLabel';
import { formatDateOnly } from '../../../utils/date';
import StatusPill from '../../../components/StatusPill';
import ErrorBanner from '../../../components/ErrorBanner';
import ExamInstructions from '../components/ExamInstructions';
import { SkeletonList } from '../../../components/Skeleton';

const STATUS_TONE = { graded: 'brand', upcoming: 'info', expired: 'neutral', resultPending: 'neutral', notSubmitted: 'neutral' };

// Exam file extension for the type chip (e.g. "PDF"). Never invented:
// empty when the file name carries no usable extension.
function fileExt(name) {
  const parts = String(name || '').split('.');
  const ext = parts.length > 1 ? parts.pop().trim().toUpperCase() : '';
  return ext && ext.length <= 4 && /^[A-Z0-9]+$/.test(ext) ? ext : '';
}

function FeedbackText({ text, t }) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSE_AT = 200;
  if (text.length <= COLLAPSE_AT) {
    return <p className="mt-3 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2.5 text-sm leading-relaxed text-brand-800">{text}</p>;
  }
  return (
    <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2.5">
      <p className="text-sm leading-relaxed text-brand-800">
        {expanded ? text : `${text.slice(0, COLLAPSE_AT)}…`}
      </p>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-1.5 text-xs font-bold text-brand-600 hover:underline"
      >
        {expanded ? t('feedbackShowLess') : t('feedbackShowMore')}
      </button>
    </div>
  );
}

function countdownLabel(targetDateStr, t) {
  if (!targetDateStr) return null;
  const [y, m, d] = targetDateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d).getTime();
  const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const diff = target - todayStart;
  const days = Math.ceil(diff / 86400000);
  if (days <= 0) return null;
  if (days === 1) return t('portal:mpCountdownTomorrow');
  if (days < 7) return t('portal:mpCountdownDays', { count: days });
  if (days < 30) return t('portal:mpCountdownWeeks', { count: Math.ceil(days / 7) });
  return t('portal:mpCountdownDays', { count: days });
}

export default function MyExams() {
  const { t, i18n } = useTranslation(['exams', 'common', 'portal', 'dashboard']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { me, students, exams, examScores, loading, error } = useAcademy();
  const [actionError, setActionError] = useState(null);

  const myExams = useMemo(() => {
    if (!me) return [];
    return [...exams]
      .filter((e) => !e.level || e.level === me.level || examScores.some((s) => s.exam_id === e.id && s.student_id === me.id))
      .sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));
  }, [exams, me, examScores]);

  const scoreFor = (examId) => examScores.find((s) => s.exam_id === examId && s.student_id === me?.id);

  const statusOf = (result, overdue, upcoming, isOral) => {
    if (result?.score != null) return 'graded';
    if (upcoming) return 'upcoming';
    if (isOral) return 'resultPending';
    if (overdue) return 'expired';
    return 'notSubmitted';
  };

  const isUpcoming = (exam) => {
    if (!exam.exam_date) return false;
    const [y, m, d] = exam.exam_date.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return false;
    const examDay = new Date(y, m - 1, d);
    const today = new Date();
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return examDay > todayLocal;
  };

  const isOverdue = (exam) => {
    if (!exam.deadline) return false;
    const [y, m, d] = exam.deadline.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return false;
    const due = new Date(y, m - 1, d);
    const today = new Date();
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return todayLocal > due;
  };

  const handleOpenFile = async (path) => {
    setActionError(null);
    try {
      const url = await getAttachmentUrl(path);
      if (url) window.open(url, '_blank', 'noopener');
      else setActionError(t('openFileFailed'));
    } catch { setActionError(t('openFileFailed')); }
  };

  const upcomingExams = useMemo(() => myExams.filter(isUpcoming), [myExams]);
  const pastExams = useMemo(() => myExams.filter((e) => !isUpcoming(e)), [myExams]);
  const gradedCount = useMemo(() => myExams.filter((e) => scoreFor(e.id)?.score != null).length, [myExams, examScores]); // eslint-disable-line react-hooks/exhaustive-deps
  const bestPct = useMemo(() => {
    const vals = myExams
      .map((e) => {
        const s = scoreFor(e.id)?.score;
        if (s == null) return null;
        const max = Number(e.max_score) || 100;
        return Math.round((Number(s) / max) * 100);
      })
      .filter((v) => v != null);
    if (!vals.length) return null;
    return Math.max(...vals);
  }, [myExams, examScores]); // eslint-disable-line react-hooks/exhaustive-deps
  const avgScore = useMemo(() => {
    const vals = myExams
      .map((e) => {
        const s = scoreFor(e.id)?.score;
        if (s == null) return null;
        const max = Number(e.max_score) || 100;
        return (Number(s) / max) * 100;
      })
      .filter((v) => v != null);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [myExams, examScores]);

  // State order matters: loading and academy errors must never be mistaken
  // for a missing student. Only a settled load with no error and no student
  // row means "not linked yet".
  if (!me && !loading && !error) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('notLinkedYet')}</p>
        <div className="mt-4 inline-flex max-w-[46ch] items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-4 py-2 text-xs font-semibold leading-relaxed text-brand-700">
          <Link2 size={14} className="shrink-0" aria-hidden="true" />
          <span className="text-left">{t('dashboard:notLinkedSubtitle')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{t('myTitle')}</h1>
            <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-ink/55">{t('mySubtitle')}</p>
          </div>
          {!loading && myExams.length > 0 && (
            <div className="flex gap-2">
              <div className="rounded-xl border border-ink/[0.06] bg-white px-3 py-2 shadow-card text-center">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink/50">{t('portal:mpGradedLabel')}</p>
                <p className="font-display text-lg font-bold text-brand-600">{gradedCount}/{myExams.length}</p>
              </div>
              {avgScore != null && (
                <div className="rounded-xl border border-ink/[0.06] bg-white px-3 py-2 shadow-card text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink/50">{t('portal:mpAverageLabel')}</p>
                  <p className="font-display text-lg font-bold text-ink">{avgScore}%</p>
                </div>
              )}
              {bestPct != null && (
                <div className="rounded-xl border border-ink/[0.06] bg-white px-3 py-2 shadow-card text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink/50">{t('bestScoreLabel')}</p>
                  <p className="font-display text-lg font-bold text-brand-600">{bestPct}%</p>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <LessonSectionTabs />
      <ErrorBanner>{actionError}</ErrorBanner>

      {loading ? (
        <SkeletonList count={3} radius="rounded-2xl" />
      ) : error ? (
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
          <div className="px-6 py-10 text-center sm:px-10 sm:py-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-inactive/10 ring-1 ring-inactive/20">
              <AlertTriangle className="text-inactive" size={22} aria-hidden="true" />
            </div>
            <h2 className="mx-auto mt-4 max-w-[28ch] font-display text-xl font-bold leading-tight text-ink">{t('loadErrorTitle')}</h2>
            <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-relaxed text-ink/55">{t('loadErrorMessage')}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700">
              {t('retry')}
            </button>
          </div>
        </div>
      ) : myExams.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
          <div className="bg-gradient-to-br from-brand-50 via-white to-paper px-6 py-10 text-center sm:px-10 sm:py-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-card ring-1 ring-ink/[0.06]">
              <Sparkles className="text-brand-500" size={22} aria-hidden="true" />
            </div>
            <h2 className="mx-auto mt-4 max-w-[28ch] font-display text-xl font-bold leading-tight text-ink">{t('portal:mpYourExamsWillAppear')}</h2>
            <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-relaxed text-ink/55">{t('portal:mpWhenTeacherSchedules')}</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700">
              <CalendarDays size={14} /> {t('portal:mpNoExamsAssigned')}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Upcoming - highlighted */}
          {upcomingExams.length > 0 && (
            <section aria-labelledby="upcoming-heading">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white"><Timer size={14} /></span>
                <h2 id="upcoming-heading" className="font-display text-sm font-bold uppercase tracking-wide text-ink">{t('portal:mpUpcoming')}</h2>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 ring-1 ring-brand-100">{upcomingExams.length}</span>
              </div>
              <div className="space-y-3">
                {upcomingExams.map((e, idx) => {
                  const result = scoreFor(e.id);
                  const isOral = e.exam_type === 'Oral';
                  const overdue = isOverdue(e);
                  const upcoming = true;
                  const status = statusOf(result, overdue, upcoming, isOral);
                  const countdown = countdownLabel(e.exam_date, t);
                  return (
                    <div
                      key={e.id}
                      className="relative overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-card"
                      style={{ animation: `slideUp 0.35s ease-out both`, animationDelay: `${Math.min(idx * 40, 200)}ms` }}
                    >
                      <div className="absolute inset-y-0 left-0 w-1 bg-brand-500" />
                      <div className="relative p-3 sm:p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-lg shadow-sm">
                            {e.exam_type === 'Written' || e.exam_type === 'Oral' ? examTypeIcon(e.exam_type) : <FileCheck2 size={18} className="text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="break-words font-display text-[15px] font-bold leading-tight text-ink sm:text-base">{e.title}</p>
                              {(e.exam_type === 'Written' || e.exam_type === 'Oral') && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${e.exam_type === 'Oral' ? 'bg-levelC' : 'bg-brand-600'}`}>{t(`examType.${e.exam_type}`)}</span>
                              )}
                              <StatusPill tone={STATUS_TONE[status]}>{status === 'expired' ? t('awaitingTeacher') : t(status)}</StatusPill>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 ring-1 ring-brand-100">
                                <CalendarDays size={12} /> {formatDateOnly(e.exam_date, dateLocale)}
                                {countdown && <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold text-brand-600 ring-1 ring-brand-100">{countdown}</span>}
                              </span>
                              <span className="text-xs text-ink/50">{t('outOfScore', { max: e.max_score })}</span>
                              {e.deadline && !isOral && (
                                <span className="text-xs text-ink/40">· {t('dueDate', { date: formatDateOnly(e.deadline.slice(0, 10), dateLocale) })}</span>
                              )}
                            </div>
                            <div className="mt-2 flex items-start gap-2 rounded-xl border border-ink/[0.06] bg-paper/60 px-3 py-2">
                              <CalendarDays size={14} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
                              <div>
                                <p className="text-xs font-bold text-ink">{t('portal:mpPreparation')}</p>
                                <p className="mt-0.5 text-xs leading-relaxed text-ink/60">{t('portal:mpReviewBefore', { date: formatDateOnly(e.exam_date, dateLocale) })}</p>
                              </div>
                            </div>
                            {e.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/65">{e.description}</p>}
                            {(e.exam_type === 'Written' || e.exam_type === 'Oral') && (
                              <ExamInstructions kind={e.exam_type === 'Oral' ? 'oral' : 'written'} t={t} />
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {e.file_url && (
                            <button onClick={() => handleOpenFile(e.file_url)} className="inline-flex min-h-[44px] min-w-0 max-w-full items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700">
                              <FileText size={14} className="shrink-0" aria-hidden />
                              <span className="min-w-0 max-w-[52vw] truncate sm:max-w-[220px]">{e.file_name || t('examFileDefault')}</span>
                              {fileExt(e.file_name) && (
                                <span className="shrink-0 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide">{fileExt(e.file_name)}</span>
                              )}
                              <Download size={13} className="shrink-0 opacity-80" aria-hidden />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Previous / All other */}
          {pastExams.length > 0 && (
            <section aria-labelledby="previous-heading">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/5 text-ink/50"><Award size={14} /></span>
                <h2 id="previous-heading" className="font-display text-sm font-bold uppercase tracking-wide text-ink">
                  {upcomingExams.length ? t('portal:mpPreviousGraded') : t('portal:mpYourExams')}
                </h2>
                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-bold text-ink/50">{pastExams.length}</span>
              </div>
              <div className="space-y-3">
                {pastExams.map((e, idx) => {
                  const result = scoreFor(e.id);
                  const graded = result?.score != null;
                  const isOral = e.exam_type === 'Oral';
                  const overdue = isOverdue(e);
                  const upcoming = false;
                  const status = statusOf(result, overdue, upcoming, isOral);
                  const expired = status === 'expired';
                  const pct = graded ? Math.round((result.score / (e.max_score || 100)) * 100) : null;
                  return (
                    <div
                      key={e.id}
                      className={`overflow-hidden rounded-2xl border bg-white p-3 shadow-card sm:p-4 ${graded ? 'border-ink/[0.06]' : expired ? 'border-inactive/20' : 'border-ink/[0.06]'}`}
                      style={{ animation: `slideUp 0.35s ease-out both`, animationDelay: `${Math.min(idx * 40, 180)}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ring-1 ${graded ? 'bg-brand-50 text-brand-600 ring-brand-100' : expired ? 'bg-inactive/10 text-inactive ring-inactive/20' : 'bg-paper text-ink/40 ring-ink/5'}`}>
                          {e.exam_type === 'Written' || e.exam_type === 'Oral' ? examTypeIcon(e.exam_type) : <FileCheck2 size={18} className={graded ? 'text-brand-500' : 'text-ink/30'} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="break-words font-display text-[15px] font-bold leading-tight text-ink sm:text-base">{e.title}</p>
                            {(e.exam_type === 'Written' || e.exam_type === 'Oral') && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${e.exam_type === 'Oral' ? 'bg-levelC/10 text-levelC ring-levelC/20' : 'bg-brand-50 text-brand-700 ring-brand-100'}`}>{t(`examType.${e.exam_type}`)}</span>
                            )}
                            <StatusPill tone={STATUS_TONE[status]}>{status === 'expired' ? t('awaitingTeacher') : t(status)}</StatusPill>
                           </div>
                          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink/50">
                            <Clock size={11} className="text-ink/30" /> {formatDateOnly(e.exam_date, dateLocale)} · {t('outOfScore', { max: e.max_score })}
                            {e.deadline && !isOral && (
                              expired ? <span className="font-semibold text-inactive"> · {t('dueDateOverdue', { date: formatDateOnly(e.deadline.slice(0, 10), dateLocale) })}</span>
                                : <span> · {t('dueDate', { date: formatDateOnly(e.deadline.slice(0, 10), dateLocale) })}</span>
                            )}
                          </p>
                          {e.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/65">{e.description}</p>}

                          {/* completion + score bar */}
                          {graded && (
                            <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-700"><TrendingUp size={12} /> {t('portal:mpScoreLabel')}</span>
                                <span className="text-sm font-bold text-brand-700 sm:hidden">{t('scoreOutOfMax', { score: result.score, max: e.max_score })} · {pct}%</span>
                              </div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-brand-100">
                                <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                              <p className="mt-1.5 text-[11px] font-medium text-brand-600/70">{t('portal:mpCompletionGraded')}</p>
                            </div>
                          )}
                          {graded && <ExamInstructions kind="result" t={t} />}
                          {expired && <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-inactive"><AlertTriangle size={12} /> {t('deadlinePassedWarning')}</p>}
                          {!graded && !expired && (
                            <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-ink/55">
                              <FileCheck2 size={12} className="mt-0.5 shrink-0 text-ink/35" aria-hidden /> {t('inClassNote')}
                            </p>
                          )}
                        </div>
                        {graded && (
                          <div className="hidden shrink-0 text-right sm:block">
                            <p className="font-display text-lg font-bold leading-none text-brand-600">{result.score}<span className="text-sm font-semibold text-ink/30">/{e.max_score}</span></p>
                            <p className="text-[11px] font-semibold text-ink/50">{pct}%</p>
                          </div>
                        )}
                      </div>

                      {result?.feedback && (
                        <FeedbackText text={result.feedback} t={t} />
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {e.file_url && (
                          <button onClick={() => handleOpenFile(e.file_url)} className="inline-flex min-h-[44px] min-w-0 max-w-full items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700">
                            <FileText size={14} className="shrink-0" aria-hidden />
                            <span className="min-w-0 max-w-[52vw] truncate sm:max-w-[220px]">{e.file_name || t('examFileDefault')}</span>
                            {fileExt(e.file_name) && (
                              <span className="shrink-0 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide">{fileExt(e.file_name)}</span>
                            )}
                            <Download size={13} className="shrink-0 opacity-80" aria-hidden />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
