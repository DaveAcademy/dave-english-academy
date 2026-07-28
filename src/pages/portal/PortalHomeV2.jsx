// PortalHomeV2.jsx
// Prototype comparison dashboard - Gamified Learning + Smart Insights
// concepts merged, per the approved design review. Deliberately a
// separate file/route from PortalHome.jsx (not touched) so both can be
// compared side by side before a direction is chosen. Some stat
// computation is intentionally duplicated from PortalHome.jsx rather
// than extracted into a shared hook, since extracting would mean
// editing that file too - fine for a comparison prototype, worth
// de-duplicating once a direction is picked.
//
// No fabricated data: the mockup version of this concept used fake
// sparklines and an invented "rank climbed 3 spots" insight. Neither
// is backed by real historical data here (no per-student points-
// snapshot history exists yet - see the Achievement Engine design doc),
// so sparklines are dropped and insights are limited to deltas that are
// genuinely computable today (this month vs last month attendance,
// current homework/exam state).

import { useState, useEffect, useMemo } from 'react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getLeaderboard } from '../../lib/db';
import { computeBadges } from '../../utils/badges';
import { attendanceRate, filterByYearMonth } from '../../utils/attendance';
import { currentAndPreviousMonth, trendFrom } from '../../utils/date';

function currentPresentStreak(records) {
  const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
  let streak = 0;
  for (const r of sorted) {
    if (r.status === 'Present') streak += 1;
    else break;
  }
  return streak;
}

export default function PortalHomeV2() {
  const { students, lessons, attendance, homework, homeworkStatus, examScores } = useAcademy();
  const me = students[0];
  const [leaderboard, setLeaderboard] = useState(null);
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

  const { points, rank } = useMemo(() => {
    if (!me || !leaderboard) return { points: 0, rank: null };
    const idx = leaderboard.findIndex((r) => r.student_id === me.id);
    return { points: leaderboard[idx]?.points ?? 0, rank: idx >= 0 ? idx + 1 : null };
  }, [leaderboard, me]);

  const topFour = useMemo(() => (leaderboard || []).slice(0, 4), [leaderboard]);

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

    const now = new Date();
    const lessonsCompleted = lessons.filter(
      (l) => new Date(l.scheduled_at) < now && (!me || (!l.group_name && !l.level) || l.group_name === me.group_name || l.level === me.level)
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

  // Honest insights only - each line is tied to a real computed value, no
  // invented history.
  const insights = useMemo(() => {
    const list = [];
    if (stats.attendanceTrend) {
      const dir = stats.attendanceTrend.direction;
      if (dir === 'up') list.push({ tag: 'Momentum', text: `Attendance is up ${stats.attendanceTrend.text.split(' ')[0]} vs last month - keep it up.` });
      else if (dir === 'down') list.push({ tag: 'Attention', text: `Attendance is down ${stats.attendanceTrend.text.split(' ')[0]} vs last month.` });
    }
    if (stats.homeworkPending > 0) {
      list.push({ tag: 'Action', text: `${stats.homeworkPending} homework item${stats.homeworkPending === 1 ? '' : 's'} still need submitting.` });
    }
    if (stats.examAvg != null) {
      list.push(
        stats.examAvg >= 80
          ? { tag: 'Strength', text: `Exam average is ${stats.examAvg}% across ${stats.examCount} graded exams - strong and steady.` }
          : { tag: 'Suggestion', text: `Exam average is ${stats.examAvg}% - a short review session before the next test could lift this.` }
      );
    }
    if (list.length === 0) list.push({ tag: 'Status', text: 'Not enough recorded activity yet to generate insights.' });
    return list.slice(0, 3);
  }, [stats]);

  const xpIntoLevel = points % 200;
  const level = Math.floor(points / 200) + 1;

  if (!me) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">Not linked yet</p>
        <p className="mt-1 text-sm text-ink/50">Your account isn't linked to a student record yet.</p>
      </div>
    );
  }

  return (
    <div className="-m-4 rounded-2xl bg-[#141224] p-5 text-[#EDEBFF] sm:-m-6 sm:p-7">
      <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-[#8B84C9]">Prototype · Dashboard V2 (Gamified + Smart Insights)</p>

      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 flex-shrink-0">
          <div className="absolute inset-[-4px] rounded-full" style={{ background: `conic-gradient(#F2B84B ${(xpIntoLevel / 200) * 360}deg, rgba(255,255,255,.1) 0)` }} />
          <div className="absolute inset-1 flex items-center justify-center rounded-full bg-[#211A3D] text-lg font-bold">
            {me.real_name.slice(0, 2).toUpperCase()}
          </div>
          <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-[#141224] bg-[#F2B84B] px-1.5 py-0.5 text-[10px] font-extrabold text-[#211A3D]">
            LV{level}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold">{me.real_name}</h1>
          <p className="font-mono text-xs text-[#8B84C9]">{points} XP · {200 - xpIntoLevel} to next level</p>
          <div className="mt-1.5 h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#2ECC91] to-[#F2B84B]" style={{ width: `${(xpIntoLevel / 200) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          ['Points', points, '#F2B84B'],
          ['Rank', rank ? `#${rank}` : '—', '#EDEBFF'],
          ['Streak', stats.attendanceStreak >= 2 ? `🔥 ${stats.attendanceStreak}` : `${stats.attendanceStreak}`, '#EDEBFF'],
          ['Exam avg', stats.examAvg == null ? '—' : `${stats.examAvg}%`, '#5EEBD8'],
        ].map(([label, val, color]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8B84C9]">{label}</p>
            <p className="mt-1 font-mono text-xl font-bold" style={{ color }}>{val}</p>
          </div>
        ))}
      </div>

      <p className="mb-2 mt-6 text-[10px] font-bold uppercase tracking-widest text-[#8B84C9]">Badges</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {badges
          .filter((b) => !b.unavailable)
          .map((b) => (
            <div
              key={b.id}
              title={b.description}
              className={`rounded-xl border p-2.5 text-center ${b.unlocked ? 'border-[#F2B84B]/40 bg-[#F2B84B]/10' : 'border-white/10 bg-white/[0.03] opacity-40'}`}
            >
              <div className="text-xl">{b.emoji}</div>
              <div className="mt-1 text-[9px] font-bold leading-tight">{b.label}</div>
            </div>
          ))}
      </div>

      <p className="mb-2 mt-6 text-[10px] font-bold uppercase tracking-widest text-[#8B84C9]">Insights</p>
      <div className="space-y-2">
        {insights.map((ins, i) => (
          <div key={i} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#5EEBD8] shadow-[0_0_6px_rgba(94,235,216,.7)]" />
            <p className="text-sm leading-relaxed text-[#DCD9F5]">
              <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wide text-[#5EEBD8]">{ins.tag}</span>
              {ins.text}
            </p>
          </div>
        ))}
      </div>

      {topFour.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-[10px] font-bold uppercase tracking-widest text-[#8B84C9]">Leaderboard</p>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            {topFour.map((r, i) => (
              <div
                key={r.student_id}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${r.student_id === me.id ? 'bg-[#F2B84B]/10' : ''}`}
              >
                <span className="w-4 font-mono text-xs font-bold text-[#F2B84B]">{i + 1}</span>
                <span className="flex-1 truncate font-medium">
                  {r.student_id === me.id ? 'You' : r.real_name}
                </span>
                <span className="font-mono text-xs text-[#8B84C9]">{r.points} pts</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
