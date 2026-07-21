// Rankings.jsx
// Points are shown as a total per student (students.points), still not
// computed from attendance/exams/homework - see migration 0008 for why.
// The total itself is now a database-maintained cache over a
// point_transactions ledger (migrations 0019/0020): the database revokes
// direct writes to students.points from every application role, so
// editing here records a bonus/penalty ledger transaction instead of
// updating the student row - the trigger-maintained cache is what makes
// the rank list (and the student portal's leaderboard) reflect it, same
// as before from this page's point of view.

import { useState, useMemo } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import { LevelBadge } from '../components/Badge';

export default function Rankings() {
  const { students, awardStudentPoints, error } = useAcademy();
  const { role, session } = useAuth();
  const isAdmin = role === 'administrator';

  const [pendingId, setPendingId] = useState(null);

  const ranked = useMemo(() => {
    return students
      .filter((s) => s.status === 'Active')
      .map((s) => ({ ...s, points: Number(s.points || 0) }))
      .sort((a, b) => b.points - a.points || a.real_name.localeCompare(b.real_name));
  }, [students]);

  const commitPoints = async (student, nextPoints) => {
    if (!isAdmin) return;
    const value = Number(nextPoints);
    const current = Number(student.points || 0);
    const delta = value - current;
    if (!Number.isFinite(value) || delta === 0) return;
    setPendingId(student.id);
    try {
      await awardStudentPoints({
        studentId: student.id,
        level: student.level,
        categoryKey: delta > 0 ? 'bonus' : 'penalty',
        points: delta,
        reason: 'Manual adjustment via Rankings page',
        awardedBy: session.user.id,
      });
    } finally {
      setPendingId(null);
    }
  };

  const adjustPoints = (student, delta) => commitPoints(student, Number(student.points || 0) + delta);

  const medal = (i) => (i === 0 ? 'bg-levelB' : i === 1 ? 'bg-ink/20' : i === 2 ? 'bg-levelA' : 'bg-ink/5');
  const medalText = (i) => (i <= 2 ? 'text-white' : 'text-ink/50');

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Rankings</h1>
        <p className="mt-1 text-sm text-ink/50">
          {isAdmin ? 'Points are fully editable - add, subtract, or set an exact total for any student.' : 'Ranked by points.'}
        </p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      {ranked.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No active students</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl bg-white shadow-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-ink/[0.02]">
                    <th className="px-4 py-3 font-semibold text-ink/70">Rank</th>
                    <th className="px-4 py-3 font-semibold text-ink/70">Points</th>
                    <th className="px-4 py-3 font-semibold text-ink/70">Real Name</th>
                    <th className="px-4 py-3 font-semibold text-ink/70">English Name</th>
                    <th className="px-4 py-3 font-semibold text-ink/70">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((s, i) => (
                    <tr key={s.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.015]">
                      <td className="px-4 py-3">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${medal(i)} ${medalText(i)}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => adjustPoints(s, -1)}
                              disabled={pendingId === s.id}
                              className="rounded-md p-1 text-ink/50 hover:bg-ink/5 disabled:opacity-40"
                              aria-label={`Subtract a point from ${s.real_name}`}
                            >
                              <Minus size={14} />
                            </button>
                            <input
                              type="number"
                              step="1"
                              defaultValue={s.points}
                              key={`${s.id}-${s.points}`}
                              disabled={pendingId === s.id}
                              onBlur={(e) => commitPoints(s, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.target.blur();
                              }}
                              className="w-16 rounded-lg border border-ink/10 px-2 py-1 text-center text-sm font-bold text-brand-500"
                            />
                            <button
                              type="button"
                              onClick={() => adjustPoints(s, 1)}
                              disabled={pendingId === s.id}
                              className="rounded-md p-1 text-ink/50 hover:bg-ink/5 disabled:opacity-40"
                              aria-label={`Add a point to ${s.real_name}`}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="font-bold text-brand-500">{s.points}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">{s.real_name}</td>
                      <td className="px-4 py-3 text-ink/70">{s.english_name || '—'}</td>
                      <td className="px-4 py-3"><LevelBadge level={s.level} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {ranked.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card">
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${medal(i)} ${medalText(i)}`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-ink">{s.real_name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {s.english_name && <span className="text-xs text-ink/40">{s.english_name}</span>}
                    <LevelBadge level={s.level} />
                  </div>
                </div>
                {isAdmin ? (
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => adjustPoints(s, -1)}
                      disabled={pendingId === s.id}
                      className="rounded-md p-1.5 text-ink/50 active:bg-ink/5 disabled:opacity-40"
                      aria-label={`Subtract a point from ${s.real_name}`}
                    >
                      <Minus size={15} />
                    </button>
                    <input
                      type="number"
                      step="1"
                      defaultValue={s.points}
                      key={`${s.id}-${s.points}`}
                      disabled={pendingId === s.id}
                      onBlur={(e) => commitPoints(s, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                      }}
                      className="w-14 rounded-lg border border-ink/10 px-1.5 py-1 text-center text-sm font-bold text-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => adjustPoints(s, 1)}
                      disabled={pendingId === s.id}
                      className="rounded-md p-1.5 text-ink/50 active:bg-ink/5 disabled:opacity-40"
                      aria-label={`Add a point to ${s.real_name}`}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                ) : (
                  <p className="flex-shrink-0 text-sm font-bold text-brand-500">{s.points} pts</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
