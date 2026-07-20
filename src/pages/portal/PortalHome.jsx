// PortalHome.jsx
// The student's own dashboard: motivating hero, points/rank/attendance/exam
// KPIs, a single rule-based "next step" suggestion, progress visualization,
// achievements (certificates presented as badge cards), ranking, and an
// upcoming-lessons timeline. Students only ever see their own data here -
// RLS scopes attendance/exam_scores/homework_status/certificates to their
// own rows, and students_self_read means `students` itself resolves to
// just their own record, so `students[0]` (if present) IS "me". Rank comes
// from get_leaderboard() (see MyRanking.jsx) since ranking against
// classmates needs data a student's own RLS-scoped reads don't include.
// Every widget here is computed from data already loaded via useAcademy()
// or the pre-existing getLeaderboard() call - no new table, column, or
// migration, and no invented streaks/goals beyond what the underlying
// attendance/homework/exam records genuinely support.

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CalendarCheck, MessageSquare, Award, Trophy, Star, BookOpen, FileCheck2, Flame, ArrowRight } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getLeaderboard } from '../../lib/db';
import Panel from '../../components/Panel';
import StatCard from '../../components/StatCard';
import DashboardHero from '../../components/DashboardHero';
import QuickActions from '../../components/QuickActions';
import SectionLabel from '../../components/SectionLabel';
import { attendanceRate, filterByYearMonth } from '../../utils/attendance';
import { currentAndPreviousMonth, trendFrom } from '../../utils/date';

function ProgressBar({ value, color = 'bg-brand-500' }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/5">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Consecutive most-recent attendance marks that are 'Present' - breaks on
// the first 'Late' or 'Absent' walking backward from today. Only ever
// shown by the caller when >= 2, so a single lucky day isn't hyped as a
// "streak".
function currentPresentStreak(records) {
  const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
  let streak = 0;
  for (const r of sorted) {
    if (r.status === 'Present') streak += 1;
    else break;
  }
  return streak;
}

export default function PortalHome() {
  const { students, lessons, attendance, homework, homeworkStatus, examScores, certificates } = useAcademy();
  const me = students[0];
  const [leaderboard, setLeaderboard] = useState(null);
  const { current, previous } = useMemo(() => currentAndPreviousMonth(), []);

  useEffect(() => {
    let cancelled = false;
    getLeaderboard()
      .then((rows) => {
        if (cancelled) return;
        setLeaderboard([...(rows || [])].sort((a, b) => b.points - a.points || a.real_name.localeCompare(b.real_name)));
      })
      .catch(() => {
        if (!cancelled) setLeaderboard([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const upcoming = useMemo(() => {
    const now = new Date();
    return lessons
      .filter((l) => new Date(l.scheduled_at) >= now)
      .filter((l) => !me || (!l.group_name && !l.level) || l.group_name === me.group_name || l.level === me.level)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .slice(0, 5);
  }, [lessons, me]);

  const { points, rank } = useMemo(() => {
    if (!me || !leaderboard) return { points: 0, rank: null };
    const idx = leaderboard.findIndex((r) => r.student_id === me.id);
    return { points: leaderboard[idx]?.points ?? 0, rank: idx >= 0 ? idx + 1 : null };
  }, [leaderboard, me]);

  const topThree = useMemo(() => (leaderboard || []).slice(0, 3), [leaderboard]);

  const stats = useMemo(() => {
    // ---- Attendance (this month vs last month) ----
    const monthRecords = filterByYearMonth(attendance, 'date', current.year, current.month);
    const lastMonthRecords = filterByYearMonth(attendance, 'date', previous.year, previous.month);
    const counts = {
      Present: monthRecords.filter((a) => a.status === 'Present').length,
      Late: monthRecords.filter((a) => a.status === 'Late').length,
      Absent: monthRecords.filter((a) => a.status === 'Absent').length,
    };
    const rate = attendanceRate(monthRecords);
    const lastRate = attendanceRate(lastMonthRecords);
    const streak = currentPresentStreak(attendance);

    // ---- Exam average (personal progress, all graded exams) ----
    const scored = examScores.filter((s) => s.score != null);
    const examAvg = scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + Number(s.score), 0) / scored.length) : null;

    // ---- Homework ----
    const myHomework = me ? homework.filter((h) => !h.level || h.level === me.level) : [];
    const statusOf = (homeworkId) => homeworkStatus.find((h) => h.homework_id === homeworkId)?.status || 'Assigned';
    const submitted = myHomework.filter((h) => statusOf(h.id) === 'Submitted').length;
    const graded = myHomework.filter((h) => statusOf(h.id) === 'Graded').length;
    const pending = myHomework.length - submitted - graded;
    const homeworkDoneRate = myHomework.length > 0 ? Math.round(((submitted + graded) / myHomework.length) * 100) : null;

    return {
      attendanceCounts: counts,
      attendanceRate: rate,
      attendanceTrend: trendFrom(rate, lastRate, '%'),
      attendanceMarks: monthRecords.length,
      attendanceStreak: streak,
      examAvg,
      examCount: scored.length,
      homeworkTotal: myHomework.length,
      homeworkSubmitted: submitted,
      homeworkGraded: graded,
      homeworkPending: pending,
      homeworkDoneRate,
    };
  }, [attendance, examScores, homework, homeworkStatus, me, current, previous]);

  // ---- Next step: one honest, actionable suggestion based on real state ----
  const nextStep = useMemo(() => {
    if (stats.homeworkPending > 0) {
      return { text: `You have ${stats.homeworkPending} homework item${stats.homeworkPending === 1 ? '' : 's'} to submit.`, to: '/my-homework', cta: 'Submit homework' };
    }
    if (upcoming.length > 0) {
      return { text: `Your next lesson is "${upcoming[0].topic}" on ${new Date(upcoming[0].scheduled_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}.`, to: '/', cta: 'View schedule' };
    }
    if (rank != null && rank > 1) {
      return { text: `You're #${rank} on the leaderboard - keep going to climb higher.`, to: '/my-ranking', cta: 'View leaderboard' };
    }
    return { text: "You're all caught up. Great work!", to: '/my-ranking', cta: 'View leaderboard' };
  }, [stats.homeworkPending, upcoming, rank]);

  const quickActions = [
    { to: '/my-homework', label: 'My Homework', Icon: BookOpen },
    { to: '/my-exams', label: 'My Exams', Icon: FileCheck2 },
    { to: '/my-certificates', label: 'Certificates', Icon: Award },
    { to: '/my-ranking', label: 'Leaderboard', Icon: Trophy },
    { to: '/chat', label: 'Messages', Icon: MessageSquare },
  ];

  if (!me) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">Not linked yet</p>
        <p className="mt-1 text-sm text-ink/50">
          Your account isn't linked to a student record yet - ask your administrator to link it.
        </p>
      </div>
    );
  }

  return (
    <div>
      <DashboardHero
        title={`Welcome back, ${me.real_name}`}
        summary={rank != null ? `You're ranked #${rank} with ${points} points.` : "Let's see how you're doing."}
        right={
          stats.attendanceStreak >= 2 ? (
            <span className="flex items-center gap-1.5 rounded-full bg-levelB/10 px-3 py-1.5 text-sm font-semibold text-levelB">
              <Flame size={16} /> {stats.attendanceStreak}-day streak
            </span>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="My points" value={points} tone="brand" icon={Star} />
        <StatCard label="My rank" value={rank ? `#${rank}` : '—'} tone="brand" icon={Trophy} />
        <StatCard
          label="Attendance (month)"
          value={stats.attendanceRate == null ? '—' : `${stats.attendanceRate}%`}
          trend={stats.attendanceTrend}
          tone="info"
          icon={CalendarCheck}
        />
        <StatCard label="Exam average" value={stats.examAvg == null ? '—' : `${stats.examAvg}%`} tone="success" icon={FileCheck2} />
      </div>

      <Link
        to={nextStep.to}
        className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-brand-600 px-4 py-3.5 text-white shadow-card transition-colors hover:bg-brand-700 active:bg-brand-700/90"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Next step</p>
          <p className="mt-0.5 truncate text-sm font-medium sm:text-base">{nextStep.text}</p>
        </div>
        <span className="flex flex-shrink-0 items-center gap-1 text-sm font-semibold">
          {nextStep.cta} <ArrowRight size={16} aria-hidden="true" />
        </span>
      </Link>

      <div className="mb-6">
        <SectionLabel>Quick actions</SectionLabel>
        <QuickActions actions={quickActions} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Attendance this month" icon={CalendarClock} action={<Link to="/progress" className="text-xs font-semibold text-brand-500 hover:underline">Details</Link>}>
          {stats.attendanceMarks === 0 ? (
            <p className="text-sm text-ink/50">No attendance recorded yet this month.</p>
          ) : (
            <>
              <div className="mb-3 text-sm text-ink/60">{stats.attendanceRate}% present this month</div>
              <ProgressBar value={stats.attendanceRate} color="bg-active" />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="font-display text-lg font-bold text-active">{stats.attendanceCounts.Present}</p>
                  <p className="text-xs text-ink/50">Present</p>
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-levelB">{stats.attendanceCounts.Late}</p>
                  <p className="text-xs text-ink/50">Late</p>
                </div>
                <div>
                  <p className="font-display text-lg font-bold text-inactive">{stats.attendanceCounts.Absent}</p>
                  <p className="text-xs text-ink/50">Absent</p>
                </div>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Homework" icon={BookOpen} action={<Link to="/my-homework" className="text-xs font-semibold text-brand-500 hover:underline">View all</Link>}>
          {stats.homeworkTotal === 0 ? (
            <p className="text-sm text-ink/50">No homework assigned yet.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-ink/60">{stats.homeworkDoneRate}% complete</span>
              </div>
              <ProgressBar value={stats.homeworkDoneRate} />
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink/60">Awaiting submission</span>
                  <span className="font-semibold text-levelB">{stats.homeworkPending}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink/60">Submitted (awaiting grade)</span>
                  <span className="font-semibold text-ink">{stats.homeworkSubmitted}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink/60">Graded</span>
                  <span className="font-semibold text-active">{stats.homeworkGraded}</span>
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Achievements" icon={Award} action={<Link to="/my-certificates" className="text-xs font-semibold text-brand-500 hover:underline">View all</Link>}>
          {certificates.length === 0 ? (
            <p className="text-sm text-ink/50">No certificates yet - keep learning to earn your first one.</p>
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
          {certificates.length > 4 && <p className="mt-2 text-xs text-ink/40">+{certificates.length - 4} more</p>}
        </Panel>

        <Panel title="Ranking" icon={Trophy} action={<Link to="/my-ranking" className="text-xs font-semibold text-brand-500 hover:underline">Full leaderboard</Link>}>
          {topThree.length === 0 ? (
            <p className="text-sm text-ink/50">No ranking data yet.</p>
          ) : (
            <div className="space-y-2">
              {topThree.map((r, i) => (
                <div key={r.student_id} className="flex items-center gap-2 text-sm">
                  <Trophy size={14} className={i === 0 ? 'text-levelB' : i === 1 ? 'text-ink/40' : 'text-levelA'} />
                  <span className={`flex-1 truncate ${r.student_id === me.id ? 'font-bold text-brand-500' : 'text-ink'}`}>
                    {r.real_name}
                    {r.student_id === me.id ? ' (you)' : ''}
                  </span>
                  <span className="font-semibold text-ink">{r.points} pts</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <SectionLabel>Upcoming lessons</SectionLabel>
      {upcoming.length === 0 ? (
        <div className="rounded-xl border border-ink/[0.06] bg-white p-6 text-center text-sm text-ink/50 shadow-card">
          No upcoming lessons scheduled.
        </div>
      ) : (
        <div className="relative space-y-4 border-l-2 border-ink/10 pl-5">
          {upcoming.map((l) => (
            <div key={l.id} className="relative">
              <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500" aria-hidden="true" />
              <div className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-white p-3 shadow-card">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                  <CalendarClock size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{l.topic}</p>
                  <p className="text-xs text-ink/50">{new Date(l.scheduled_at).toLocaleString()}</p>
                </div>
                {l.discussion_enabled && (
                  <Link
                    to={`/chat?type=lesson&id=${l.id}`}
                    className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 transition-colors hover:bg-ink/5 active:bg-ink/10"
                  >
                    <MessageSquare size={13} aria-hidden="true" /> Discuss
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
