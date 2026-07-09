// PortalHome.jsx
// Students only ever see their own data here - RLS scopes lesson_attendance/
// exam_scores/homework_status/certificates to their own rows, and
// students_self_read means `students` itself resolves to just their own
// record, so `students[0]` (if present) IS "me". Rank comes from
// get_leaderboard() (see MyRanking.jsx) since ranking against classmates
// needs data a student's own RLS-scoped reads don't include.

import { useState, useEffect, useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getLeaderboard } from '../../lib/db';

export default function PortalHome() {
  const { students, lessons } = useAcademy();
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
        <p className="mt-1 text-sm text-ink/50">Here's what's coming up.</p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-card">
          <p className="text-xs text-ink/50">My points</p>
          <p className="mt-1 font-display text-2xl font-bold text-brand-500">{points}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-card">
          <p className="text-xs text-ink/50">My rank</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{rank ? `#${rank}` : '—'}</p>
        </div>
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
              <div>
                <p className="font-semibold text-ink">{l.topic}</p>
                <p className="text-xs text-ink/50">{new Date(l.scheduled_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
