// MyExams.jsx - premium exam portal
// Preserves: useAcademy (level filter, exams/examScores), uploadAttachment/getAttachmentUrl, submitMyExamAnswer,
// LessonSectionTabs, real exam data only (me.level), no auto-scoring.
// Adds: upcoming highlight, countdown, preparation status, previous scores hierarchy, clear CTA, mobile, animations.

import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FileCheck2, Download, Upload, MessageSquare, Clock, Award, CalendarDays,
  TrendingUp, AlertTriangle, Timer, Sparkles,
} from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { uploadAttachment, getAttachmentUrl } from '../../../lib/db';
import LessonSectionTabs from '../../../components/lesson/LessonSectionTabs';
import { examTypeIcon } from '../../../utils/examLabel';
import { formatDateOnly } from '../../../utils/date';
import StatusPill from '../../../components/StatusPill';
import ErrorBanner from '../../../components/ErrorBanner';
import { SkeletonList } from '../../../components/Skeleton';

const STATUS_TONE = { graded: 'brand', awaitingGrading: 'success', upcoming: 'info', expired: 'danger', resultPending: 'neutral', notSubmitted: 'neutral' };

function countdownLabel(targetDateStr) {
  if (!targetDateStr) return null;
  const [y, m, d] = targetDateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d).getTime();
  const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const diff = target - todayStart;
  const days = Math.ceil(diff / 86400000);
  if (days <= 0) return null;
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `In ${days} days`;
  if (days < 30) return `In ${Math.ceil(days / 7)} weeks`;
  return `In ${days} days`;
}

export default function MyExams() {
  const { t, i18n } = useTranslation(['exams', 'common']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { students, exams, examScores, submitMyExamAnswer, loading } = useAcademy();
  const me = students[0];
  const [submittingId, setSubmittingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const myExams = useMemo(() => {
    if (!me) return [];
    return [...exams].filter((e) => !e.level || e.level === me.level).sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));
  }, [exams, me]);

  const scoreFor = (examId) => examScores.find((s) => s.exam_id === examId && s.student_id === me?.id);

  const statusOf = (result, overdue, upcoming, isOral) => {
    if (result?.score != null) return 'graded';
    if (result?.answer_file_url) return 'awaitingGrading';
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

  const handleUpload = async (examId, file) => {
    if (!file || !me) return;
    setSubmittingId(examId);
    setActionError(null);
    let uploaded;
    try { uploaded = await uploadAttachment(file, `exam-answers/${me.id}`); }
    catch { setActionError(t('uploadFileFailed')); setSubmittingId(null); return; }
    try { await submitMyExamAnswer(examId, me.id, { fileUrl: uploaded.path, fileName: uploaded.name }); }
    catch { setActionError(t('submitAnswerFailed')); }
    finally { setSubmittingId(null); }
  };

  const upcomingExams = useMemo(() => myExams.filter(isUpcoming), [myExams]);
  const pastExams = useMemo(() => myExams.filter((e) => !isUpcoming(e)), [myExams]);
  const gradedCount = useMemo(() => myExams.filter((e) => scoreFor(e.id)?.score != null).length, [myExams, examScores]); // eslint-disable-line react-hooks/exhaustive-deps
  const avgScore = useMemo(() => {
    const vals = myExams.map((e) => scoreFor(e.id)?.score).filter((v) => v != null);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [myExams, examScores]);

  if (!me) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('notLinkedYet')}</p>
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
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Graded</p>
                <p className="font-display text-lg font-bold text-brand-600">{gradedCount}/{myExams.length}</p>
              </div>
              {avgScore != null && (
                <div className="rounded-xl border border-ink/[0.06] bg-white px-3 py-2 shadow-card text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Average</p>
                  <p className="font-display text-lg font-bold text-ink">{avgScore}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <LessonSectionTabs />
      <ErrorBanner>{actionError}</ErrorBanner>

      {loading ? (
        <SkeletonList count={3} />
      ) : myExams.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
          <div className="bg-gradient-to-br from-brand-50 via-white to-paper px-6 py-10 text-center sm:px-10 sm:py-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-card ring-1 ring-ink/[0.06]">
              <Sparkles className="text-brand-500" size={22} aria-hidden="true" />
            </div>
            <h2 className="mx-auto mt-4 max-w-[28ch] font-display text-xl font-bold leading-tight text-ink">Your exams will appear here</h2>
            <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-relaxed text-ink/55">When your teacher schedules a Written or Oral assessment for your level, you&apos;ll see the date, preparation guide, and submission tools right here.</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700">
              <CalendarDays size={14} /> No exams assigned for your level yet
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
                <h2 id="upcoming-heading" className="font-display text-sm font-bold uppercase tracking-wide text-ink">Upcoming</h2>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 ring-1 ring-brand-100">{upcomingExams.length}</span>
              </div>
              <div className="space-y-3">
                {upcomingExams.map((e, idx) => {
                  const result = scoreFor(e.id);
                  const isOral = e.exam_type === 'Oral';
                  const overdue = isOverdue(e);
                  const upcoming = true;
                  const status = statusOf(result, overdue, upcoming, isOral);
                  const countdown = countdownLabel(e.exam_date);
                  return (
                    <div
                      key={e.id}
                      className="relative overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-card"
                      style={{ animation: `slideUp 0.35s ease-out both`, animationDelay: `${Math.min(idx * 40, 200)}ms` }}
                    >
                      <div className="absolute inset-y-0 left-0 w-1 bg-brand-500" />
                      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-50 opacity-60 blur-2xl pointer-events-none" />
                      <div className="relative p-3 sm:p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-lg shadow-sm">
                            {e.exam_type === 'Written' || e.exam_type === 'Oral' ? examTypeIcon(e.exam_type) : <FileCheck2 size={18} className="text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="break-words font-display text-[15px] font-bold leading-tight text-ink sm:text-base">{e.title}</p>
                              {(e.exam_type === 'Written' || e.exam_type === 'Oral') && (
                                <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t(`examType.${e.exam_type}`)}</span>
                              )}
                              <StatusPill tone={STATUS_TONE[status]}>{t(status)}</StatusPill>
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
                            <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
                              <p className="text-xs font-semibold text-amber-800">Preparation</p>
                              <p className="mt-0.5 text-xs leading-relaxed text-amber-700/80">{t('upcomingPrepareMessage')} Review your lesson notes, vocabulary, and practice examples before {formatDateOnly(e.exam_date, dateLocale)}.</p>
                            </div>
                            {e.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/65">{e.description}</p>}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {e.file_url && (
                            <button onClick={() => handleOpenFile(e.file_url)} className="inline-flex min-h-[44px] min-w-0 max-w-full items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-brand-700 shadow-sm hover:bg-brand-50">
                              <Download size={14} className="shrink-0" /> <span className="min-w-0 max-w-[52vw] truncate sm:max-w-[220px]">{e.file_name || t('examFileDefault')}</span>
                            </button>
                          )}
                          <Link to={`/chat?type=exam&id=${e.id}`} className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-ink/10 bg-white px-3.5 py-2.5 text-xs font-semibold text-ink/70 shadow-sm hover:bg-ink/5">
                            <MessageSquare size={14} /> {t('discuss')}
                          </Link>
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
                  {upcomingExams.length ? 'Previous & graded' : 'Your exams'}
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
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ring-1 ${graded ? 'bg-brand-50 text-brand-600 ring-brand-100' : expired ? 'bg-red-50 text-red-500 ring-red-100' : 'bg-paper text-ink/40 ring-ink/5'}`}>
                          {e.exam_type === 'Written' || e.exam_type === 'Oral' ? examTypeIcon(e.exam_type) : <FileCheck2 size={18} className={graded ? 'text-brand-500' : 'text-ink/30'} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="break-words font-display text-[15px] font-bold leading-tight text-ink sm:text-base">{e.title}</p>
                            {(e.exam_type === 'Written' || e.exam_type === 'Oral') && (
                              <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold text-ink/50">{t(`examType.${e.exam_type}`)}</span>
                            )}
                            <StatusPill tone={STATUS_TONE[status]}>{t(status)}</StatusPill>
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
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-700"><TrendingUp size={12} /> Score</span>
                                <span className="text-sm font-bold text-brand-700">{t('scoreOutOfMax', { score: result.score, max: e.max_score })} · {pct}%</span>
                              </div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-brand-100">
                                <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                              <p className="mt-1.5 text-[11px] font-medium text-brand-600/70">Completion status: graded — feedback below if provided.</p>
                            </div>
                          )}
                          {!graded && result?.answer_file_url && (
                            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                              <FileCheck2 size={12} /> Submitted — awaiting grading
                            </div>
                          )}
                          {expired && <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-inactive"><AlertTriangle size={12} /> {t('deadlinePassedWarning')}</p>}
                        </div>
                        {graded && (
                          <div className="hidden shrink-0 text-right sm:block">
                            <p className="font-display text-lg font-bold leading-none text-brand-600">{result.score}<span className="text-sm font-semibold text-ink/30">/{e.max_score}</span></p>
                            <p className="text-[11px] font-semibold text-ink/40">{pct}%</p>
                          </div>
                        )}
                      </div>

                      {result?.feedback && (
                        <p className="mt-3 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2.5 text-sm leading-relaxed text-brand-800">{result.feedback}</p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {e.file_url && (
                          <button onClick={() => handleOpenFile(e.file_url)} className="inline-flex min-h-[44px] min-w-0 max-w-full items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-brand-700 shadow-sm hover:bg-brand-50">
                            <Download size={14} className="shrink-0" /> <span className="min-w-0 max-w-[52vw] truncate sm:max-w-[220px]">{e.file_name || t('examFileDefault')}</span>
                          </button>
                        )}
                        {e.exam_type !== 'Oral' && !graded && (
                          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-ink/10 bg-white px-3.5 py-2.5 text-xs font-semibold text-ink/70 shadow-sm hover:bg-ink/5">
                            <Upload size={14} />
                            {submittingId === e.id ? t('uploading') : result?.answer_file_name ? t('replaceMyAnswer') : t('uploadMyAnswer')}
                            <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" disabled={submittingId === e.id} onChange={(ev) => handleUpload(e.id, ev.target.files?.[0])} />
                          </label>
                        )}
                        {e.exam_type !== 'Oral' && result?.answer_file_url && (
                          <button onClick={() => handleOpenFile(result.answer_file_url)} className="inline-flex min-h-[44px] items-center px-3 py-2.5 text-xs font-medium text-ink/50 hover:text-brand-600 hover:underline">
                            {t('viewMySubmittedAnswer')}
                          </button>
                        )}
                        <Link to={`/chat?type=exam&id=${e.id}`} className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-ink/10 bg-white px-3.5 py-2.5 text-xs font-semibold text-ink/70 shadow-sm hover:bg-ink/5">
                          <MessageSquare size={14} /> {t('discuss')}
                        </Link>
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
