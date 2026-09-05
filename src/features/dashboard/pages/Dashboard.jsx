import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import {
  Users,
  CalendarCheck,
  Wallet,
  AlertCircle,
  CalendarClock,
  BarChart3,
  Award,
  FileCheck2,
  BookOpen,
  ClipboardList,
  ImagePlus,
  ListChecks,
  Bell,
  LogIn,
  Globe,
  AlertTriangle,
} from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import {
  getMonthlyPaymentCollection,
  getPaymentCollectionSummary,
  getStudentPaymentStatus,
  listRecognitionAwards,
  listCertificates,
  listAllStudentLessonProgress,
  listStudentLoginInfo,
  getDailyMissionProgress,
  getWeeklyMissionProgress,
  getCurrentStreak,
  getBestStreak,
} from '../../../lib/storageBridge';
import { useAuth } from '../../../lib/AuthContext';
import StatCard from '../../../components/StatCard';
import Panel from '../../../components/Panel';
import DashboardHero from '../../../components/DashboardHero';
import QuickActions from '../../../components/QuickActions';
import AttentionCard from '../../../components/AttentionCard';
import MiniBarChart from '../../../components/MiniBarChart';
import SectionLabel from '../../../components/SectionLabel';
import DashboardErrorBoundary from '../../../components/DashboardErrorBoundary';
import ActivityFeed from '../../../components/ActivityFeed';
import ProgressAnalytics from '../../../components/ProgressAnalytics';
import WebsiteEngagementSummary from '../../../components/WebsiteEngagementSummary';
import AcademicProgressSummary from '../../../components/AcademicProgressSummary';
import DailyMissions from '../components/DailyMissions';
import WeeklyMissions from '../components/WeeklyMissions';
import StreakDisplay from '../components/StreakDisplay';
import { TONE } from '../../../utils/tone';
import { formatUZS } from '../../../utils/format';
import { attendanceRate, filterByYearMonth } from '../../../utils/attendance';
import { currentAndPreviousMonth, trendFrom } from '../../../utils/date';
import { LEVELS } from '../../../lib/levels';
import { buildStudentProgressRows, summarizeProgress } from '../../../lib/progressAnalytics';
import { buildWebsiteEngagementRows, summarizeWebsiteEngagement } from '../../../lib/websiteEngagement';

function lastNMonths(n) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleString('default', { month: 'short' }) });
  }
  return months;
}

export default function Dashboard() {
  const { role } = useAuth();
  return role === 'administrator' ? <AdminDashboard /> : <TeacherDashboard />;
}

function AdminDashboard() {
  const { t, i18n } = useTranslation('dashboard');
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { profile } = useAuth();
  const { students, attendance, exams, examScores, lessons, homeworkStatus, curriculumProgress, loading } = useAcademy();

  const months = useMemo(() => lastNMonths(6), []);
  const { current, previous } = useMemo(() => currentAndPreviousMonth(), []);

  const { me } = useAcademy();
  const [levelFilter, setLevelFilter] = useState('');
  const active = useMemo(
    () => students.filter((s) => s.status === 'Active' && (!levelFilter || s.level === levelFilter)),
    [students, levelFilter],
  );
  const groupLevels = levelFilter ? [levelFilter] : LEVELS;

  const [recentAwards, setRecentAwards] = useState([]);
  useEffect(() => {
    let cancelled = false;
    listRecognitionAwards()
      .then((rows) => {
        if (!cancelled) setRecentAwards(rows || []);
      })
      .catch(() => {
        if (!cancelled) setRecentAwards([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [certificates, setCertificates] = useState([]);
  useEffect(() => {
    let cancelled = false;
    listCertificates()
      .then((rows) => {
        if (!cancelled) setCertificates(rows || []);
      })
      .catch(() => {
        if (!cancelled) setCertificates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [allLessonProgress, setAllLessonProgress] = useState([]);
  const [progressLoading, setProgressLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listAllStudentLessonProgress()
      .then((rows) => {
        if (!cancelled) setAllLessonProgress(rows || []);
      })
      .catch(() => {
        if (!cancelled) setAllLessonProgress([]);
      })
      .finally(() => {
        if (!cancelled) setProgressLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [loginInfo, setLoginInfo] = useState([]);
  const [loginInfoLoading, setLoginInfoLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listStudentLoginInfo()
      .then((rows) => {
        if (!cancelled) setLoginInfo(rows || []);
      })
      .catch(() => {
        if (!cancelled) setLoginInfo([]);
      })
      .finally(() => {
        if (!cancelled) setLoginInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Stage 14: Missions and streaks data
  const [dailyMissionProgress, setDailyMissionProgress] = useState(null);
  const [weeklyMissionProgress, setWeeklyMissionProgress] = useState(null);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [lastActiveDate, setLastActiveDate] = useState(null);

  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    const fetchMissionsAndStreak = async () => {
      try {
        const [daily, weekly, cur, best] = await Promise.all([
          getDailyMissionProgress(me.id).catch(() => null),
          getWeeklyMissionProgress(me.id).catch(() => null),
          getCurrentStreak(me.id).catch(() => 0),
          getBestStreak(me.id).catch(() => 0),
        ]);
        if (cancelled) return;
        if (daily) setDailyMissionProgress({ missions: daily });
        if (weekly) setWeeklyMissionProgress(weekly);
        setCurrentStreak(typeof cur === 'number' ? cur : 0);
        setBestStreak(typeof best === 'number' ? best : 0);
        // lastActiveDate derived from streak presence; keep as today if streak>0
        if (cur > 0) setLastActiveDate(new Date().toISOString().slice(0, 10));
      } catch (e) {
        console.error('Failed to fetch missions/streak data:', e);
      }
    };
    fetchMissionsAndStreak();
    return () => { cancelled = true; };
  }, [me?.id]);

  const progressRows = useMemo(
    () => buildStudentProgressRows({ students, attendance, exams, examScores, homeworkStatus, lessons, curriculumProgress, lessonProgress: allLessonProgress }),
    [students, attendance, exams, examScores, homeworkStatus, lessons, curriculumProgress, allLessonProgress]
  );
  const progressDataLoading = loading || progressLoading;
  const engagementRows = useMemo(() => buildWebsiteEngagementRows(progressRows, loginInfo), [progressRows, loginInfo]);
  const engagementDataLoading = progressDataLoading || loginInfoLoading;

  const engagementSummary = useMemo(() => {
    const scoped = levelFilter ? engagementRows.filter((r) => r.level === levelFilter) : engagementRows;
    return summarizeWebsiteEngagement(scoped);
  }, [engagementRows, levelFilter]);
  const progressSummary = useMemo(() => {
    const scoped = levelFilter ? progressRows.filter((r) => r.level === levelFilter) : progressRows;
    return summarizeProgress(scoped);
  }, [progressRows, levelFilter]);

  const [collectionByMonth, setCollectionByMonth] = useState({});
  useEffect(() => {
    const keys = [...months, previous];
    const unique = Array.from(new Map(keys.map((k) => [`${k.year}-${k.month}`, k])).values());
    let cancelled = false;
    Promise.all(
      unique.map((k) =>
        getMonthlyPaymentCollection(k.year, k.month)
          .then((row) => [`${k.year}-${k.month}`, Number(row?.total_collected || 0)])
          .catch(() => [`${k.year}-${k.month}`, 0])
      )
    ).then((pairs) => {
      if (!cancelled) setCollectionByMonth(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [months, previous]);

  const [monthTransactions, setMonthTransactions] = useState([]);
  useEffect(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const from = `${current.year}-${pad(current.month)}-01`;
    const daysInMonth = new Date(current.year, current.month, 0).getDate();
    const to = `${current.year}-${pad(current.month)}-${pad(daysInMonth)}`;
    let cancelled = false;
    getPaymentCollectionSummary(from, to)
      .then((rows) => {
        if (!cancelled) setMonthTransactions(rows || []);
      })
      .catch(() => {
        if (!cancelled) setMonthTransactions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [current]);

  const [coverageStatuses, setCoverageStatuses] = useState({});
  useEffect(() => {
    if (active.length === 0) return;
    let cancelled = false;
    Promise.all(
      active.map((s) =>
        getStudentPaymentStatus(s.id)
          .then((st) => [s.id, st])
          .catch(() => [s.id, null])
      )
    ).then((pairs) => {
      if (!cancelled) setCoverageStatuses(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const stats = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    const activeIds = new Set(active.map((s) => s.id));

    const expected = active.reduce((sum, s) => sum + Number(s.monthly_fee || 0), 0);
    const levelById = Object.fromEntries(students.map((s) => [s.id, s.level]));
    const collected = levelFilter
      ? monthTransactions.reduce((sum, tx) => (levelById[tx.student_id] === levelFilter ? sum + Number(tx.amount || 0) : sum), 0)
      : collectionByMonth[`${current.year}-${current.month}`] || 0;
    const lastCollected = collectionByMonth[`${previous.year}-${previous.month}`] || 0;
    const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
    const lastCollectionRate = expected > 0 ? Math.round((lastCollected / expected) * 100) : null;
    const outstanding = Math.max(0, expected - collected);

    const unpaidStudents = active
      .filter((s) => coverageStatuses[s.id]?.status === 'overdue')
      .sort((a, b) => Number(coverageStatuses[b.id]?.outstanding || 0) - Number(coverageStatuses[a.id]?.outstanding || 0));

    const paymentStatusCounts = active.reduce(
      (acc, s) => {
        const status = coverageStatuses[s.id]?.status;
        if (status === 'paid') acc.paid += 1;
        else if (status === 'due_soon') acc.dueSoon += 1;
        else if (status === 'overdue') acc.overdue += 1;
        return acc;
      },
      { paid: 0, dueSoon: 0, overdue: 0 }
    );

    const dueTodayStudents = active.filter((s) => coverageStatuses[s.id]?.status === 'due_soon' && coverageStatuses[s.id]?.next_due_date === todayISO);
    const dueWithin7Students = active.filter((s) => {
      const st = coverageStatuses[s.id];
      if (st?.status !== 'due_soon' || st.next_due_date === todayISO) return false;
      const days = Math.ceil((new Date(st.next_due_date) - new Date(todayISO)) / (24 * 60 * 60 * 1000));
      return days > 0 && days <= 7;
    });

    const levelCounts = active.reduce(
      (acc, s) => {
        if (s.level === 'A') acc.A += 1;
        else if (s.level === 'B') acc.B += 1;
        else if (s.level === 'C') acc.C += 1;
        return acc;
      },
      { A: 0, B: 0, C: 0 }
    );

    const collectedByLevel = monthTransactions.reduce((acc, tx) => {
      const level = levelById[tx.student_id];
      if (level) acc[level] = (acc[level] || 0) + Number(tx.amount || 0);
      return acc;
    }, {});
    const financeByGroup = groupLevels.map((level) => {
      const group = active.filter((s) => s.level === level);
      const groupExpected = group.reduce((sum, s) => sum + Number(s.monthly_fee || 0), 0);
      const groupCollected = Math.max(0, collectedByLevel[level] || 0);
      const paid = group.filter((s) => coverageStatuses[s.id]?.status === 'paid').length;
      return {
        level,
        paid,
        total: group.length,
        collected: groupCollected,
        expected: groupExpected,
        rate: groupExpected > 0 ? Math.round((groupCollected / groupExpected) * 100) : 0,
      };
    });
    const financeTotal = financeByGroup.reduce(
      (acc, g) => ({
        paid: acc.paid + g.paid,
        total: acc.total + g.total,
        collected: acc.collected + g.collected,
        expected: acc.expected + g.expected,
      }),
      { paid: 0, total: 0, collected: 0, expected: 0 }
    );
    financeTotal.rate = financeTotal.expected > 0 ? Math.round((financeTotal.collected / financeTotal.expected) * 100) : 0;

    const attendanceThisMonth = filterByYearMonth(attendance, 'date', current.year, current.month).filter((a) => activeIds.has(a.student_id));
    const attendanceLastMonth = filterByYearMonth(attendance, 'date', previous.year, previous.month).filter((a) => activeIds.has(a.student_id));
    const attendanceRateNow = attendanceRate(attendanceThisMonth);
    const attendanceRateLast = attendanceRate(attendanceLastMonth);

    const attendanceByStudent = attendance.reduce((acc, a) => {
      (acc[a.student_id] ||= []).push(a);
      return acc;
    }, {});
    const consecutiveAbsentStudents = active
      .map((s) => {
        const records = [...(attendanceByStudent[s.id] || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
        let streak = 0;
        for (const r of records) {
          if (r.status !== 'Absent') break;
          streak += 1;
        }
        return { ...s, streak };
      })
      .filter((s) => s.streak >= 2)
      .sort((a, b) => b.streak - a.streak);
    const twoConsecutiveAbsent = consecutiveAbsentStudents.filter((s) => s.streak === 2);
    const threePlusConsecutiveAbsent = consecutiveAbsentStudents.filter((s) => s.streak >= 3);

    const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));

    const classHealth = groupLevels.map((level) => {
      const group = active.filter((s) => s.level === level);
      const groupIds = new Set(group.map((s) => s.id));
      const groupAttendance = attendanceThisMonth.filter((a) => groupIds.has(a.student_id));
      const groupAttendanceRate = attendanceRate(groupAttendance);
      const groupHomework = homeworkStatus.filter((h) => groupIds.has(h.student_id));
      const groupHomeworkDone = groupHomework.filter((h) => h.status === 'Submitted' || h.status === 'Graded').length;
      const groupHomeworkRate = groupHomework.length > 0 ? Math.round((groupHomeworkDone / groupHomework.length) * 100) : null;
      const groupScores = examScores.filter((sc) => groupIds.has(sc.student_id) && sc.score != null);
      const groupTestAvg =
        groupScores.length > 0
          ? Math.round((groupScores.reduce((sum, sc) => sum + Number(sc.score) / (examsById[sc.exam_id]?.max_score || 100), 0) / groupScores.length) * 100)
          : null;
      const metrics = [groupAttendanceRate, groupHomeworkRate, groupTestAvg].filter((v) => v != null);
      const composite = metrics.length > 0 ? Math.round(metrics.reduce((sum, v) => sum + v, 0) / metrics.length) : null;
      const health = composite == null ? 'neutral' : composite >= 80 ? 'success' : composite >= 60 ? 'warning' : 'danger';
      return {
        level,
        students: group.length,
        attendanceRate: groupAttendanceRate,
        homeworkRate: groupHomeworkRate,
        testAvg: groupTestAvg,
        health,
      };
    });

    const todayRecords = attendance.filter((a) => a.date === todayISO && activeIds.has(a.student_id));
    const todayAttendanceCounts = {
      Present: todayRecords.filter((a) => a.status === 'Present').length,
      Late: todayRecords.filter((a) => a.status === 'Late').length,
      Absent: todayRecords.filter((a) => a.status === 'Absent').length,
    };
    const todaysLessons = lessons
      .filter((l) => new Date(l.scheduled_at).toISOString().slice(0, 10) === todayISO)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

    const activeHomeworkStatus = homeworkStatus.filter((h) => activeIds.has(h.student_id));
    const homeworkSubmitted = activeHomeworkStatus.filter((h) => h.status === 'Submitted').length;
    const homeworkGraded = activeHomeworkStatus.filter((h) => h.status === 'Graded').length;
    const homeworkCompletionRate =
      activeHomeworkStatus.length > 0 ? Math.round(((homeworkSubmitted + homeworkGraded) / activeHomeworkStatus.length) * 100) : null;

    const examsAwaitingGrading = examScores.filter((s) => s.score == null && activeIds.has(s.student_id)).length;

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingExams = exams
      .filter((e) => {
        const d = new Date(e.exam_date);
        return d >= now && d <= in7Days;
      })
      .sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date))
      .slice(0, 5);

    const scored = examScores.filter((s) => s.score != null && activeIds.has(s.student_id));
    const examAvg =
      scored.length > 0
        ? Math.round((scored.reduce((sum, s) => sum + Number(s.score) / (examsById[s.exam_id]?.max_score || 100), 0) / scored.length) * 100)
        : null;

    const income = months.map(({ year, month, label }) => ({
      label,
      value: collectionByMonth[`${year}-${month}`] || 0,
    }));

    const studentsById = Object.fromEntries(students.map((s) => [s.id, s]));

    const mostImprovedAward = [...recentAwards]
      .filter((a) => a.status === 'final' && a.award_type === 'most_improved')
      .sort((a, b) => new Date(b.computed_at) - new Date(a.computed_at))
      .map((a) => ({ ...a, student: studentsById[a.student_id] }))[0] || null;

    const certificatesThisMonth = certificates.filter((c) => {
      if (!c.issued_date) return false;
      const [y, m] = c.issued_date.split('-').map(Number);
      return y === current.year && m === current.month;
    }).length;
    const recentCertificates = certificates.slice(0, 5).map((c) => ({ ...c, student: studentsById[c.student_id] }));

    return {
      active: active.length,
      total: students.length,
      levelCounts,
      collected,
      expected,
      collectionRate,
      collectionTrend: trendFrom(collectionRate, lastCollectionRate, '%'),
      outstanding,
      unpaidStudents,
      paymentStatusCounts,
      financeByGroup,
      financeTotal,
      dueTodayStudents,
      dueWithin7Students,
      attendanceRateNow,
      attendanceTrendBadge: trendFrom(attendanceRateNow, attendanceRateLast, '%'),
      twoConsecutiveAbsent,
      threePlusConsecutiveAbsent,
      classHealth,
      todayAttendanceCounts,
      todaysLessons,
      classesToday: todaysLessons.length,
      homeworkSubmitted,
      homeworkCompletionRate,
      examsAwaitingGrading,
      upcomingExams,
      examAvg,
      income,
      mostImprovedAward,
      certificatesThisMonth,
      recentCertificates,
    };
  }, [
    students,
    active,
    groupLevels,
    levelFilter,
    collectionByMonth,
    monthTransactions,
    coverageStatuses,
    attendance,
    exams,
    examScores,
    lessons,
    homeworkStatus,
    recentAwards,
    certificates,
    months,
    current,
    previous,
  ]);

  const quickActions = [
    { to: '/students', label: t('qaAddStudent'), Icon: Users },
    { to: '/payments', label: t('qaAddPayment'), Icon: Wallet },
    { to: '/attendance', label: t('qaTakeAttendance'), Icon: CalendarCheck },
    { to: '/lessons', label: t('qaCreateLesson'), Icon: CalendarClock },
    { to: '/homework', label: t('qaAddHomework'), Icon: BookOpen },
    { to: '/certificates', label: t('qaIssueCertificate'), Icon: ImagePlus },
    { to: '/students', label: t('qaViewStudents'), Icon: ListChecks },
  ];

  return (
    <div>
      <DashboardHero
        name={profile?.full_name}
        summary={
          loading
            ? undefined
            : t('adminHeroSummary', {
                active: stats.active,
                collectionRate: stats.collectionRate,
                attendanceFragment:
                  stats.attendanceRateNow == null
                    ? t('adminHeroNoAttendance')
                    : t('adminHeroAttendancePercent', { rate: stats.attendanceRateNow }),
              })
        }
        right={
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="input sm:w-40" aria-label={t('common:allLevels')}>
            <option value="">{t('common:allLevels')}</option>
            {LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>{t(`common:level${lvl}`)}</option>
            ))}
          </select>
        }
      />

      <DashboardErrorBoundary>
        <div className="mt-6">
          <SectionLabel>{t('overviewLabel')}</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              label={t('activeStudents')}
              value={stats.active}
              hint={levelFilter ? undefined : t('levelBreakdownHint', { a: stats.levelCounts.A, b: stats.levelCounts.B, c: stats.levelCounts.C })}
              tone="success"
              icon={Users}
              loading={loading}
            />
            <StatCard
              label={t('neverLoggedInLabel')}
              value={engagementSummary.neverLoggedIn}
              hint={t('websiteOverviewHint', { noLessons: engagementSummary.loggedInNoLessons, learning: engagementSummary.learning, upToDate: engagementSummary.upToDate })}
              tone="danger"
              icon={LogIn}
              loading={engagementDataLoading}
            />
            <StatCard
              label={t('outstandingRevenue')}
              value={formatUZS(stats.outstanding)}
              hint={t('paymentsOverviewHint', { paid: stats.paymentStatusCounts.paid, active: stats.active, rate: stats.collectionRate })}
              tone="danger"
              icon={AlertCircle}
              loading={loading}
            />
            <StatCard
              label={t('atRiskLabel')}
              value={progressSummary.atRisk}
              hint={t('academicOverviewHint', { onTrack: progressSummary.onTrack, behind: progressSummary.behind })}
              tone="danger"
              icon={AlertTriangle}
              loading={progressDataLoading}
            />
          </div>

          {stats.todaysLessons.length > 0 && (
            <div className="mt-4">
              <Panel title={t('todaysLessonsTitle')} icon={CalendarClock}>
                <div className="space-y-2">
                  {stats.todaysLessons.map((l) => (
                    <Link
                      key={l.id}
                      to={`/lessons/${l.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg text-sm hover:text-brand-600"
                    >
                      <span className="font-medium text-ink">{l.topic}</span>
                      <span className="flex-shrink-0 text-ink/50">
                        {new Date(l.scheduled_at).toLocaleTimeString(dateLocale, { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </Link>
                  ))}
                </div>
              </Panel>
            </div>
          )}
        </div>
      </DashboardErrorBoundary>

      {/* Stage 14: Daily Missions */}
      <DailyMissions dailyProgress={dailyMissionProgress} />

      {/* Stage 14: Weekly Missions */}
      <WeeklyMissions weeklyProgress={weeklyMissionProgress} />

      {/* Stage 14: Streak Display */}
      <StreakDisplay currentStreak={currentStreak} bestStreak={bestStreak} lastActiveDate={lastActiveDate} />

      <DashboardErrorBoundary>
        <div className="mt-6">
          <SectionLabel>{t('needsAttentionLabel')}</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Panel title={t('paymentAlertsTitle')} icon={Wallet}>
              <div className="space-y-2">
                <Link to="/payments" className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="text-ink/60">{t('overdueLabel')}</span>
                  <span className="font-semibold text-inactive">{stats.unpaidStudents.length}</span>
                </Link>
                <Link to="/payments" className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="text-ink/60">{t('dueTodayLabel')}</span>
                  <span className="font-semibold text-levelB">{stats.dueTodayStudents.length}</span>
                </Link>
                <Link to="/payments" className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="text-ink/60">{t('dueWithin7Label')}</span>
                  <span className="font-semibold text-levelA">{stats.dueWithin7Students.length}</span>
                </Link>
              </div>
              {/* Reminders CTA temporarily hidden (2026-08-19) - /reminders route disabled, feature kept intact.
              <Link
                to="/reminders"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-100"
              >
                <Bell size={13} aria-hidden="true" />
                {t('sendRemindersCta')}
              </Link>
              */}
            </Panel>

            <Panel title={t('attendanceAlertsTitle')} icon={CalendarCheck}>
              <div className="space-y-2">
                <Link to="/attendance" className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="text-ink/60">{t('absentTodayLabel')}</span>
                  <span className="font-semibold text-inactive">{stats.todayAttendanceCounts.Absent}</span>
                </Link>
                <Link to="/attendance" className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="text-ink/60">{t('twoConsecutiveLabel')}</span>
                  <span className="font-semibold text-levelB">{stats.twoConsecutiveAbsent.length}</span>
                </Link>
                <Link to="/attendance" className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="text-ink/60">{t('threePlusConsecutiveLabel')}</span>
                  <span className="font-semibold text-inactive">{stats.threePlusConsecutiveAbsent.length}</span>
                </Link>
              </div>
            </Panel>

            <Panel title={t('homeworkReviewTitle')} icon={BookOpen}>
              <div className="space-y-2">
                <Link to="/homework" className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="text-ink/60">{t('waitingForReviewLabel')}</span>
                  <span className="font-semibold text-levelB">{stats.homeworkSubmitted}</span>
                </Link>
                <Link to="/exams" className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="text-ink/60">{t('writingExamsGradingLabel')}</span>
                  <span className="font-semibold text-levelB">{stats.examsAwaitingGrading}</span>
                </Link>
              </div>
            </Panel>

            <Panel title={t('academicAlertsTitle')} icon={AlertTriangle}>
              <div className="space-y-2">
                <Link to="/students" className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="text-ink/60">{t('atRiskLabel')}</span>
                  <span className="font-semibold text-inactive">{progressSummary.atRisk}</span>
                </Link>
                <Link to="/students" className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="text-ink/60">{t('behindLabel')}</span>
                  <span className="font-semibold text-levelB">{progressSummary.behind}</span>
                </Link>
              </div>
            </Panel>

            <Panel title={t('websiteAlertsTitle')} icon={Globe}>
              <div className="space-y-2">
                <Link to="/students" className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="text-ink/60">{t('neverLoggedInLabel')}</span>
                  <span className="font-semibold text-inactive">{engagementSummary.neverLoggedIn}</span>
                </Link>
                <Link to="/students" className="flex items-center justify-between text-sm hover:text-brand-600">
                  <span className="text-ink/60">{t('loggedInNoLessonsLabel')}</span>
                  <span className="font-semibold text-levelB">{engagementSummary.loggedInNoLessons}</span>
                </Link>
              </div>
            </Panel>
          </div>

          <div className="mt-4">
            <AttentionCard
              title={t('upcomingExamsTitle')}
              icon={FileCheck2}
              items={stats.upcomingExams.map((e) => ({
                id: e.id,
                label: e.title,
                detail: new Date(e.exam_date).toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' }),
                tone: 'info',
                to: '/exams',
              }))}
              emptyText={t('upcomingExamsEmpty')}
              loading={loading}
            />
          </div>
        </div>
      </DashboardErrorBoundary>

      <DashboardErrorBoundary>
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">{t('websiteEngagementLabel')}</h3>
          <WebsiteEngagementSummary rows={engagementRows} levelFilter={levelFilter} loading={engagementDataLoading} />
        </div>
      </DashboardErrorBoundary>

      <DashboardErrorBoundary>
        <div className="mt-6 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/40 p-4 sm:p-5">
          <SectionLabel>{t('websiteEngagementLabel')}</SectionLabel>
          <WebsiteEngagementSummary rows={engagementRows} levelFilter={levelFilter} loading={engagementDataLoading} />
        </div>
      </DashboardErrorBoundary>

      <DashboardErrorBoundary>
        <div className="mt-6">
          <SectionLabel>{t('financeOverviewLabel')}</SectionLabel>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink/50">{t('groupBreakdownTitle')}</h2>
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-ink/40">
                    <th className="py-2 font-semibold">{t('group')}</th>
                    <th className="py-2 font-semibold">{t('paidCol')}</th>
                    <th className="py-2 font-semibold">{t('totalCol')}</th>
                    <th className="py-2 font-semibold">{t('collected')}</th>
                    <th className="py-2 font-semibold">{t('expectedCol')}</th>
                    <th className="py-2 font-semibold">{t('collectionPercentCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/[0.06]">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-3 text-ink/40">
                        —
                      </td>
                    </tr>
                  ) : (
                    <>
                      {stats.financeByGroup.map((g) => (
                        <tr key={g.level}>
                          <td className="py-2 font-medium text-ink">{t('levelLabel', { level: g.level })}</td>
                          <td className="py-2 text-ink/70">{g.paid}</td>
                          <td className="py-2 text-ink/70">{g.total}</td>
                          <td className="py-2 text-ink/70">{formatUZS(g.collected)}</td>
                          <td className="py-2 text-ink/70">{formatUZS(g.expected)}</td>
                          <td className="py-2 text-ink/70">{g.rate}%</td>
                        </tr>
                      ))}
                      <tr className="font-semibold text-ink">
                        <td className="py-2">{t('totalRow')}</td>
                        <td className="py-2">{stats.financeTotal.paid}</td>
                        <td className="py-2">{stats.financeTotal.total}</td>
                        <td className="py-2">{formatUZS(stats.financeTotal.collected)}</td>
                        <td className="py-2">{formatUZS(stats.financeTotal.expected)}</td>
                        <td className="py-2">{stats.financeTotal.rate}%</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            <Panel title={t('revenueTrendTitle')} icon={BarChart3}>
              <p className="mb-3 text-xs text-ink/50">
                <Trans
                  i18nKey="dashboard:collectedOfExpected"
                  values={{ collected: formatUZS(stats.collected), expected: formatUZS(stats.expected) }}
                  components={[<span className="font-semibold text-ink" key="0" />]}
                />
              </p>
              <MiniBarChart data={stats.income} formatValue={formatUZS} color="bg-active" loading={loading} />
            </Panel>
          </div>
        </div>
      </DashboardErrorBoundary>

      <DashboardErrorBoundary>
        <div className="mt-6">
          <SectionLabel>{t('attendanceExamsLabel')}</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              label={t('averageAttendanceLabel')}
              value={stats.attendanceRateNow == null ? t('noData') : `${stats.attendanceRateNow}%`}
              trend={stats.attendanceTrendBadge}
              tone="info"
              icon={CalendarCheck}
              loading={loading}
            />
            <StatCard
              label={t('homeworkCompletionRateLabel')}
              value={stats.homeworkCompletionRate == null ? t('noData') : `${stats.homeworkCompletionRate}%`}
              tone="warning"
              icon={BookOpen}
              loading={loading}
            />
            <StatCard
              label={t('averageTestScoreLabel')}
              value={stats.examAvg == null ? t('noData') : `${stats.examAvg}%`}
              tone="brand"
              icon={FileCheck2}
              loading={loading}
            />
            <StatCard label={t('certificatesIssuedLabel')} value={stats.certificatesThisMonth} tone="success" icon={Award} loading={loading} />
          </div>
        </div>
      </DashboardErrorBoundary>

      <div className="mt-8">
        <details className="group rounded-2xl border border-ink/[0.06] bg-white open:shadow-card">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <span>{t('detailedAnalyticsLabel')}</span>
            <span className="rounded-full bg-ink/[0.04] px-2.5 py-1 text-xs text-ink/60 group-open:hidden">Show</span>
            <span className="hidden rounded-full bg-ink/[0.04] px-2.5 py-1 text-xs text-ink/60 group-open:inline">Hide</span>
          </summary>
          <div className="border-t border-ink/[0.06] p-4 sm:p-5">

        <DashboardErrorBoundary>
          <div className="mt-3 overflow-x-auto rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink/50">
              <ClipboardList size={14} className="text-ink/40" aria-hidden="true" />
              {t('classHealthTitle')}
            </h2>
            <p className="mb-3 text-xs text-ink/40">{t('classHealthDisclaimer')}</p>
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-ink/40">
                  <th className="py-2 font-semibold">{t('group')}</th>
                  <th className="py-2 font-semibold">{t('studentsCol')}</th>
                  <th className="py-2 font-semibold">{t('attendanceCol')}</th>
                  <th className="py-2 font-semibold">{t('homeworkCol')}</th>
                  <th className="py-2 font-semibold">{t('testAvgCol')}</th>
                  <th className="py-2 font-semibold">{t('healthCol')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.06]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-3 text-ink/40">
                      —
                    </td>
                  </tr>
                ) : (
                  stats.classHealth.map((g) => (
                    <tr key={g.level}>
                      <td className="py-2 font-medium text-ink">{t('levelLabel', { level: g.level })}</td>
                      <td className="py-2 text-ink/70">{g.students}</td>
                      <td className="py-2 text-ink/70">{g.attendanceRate == null ? '—' : `${g.attendanceRate}%`}</td>
                      <td className="py-2 text-ink/70">{g.homeworkRate == null ? '—' : `${g.homeworkRate}%`}</td>
                      <td className="py-2 text-ink/70">{g.testAvg == null ? '—' : `${g.testAvg}%`}</td>
                      <td className="py-2">
                        <span className={`inline-flex h-2.5 w-2.5 rounded-full ${TONE[g.health].dot}`} aria-hidden="true" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DashboardErrorBoundary>

        <DashboardErrorBoundary>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title={t('mostImprovedTitle')} icon={Award}>
              {stats.mostImprovedAward == null ? (
                <p className="text-sm text-ink/50">{t('mostImprovedEmpty')}</p>
              ) : (
                <div className="text-sm">
                  <p className="font-medium text-ink">
                    {stats.mostImprovedAward.student?.real_name || t('recentRecognitionUnknownStudent')}
                    {stats.mostImprovedAward.student?.english_name && (
                      <span className="text-ink/40"> ({stats.mostImprovedAward.student.english_name})</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-ink/50">
                    {new Date(stats.mostImprovedAward.period_start).toLocaleDateString(dateLocale, { month: 'short', year: 'numeric' })}
                  </p>
                </div>
              )}
            </Panel>

            <Panel title={t('recentCertificatesTitle')} icon={ImagePlus}>
              {stats.recentCertificates.length === 0 ? (
                <p className="text-sm text-ink/50">{t('recentCertificatesEmpty')}</p>
              ) : (
                <div className="space-y-2">
                  {stats.recentCertificates.map((c) => (
                    <div key={c.id} className="text-sm">
                      <p className="truncate font-medium text-ink">{c.title}</p>
                      <p className="truncate text-xs text-ink/50">
                        {c.student?.real_name || t('recentRecognitionUnknownStudent')} ·{' '}
                        {new Date(c.issued_date).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </DashboardErrorBoundary>

        <DashboardErrorBoundary>
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">{t('progressAnalyticsLabel')}</h3>
            <ProgressAnalytics rows={progressRows} levelFilter={levelFilter} loading={progressDataLoading} />
          </div>
        </DashboardErrorBoundary>

        <DashboardErrorBoundary>
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">{t('activityFeedLabel')}</h3>
            <ActivityFeed />
          </div>
        </DashboardErrorBoundary>
          </div>
        </details>
      </div>

      <DashboardErrorBoundary>
        <div className="mt-6">
          <SectionLabel>{t('quickActionsLabel')}</SectionLabel>
          <QuickActions actions={quickActions} />
        </div>
      </DashboardErrorBoundary>
    </div>
  );
}

function TeacherDashboard() {
  const { t, i18n } = useTranslation('dashboard');
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { profile } = useAuth();
  const { students, lessons, attendance, exams, examScores, homework, homeworkStatus, loading } = useAcademy();
  const { current, previous } = useMemo(() => currentAndPreviousMonth(), []);

  const stats = useMemo(() => {
    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);
    const active = students.filter((s) => s.status === 'Active');

    const todayRecords = attendance.filter((a) => a.date === todayISO);
    const todayCounts = {
      Present: todayRecords.filter((a) => a.status === 'Present').length,
      Late: todayRecords.filter((a) => a.status === 'Late').length,
      Absent: todayRecords.filter((a) => a.status === 'Absent').length,
    };
    const monthRecords = filterByYearMonth(attendance, 'date', current.year, current.month);
    const lastMonthRecords = filterByYearMonth(attendance, 'date', previous.year, previous.month);
    const monthRate = attendanceRate(monthRecords);
    const lastMonthRate = attendanceRate(lastMonthRecords);

    const todaysLessons = lessons
      .filter((l) => new Date(l.scheduled_at).toISOString().slice(0, 10) === todayISO)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

    const submitted = homeworkStatus.filter((h) => h.status === 'Submitted').length;
    const graded = homeworkStatus.filter((h) => h.status === 'Graded').length;

    const scored = examScores.filter((s) => s.score != null);
    const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));
    const examAvg =
      scored.length > 0
        ? Math.round((scored.reduce((sum, s) => sum + Number(s.score) / (examsById[s.exam_id]?.max_score || 100), 0) / scored.length) * 100)
        : null;
    const awaitingGrading = examScores.filter((s) => s.score == null).length;

    const performance = active
      .map((s) => {
        const records = monthRecords.filter((a) => a.student_id === s.id);
        const rate = attendanceRate(records);
        return { ...s, rate, marks: records.length };
      })
      .filter((s) => s.rate != null)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5);

    return {
      todayCounts,
      todayTotal: todayRecords.length,
      todaysLessons,
      monthRate,
      monthRateTrend: trendFrom(monthRate, lastMonthRate, '%'),
      submitted,
      graded,
      homeworkTotal: homework.length,
      examAvg,
      examScoredCount: scored.length,
      awaitingGrading,
      examTotal: exams.length,
      performance,
    };
  }, [students, lessons, attendance, exams, examScores, homework, homeworkStatus, current, previous]);

  const quickActions = [
    { to: '/attendance', label: t('qaTakeAttendance'), Icon: CalendarCheck },
    { to: '/homework', label: t('qaAddHomework'), Icon: BookOpen },
    { to: '/exams', label: t('qaOpenExams'), Icon: FileCheck2 },
    { to: '/students', label: t('qaViewStudents'), Icon: Users },
    { to: '/lessons', label: t('qaViewLessons'), Icon: CalendarClock },
  ];

  return (
    <div>
      <DashboardHero
        name={profile?.full_name}
        summary={
          loading
            ? undefined
            : t('teacherHeroSummary', {
                present: stats.todayCounts.Present,
                total: stats.todayTotal || 0,
                count: stats.submitted + stats.awaitingGrading,
              })
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={t('presentToday')} value={stats.todayCounts.Present} tone="success" icon={CalendarCheck} loading={loading} />
        <StatCard label={t('lateToday')} value={stats.todayCounts.Late} tone="warning" loading={loading} />
        <StatCard label={t('absentToday')} value={stats.todayCounts.Absent} tone="danger" loading={loading} />
        <StatCard
          label={t('attendanceRateMonth')}
          value={stats.monthRate == null ? t('noData') : `${stats.monthRate}%`}
          trend={stats.monthRateTrend}
          tone="info"
          loading={loading}
        />
      </div>

      <div className="mt-6">
        <SectionLabel>{t('quickActionsLabel')}</SectionLabel>
        <QuickActions actions={quickActions} />
      </div>

      <div className="mt-6">
        <SectionLabel>{t('needsAttentionLabel')}</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-2">
        <AttentionCard
          title={t('awaitingGrading')}
          icon={ClipboardList}
          items={[
            ...(stats.submitted > 0
              ? [{ id: 'hw', label: t('homeworkSubmissionsCount', { count: stats.submitted }), tone: 'warning', to: '/homework' }]
              : []),
            ...(stats.awaitingGrading > 0
              ? [{ id: 'exam', label: t('examAnswersCount', { count: stats.awaitingGrading }), tone: 'warning', to: '/exams' }]
              : []),
          ]}
          emptyText={t('awaitingGradingEmpty')}
          loading={loading}
        />
        <AttentionCard
          title={t('studentsNeedingAttention')}
          icon={Users}
          items={stats.performance
            .filter((s) => s.rate < 70)
            .map((s) => ({ id: s.id, label: s.real_name, detail: t('attendanceThisMonthDetail', { rate: s.rate }), tone: s.rate < 50 ? 'danger' : 'warning', to: '/attendance' }))}
          emptyText={t('studentsAttentionEmpty')}
          loading={loading}
        />
        </div>
      </div>

      <div className="mt-6">
        <Panel title={t('todaysLessonsTitle')} icon={CalendarClock}>
          {stats.todaysLessons.length === 0 ? (
            <p className="text-sm text-ink/50">{t('noLessonsToday')}</p>
          ) : (
            <div className="space-y-2">
              {stats.todaysLessons.map((l) => (
                <Link
                  key={l.id}
                  to={`/lessons/${l.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg text-sm hover:text-brand-600"
                >
                  <span className="font-medium text-ink">{l.topic}</span>
                  <span className="flex-shrink-0 text-ink/50">
                    {new Date(l.scheduled_at).toLocaleTimeString(dateLocale, { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title={t('homework')} icon={BookOpen}>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">{t('assigned')}</span>
              <span className="font-semibold text-ink">{stats.homeworkTotal}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">{t('awaitingGrading')}</span>
              <span className="font-semibold text-levelB">{stats.submitted}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">{t('graded')}</span>
              <span className="font-semibold text-active">{stats.graded}</span>
            </div>
          </div>
        </Panel>

        <Panel title={t('examStatistics')} icon={FileCheck2}>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">{t('totalExams')}</span>
              <span className="font-semibold text-ink">{stats.examTotal}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">{t('awaitingGrading')}</span>
              <span className="font-semibold text-levelB">{stats.awaitingGrading}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">{t('averageScore')}</span>
              <span className="font-semibold text-ink">{stats.examAvg == null ? t('noData') : `${stats.examAvg}%`}</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
