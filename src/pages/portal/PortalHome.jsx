// PortalHome.jsx
// Module 3 of the dashboard work: the student's own dashboard - Personal
// Progress, Attendance, Homework, Certificates, and Ranking, plus the
// pre-existing Upcoming Lessons list. Students only ever see their own
// data here - RLS scopes attendance/exam_scores/homework_status/
// certificates to their own rows, and students_self_read means `students`
// itself resolves to just their own record, so `students[0]` (if present)
// IS "me". Rank comes from get_leaderboard() (see MyRanking.jsx) since
// ranking against classmates needs data a student's own RLS-scoped reads
// don't include. Every widget here is computed from data already loaded
// via useAcademy() - no new table, column, or migration.

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, MessageSquare, Award, Trophy } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getLeaderboard } from '../../lib/db';
import Panel from '../../components/Panel';

export default function PortalHome() {
  const { students, lessons, attendance, homework, homeworkStatus, examScores, certificates } = useAcademy();
  const me = students[0];
  const [leaderboard, setLeaderboard] = useState(null);

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
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1;

    // ---- Attendance (this month) ----
    const monthRecords = attendance.filter((a) => {
      const [y, m] = a.date.split('-').map(Number);
      return y === curYear && m === curMonth;
    });
    const counts = {
      Present: monthRecords.filter((a) => a.status === 'Present').length,
      Late: monthRecords.filter((a) => a.status === 'Late').length,
      Absent: monthRecords.filter((a) => a.status === 'Absent').length,
    };
    const score = monthRecords.reduce((sum, a) => sum + (a.status === 'Present' ? 1 : a.status === 'Late' ? 0.5 : 0), 0);
    const attendanceRate = monthRecords.length > 0 ? Math.round((score / monthRecords.length) * 100) : null;

    // ---- Exam average (personal progress) ----
    const scored = examScores.filter((s) => s.score != null);
    const examAvg = scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + Number(s.score), 0) / scored.length) : null;

    // ---- Homework ----
    const myHomework = me ? homework.filter((h) => !h.level || h.level === me.level) : [];
    const statusOf = (homeworkId) => homeworkStatus.find((h) => h.homework_id === homeworkId)?.status || 'Assigned';
    const submitted = myHomework.filter((h) => statusOf(h.id) === 'Submitted').length;
    const graded = myHomework.filter((h) => statusOf(h.id) === 'Graded').length;
    const pending = myHomework.length - submitted - graded;

    return { attendanceCounts: counts, attendanceRate, attendanceMarks: monthRecords.length, examAvg, examCount: scored.length, homeworkTotal: myHomework.length, homeworkSubmitted: submitted, homeworkGraded: graded, homeworkPending: pending };
  }, [attendance, examScores, homework, homeworkStatus, me]);

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
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Welcome, {me.real_name}</h1>
        <p className="mt-1 text-sm text-ink/50">Your progress at a glance.</p>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-card">
          <p className="text-xs text-ink/50">My points</p>
          <p className="mt-1 font-display text-2xl font-bold text-brand-500">{points}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-card">
          <p className="text-xs text-ink/50">My rank</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{rank ? `#${rank}` : '—'}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-card">
          <p className="text-xs text-ink/50">Attendance (month)</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{stats.attendanceRate == null ? '—' : `${stats.attendanceRate}%`}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-card">
          <p className="text-xs text-ink/50">Exam average</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{stats.examAvg == null ? '—' : stats.examAvg}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Attendance this month" action={<Link to="/progress" className="text-xs font-semibold text-brand-500 hover:underline">Details</Link>}>
          {stats.attendanceMarks === 0 ? (
            <p className="text-sm text-ink/50">No attendance recorded yet this month.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="font-display text-xl font-bold text-active">{stats.attendanceCounts.Present}</p>
                <p className="text-xs text-ink/50">Present</p>
              </div>
              <div>
                <p className="font-display text-xl font-bold text-levelB">{stats.attendanceCounts.Late}</p>
                <p className="text-xs text-ink/50">Late</p>
              </div>
              <div>
                <p className="font-display text-xl font-bold text-inactive">{stats.attendanceCounts.Absent}</p>
                <p className="text-xs text-ink/50">Absent</p>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Homework" action={<Link to="/my-homework" className="text-xs font-semibold text-brand-500 hover:underline">View all</Link>}>
          {stats.homeworkTotal === 0 ? (
            <p className="text-sm text-ink/50">No homework assigned yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink/60">Awaiting submission</span>
                <span className="font-semibold text-inactive">{stats.homeworkPending}</span>
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
          )}
        </Panel>

        <Panel title="Certificates" action={<Link to="/my-certificates" className="text-xs font-semibold text-brand-500 hover:underline">View all</Link>}>
          {certificates.length === 0 ? (
            <p className="text-sm text-ink/50">No certificates yet.</p>
          ) : (
            <div className="space-y-2">
              {certificates.slice(0, 3).map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <Award size={14} className="flex-shrink-0 text-brand-500" />
                  <span className="truncate text-ink">{c.title}</span>
                </div>
              ))}
              {certificates.length > 3 && <p className="text-xs text-ink/40">+{certificates.length - 3} more</p>}
            </div>
          )}
        </Panel>

        <Panel title="Ranking" action={<Link to="/my-ranking" className="text-xs font-semibold text-brand-500 hover:underline">Full leaderboard</Link>}>
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

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink/50">Upcoming lessons</h2>
      {upcoming.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-sm text-ink/50 shadow-card">No upcoming lessons scheduled.</div>
      ) : (
        <div className="space-y-2">
          {upcoming.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <CalendarClock size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{l.topic}</p>
                <p className="text-xs text-ink/50">{new Date(l.scheduled_at).toLocaleString()}</p>
              </div>
              {l.discussion_enabled && (
                <Link
                  to={`/chat?type=lesson&id=${l.id}`}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
                >
                  <MessageSquare size={13} /> Discuss
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
