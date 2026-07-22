// Recognition.jsx
// Admin-only (English-only by design, same as Rankings.jsx/Payments.jsx -
// no i18n needed here).
//
// Candidates come straight from get_group_leaderboard() (0023) - the same
// RPC Rankings.jsx's Level Leaderboard already uses - scoped to a single
// week/month period. finalize_recognition() (0023) auto-computes and
// auto-picks a winner with no way to specify one; it structurally can't
// express "the admin reviewed candidates and picked this student", so this
// page calls finalize_recognition_winner() (0025) instead, which takes an
// admin-chosen student_id, recomputes their period points from the ledger
// itself (never trusts a client-supplied value), and issues the
// certificate in the same transaction.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check, History, ShieldAlert } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import { LevelBadge } from '../components/Badge';
import { getGroupLeaderboard, getPeriodBounds, listRecognitionAwards } from '../lib/db';
import { addDaysISO, addMonthsISO } from '../utils/date';

const LEVELS = ['A', 'B', 'C'];
const AWARD_TYPES = [
  { key: 'student_of_week', periodType: 'week', title: 'Student of the Week' },
  { key: 'student_of_month', periodType: 'month', title: 'Student of the Month' },
];

function formatPeriodLabel(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startStr = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const endStr =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
      ? end.toLocaleDateString('en-US', { day: 'numeric' })
      : end.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `${startStr}–${endStr}, ${end.getFullYear()}`;
}

export default function Recognition() {
  const { students, finalizeRecognitionWinner, error } = useAcademy();
  const { role } = useAuth();
  const isAdmin = role === 'administrator';

  const [awardTypeKey, setAwardTypeKey] = useState('student_of_week');
  const awardType = AWARD_TYPES.find((a) => a.key === awardTypeKey);

  const [bounds, setBounds] = useState(null);
  const [candidates, setCandidates] = useState({});
  const [history, setHistory] = useState(null);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const studentsById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  // "Current" period whenever the award type tab changes - always via the
  // server (Asia/Tashkent "today"), never computed client-side.
  useEffect(() => {
    let cancelled = false;
    setBounds(null);
    getPeriodBounds(awardType.periodType, null).then((b) => {
      if (!cancelled) setBounds(b);
    });
    return () => {
      cancelled = true;
    };
  }, [awardType.periodType]);

  useEffect(() => {
    if (!bounds) return undefined;
    let cancelled = false;
    setCandidates({});
    Promise.all(LEVELS.map((lvl) => getGroupLeaderboard(lvl, awardType.periodType, bounds.period_start)))
      .then((results) => {
        if (cancelled) return;
        const byLevel = {};
        LEVELS.forEach((lvl, i) => {
          byLevel[lvl] = (results[i] || []).filter((r) => Number(r.points) > 0).slice(0, 5);
        });
        setCandidates(byLevel);
      })
      .catch(() => {
        if (!cancelled) {
          const empty = {};
          LEVELS.forEach((lvl) => (empty[lvl] = []));
          setCandidates(empty);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bounds, awardType.periodType]);

  const loadHistory = useCallback(() => {
    setHistory(null);
    listRecognitionAwards()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Already-finalized winner for the currently-viewed award type + period,
  // per level - drives both the "already awarded" summary and blocks
  // Confirm client-side before the RPC's own duplicate check even runs.
  const finalizedByLevel = useMemo(() => {
    if (!history || !bounds) return {};
    const map = {};
    for (const h of history) {
      if (h.award_type === awardTypeKey && h.period_start === bounds.period_start && h.period_end === bounds.period_end) {
        map[h.level] = h;
      }
    }
    return map;
  }, [history, bounds, awardTypeKey]);

  const navigatePeriod = (direction) => {
    if (!bounds) return;
    const nextRef =
      awardType.periodType === 'week' ? addDaysISO(bounds.period_start, direction * 7) : addMonthsISO(bounds.period_start, direction);
    setBounds(null);
    getPeriodBounds(awardType.periodType, nextRef).then(setBounds);
  };

  const submitConfirm = async () => {
    if (!pendingConfirm || !bounds) return;
    setConfirmSubmitting(true);
    setMessage('');
    try {
      await finalizeRecognitionWinner({
        awardType: awardTypeKey,
        level: pendingConfirm.level,
        periodType: awardType.periodType,
        periodStart: bounds.period_start,
        periodEnd: bounds.period_end,
        studentId: pendingConfirm.candidate.student_id,
      });
      setMessage(`${awardType.title} confirmed for ${pendingConfirm.candidate.real_name} (Level ${pendingConfirm.level}).`);
      setPendingConfirm(null);
      loadHistory();
    } catch (e) {
      setMessage(
        e?.message?.toLowerCase().includes('reason')
          ? 'This period has already been finalized for this level.'
          : 'Could not finalize this recognition. Please try again.'
      );
    } finally {
      setConfirmSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-inactive" />
        <p className="font-display text-lg font-semibold text-ink">Administrators only</p>
        <p className="mt-1 text-sm text-ink/50">Recognition finalization is an admin-only action.</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Recognition</h1>
        <p className="mt-1 text-sm text-ink/50">Review candidates and confirm Student of the Week/Month winners.</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}
      {message && <div className="mb-4 rounded-lg border border-active/30 bg-active/5 px-4 py-3 text-sm text-active">{message}</div>}

      <div className="mb-4 flex gap-1.5">
        {AWARD_TYPES.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setAwardTypeKey(a.key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              awardTypeKey === a.key ? 'bg-brand-500 text-white' : 'bg-white text-ink/60 shadow-card hover:text-ink'
            }`}
          >
            {a.title}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
        <button type="button" onClick={() => navigatePeriod(-1)} disabled={!bounds} className="rounded-lg p-2 text-ink/60 hover:bg-ink/5 disabled:opacity-40">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-semibold text-ink">
          Period: {bounds ? formatPeriodLabel(bounds.period_start, bounds.period_end) : 'Loading...'}
        </p>
        <button type="button" onClick={() => navigatePeriod(1)} disabled={!bounds} className="rounded-lg p-2 text-ink/60 hover:bg-ink/5 disabled:opacity-40">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {LEVELS.map((level) => {
          const list = candidates[level];
          const alreadyFinalized = finalizedByLevel[level];
          const rankCounts = {};
          (list || []).forEach((c) => {
            rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
          });

          return (
            <div key={level} className="rounded-xl bg-white p-4 shadow-card">
              <div className="mb-3 flex items-center gap-2">
                <LevelBadge level={level} />
                <h3 className="font-display text-sm font-bold text-ink">Candidates</h3>
              </div>

              {alreadyFinalized ? (
                <div className="flex items-start gap-2 rounded-lg bg-active/10 px-3 py-2.5 text-sm text-active">
                  <Check size={16} className="mt-0.5 flex-shrink-0" />
                  <span>
                    Already awarded to <strong>{studentsById[alreadyFinalized.student_id]?.real_name || 'a student'}</strong> ·{' '}
                    {alreadyFinalized.points} pts
                  </span>
                </div>
              ) : list === undefined ? (
                <p className="py-4 text-center text-sm text-ink/50">Loading...</p>
              ) : list.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink/50">No candidates yet - no points earned this period.</p>
              ) : (
                <div className="space-y-1.5">
                  {list.map((c) => {
                    const tied = rankCounts[c.rank] > 1;
                    const student = studentsById[c.student_id];
                    return (
                      <div key={c.student_id} className="flex items-center gap-2 rounded-lg border border-ink/5 px-3 py-2">
                        <span className="w-5 flex-shrink-0 text-center text-sm font-bold text-ink/40">{c.rank}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {c.real_name}
                            {student?.english_name && <span className="text-ink/40"> ({student.english_name})</span>}
                            {tied && (
                              <span className="ml-1.5 rounded-full bg-levelB/10 px-1.5 py-0.5 text-[10px] font-bold text-levelB">TIED</span>
                            )}
                          </p>
                          <p className="text-xs text-ink/50">
                            {c.points} pts this period · {student?.points ?? '—'} total
                            {c.attendance_rate != null && ` · ${c.attendance_rate}% attendance`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPendingConfirm({ level, candidate: c })}
                          className="flex-shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
                        >
                          Confirm
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-center gap-2">
          <History size={16} className="text-brand-500" />
          <h2 className="font-display text-base font-bold text-ink">Recognition History</h2>
        </div>
        {history === null ? (
          <p className="py-4 text-center text-sm text-ink/50">Loading...</p>
        ) : history.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center shadow-card">
            <p className="text-sm text-ink/50">No recognitions finalized yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-ink/[0.02]">
                    <th className="px-4 py-2.5 font-semibold text-ink/70">Award</th>
                    <th className="px-4 py-2.5 font-semibold text-ink/70">Student</th>
                    <th className="px-4 py-2.5 font-semibold text-ink/70">Level</th>
                    <th className="px-4 py-2.5 font-semibold text-ink/70">Period</th>
                    <th className="px-4 py-2.5 font-semibold text-ink/70">Points</th>
                    <th className="px-4 py-2.5 font-semibold text-ink/70">Certificate</th>
                    <th className="px-4 py-2.5 font-semibold text-ink/70">Finalized</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-ink/5 last:border-0">
                      <td className="px-4 py-2.5 text-ink">{h.award_type === 'student_of_week' ? 'Student of the Week' : 'Student of the Month'}</td>
                      <td className="px-4 py-2.5 font-medium text-ink">{studentsById[h.student_id]?.real_name || 'Unknown'}</td>
                      <td className="px-4 py-2.5">
                        <LevelBadge level={h.level} />
                      </td>
                      <td className="px-4 py-2.5 text-ink/60">{formatPeriodLabel(h.period_start, h.period_end)}</td>
                      <td className="px-4 py-2.5 font-bold text-brand-500">{h.points}</td>
                      <td className="px-4 py-2.5">
                        {h.certificate_id ? <span className="text-active">✓ Issued</span> : <span className="text-ink/40">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-ink/60">
                        {new Date(h.computed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {pendingConfirm && bounds && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-display text-lg font-bold text-ink">Confirm {awardType.title}</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink/50">Period</dt>
                <dd className="font-medium text-ink">{formatPeriodLabel(bounds.period_start, bounds.period_end)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/50">Level</dt>
                <dd className="font-medium text-ink">Level {pendingConfirm.level}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/50">Student</dt>
                <dd className="font-medium text-ink">{pendingConfirm.candidate.real_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/50">Points earned</dt>
                <dd className="font-medium text-ink">{pendingConfirm.candidate.points}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink/50">
              This creates a recognition record and issues a &quot;{awardType.title}&quot; certificate for this student.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                disabled={confirmSubmitting}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitConfirm}
                disabled={confirmSubmitting}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {confirmSubmitting ? 'Confirming...' : 'Confirm winner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
