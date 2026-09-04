// PortalHomeV3.jsx
// "Progress Studio" - the approved V3-B direction. Separate route from
// PortalHome.jsx (untouched) and PortalHomeV2.jsx (untouched, still
// live at /dashboard-v2 for comparison). Same duplication trade-off as
// V2: stat computation is copied rather than extracted into a shared
// hook, since extracting would mean editing PortalHome.jsx too - fine
// for a comparison-phase prototype, worth de-duplicating once this (or
// another direction) is picked as final.
//
// Real data only: certificates and upcoming lessons are the same
// pre-existing logic from PortalHome.jsx, restored here after V2 had
// dropped them for scope - the "information completeness" requirement
// from the V3 spec means this page should not be thinner than the
// current dashboard.
//
// i18n: fully localized via the dashboard/nav namespaces, same pattern as
// PortalHome.jsx. Status/next-step/insight helpers below return
// translation keys rather than literal text (this is plain logic, no
// access to useTranslation()) - the component resolves them via t().

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarClock, MessageSquare, Award, BookOpen, FileCheck2, CreditCard, Flame, GraduationCap, Trophy, Target, Layers, Languages } from 'lucide-react';
import {
  LESSON_STATUS, teacherPaceFor, lessonCapFor, progressByLessonNumber, lessonStatusFor, nextUnfinishedLesson, translatedLessonTitle,
} from '../../lib/lessonLogic';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getStudentPaymentStatus } from '../../lib/storageBridge';
import Panel from '../../components/Panel';
import StatCard from '../../components/StatCard';
import StatusPill from '../../components/StatusPill';
import QuickActions from '../../components/QuickActions';
import SectionLabel from '../../components/SectionLabel';
import { attendanceRate, filterByYearMonth, currentStreak } from '../../utils/attendance';
import { currentAndPreviousMonth, trendFrom, formatDateOnly, timeOfDayGreeting, formatWeekdayName, formatFullDateNumeric, formatClockTime } from '../../utils/date';
import { formatUZS } from '../../utils/format';
import { useLocalClock } from '../../hooks/useLocalClock';

// Per-metric status thresholds - deliberately different per metric rather
// than one flat cutoff, because each behaves differently in practice:
//
// Attendance: easy to keep at/near 100%, so even a modest drop is a real
// signal. Mirrors common school-attendance framing (~90%+ is "regular",
// dropping toward 75% is a recognized chronic-absence concern).
//   >=90 good, 75-89 watch, <75 attention
//
// Homework completion: cumulative and catch-up-able - a busy week
// shouldn't read as a crisis the way missed classes do. More forgiving
// band before flagging attention.
//   >=80 good, 50-79 watch, <50 attention
//
// Exam average: follows ordinary grading-scale convention, where 50-69%
// is a normal "needs work but not failing" band rather than alarming.
//   >=70 good, 50-69 watch, <50 attention
function attendanceStatus(rate) {
  if (rate >= 90) return { tone: 'good', key: 'statusOnTrack' };
  if (rate >= 75) return { tone: 'watch', key: 'statusWatch' };
  return { tone: 'attention', key: 'needsAttentionLabel' };
}
// Named homeworkStatusFor (not homeworkStatus) deliberately - useAcademy()
// returns a field also called `homeworkStatus` (the raw per-item status
// array), and destructuring that inside the component would have shadowed
// a same-named function here for the entire component body. That's not a
// hypothetical: it happened, and crashed with a TypeError for any student
// whose homeworkDoneRate wasn't null - untested because the only live
// account checked during development had no homework data at all, so the
// crashing branch never ran. Found during this review's code-quality pass.
function homeworkStatusFor(rate) {
  if (rate >= 80) return { tone: 'good', key: 'statusOnTrack' };
  if (rate >= 50) return { tone: 'watch', key: 'statusWatch' };
  return { tone: 'attention', key: 'needsAttentionLabel' };
}
function examStatus(avg) {
  if (avg >= 70) return { tone: 'good', key: 'statusOnTrack' };
  if (avg >= 50) return { tone: 'watch', key: 'statusWatch' };
  return { tone: 'attention', key: 'needsAttentionLabel' };
}

const GREETING_EMOJI = {
  greetingMorning: '🌅',
  greetingAfternoon: '☀️',
  greetingEvening: '🌇',
  greetingNight: '🌙',
};

function gameTierForPoints(points) {
  if (points >= 1000) return { key: 'v3TierDiamond', color: 'text-[#6B6BEC] bg-[#6B6BEC]/10 border-[#6B6BEC]/15' };
  if (points >= 600) return { key: 'v3TierGold', color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' };
  if (points >= 300) return { key: 'v3TierSilver', color: 'text-ink/70 bg-ink/[0.06] border-ink/10' };
  if (points >= 100) return { key: 'v3TierBronze', color: 'text-amber-700 bg-amber-600/10 border-amber-600/15' };
  return { key: 'v3TierStarter', color: 'text-ink/60 bg-ink/[0.04] border-ink/[0.06]' };
}

function nextMilestoneMeta(completed) {
  const milestones = [5, 10, 20, 30, 50, 75, 100];
  const next = milestones.find((m) => m > completed) || null;
  if (!next) return { label: null, remaining: 0, done: true };
  return { label: next, remaining: next - completed, done: false };
}

// Rule-based "next step" - never just a stack of red pills. Priority order
// (attendance > homework > exam) matches the reasoning already used for
// the thresholds above: attendance is the most foundational habit metric,
// so it's addressed first if it's the one that's slipping. Homework with
// no data at all (rate === null) is excluded from consideration here -
// there's nothing actionable to recommend about homework that doesn't
// exist yet, so it falls through to whichever real metric needs it.
function nextStepFor(attendance, homework, exam) {
  const candidates = [attendance, homework, exam];
  if (candidates.some((c) => c?.tone === 'attention' || c?.tone === 'watch')) {
    if (attendance?.tone === 'attention' || attendance?.tone === 'watch') {
      return { icon: '📅', to: '/progress', titleKey: 'v3NextStepAttendanceTitle', textKey: 'v3NextStepAttendanceText' };
    }
    if (homework?.tone === 'attention' || homework?.tone === 'watch') {
      return { icon: '📝', to: '/my-homework', titleKey: 'v3NextStepHomeworkTitle', textKey: 'v3NextStepHomeworkText' };
    }
    return { icon: '📚', to: '/my-exams', titleKey: 'v3NextStepExamTitle', textKey: 'v3NextStepExamText' };
  }
  return { icon: '⭐', to: '/my-ranking', titleKey: 'v3NextStepMomentumTitle', textKey: 'v3NextStepMomentumText' };
}

export default function PortalHomeV3() {
  const { t, i18n } = useTranslation(['dashboard', 'nav']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { lessons, attendance, homework, homeworkStatus, exams, examScores, certificates, curriculumProgress, lessonProgress, me } = useAcademy();
  const [paymentStatus, setPaymentStatus] = useState(null);
  const { current, previous } = useMemo(() => currentAndPreviousMonth(), []);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    getStudentPaymentStatus(me.id)
      .then((st) => !cancelled && setPaymentStatus(st))
      .catch(() => !cancelled && setPaymentStatus(null));
    return () => {
      cancelled = true;
    };
  }, [me]);

  // Lessons no longer carry a meaningful scheduled_at (it's set to
  // creation time and never edited - see Lessons.jsx and PortalHome.jsx's
  // own note on this), so ordering follows the permanent curriculum
  // sequence (curriculum_lessons.lesson_number), never creation/upload
  // date - matches MyLessons.jsx. Legacy lessons with no curriculum link
  // have no fixed position, so they sort after the curriculum ones.
  //
  // The full visible set in curriculum order backs the Continue Learning
  // CTA, the real completion count, and the upcoming widget below.
  const myLessons = useMemo(() => {
    if (!me) return [];
    return [...lessons]
      .filter((l) => (!l.group_name && !l.level) || l.group_name === me.group_name || l.level === me.level)
      .sort((a, b) => {
        const an = a.curriculum_lessons?.lesson_number;
        const bn = b.curriculum_lessons?.lesson_number;
        if (an != null && bn != null) return an - bn;
        if (an != null) return -1;
        if (bn != null) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }, [lessons, me]);
  const upcoming = useMemo(() => myLessons.slice(0, 4), [myLessons]);

  // Same unlock/status rules as MyLessons (lessonLogic.js) - the Continue
  // Learning button always points at the first unlocked, unfinished lesson.
  const pace = teacherPaceFor(curriculumProgress, me?.level);
  const cap = lessonCapFor(curriculumProgress, me?.level);
  const progressByNum = useMemo(() => progressByLessonNumber(lessonProgress, myLessons), [lessonProgress, myLessons]);
  const nextLesson = useMemo(
    () => nextUnfinishedLesson(myLessons, pace, progressByNum, undefined, cap),
    [myLessons, pace, progressByNum, cap]
  );
  const lessonStats = useMemo(() => {
    let completed = 0;
    for (const l of myLessons) {
      if (lessonStatusFor(l, pace, progressByNum, cap) === LESSON_STATUS.COMPLETED) completed += 1;
    }
    return {
      total: myLessons.length,
      completed,
      remaining: myLessons.length - completed,
      percent: myLessons.length > 0 ? Math.round((completed / myLessons.length) * 100) : 0,
    };
  }, [myLessons, pace, progressByNum, cap]);

  const stats = useMemo(() => {
    const monthRecords = filterByYearMonth(attendance, 'date', current.year, current.month);
    const lastMonthRecords = filterByYearMonth(attendance, 'date', previous.year, previous.month);
    const rate = attendanceRate(monthRecords);
    const lastRate = attendanceRate(lastMonthRecords);
    const streak = currentStreak(attendance);

    // Normalized against each exam's own max_score (average of score/max → %)
    // - the same formula the Dashboard and MyProgress use, so the number shown
    // here always agrees with theirs, even when exams have different totals.
    const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));
    const scored = examScores.filter((s) => s.score != null);
    const examAvg = scored.length > 0
      ? Math.round((scored.reduce((sum, s) => sum + Number(s.score) / (examsById[s.exam_id]?.max_score || 100), 0) / scored.length) * 100)
      : null;

    const myHomework = me ? homework.filter((h) => !h.level || h.level === me.level) : [];
    const statusOf = (id) => homeworkStatus.find((h) => h.homework_id === id)?.status || 'Assigned';
    const submitted = myHomework.filter((h) => statusOf(h.id) === 'Submitted').length;
    const graded = myHomework.filter((h) => statusOf(h.id) === 'Graded').length;
    const pending = myHomework.length - submitted - graded;
    const homeworkDoneRate = myHomework.length > 0 ? Math.round(((submitted + graded) / myHomework.length) * 100) : null;

    // Real completion count from student_lesson_progress (via lessonStats),
    // not a "how many lessons are visible" estimate.
    const lessonsCompleted = lessonStats.completed;

    return {
      attendanceRate: rate,
      attendanceTrend: trendFrom(rate, lastRate, '%'),
      attendanceStreak: streak,
      examAvg,
      examCount: scored.length,
      homeworkTotal: myHomework.length,
      homeworkDoneRate,
      homeworkPending: pending,
      lessonsCompleted,
    };
  }, [attendance, exams, examScores, homework, homeworkStatus, lessonStats, me, current, previous]);

  const insights = useMemo(() => {
    const list = [];
    if (stats.attendanceTrend) {
      const { direction, values } = stats.attendanceTrend;
      const delta = `${values.delta}${values.unit}`;
      if (direction === 'up') list.push({ tag: t('insightTagMomentum'), text: t('insightAttendanceUp', { delta }) });
      else if (direction === 'down') list.push({ tag: t('insightTagAttention'), text: t('insightAttendanceDown', { delta }) });
    }
    if (stats.homeworkPending > 0) {
      list.push({ tag: t('insightTagAction'), text: t('insightHomeworkPending', { count: stats.homeworkPending }) });
    }
    if (stats.examAvg != null) {
      list.push(
        stats.examAvg >= 80
          ? { tag: t('insightTagStrength'), text: t('insightExamStrength', { avg: stats.examAvg, count: stats.examCount }) }
          : { tag: t('insightTagSuggestion'), text: t('insightExamSuggestion', { avg: stats.examAvg }) }
      );
    }
    if (list.length === 0) list.push({ tag: t('insightTagStatus'), text: t('insightNotEnoughActivity') });
    return list.slice(0, 3);
  }, [stats, t]);

  // Computed once here and reused below for both the status pills and the
  // next-step recommendation, instead of each caller re-deriving the same
  // status from the same rate - was previously called 2-3x per metric per
  // render for identical inputs.
  const attendanceStatusValue = stats.attendanceRate == null ? null : attendanceStatus(stats.attendanceRate);
  const homeworkStatusValue = stats.homeworkDoneRate == null ? null : homeworkStatusFor(stats.homeworkDoneRate);
  const examStatusValue = stats.examAvg == null ? null : examStatus(stats.examAvg);
  const nextStep = nextStepFor(attendanceStatusValue, homeworkStatusValue, examStatusValue);

  const quickActions = [
    { to: '/my-homework', label: t('nav:myHomeworkFull'), Icon: BookOpen },
    { to: '/my-exams', label: t('nav:myExamsFull'), Icon: FileCheck2 },
    { to: '/my-certificates', label: t('nav:certificates'), Icon: Award },
    { to: '/chat', label: t('nav:messages'), Icon: MessageSquare },
  ];

  // Tashkent greeting — re-evaluated every 15s via useLocalClock (interval is inside the hook)
  const now = useLocalClock();
  const greetingKey = timeOfDayGreeting(now);
  const greetingEmoji = GREETING_EMOJI[greetingKey] || '👋';

  if (!me) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('notLinkedYet')}</p>
        <p className="mt-1 text-sm text-ink/50">{t('notLinkedSubtitle')}</p>
      </div>
    );
  }

  // Premium hero derived values — only valid when me exists (guarded above)
  const firstName = me.real_name.split(' ')[0];
  const initials = me.real_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const totalPoints = Number(me.points ?? 0);
  const tier = gameTierForPoints(totalPoints);
  const milestone = nextMilestoneMeta(lessonStats.completed);
  const nextLessonNumber = nextLesson?.curriculum_lessons?.lesson_number ?? null;
  const nextLessonTitle = nextLesson ? translatedLessonTitle(t, nextLessonNumber, nextLesson.topic || nextLesson.curriculum_lessons?.title || '') : '';
  const lessonProgressPercent = lessonStats.total > 0 ? Math.round((lessonStats.completed / lessonStats.total) * 100) : 0;
  const homeworkPendingCount = stats.homeworkPending;

  return (
    <div>
      <p className="mb-4 text-sm font-medium tracking-wide text-ink/45" style={{ animation: 'fadeIn 0.5s ease-out both' }}>{t('v3Tagline')}</p>

      {/* ── Premium hero ─────────────────────────────────────────────── */}
      <div
        className="mb-6 overflow-hidden rounded-[20px] border border-ink/[0.06] bg-white shadow-[0_2px_8px_rgba(27,36,48,0.04),0_8px_24px_rgba(27,36,48,0.06)]"
        style={{ animation: 'fadeIn 0.55s ease-out both' }}
      >
        {/* hairline brand accent */}
        <div className="h-[3px] w-full bg-brand-500" aria-hidden="true" />
        {/* greeting + identity row */}
        <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-display text-[22px] font-bold leading-none tracking-tight text-ink sm:text-[26px]">
                <span aria-hidden="true">{greetingEmoji} </span>{t(greetingKey)}, {firstName}!
              </p>
              <p className="mt-1.5 text-xs font-medium text-ink/45 sm:text-[13px]">
                {formatWeekdayName(now, dateLocale)} · {formatFullDateNumeric(now, dateLocale)} · {formatClockTime(now, dateLocale)}
              </p>
              <p className="mt-1 text-xs text-ink/40">
                {t('v3ClassMeta', { level: me.level, group: me.group_name || t('v3NoGroup'), points: totalPoints })}
              </p>
            </div>
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-ink/[0.06] bg-paper text-sm font-bold tracking-wide text-ink sm:h-12 sm:w-12 sm:text-base" aria-hidden="true">
              {initials}
            </div>
          </div>

          {/* compact stats strip — level / points / tier / streak / milestone */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/[0.06] pt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              <GraduationCap size={13} aria-hidden="true" />{t('v3LevelLabel', { level: me.level })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/[0.06] bg-white px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
              <Trophy size={13} className="text-brand-500" aria-hidden="true" />{totalPoints} {t('v3PointsLabel')}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tier.color}`}>
              <Layers size={13} aria-hidden="true" />{t(tier.key)}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${stats.attendanceStreak > 0 ? 'border-active/15 bg-active/10 text-active' : 'border-ink/[0.06] bg-white text-ink/50'}`}>
              <Flame size={13} aria-hidden="true" />{stats.attendanceStreak} · {t('v3StreakLabel')}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/[0.06] bg-white px-2.5 py-1 text-xs font-semibold text-ink/70">
              <Target size={13} className="text-ink/40" aria-hidden="true" />
              {milestone.done ? t('v3MilestoneComplete') : t('v3MilestoneLessons', { remaining: milestone.remaining, milestone: milestone.label })}
            </span>
          </div>
        </div>

        {/* Today's Learning + Next Goal */}
        <div className="grid gap-0 border-t border-ink/[0.06] sm:grid-cols-[1.15fr_1fr]">
          {/* Today's Learning — visually obvious */}
          <div className="border-b border-ink/[0.06] p-5 sm:border-b-0 sm:border-r sm:p-6" style={{ animation: 'slideUp 0.5s ease-out 0.12s both' }}>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-6 w-0.5 rounded-full bg-brand-500" aria-hidden="true" />
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40">{t('v3TodaysLearning')}</p>
              <span className="ml-auto text-[11px] font-medium text-ink/35">{lessonProgressPercent}%</span>
            </div>
            {/* thin progress rail */}
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${lessonProgressPercent}%` }} />
            </div>
            <ul className="space-y-2.5">
              <li className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-paper px-3 py-2.5">
                <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${nextLesson ? 'bg-brand-500 text-white' : 'bg-active/15 text-active'}`}>
                  <BookOpen size={14} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-wide text-ink/40">{t('v3MissionLesson')}</span>
                  <span className="block truncate text-sm font-semibold text-ink">{nextLesson ? nextLessonTitle : t('v3AllCaughtUp')}</span>
                </span>
                {nextLesson ? (
                  <Link to={`/my-lessons/${nextLesson.id}`} className="flex-shrink-0 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-ink/90">
                    {t('v3MissionLessonContinue')}
                  </Link>
                ) : (
                  <span className="text-xs font-medium text-active">✓</span>
                )}
              </li>
              <li className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-white px-3 py-2.5">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-levelA/10 text-levelA">
                  <Languages size={14} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-wide text-ink/40">{t('v3MissionVocab')}</span>
                  <span className="block text-sm font-semibold text-ink">
                    {nextLesson ? t('v3MissionVocabHint', { count: nextLesson.vocabulary_count || 10 }) : t('v3MissionVocabHint', { count: 10 })}
                  </span>
                </span>
                <Link to={nextLesson ? `/my-lessons/${nextLesson.id}` : '/my-lessons'} className="flex-shrink-0 text-xs font-semibold text-brand-600 hover:underline">
                  {t('viewAll')}
                </Link>
              </li>
              <li className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-white px-3 py-2.5">
                <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${homeworkPendingCount > 0 ? 'bg-levelB/15 text-levelB' : 'bg-active/10 text-active'}`}>
                  <FileCheck2 size={14} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-wide text-ink/40">{t('v3MissionHomework')}</span>
                  <span className="block text-sm font-semibold text-ink">
                    {homeworkPendingCount > 0 ? t('v3MissionHomeworkPending', { count: homeworkPendingCount }) : t('v3MissionHomeworkDone')}
                  </span>
                </span>
                {homeworkPendingCount > 0 && (
                  <Link to="/my-homework" className="flex-shrink-0 text-xs font-semibold text-brand-600 hover:underline">
                    {t('viewAll')}
                  </Link>
                )}
              </li>
            </ul>
          </div>

          {/* Next Goal — prominent */}
          <div className="bg-paper/60 p-5 sm:p-6" style={{ animation: 'slideUp 0.5s ease-out 0.2s both' }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40">{t('v3NextGoalLabel')}</p>
            {nextLesson ? (
              <>
                <p className="mt-2 font-display text-[20px] font-bold leading-tight tracking-tight text-ink sm:text-[22px]">
                  {t('v3NextGoalFinish', { number: nextLessonNumber })}
                </p>
                <p className="mt-1 line-clamp-2 text-sm leading-snug text-ink/60">
                  {nextLessonTitle}
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs text-ink/45">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 font-medium shadow-sm">
                    <Target size={12} aria-hidden="true" /> {t('v3LessonsProgress', { completed: lessonStats.completed, total: lessonStats.total })}
                  </span>
                  {stats.attendanceStreak > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Flame size={12} className="text-active" aria-hidden="true" />{stats.attendanceStreak}-day
                    </span>
                  )}
                </div>
                <Link
                  to={`/my-lessons/${nextLesson.id}`}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(27,36,48,0.12)] transition-colors hover:bg-ink/90 sm:w-auto"
                >
                  {t('v3OpenLesson')} <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <p className="mt-2 text-xs text-ink/35">
                  {lessonStats.remaining > 0 ? t('v3LessonsRemaining', { remaining: lessonStats.remaining }) : t('v3AllCaughtUpHint')}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 font-display text-[20px] font-bold leading-tight tracking-tight text-ink sm:text-[22px]">
                  {t('v3NextGoalAllDone')}
                </p>
                <p className="mt-1 text-sm leading-snug text-ink/60">{t('v3AllCaughtUpHint')}</p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-active/10 px-3 py-2 text-sm font-semibold text-active">
                  <Trophy size={16} aria-hidden="true" /> {t('v3MilestoneComplete')}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div style={{ animation: 'slideUp 0.45s ease-out 0.28s both' }}>
          <StatCard label={t('nav:attendance')} value={stats.attendanceRate == null ? '—' : `${stats.attendanceRate}%`} trend={stats.attendanceTrend} tone="success" icon={CalendarClock} />
          {attendanceStatusValue && (
            <div className="mt-1.5"><StatusPill tone={attendanceStatusValue.tone}>{t(attendanceStatusValue.key)}</StatusPill></div>
          )}
        </div>
        {!homeworkStatusValue ? (
          <div className="rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5" style={{ animation: 'slideUp 0.45s ease-out 0.34s both' }}>
            <p className="text-xs font-medium text-ink/60 sm:text-sm">{t('homework')}</p>
            <p className="mt-1.5 text-sm font-semibold text-ink sm:mt-2">{t('v3NoAssignmentsYet')}</p>
            <div className="mt-1.5"><StatusPill tone="info">ℹ️ {t('v3WaitingForHomework')}</StatusPill></div>
          </div>
        ) : (
          <div style={{ animation: 'slideUp 0.45s ease-out 0.34s both' }}>
            <StatCard label={t('homework')} value={`${stats.homeworkDoneRate}%`} tone="info" icon={BookOpen} />
            <div className="mt-1.5"><StatusPill tone={homeworkStatusValue.tone}>{t(homeworkStatusValue.key)}</StatusPill></div>
          </div>
        )}
        <div style={{ animation: 'slideUp 0.45s ease-out 0.40s both' }}>
          <StatCard label={t('examAverage')} value={stats.examAvg == null ? '—' : `${stats.examAvg}%`} tone="brand" icon={FileCheck2} />
          {examStatusValue && (
            <div className="mt-1.5"><StatusPill tone={examStatusValue.tone}>{t(examStatusValue.key)}</StatusPill></div>
          )}
        </div>
        <div style={{ animation: 'slideUp 0.45s ease-out 0.46s both' }}>
          <StatCard label={t('v3LessonsCompletedLabel')} value={stats.lessonsCompleted} tone="info" icon={CalendarClock} />
        </div>
      </div>

      <Link
        to={nextStep.to}
        className="mb-6 flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3.5 shadow-card transition-colors hover:bg-brand-100/60"
      >
        <span className="text-2xl" aria-hidden="true">{nextStep.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-600">{t('v3YourNextStepLabel')}</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{t(nextStep.titleKey)}</p>
          <p className="text-xs text-ink/60">{t(nextStep.textKey)}</p>
        </div>
      </Link>

      {paymentStatus && (
        <div className="mb-6">
          <Panel title={t('v3PaymentTitle')} icon={CreditCard}>
            {(() => {
              const nextDueText = formatDateOnly(paymentStatus.next_due_date, dateLocale);
              // Genuinely paid-ahead vs. never-paid-but-nothing-due-yet both
              // return status='paid' (correct - neither owes anything right
              // now), but they must not read the same way to a student who
              // has never made a payment. Found this exact gap verifying
              // against a real student (paid_to_date 0, status 'paid') before
              // shipping - see migration 0063.
              const isFirstPaymentDue = paymentStatus.status === 'paid' && Number(paymentStatus.paid_to_date) === 0 && paymentStatus.next_due_date;
              // paid_through_date (migration 0068) is the end of the last
              // period actually, fully covered - next_due_date points at the
              // following (not-yet-due, not-yet-paid) period instead, which
              // is the right field for "when is my next deadline" but the
              // wrong one for "paid until": it always lands one period past
              // what's actually been paid for. A partial payment that
              // doesn't fully cover even the current period leaves
              // paid_through_date null despite paid_to_date > 0 - that's the
              // 'partial' case below, not 'paid'.
              const isPartial = paymentStatus.status === 'paid' && Number(paymentStatus.paid_to_date) > 0 && !paymentStatus.paid_through_date;
              // A paid_through_date that ends before current_period_end used
              // to be handled here as a frontend-only "paid but current
              // period unpaid" case - migration 0071 moved it into the
              // backend (status='overdue' immediately, no grace until that
              // period closes), so it's now just the ordinary overdue
              // branch above like any other overdue student.
              const kind = paymentStatus.status === 'overdue' ? 'overdue' : paymentStatus.status === 'due_soon' ? 'dueSoon' : isFirstPaymentDue ? 'firstDue' : isPartial ? 'partial' : 'paid';
              const date = kind === 'paid' ? formatDateOnly(paymentStatus.paid_through_date, dateLocale) : nextDueText;
              const headlineKey = {
                overdue: 'v3PaymentHeadlineOverdue',
                dueSoon: 'v3PaymentHeadlineDueSoon',
                firstDue: 'v3PaymentHeadlineFirstDue',
                partial: 'v3PaymentHeadlinePartial',
                paid: 'v3PaymentHeadlinePaid',
              }[kind];
              const explanationKey = {
                overdue: 'v3PaymentExplanationOverdue',
                dueSoon: 'v3PaymentExplanationDueSoon',
                firstDue: 'v3PaymentExplanationFirstDue',
                partial: 'v3PaymentExplanationPartial',
                paid: 'v3PaymentExplanationPaid',
              }[kind];
              const headlineColor = { overdue: 'text-inactive', dueSoon: 'text-levelB', firstDue: 'text-levelA', partial: 'text-levelB', paid: 'text-active' }[kind];
              // The exact amount of the specific period that's due - not an
              // approximation from monthly_fee, which would be wrong for a
              // prorated first payment. outstanding (not next_amount_due) is
              // used for overdue since it correctly sums every unpaid period,
              // not just the next one.
              const amountToPay = paymentStatus.status === 'overdue' ? paymentStatus.outstanding : paymentStatus.next_amount_due;
              return (
                <>
                  <p className={`text-base font-bold ${headlineColor}`}>{t(headlineKey, { date, amount: formatUZS(paymentStatus.paid_to_date) })}</p>
                  <p className="mt-1 text-sm text-ink/60">{t(explanationKey)}</p>

                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-ink/[0.06] pt-3 text-sm">
                    <div>
                      <p className="text-xs text-ink/50">{t('v3PaymentMonthlyFee')}</p>
                      <p className="font-semibold text-ink">{formatUZS(paymentStatus.monthly_fee)}</p>
                    </div>
                    {/* Recurring monthly deadline (current_period_end) - the
                        calendar period "today" falls inside, unaffected by
                        when/whether it's been paid. Deliberately not
                        next_due_date, which is payment-gated. */}
                    {paymentStatus.current_period_end && (
                      <div>
                        <p className="text-xs text-ink/50">{t('v3PaymentNextDue')}</p>
                        <p className="font-semibold text-ink">{formatDateOnly(paymentStatus.current_period_end, dateLocale)}</p>
                      </div>
                    )}
                    {kind !== 'paid' && (
                      <div>
                        <p className="text-xs text-ink/50">{t('v3PaymentAmountToPay')}</p>
                        <p className="font-semibold text-ink">{formatUZS(amountToPay)}</p>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </Panel>
        </div>
      )}

      <div className="mb-6">
        <SectionLabel>{t('quickActionsLabel')}</SectionLabel>
        <QuickActions actions={quickActions} />
      </div>

      <div className="mb-6">
        <Panel title={t('v3SmartInsightsTitle')}>
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div key={i} className="rounded-lg border border-brand-100 bg-brand-50 p-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-600">{ins.tag}</p>
                <p className="mt-0.5 text-sm text-ink">{ins.text}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel title={t('certificatesTitle')} icon={Award} action={<Link to="/my-certificates" className="text-xs font-semibold text-brand-600 hover:underline">{t('viewAll')}</Link>}>
          {certificates.length === 0 ? (
            <div className="py-4 text-center">
              <Award className="mx-auto mb-2 text-ink/15" size={28} aria-hidden="true" />
              <p className="text-sm text-ink/50">{t('noCertificatesYet')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {certificates.slice(0, 4).map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 p-2.5">
                  <Award size={16} className="flex-shrink-0 text-brand-500" aria-hidden="true" />
                  <span className="truncate text-xs font-semibold text-ink">{c.title}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title={t('upcomingLessons')} icon={CalendarClock}>
          {upcoming.length === 0 ? (
            <div className="py-4 text-center">
              <CalendarClock className="mx-auto mb-2 text-ink/15" size={28} aria-hidden="true" />
              <p className="text-sm text-ink/50">{t('noUpcomingLessons')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-ink">{l.topic}</span>
                  {l.group_name && <span className="flex-shrink-0 text-xs text-ink/50">{l.group_name}</span>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
