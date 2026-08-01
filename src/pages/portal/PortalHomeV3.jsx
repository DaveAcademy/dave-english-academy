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
import { CalendarClock, MessageSquare, Award, Trophy, BookOpen, FileCheck2, CreditCard } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getLeaderboard } from '../../lib/db';
import { getStudentPaymentStatus } from '../../lib/storageBridge';
import Panel from '../../components/Panel';
import StatCard from '../../components/StatCard';
import StatusPill from '../../components/StatusPill';
import BadgeShelf from '../../components/BadgeShelf';
import ProfileHeroCard from '../../components/ProfileHeroCard';
import QuickActions from '../../components/QuickActions';
import SectionLabel from '../../components/SectionLabel';
import { computeBadges } from '../../utils/badges';
import { attendanceRate, filterByYearMonth } from '../../utils/attendance';
import { currentAndPreviousMonth, trendFrom, formatDateOnly } from '../../utils/date';
import { formatUZS } from '../../utils/format';

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

function currentPresentStreak(records) {
  const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
  let streak = 0;
  for (const r of sorted) {
    if (r.status === 'Present') streak += 1;
    else break;
  }
  return streak;
}

export default function PortalHomeV3() {
  const { t, i18n } = useTranslation(['dashboard', 'nav']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { students, lessons, attendance, homework, homeworkStatus, examScores, certificates } = useAcademy();
  const me = students[0];
  const [leaderboard, setLeaderboard] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const { current, previous } = useMemo(() => currentAndPreviousMonth(), []);

  useEffect(() => {
    let cancelled = false;
    getLeaderboard()
      .then((rows) => !cancelled && setLeaderboard([...(rows || [])].sort((a, b) => b.points - a.points || a.real_name.localeCompare(b.real_name))))
      .catch(() => !cancelled && setLeaderboard([]));
    return () => {
      cancelled = true;
    };
  }, []);

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

  const { points, rank } = useMemo(() => {
    if (!me || !leaderboard) return { points: 0, rank: null };
    const idx = leaderboard.findIndex((r) => r.student_id === me.id);
    return { points: leaderboard[idx]?.points ?? 0, rank: idx >= 0 ? idx + 1 : null };
  }, [leaderboard, me]);

  const topFour = useMemo(() => (leaderboard || []).slice(0, 4), [leaderboard]);

  // Lessons no longer carry a meaningful scheduled_at (it's set to
  // creation time and never edited - see Lessons.jsx and PortalHome.jsx's
  // own note on this), so "upcoming" shows the most recently created
  // lessons for the student's level/group instead of filtering by date.
  const upcoming = useMemo(() => {
    return lessons
      .filter((l) => !me || (!l.group_name && !l.level) || l.group_name === me.group_name || l.level === me.level)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 4);
  }, [lessons, me]);

  const stats = useMemo(() => {
    const monthRecords = filterByYearMonth(attendance, 'date', current.year, current.month);
    const lastMonthRecords = filterByYearMonth(attendance, 'date', previous.year, previous.month);
    const rate = attendanceRate(monthRecords);
    const lastRate = attendanceRate(lastMonthRecords);
    const streak = currentPresentStreak(attendance);

    const scored = examScores.filter((s) => s.score != null);
    const examAvg = scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + Number(s.score), 0) / scored.length) : null;

    const myHomework = me ? homework.filter((h) => !h.level || h.level === me.level) : [];
    const statusOf = (id) => homeworkStatus.find((h) => h.homework_id === id)?.status || 'Assigned';
    const submitted = myHomework.filter((h) => statusOf(h.id) === 'Submitted').length;
    const graded = myHomework.filter((h) => statusOf(h.id) === 'Graded').length;
    const pending = myHomework.length - submitted - graded;
    const homeworkDoneRate = myHomework.length > 0 ? Math.round(((submitted + graded) / myHomework.length) * 100) : null;

    // "Completed" no longer has a real date signal to key off (see the
    // upcoming-lessons note above), so this counts all lessons visible to
    // the student's level/group rather than a date-filtered subset.
    const lessonsCompleted = lessons.filter(
      (l) => !me || (!l.group_name && !l.level) || l.group_name === me.group_name || l.level === me.level
    ).length;

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
  }, [attendance, examScores, homework, homeworkStatus, lessons, me, current, previous]);

  const badges = useMemo(
    () =>
      computeBadges({
        attendanceRate: stats.attendanceRate,
        attendanceStreak: stats.attendanceStreak,
        homeworkTotal: stats.homeworkTotal,
        homeworkDoneRate: stats.homeworkDoneRate,
        examAvg: stats.examAvg,
        lessonsCompleted: stats.lessonsCompleted,
        rank,
      }),
    [stats, rank]
  );

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
    { to: '/my-ranking', label: t('leaderboard'), Icon: Trophy },
    { to: '/chat', label: t('nav:messages'), Icon: MessageSquare },
  ];

  if (!me) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('notLinkedYet')}</p>
        <p className="mt-1 text-sm text-ink/50">{t('notLinkedSubtitle')}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm font-medium text-ink/50">{t('v3Tagline')}</p>

      <div className="mb-6">
        <ProfileHeroCard
          studentId={me.id}
          name={me.real_name}
          meta={t('v3ClassMeta', { level: me.level, group: me.group_name || t('v3NoGroup'), points })}
          points={points}
          rank={rank}
          streak={stats.attendanceStreak}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div>
          <StatCard label={t('nav:attendance')} value={stats.attendanceRate == null ? '—' : `${stats.attendanceRate}%`} trend={stats.attendanceTrend} tone="success" icon={CalendarClock} />
          {attendanceStatusValue && (
            <div className="mt-1.5"><StatusPill tone={attendanceStatusValue.tone}>{t(attendanceStatusValue.key)}</StatusPill></div>
          )}
        </div>
        {!homeworkStatusValue ? (
          <div className="rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
            <p className="text-xs font-medium text-ink/60 sm:text-sm">{t('homework')}</p>
            <p className="mt-1.5 text-sm font-semibold text-ink sm:mt-2">{t('v3NoAssignmentsYet')}</p>
            <div className="mt-1.5"><StatusPill tone="info">ℹ️ {t('v3WaitingForHomework')}</StatusPill></div>
          </div>
        ) : (
          <div>
            <StatCard label={t('homework')} value={`${stats.homeworkDoneRate}%`} tone="info" icon={BookOpen} />
            <div className="mt-1.5"><StatusPill tone={homeworkStatusValue.tone}>{t(homeworkStatusValue.key)}</StatusPill></div>
          </div>
        )}
        <div>
          <StatCard label={t('examAverage')} value={stats.examAvg == null ? '—' : `${stats.examAvg}%`} tone="brand" icon={FileCheck2} />
          {examStatusValue && (
            <div className="mt-1.5"><StatusPill tone={examStatusValue.tone}>{t(examStatusValue.key)}</StatusPill></div>
          )}
        </div>
        <StatCard label={t('v3LessonsCompletedLabel')} value={stats.lessonsCompleted} tone="info" icon={CalendarClock} />
      </div>

      <Link
        to={nextStep.to}
        className="mb-6 flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3.5 shadow-card transition-colors hover:bg-brand-100/60"
      >
        <span className="text-2xl" aria-hidden="true">{nextStep.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-500">{t('v3YourNextStepLabel')}</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{t(nextStep.titleKey)}</p>
          <p className="text-xs text-ink/60">{t(nextStep.textKey)}</p>
        </div>
      </Link>

      {paymentStatus && (
        <div className="mb-6">
          <Panel title={t('v3PaymentTitle')} icon={CreditCard}>
            {(() => {
              const date = formatDateOnly(paymentStatus.next_due_date, dateLocale);
              // Genuinely paid-ahead vs. never-paid-but-nothing-due-yet both
              // return status='paid' (correct - neither owes anything right
              // now), but they must not read the same way to a student who
              // has never made a payment. Found this exact gap verifying
              // against a real student (paid_to_date 0, status 'paid') before
              // shipping - see migration 0063.
              const isFirstPaymentDue = paymentStatus.status === 'paid' && Number(paymentStatus.paid_to_date) === 0 && paymentStatus.next_due_date;
              const kind = paymentStatus.status === 'overdue' ? 'overdue' : paymentStatus.status === 'due_soon' ? 'dueSoon' : isFirstPaymentDue ? 'firstDue' : 'paid';
              const headlineKey = {
                overdue: 'v3PaymentHeadlineOverdue',
                dueSoon: 'v3PaymentHeadlineDueSoon',
                firstDue: 'v3PaymentHeadlineFirstDue',
                paid: 'v3PaymentHeadlinePaid',
              }[kind];
              const explanationKey = {
                overdue: 'v3PaymentExplanationOverdue',
                dueSoon: 'v3PaymentExplanationDueSoon',
                firstDue: 'v3PaymentExplanationFirstDue',
                paid: 'v3PaymentExplanationPaid',
              }[kind];
              const headlineColor = { overdue: 'text-inactive', dueSoon: 'text-levelB', firstDue: 'text-levelA', paid: 'text-active' }[kind];
              // The exact amount of the specific period that's due - not an
              // approximation from monthly_fee, which would be wrong for a
              // prorated first payment. outstanding (not next_amount_due) is
              // used for overdue since it correctly sums every unpaid period,
              // not just the next one.
              const amountToPay = paymentStatus.status === 'overdue' ? paymentStatus.outstanding : paymentStatus.next_amount_due;
              return (
                <>
                  <p className={`text-base font-bold ${headlineColor}`}>{t(headlineKey, { date })}</p>
                  <p className="mt-1 text-sm text-ink/60">{t(explanationKey)}</p>

                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-ink/[0.06] pt-3 text-sm">
                    <div>
                      <p className="text-xs text-ink/50">{t('v3PaymentMonthlyFee')}</p>
                      <p className="font-semibold text-ink">{formatUZS(paymentStatus.monthly_fee)}</p>
                    </div>
                    {paymentStatus.next_due_date && (
                      <div>
                        <p className="text-xs text-ink/50">{t('v3PaymentNextDue')}</p>
                        <p className="font-semibold text-ink">{date}</p>
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
        <SectionLabel>{t('achievementsTitle')}</SectionLabel>
        <BadgeShelf badges={badges} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel title={t('v3SmartInsightsTitle')}>
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div key={i} className="rounded-lg border border-brand-100 bg-brand-50 p-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-500">{ins.tag}</p>
                <p className="mt-0.5 text-sm text-ink">{ins.text}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t('v3ClassLeaderboardTitle')} action={<Link to="/my-ranking" className="text-xs font-semibold text-brand-500 hover:underline">{t('fullLeaderboard')}</Link>}>
          {topFour.length === 0 ? (
            <p className="text-sm text-ink/50">{t('noRankingDataYet')}</p>
          ) : (
            <div className="space-y-2">
              {topFour.map((r, i) => (
                <div key={r.student_id} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${r.student_id === me.id ? 'bg-brand-50' : ''}`}>
                  <span className="w-5 font-mono text-xs font-bold text-levelB">{i + 1}</span>
                  <span className={`flex-1 truncate ${r.student_id === me.id ? 'font-bold text-brand-500' : 'text-ink'}`}>
                    {r.student_id === me.id ? t('v3YouLabel') : r.real_name}
                  </span>
                  <span className="font-mono text-xs text-ink/50">{r.points} {t('points')}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel title={t('certificatesTitle')} icon={Award} action={<Link to="/my-certificates" className="text-xs font-semibold text-brand-500 hover:underline">{t('viewAll')}</Link>}>
          {certificates.length === 0 ? (
            <p className="text-sm text-ink/50">{t('noCertificatesYet')}</p>
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
            <p className="text-sm text-ink/50">{t('noUpcomingLessons')}</p>
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
