// Dashboard.jsx
// Module 1 of the dashboard work: a richer Administrator Dashboard,
// computed entirely from data the app already loads (no new tables, no
// new migration). Teachers still see the original dashboard unchanged -
// a distinct Teacher Dashboard is a separate follow-up module, not part
// of this PR.

import { useMemo } from 'react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import StatCard from '../components/StatCard';
import Panel from '../components/Panel';
import { formatUZS } from '../utils/format';

function lastNMonths(n) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleString('default', { month: 'short' }) });
  }
  return months;
}

function MiniBarRow({ label, value, max, formatValue = (v) => v, color = 'bg-brand-500' }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 flex-shrink-0 text-xs text-ink/50">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/5">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 flex-shrink-0 text-right text-xs font-semibold text-ink">{formatValue(value)}</span>
    </div>
  );
}

export default function Dashboard() {
  const { role } = useAuth();
  return role === 'administrator' ? <AdminDashboard /> : <TeacherDashboard />;
}

function AdminDashboard() {
  const { students, payments, attendance, exams, examScores, homework, homeworkStatus, loading } = useAcademy();

  const months = useMemo(() => lastNMonths(6), []);

  const stats = useMemo(() => {
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1;
    const active = students.filter((s) => s.status === 'Active');

    // ---- Payment collection ----
    const paidThisMonth = active.filter((s) =>
      payments.some((p) => p.student_id === s.id && p.year === curYear && p.month === curMonth && p.paid)
    );
    const collected = paidThisMonth.reduce((sum, s) => sum + Number(s.monthly_fee || 0), 0);
    const expected = active.reduce((sum, s) => sum + Number(s.monthly_fee || 0), 0);
    const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;

    // ---- Attendance rate (this month) ----
    const attendanceThisMonth = attendance.filter((a) => {
      const [y, m] = a.date.split('-').map(Number);
      return y === curYear && m === curMonth;
    });
    const attendanceScore = attendanceThisMonth.reduce(
      (sum, a) => sum + (a.status === 'Present' ? 1 : a.status === 'Late' ? 0.5 : 0),
      0
    );
    const attendanceRate = attendanceThisMonth.length > 0 ? Math.round((attendanceScore / attendanceThisMonth.length) * 100) : null;

    // ---- Homework completion ----
    const submittedOrGraded = homeworkStatus.filter((h) => h.status === 'Submitted' || h.status === 'Graded').length;
    const homeworkExpected = homework.length * active.length;
    const homeworkRate = homeworkExpected > 0 ? Math.round((submittedOrGraded / homeworkExpected) * 100) : null;

    // ---- Exam performance ----
    const scored = examScores.filter((s) => s.score != null);
    const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));
    const examAvg =
      scored.length > 0
        ? Math.round(
            (scored.reduce((sum, s) => sum + Number(s.score) / (examsById[s.exam_id]?.max_score || 100), 0) / scored.length) * 100
          )
        : null;

    // ---- Student growth (new active students joined per month) ----
    const growth = months.map(({ year, month, label }) => ({
      label,
      count: students.filter((s) => {
        if (!s.join_date) return false;
        const [y, m] = s.join_date.split('-').map(Number);
        return y === year && m === month;
      }).length,
    }));
    const maxGrowth = Math.max(1, ...growth.map((g) => g.count));

    // ---- Income overview (collected per month, last 6 months) ----
    const income = months.map(({ year, month, label }) => {
      const paidRecords = payments.filter((p) => p.year === year && p.month === month && p.paid);
      const total = paidRecords.reduce((sum, p) => {
        const student = students.find((s) => s.id === p.student_id);
        return sum + Number(student?.monthly_fee || 0);
      }, 0);
      return { label, total };
    });
    const maxIncome = Math.max(1, ...income.map((i) => i.total));

    // ---- Monthly statistics table ----
    const monthly = months.map(({ year, month, label }) => {
      const attendanceMarks = attendance.filter((a) => {
        const [y, m] = a.date.split('-').map(Number);
        return y === year && m === month;
      }).length;
      const examsGiven = exams.filter((e) => {
        const [y, m] = e.exam_date.split('-').map(Number);
        return y === year && m === month;
      }).length;
      const homeworkAssigned = homework.filter((h) => {
        const [y, m] = h.due_date.split('-').map(Number);
        return y === year && m === month;
      }).length;
      return { label, attendanceMarks, examsGiven, homeworkAssigned, collected: income.find((i) => i.label === label)?.total || 0 };
    });

    // ---- Top students ----
    const topStudents = [...active]
      .map((s) => ({ ...s, points: Number(s.points || 0) }))
      .sort((a, b) => b.points - a.points || a.real_name.localeCompare(b.real_name))
      .slice(0, 5);

    return {
      active: active.length,
      total: students.length,
      collected,
      expected,
      collectionRate,
      attendanceRate,
      attendanceThisMonthCount: attendanceThisMonth.length,
      homeworkRate,
      examAvg,
      examScoredCount: scored.length,
      growth,
      maxGrowth,
      income,
      maxIncome,
      monthly,
      topStudents,
    };
  }, [students, payments, attendance, exams, examScores, homework, homeworkStatus, months]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Administrator Dashboard</h1>
        <p className="mt-1 text-sm text-ink/50">Academy-wide performance at a glance.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Active students" value={stats.active} accent="active" loading={loading} />
        <StatCard
          label="Attendance rate"
          value={stats.attendanceRate == null ? 'No data' : `${stats.attendanceRate}%`}
          accent="brand"
          loading={loading}
        />
        <StatCard label="Payment collection" value={`${stats.collectionRate}%`} accent="levelA" loading={loading} />
        <StatCard
          label="Homework completion"
          value={stats.homeworkRate == null ? 'No data' : `${stats.homeworkRate}%`}
          accent="levelB"
          loading={loading}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Student growth (last 6 months)">
          <div className="space-y-2">
            {stats.growth.map((g) => (
              <MiniBarRow key={g.label} label={g.label} value={g.count} max={stats.maxGrowth} color="bg-brand-500" />
            ))}
          </div>
        </Panel>

        <Panel title="Income overview (last 6 months)">
          <p className="mb-3 text-xs text-ink/50">
            This month: <span className="font-semibold text-ink">{formatUZS(stats.collected)}</span> collected of{' '}
            {formatUZS(stats.expected)} expected
          </p>
          <div className="space-y-2">
            {stats.income.map((i) => (
              <MiniBarRow key={i.label} label={i.label} value={i.total} max={stats.maxIncome} formatValue={formatUZS} color="bg-active" />
            ))}
          </div>
        </Panel>

        <Panel title="Exam performance">
          {stats.examAvg == null ? (
            <p className="text-sm text-ink/50">No graded exams yet.</p>
          ) : (
            <>
              <p className="font-display text-3xl font-bold text-ink">{stats.examAvg}%</p>
              <p className="mt-1 text-xs text-ink/50">Average score across {stats.examScoredCount} graded exam entries.</p>
            </>
          )}
        </Panel>

        <Panel title="Top students">
          {stats.topStudents.length === 0 ? (
            <p className="text-sm text-ink/50">No active students yet.</p>
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
                  <span className="text-sm font-bold text-brand-500">{s.points} pts</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Monthly statistics">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-xs text-ink/50">
                  <th className="py-2 pr-4 font-semibold">Month</th>
                  <th className="py-2 pr-4 font-semibold">Attendance marks</th>
                  <th className="py-2 pr-4 font-semibold">Exams given</th>
                  <th className="py-2 pr-4 font-semibold">Homework assigned</th>
                  <th className="py-2 font-semibold">Collected</th>
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

// Module 2: Attendance, Homework, Exam Statistics, Student Performance -
// deliberately no payment/financial widget here, matching the existing
// RLS boundary (teachers have read-only payment access, and Reports.jsx
// - the one place with academy-wide financial figures - is already
// admin-only) and the requested widget list for this dashboard.
function TeacherDashboard() {
  const { students, attendance, exams, examScores, homework, homeworkStatus, loading } = useAcademy();

  const stats = useMemo(() => {
    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1;
    const active = students.filter((s) => s.status === 'Active');

    // ---- Attendance ----
    const todayRecords = attendance.filter((a) => a.date === todayISO);
    const todayCounts = {
      Present: todayRecords.filter((a) => a.status === 'Present').length,
      Late: todayRecords.filter((a) => a.status === 'Late').length,
      Absent: todayRecords.filter((a) => a.status === 'Absent').length,
    };
    const monthRecords = attendance.filter((a) => {
      const [y, m] = a.date.split('-').map(Number);
      return y === curYear && m === curMonth;
    });
    const monthScore = monthRecords.reduce((sum, a) => sum + (a.status === 'Present' ? 1 : a.status === 'Late' ? 0.5 : 0), 0);
    const monthRate = monthRecords.length > 0 ? Math.round((monthScore / monthRecords.length) * 100) : null;

    // ---- Homework ----
    const submitted = homeworkStatus.filter((h) => h.status === 'Submitted').length;
    const graded = homeworkStatus.filter((h) => h.status === 'Graded').length;

    // ---- Exam statistics ----
    const scored = examScores.filter((s) => s.score != null);
    const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));
    const examAvg =
      scored.length > 0
        ? Math.round(
            (scored.reduce((sum, s) => sum + Number(s.score) / (examsById[s.exam_id]?.max_score || 100), 0) / scored.length) * 100
          )
        : null;
    const awaitingGrading = examScores.filter((s) => s.score == null).length;

    // ---- Student performance: lowest attendance rate this month, so a
    // teacher can see who needs a nudge without digging through Attendance.
    const performance = active
      .map((s) => {
        const records = monthRecords.filter((a) => a.student_id === s.id);
        const score = records.reduce((sum, a) => sum + (a.status === 'Present' ? 1 : a.status === 'Late' ? 0.5 : 0), 0);
        const rate = records.length > 0 ? Math.round((score / records.length) * 100) : null;
        return { ...s, rate, marks: records.length };
      })
      .filter((s) => s.rate != null)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5);

    return { todayCounts, todayTotal: todayRecords.length, monthRate, submitted, graded, homeworkTotal: homework.length, examAvg, examScoredCount: scored.length, awaitingGrading, examTotal: exams.length, performance };
  }, [students, attendance, exams, examScores, homework, homeworkStatus]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink/50">Today's attendance, homework, and exam activity.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Present today" value={stats.todayCounts.Present} accent="active" loading={loading} />
        <StatCard label="Late today" value={stats.todayCounts.Late} accent="levelB" loading={loading} />
        <StatCard label="Absent today" value={stats.todayCounts.Absent} accent="inactive" loading={loading} />
        <StatCard label="Attendance rate (month)" value={stats.monthRate == null ? 'No data' : `${stats.monthRate}%`} accent="brand" loading={loading} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Homework">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">Assigned</span>
              <span className="font-semibold text-ink">{stats.homeworkTotal}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">Awaiting grading</span>
              <span className="font-semibold text-inactive">{stats.submitted}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">Graded</span>
              <span className="font-semibold text-active">{stats.graded}</span>
            </div>
          </div>
        </Panel>

        <Panel title="Exam statistics">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">Total exams</span>
              <span className="font-semibold text-ink">{stats.examTotal}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">Awaiting grading</span>
              <span className="font-semibold text-inactive">{stats.awaitingGrading}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">Average score</span>
              <span className="font-semibold text-ink">{stats.examAvg == null ? 'No data' : `${stats.examAvg}%`}</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Student performance - lowest attendance this month">
          {stats.performance.length === 0 ? (
            <p className="text-sm text-ink/50">No attendance recorded this month yet.</p>
          ) : (
            <div className="space-y-2">
              {stats.performance.map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="flex-1 truncate text-sm font-medium text-ink">{s.real_name}</span>
                  <span className="text-xs text-ink/40">{s.marks} marks</span>
                  <span className={`text-sm font-bold ${s.rate < 50 ? 'text-inactive' : 'text-ink'}`}>{s.rate}%</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
