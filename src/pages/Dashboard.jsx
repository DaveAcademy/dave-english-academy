// Dashboard.jsx
// Administrator Dashboard and Teacher Dashboard, computed entirely from
// data the app already loads via useAcademy() - no new tables, no new
// migration. Redesigned for visual hierarchy (hero -> KPIs -> quick
// actions -> attention -> analytics -> detail), but every number here was
// already being calculated before this pass; the only new metrics are
// outstanding-payments and month-over-month trends, both derived from the
// same students/payments/attendance/exams data already in memory.
//
// i18n: fully localized via the `dashboard` namespace, including the
// strings introduced by the premium redesign (hero summaries, Outstanding
// KPI, Quick Actions, Needs Attention/AttentionCard, Analytics section,
// Today's lessons). Date/time formatting (exam dates, lesson times) uses
// `dateLocale` - derived from i18n.language - instead of a hardcoded
// 'en-US', so Uzbek-selecting students see Uzbek-formatted dates. Teachers
// and Administrators never see 'uz' here because syncLanguageForRole (see
// App.jsx / i18n/index.js) forces i18n.language back to 'en' for any
// non-student role, so dateLocale resolves to 'en-US' for them regardless.
import { useMemo } from 'react';
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
  Trophy,
  BookOpen,
  ClipboardList,
  UserPlus,
  ImagePlus,
} from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import StatCard from '../components/StatCard';
import Panel from '../components/Panel';
import DashboardHero from '../components/DashboardHero';
import QuickActions from '../components/QuickActions';
import AttentionCard from '../components/AttentionCard';
import MiniBarChart from '../components/MiniBarChart';
import SectionLabel from '../components/SectionLabel';
import { formatUZS } from '../utils/format';
import { attendanceRate, filterByYearMonth } from '../utils/attendance';
import { currentAndPreviousMonth, trendFrom } from '../utils/date';

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
  const { students, payments, attendance, exams, examScores, homework, loading } = useAcademy();

  const months = useMemo(() => lastNMonths(6), []);
  const { current, previous } = useMemo(() => currentAndPreviousMonth(), []);

  const stats = useMemo(() => {
    const active = students.filter((s) => s.status === 'Active');

    // ---- Payment collection (this month vs last month) ----
    const paymentsForMonth = ({ year, month }) => {
      const paidIds = new Set(payments.filter((p) => p.year === year && p.month === month && p.paid).map((p) => p.student_id));
      const paid = active.filter((s) => paidIds.has(s.id));
      const collected = paid.reduce((sum, s) => sum + Number(s.monthly_fee || 0), 0);
      const expected = active.reduce((sum, s) => sum + Number(s.monthly_fee || 0), 0);
      return { collected, expected, unpaid: active.filter((s) => !paidIds.has(s.id)) };
    };
    const thisMonthPayments = paymentsForMonth(current);
    const lastMonthPayments = paymentsForMonth(previous);
    const collectionRate = thisMonthPayments.expected > 0 ? Math.round((thisMonthPayments.collected / thisMonthPayments.expected) * 100) : 0;
    const lastCollectionRate =
      lastMonthPayments.expected > 0 ? Math.round((lastMonthPayments.collected / lastMonthPayments.expected) * 100) : null;
    const outstanding = thisMonthPayments.expected - thisMonthPayments.collected;
    const unpaidStudents = [...thisMonthPayments.unpaid].sort((a, b) => Number(b.monthly_fee || 0) - Number(a.monthly_fee || 0));

    // ---- Attendance rate (this month vs last month) ----
    const attendanceThisMonth = filterByYearMonth(attendance, 'date', current.year, current.month);
    const attendanceLastMonth = filterByYearMonth(attendance, 'date', previous.year, previous.month);
    const attendanceRateNow = attendanceRate(attendanceThisMonth);
    const attendanceRateLast = attendanceRate(attendanceLastMonth);

    // ---- Attendance concerns: active students under 50% this month ----
    const attendanceConcerns = active
      .map((s) => {
        const records = attendanceThisMonth.filter((a) => a.student_id === s.id);
        const rate = attendanceRate(records);
        return { ...s, rate, marks: records.length };
      })
      .filter((s) => s.rate != null && s.rate < 50)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5);

    // ---- Upcoming exams (next 7 days) ----
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingExams = exams
      .filter((e) => {
        const d = new Date(e.exam_date);
        return d >= now && d <= in7Days;
      })
      .sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date))
      .slice(0, 5);

    // ---- Exam performance (overall + per-month trend) ----
    const scored = examScores.filter((s) => s.score != null);
    const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));
    const examAvg =
      scored.length > 0
        ? Math.round((scored.reduce((sum, s) => sum + Number(s.score) / (examsById[s.exam_id]?.max_score || 100), 0) / scored.length) * 100)
        : null;

    // ---- Student growth (new active students joined per month) ----
    const growth = months.map(({ year, month, label }) => ({
      label,
      value: students.filter((s) => {
        if (!s.join_date) return false;
        const [y, m] = s.join_date.split('-').map(Number);
        return y === year && m === month;
      }).length,
    }));

    // ---- Income overview (collected per month, last 6 months) ----
    const income = months.map(({ year, month, label }) => {
      const paidRecords = payments.filter((p) => p.year === year && p.month === month && p.paid);
      const total = paidRecords.reduce((sum, p) => {
        const student = students.find((s) => s.id === p.student_id);
        return sum + Number(student?.monthly_fee || 0);
      }, 0);
      return { label, value: total };
    });

    // ---- Attendance trend (rate per month, last 6 months) ----
    const attendanceTrend = months.map(({ year, month, label }) => ({
      label,
      value: attendanceRate(filterByYearMonth(attendance, 'date', year, month)) || 0,
    }));

    // ---- Exam performance trend (avg % per month, last 6 months) ----
    const examTrend = months.map(({ year, month, label }) => {
      const examIdsThisMonth = new Set(
        exams
          .filter((e) => {
            const [y, m] = e.exam_date.split('-').map(Number);
            return y === year && m === month;
          })
          .map((e) => e.id)
      );
      const monthScores = scored.filter((s) => examIdsThisMonth.has(s.exam_id));
      const avg =
        monthScores.length > 0
          ? Math.round((monthScores.reduce((sum, s) => sum + Number(s.score) / (examsById[s.exam_id]?.max_score || 100), 0) / monthScores.length) * 100)
          : 0;
      return { label, value: avg };
    });

    // ---- Monthly statistics table ----
    const monthly = months.map(({ year, month, label }) => {
      const attendanceMarks = filterByYearMonth(attendance, 'date', year, month).length;
      const examsGiven = exams.filter((e) => {
        const [y, m] = e.exam_date.split('-').map(Number);
        return y === year && m === month;
      }).length;
      const homeworkAssigned = homework.filter((h) => {
        const [y, m] = h.due_date.split('-').map(Number);
        return y === year && m === month;
      }).length;
      return { label, attendanceMarks, examsGiven, homeworkAssigned, collected: income.find((i) => i.label === label)?.value || 0 };
    });

    // ---- Top students ----
    const topStudents = [...active]
      .map((s) => ({ ...s, points: Number(s.points || 0) }))
      .sort((a, b) => b.points - a.points || a.real_name.localeCompare(b.real_name))
      .slice(0, 5);

    return {
      active: active.length,
      total: students.length,
      collected: thisMonthPayments.collected,
      expected: thisMonthPayments.expected,
      collectionRate,
      collectionTrend: trendFrom(collectionRate, lastCollectionRate, '%'),
      outstanding,
      unpaidStudents,
      attendanceRateNow,
      attendanceTrendBadge: trendFrom(attendanceRateNow, attendanceRateLast, '%'),
      attendanceConcerns,
      upcomingExams,
      examAvg,
      examScoredCount: scored.length,
      growth,
      income,
      attendanceTrend,
      examTrend,
      monthly,
      topStudents,
    };
  }, [students, payments, attendance, exams, examScores, homework, months, current, previous]);

  const quickActions = [
    { to: '/students', label: t('qaAddStudent'), Icon: Users },
    { to: '/attendance', label: t('qaRecordAttendance'), Icon: CalendarCheck },
    { to: '/payments', label: t('qaAddPayment'), Icon: Wallet },
    { to: '/lessons', label: t('qaCreateLesson'), Icon: CalendarClock },
    { to: '/certificates', label: t('qaUploadCertificate'), Icon: ImagePlus },
    { to: '/settings', label: t('qaCreateUser'), Icon: UserPlus },
    { to: '/reports', label: t('qaViewReports'), Icon: BarChart3 },
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
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={t('activeStudents')} value={stats.active} hint={`${stats.total} total enrolled`} tone="success" icon={Users} loading={loading} />
        <StatCard
          label={t('attendanceRate')}
          value={stats.attendanceRateNow == null ? t('noData') : `${stats.attendanceRateNow}%`}
          trend={stats.attendanceTrendBadge}
          tone="info"
          icon={CalendarCheck}
          loading={loading}
        />
        <StatCard
          label={t('paymentCollection')}
          value={`${stats.collectionRate}%`}
          trend={stats.collectionTrend}
          tone="brand"
          icon={Wallet}
          loading={loading}
        />
        <StatCard
          label={t('outstandingKpi')}
          value={formatUZS(stats.outstanding)}
          hint={`${stats.unpaidStudents.length} students unpaid`}
          tone="danger"
          icon={AlertCircle}
          loading={loading}
        />
      </div>

      <div className="mt-6">
        <SectionLabel>{t('quickActionsLabel')}</SectionLabel>
        <QuickActions actions={quickActions} />
      </div>

      <div className="mt-6">
        <SectionLabel>{t('needsAttentionLabel')}</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-3">
        <AttentionCard
          title={t('unpaidThisMonth')}
          icon={Wallet}
          items={stats.unpaidStudents.slice(0, 5).map((s) => ({
            id: s.id,
            label: s.real_name,
            detail: formatUZS(s.monthly_fee),
            tone: 'danger',
            to: '/payments',
          }))}
          emptyText={t('unpaidEmpty')}
          loading={loading}
        />
        <AttentionCard
          title={t('attendanceConcernsTitle')}
          icon={CalendarCheck}
          items={stats.attendanceConcerns.map((s) => ({
            id: s.id,
            label: s.real_name,
            detail: t('attendanceConcernDetail', { rate: s.rate, marks: s.marks }),
            tone: 'warning',
            to: '/attendance',
          }))}
          emptyText={t('attendanceConcernsEmpty')}
          loading={loading}
        />
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

      <div className="mt-6">
        <SectionLabel>{t('analyticsLabel')}</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={t('studentGrowth')} icon={Users}>
          <MiniBarChart data={stats.growth} color="bg-brand-500" loading={loading} />
        </Panel>
        <Panel title={t('incomeOverview')}>
          <p className="mb-3 text-xs text-ink/50">
            <Trans
              i18nKey="dashboard:collectedOfExpected"
              values={{ collected: formatUZS(stats.collected), expected: formatUZS(stats.expected) }}
              components={[<span className="font-semibold text-ink" key="0" />]}
            />
          </p>
          <MiniBarChart data={stats.income} formatValue={formatUZS} color="bg-active" loading={loading} />
        </Panel>
        <Panel title={t('attendanceTrendTitle')} icon={CalendarCheck}>
          <MiniBarChart data={stats.attendanceTrend} formatValue={(v) => `${v}%`} color="bg-levelA" loading={loading} />
        </Panel>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={t('examPerformance')} icon={FileCheck2}>
          {loading ? (
            <MiniBarChart data={stats.examTrend} formatValue={(v) => `${v}%`} color="bg-levelC" loading />
          ) : stats.examAvg == null ? (
            <p className="text-sm text-ink/50">{t('noGradedExams')}</p>
          ) : (
            <>
              <p className="font-display text-3xl font-bold text-ink">{stats.examAvg}%</p>
              <p className="mb-3 mt-1 text-xs text-ink/50">{t('avgScoreAcross', { count: stats.examScoredCount })}</p>
              <MiniBarChart data={stats.examTrend} formatValue={(v) => `${v}%`} color="bg-levelC" />
            </>
          )}
        </Panel>

        <Panel title={t('topStudents')} icon={Trophy}>
          {stats.topStudents.length === 0 ? (
            <p className="text-sm text-ink/50">{t('noActiveStudents')}</p>
          ) : (
            <div className="space-y-2">
              {stats.topStudents.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0 ? 'bg-levelB text-white' : i === 1 ? 'bg-ink/20' : i === 2 ? 'bg-levelA text-white' : 'bg-ink/5 text-ink/50'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium text-ink">{s.real_name}</span>
                  <span className="text-sm font-bold text-brand-500">{s.points} {t('points')}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        </div>
      </div>

      <div className="mt-6">
        <Panel title={t('monthlyStatistics')} icon={BarChart3}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-xs text-ink/50">
                  <th className="py-2 pr-4 font-semibold">{t('month')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('attendanceMarks')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('examsGiven')}</th>
                  <th className="py-2 pr-4 font-semibold">{t('homeworkAssigned')}</th>
                  <th className="py-2 font-semibold">{t('collected')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.monthly.map((m) => (
                  <tr key={m.label} className="border-b border-ink/5 last:border-0">
                    <td className="py-2 pr-4 font-medium text-ink">{m.label}</td>
                    <td className="py-2 pr-4 text-ink/70">{m.attendanceMarks}</td>
                    <td className="py-2 pr-4 text-ink/70">{m.examsGiven}</td>
                    <td className="py-2 pr-4 text-ink/70">{m.homeworkAssigned}</td>
                    <td className="py-2 text-ink/70">{formatUZS(m.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// Teacher Dashboard - deliberately no payment/financial widget or import
// anywhere in this function, matching the existing RLS boundary (teachers
// have read-only payment access, and Reports.jsx is admin-only).
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

    // ---- Attendance ----
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

    // ---- Today's lessons ----
    const todaysLessons = lessons
      .filter((l) => new Date(l.scheduled_at).toISOString().slice(0, 10) === todayISO)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

    // ---- Homework ----
    const submitted = homeworkStatus.filter((h) => h.status === 'Submitted').length;
    const graded = homeworkStatus.filter((h) => h.status === 'Graded').length;

    // ---- Exam statistics ----
    const scored = examScores.filter((s) => s.score != null);
    const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));
    const examAvg =
      scored.length > 0
        ? Math.round((scored.reduce((sum, s) => sum + Number(s.score) / (examsById[s.exam_id]?.max_score || 100), 0) / scored.length) * 100)
        : null;
    const awaitingGrading = examScores.filter((s) => s.score == null).length;

    // ---- Students needing attention: lowest attendance rate this month ----
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
                <div key={l.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-ink">{l.topic}</span>
                  <span className="flex-shrink-0 text-ink/50">
                    {new Date(l.scheduled_at).toLocaleTimeString(dateLocale, { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
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
