// MyProgress.jsx

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, XCircle, Star, Trophy, CalendarCheck, FileCheck2, BookOpen } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getGroupLeaderboard } from '../../lib/db';
import {
  LESSON_STATUS, teacherPaceFor, lessonCapFor, progressByLessonNumber, lessonStatusFor,
  nextUnfinishedLesson, completionStreak,
} from '../../lib/lessonLogic';
import { formatWeekdayDate } from '../../utils/date';
import { attendanceRate } from '../../utils/attendance';
import { calculateLevel } from '../../utils/level';
import { computeBadges } from '../../utils/badges';
import StatCard from '../../components/StatCard';
import Panel from '../../components/Panel';
import SectionLabel from '../../components/SectionLabel';
import StatusPill from '../../components/StatusPill';
import BadgeShelf from '../../components/BadgeShelf';
import LessonStatsBar from '../../components/lesson/LessonStatsBar';

const STATUS_ICON = { Present: CheckCircle2, Late: Clock, Absent: XCircle };
const STATUS_COLOR = { Present: 'text-active', Late: 'text-levelB', Absent: 'text-inactive' };
const HOMEWORK_TONE = { Assigned: 'watch', Submitted: 'info', Graded: 'good' };

export default function MyProgress() {
  const { t, i18n } = useTranslation(['portal', 'attendance', 'dashboard']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { students, attendance, homework, homeworkStatus, exams, examScores, lessons, curriculumProgress, lessonProgress } = useAcademy();
  const me = students[0];
  const [leaderboard, setLeaderboard] = useState(null);

  // get_group_leaderboard(level, 'all_time') - the same RPC and ranking
  // convention the admin Rankings page's Level Leaderboard already uses
  // (see Rankings.jsx), scoped to active students in this student's own
  // level. It computes rank server-side with SQL RANK() over lifetime
  // point_transactions totals, so ties already get the same rank number
  // instead of an arbitrary sequential position - no rank math is
  // duplicated here. Previously this called the academy-wide
  // get_leaderboard() RPC (no level filter), which is why "My Rank" could
  // reflect the entire academy population instead of just this student's
  // level.
  useEffect(() => {
    if (!me?.level) return;
    let cancelled = false;
    getGroupLeaderboard(me.level, 'all_time')
      .then((rows) => !cancelled && setLeaderboard(rows || []))
      .catch(() => !cancelled && setLeaderboard([]));
    return () => {
      cancelled = true;
    };
  }, [me?.level]);

  const { points, rank } = useMemo(() => {
    if (!me || !leaderboard) return { points: 0, rank: null };
    const row = leaderboard.find((r) => r.student_id === me.id);
    return { points: row?.points ?? 0, rank: row?.rank ?? null };
  }, [leaderboard, me]);

  // Real attendance records (see Attendance.jsx / attendance table) - the
  // same source PortalHomeV3's attendance stat reads, not the never-written
  // lesson_attendance table this page used to (mis)read.
  const attendanceRows = useMemo(() => [...attendance].sort((a, b) => new Date(b.date) - new Date(a.date)), [attendance]);
  const attendedCount = attendanceRows.filter((a) => a.status !== 'Absent').length;
  // Present=1/Late=0.5/Absent=0 - the same shared formula the Dashboard and
  // Attendance pages use (utils/attendance.js), so this percentage always
  // matches what's shown there rather than a simpler present-count ratio.
  const attendancePct = attendanceRate(attendanceRows);

  const examRows = useMemo(() => {
    const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));
    return examScores
      .map((s) => ({ ...s, exam: examsById[s.exam_id] }))
      .filter((s) => s.exam)
      .sort((a, b) => new Date(b.exam.exam_date) - new Date(a.exam.exam_date));
  }, [examScores, exams]);

  const examAvg = useMemo(() => {
    const scored = examRows.filter((s) => s.score != null);
    return scored.length > 0
      ? Math.round((scored.reduce((sum, s) => sum + Number(s.score) / (s.exam.max_score || 100), 0) / scored.length) * 100)
      : null;
  }, [examRows]);

  // Final Exams highlight - each 10-lesson cycle ends with one Written and
  // one Oral exam (exam_type is the modality axis, not the title text -
  // real exam titles vary, e.g. "Test" / "Speaking Exam"). examRows is
  // already sorted newest-first, so the first match per type is this
  // student's latest cycle's exam - null if none exists yet for either.
  const finalWriting = useMemo(() => examRows.find((s) => s.exam.exam_type === 'Written') || null, [examRows]);
  const finalSpeaking = useMemo(() => examRows.find((s) => s.exam.exam_type === 'Oral') || null, [examRows]);
  const finalExamContribution = useMemo(() => {
    const parts = [finalWriting, finalSpeaking].filter((s) => s?.score != null);
    return parts.length > 0 ? parts.reduce((sum, s) => sum + Number(s.score), 0) : null;
  }, [finalWriting, finalSpeaking]);

  // Improvement indicator: latest two exams, normalized to a percent of
  // each exam's own max_score so exams with different point totals stay
  // comparable - a real delta, not an invented one.
  const examTrend = useMemo(() => {
    if (examRows.length < 2) return null;
    const pct = (row) => (row.exam.max_score ? (Number(row.score) / row.exam.max_score) * 100 : null);
    const latest = pct(examRows[0]);
    const previous = pct(examRows[1]);
    if (latest == null || previous == null) return null;
    const delta = Math.round(latest - previous);
    if (delta === 0) return { direction: 'flat' };
    return { direction: delta > 0 ? 'up' : 'down', delta: Math.abs(delta) };
  }, [examRows]);

  // Curriculum progress - the same lessonLogic + student_lesson_progress
  // model the portal home and MyLessons use, so the numbers here always
  // agree with what the student already sees there (status/cap/unlock).
  const lessonBlock = useMemo(() => {
    if (!me) return null;
    const visible = lessons.filter((l) => (!l.group_name && !l.level) || l.group_name === me.group_name || l.level === me.level);
    const pace = teacherPaceFor(curriculumProgress, me.level);
    const cap = lessonCapFor(curriculumProgress, me.level);
    const progressByNum = progressByLessonNumber(lessonProgress, visible);
    let completed = 0;
    let inProgress = 0;
    let vocabCount = 0;
    for (const l of visible) {
      const s = lessonStatusFor(l, pace, progressByNum, cap);
      if (s === LESSON_STATUS.COMPLETED) {
        completed += 1;
        vocabCount += l.lesson_vocabulary?.[0]?.count ?? 0;
      } else if (s === LESSON_STATUS.IN_PROGRESS) {
        inProgress += 1;
      }
    }
    const total = visible.length;
    return {
      total,
      completed,
      inProgress,
      remaining: total - completed,
      vocabCount,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      streak: completionStreak(lessonProgress),
      cap,
      next: nextUnfinishedLesson(visible, pace, progressByNum, undefined, cap),
    };
  }, [me, lessons, curriculumProgress, lessonProgress]);

  // Same scoping rule as PortalHomeV3/Homework.jsx: homework assigned to
  // the student's level (or to everyone, when level is unset).
  const homeworkRows = useMemo(() => {
    const myHomework = me ? homework.filter((h) => !h.level || h.level === me.level) : [];
    const statusById = Object.fromEntries(homeworkStatus.map((h) => [h.homework_id, h]));
    return myHomework
      .map((h) => ({ ...h, statusRow: statusById[h.id] }))
      .sort((a, b) => new Date(b.due_date) - new Date(a.due_date));
  }, [homework, homeworkStatus, me]);

  const homeworkStats = useMemo(() => {
    const total = homeworkRows.length;
    const completed = homeworkRows.filter((h) => h.statusRow?.status === 'Submitted' || h.statusRow?.status === 'Graded').length;
    return { total, completed, rate: total > 0 ? Math.round((completed / total) * 100) : null };
  }, [homeworkRows]);

  const badges = useMemo(
    () =>
      computeBadges({
        attendanceRate: attendancePct,
        attendanceStreak: 0,
        homeworkTotal: homeworkStats.total,
        homeworkDoneRate: homeworkStats.rate,
        examAvg,
        lessonsCompleted: lessonBlock?.completed ?? 0,
        rank,
      }),
    [attendancePct, homeworkStats, examAvg, rank, lessonBlock]
  );

  if (!me) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('dashboard:notLinkedYet')}</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">{t('portal:myProgressTitle')}</h1>
        <p className="mt-1 text-sm text-ink/50">
          {t('portal:attendedOfDays', { count: attendedCount, total: attendanceRows.length })}
        </p>
      </header>

      <SectionLabel>{t('portal:progressSummaryTitle')}</SectionLabel>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label={t('portal:progressLevelLabel')} value={`LV${calculateLevel(points)}`} tone="brand" icon={Star} />
        <StatCard label={t('nav:attendance')} value={attendancePct == null ? '—' : `${attendancePct}%`} tone="success" icon={CalendarCheck} />
        <StatCard label={t('dashboard:examAverage')} value={examAvg == null ? '—' : `${examAvg}%`} tone="info" icon={FileCheck2} />
        <StatCard label={t('dashboard:homework')} value={homeworkStats.rate == null ? '—' : `${homeworkStats.rate}%`} tone="warning" icon={BookOpen} />
        <StatCard label={t('dashboard:myPoints')} value={points} tone="brand" icon={Star} />
        <StatCard label={t('dashboard:myRank')} value={rank ? `#${rank}` : '—'} tone="success" icon={Trophy} />
      </div>

      {lessonBlock && (
        <>
          <SectionLabel>{t('portal:lessonProgressTitle')}</SectionLabel>
          <div className="mb-6 space-y-3">
            <LessonStatsBar
              total={lessonBlock.total}
              completed={lessonBlock.completed}
              inProgress={lessonBlock.inProgress}
              remaining={lessonBlock.remaining}
              streak={lessonBlock.streak}
              vocabCount={lessonBlock.vocabCount}
            />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-white px-4 py-3 text-sm text-ink/70 shadow-card">
              <span>
                <strong className="font-semibold text-ink">{t('portal:lessonCapLabel')}</strong>: {lessonBlock.cap}
              </span>
              <span className="text-ink/30">·</span>
              {lessonBlock.next ? (
                <Link to={`/my-lessons/${lessonBlock.next.id}`} className="font-semibold text-brand-500 hover:underline">
                  {t('portal:nextLessonLabel')}: {lessonBlock.next.topic || lessonBlock.next.curriculum_lessons?.title || ''} (#{lessonBlock.next.curriculum_lessons?.lesson_number})
                </Link>
              ) : (
                <span>{t('portal:nextLessonLabel')}: —</span>
              )}
            </div>
          </div>
        </>
      )}

      <SectionLabel>{t('dashboard:milestonesTitle')}</SectionLabel>
      <div className="mb-6">
        <BadgeShelf badges={badges} />
      </div>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink/50">{t('portal:attendanceHistory')}</h2>
      {attendanceRows.length === 0 ? (
        <div className="mb-6 rounded-xl bg-white p-6 text-center text-sm text-ink/50 shadow-card">{t('portal:noAttendanceRecorded')}</div>
      ) : (
        <div className="mb-6 space-y-2">
          {attendanceRows.map((a) => {
            const Icon = STATUS_ICON[a.status];
            return (
              <div key={a.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
                <p className="font-semibold text-ink">{formatWeekdayDate(new Date(a.date), dateLocale)}</p>
                <span className={`flex items-center gap-1 text-sm font-semibold ${STATUS_COLOR[a.status]}`}>
                  <Icon size={16} /> {t(`attendance:${a.status.toLowerCase()}`)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink/50">{t('portal:homeworkProgressTitle')}</h2>
      <Panel title={t('portal:recentHomeworkTitle')} action={<span className="text-xs font-semibold text-ink/50">{t('portal:homeworkCompletedOfTotal', { completed: homeworkStats.completed, total: homeworkStats.total })}</span>}>
        {homeworkRows.length === 0 ? (
          <p className="text-sm text-ink/50">{t('dashboard:noHomeworkAssignedYet')}</p>
        ) : (
          <div className="space-y-2">
            {homeworkRows.slice(0, 5).map((h) => {
              const status = h.statusRow?.status || 'Assigned';
              return (
                <div key={h.id} className="rounded-lg border border-ink/[0.06] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{h.title}</p>
                    <StatusPill tone={HOMEWORK_TONE[status]}>{t(`dashboard:${status === 'Assigned' ? 'assigned' : status === 'Submitted' ? 'awaitingSubmission' : 'graded'}`)}</StatusPill>
                  </div>
                  {h.statusRow?.feedback && (
                    <p className="mt-1 text-xs text-ink/50">{t('portal:teacherFeedbackLabel')}: {h.statusRow.feedback}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {(finalWriting || finalSpeaking) && (
        <div className="mb-6 rounded-xl border-2 border-brand-200 bg-brand-50/40 p-4 shadow-card">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-brand-700">
            🏆 {t('portal:finalExamsTitle')}
          </h2>
          <div className="space-y-2">
            {finalWriting && (
              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                <span className="text-sm font-semibold text-ink">✍️ {t('portal:finalWritingExam')}</span>
                {finalWriting.score != null ? (
                  <span className="text-sm font-bold text-brand-600">{finalWriting.score}/{finalWriting.exam.max_score}</span>
                ) : (
                  <StatusPill tone="info">{t('dashboard:awaitingGrading')}</StatusPill>
                )}
              </div>
            )}
            {finalSpeaking && (
              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                <span className="text-sm font-semibold text-ink">🗣️ {t('portal:finalSpeakingExam')}</span>
                {finalSpeaking.score != null ? (
                  <span className="text-sm font-bold text-brand-600">{finalSpeaking.score}/{finalSpeaking.exam.max_score}</span>
                ) : (
                  /* "Awaiting grading" implies the student submitted something and it's in
                     a grading queue - Speaking exams have no submission step at all, so
                     that phrasing doesn't apply here the way it does for Writing. */
                  <StatusPill tone="info">{t('exams:resultPending')}</StatusPill>
                )}
              </div>
            )}
          </div>
          {finalExamContribution != null && (
            <p className="mt-3 text-xs font-semibold text-brand-700">
              {t('portal:finalExamContribution')}: {t('portal:finalExamContributionPoints', { points: finalExamContribution })}
            </p>
          )}
        </div>
      )}

      <h2 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-ink/50">{t('portal:examScores')}</h2>
      {examTrend && (
        <p className="mb-3 text-sm text-ink/60">
          {examTrend.direction === 'flat'
            ? t('portal:examTrendSame')
            : examTrend.direction === 'up'
              ? t('portal:examTrendUp', { delta: examTrend.delta })
              : t('portal:examTrendDown', { delta: examTrend.delta })}
        </p>
      )}
      {examRows.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-sm text-ink/50 shadow-card">{t('portal:noExamScoresYet')}</div>
      ) : (
        <div className="space-y-2">
          {examRows.map((s) => (
            <div key={s.id} className="rounded-xl bg-white p-3 shadow-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink">{s.exam.title}</p>
                  <p className="text-xs text-ink/50">{s.exam.exam_date}</p>
                </div>
                {s.score != null ? (
                  <p className="text-sm font-bold text-brand-500">
                    {s.score} / {s.exam.max_score}
                  </p>
                ) : (
                  <StatusPill tone="info">{t('dashboard:awaitingGrading')}</StatusPill>
                )}
              </div>
              {s.feedback && <p className="mt-1 text-xs text-ink/50">{t('portal:teacherFeedbackLabel')}: {s.feedback}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
