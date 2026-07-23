// Rankings.jsx
// Points are shown as a total per student (students.points), still not
// computed from attendance/exams/homework - see migration 0008 for why.
// The total itself is now a database-maintained cache over a
// point_transactions ledger (migrations 0019/0020): the database revokes
// direct writes to students.points from every application role, so
// awarding here always records a point_transactions row (never a direct
// students.points update) - the trigger-maintained cache is what makes
// the rank list (and the student portal's leaderboard) reflect it.
//
// Three workflows, same ledger underneath:
//   - Quick Points (primary): -1/+1/+3/+5 buttons, tagged bonus/penalty
//     with a fixed reason. No category/reason picker - this is the fast
//     path for ordinary classroom use.
//   - Detailed / Advanced Award (collapsed by default): the original
//     category + custom points + reason form, for when the specific
//     category matters (Homework, Behavior, etc.) for reporting.
//   - Award Class Points (collapsed by default): the same ledger insert,
//     batched as one request for every student in a level/group at once.
// All three ultimately call awardStudentPoints()/bulkAwardStudentPoints(),
// which is a plain point_transactions insert - RLS and the level-match
// trigger enforce the real security boundary identically for all three.

import { useState, useMemo, useEffect, useRef } from 'react';
import { Minus, Plus, Tag, Users, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import { LevelBadge } from '../components/Badge';
import { listPointCategories, listMyTeacherLevels, getGroupLeaderboard, getPeriodBounds, listClassPointTransactions } from '../lib/db';

const LEVELS = ['A', 'B', 'C'];
const PERIODS = ['week', 'month', 'all_time'];
const PERIOD_LABEL = { week: 'This Week', month: 'This Month', all_time: 'All Time' };
const QUICK_DELTAS = [1, 3, 5];

export default function Rankings() {
  const { students, awardStudentPoints, bulkAwardStudentPoints, error } = useAcademy();
  const { role, session } = useAuth();
  const isAdmin = role === 'administrator';
  const isTeacher = role === 'teacher';
  const canAwardAtAll = isAdmin || isTeacher;

  const [pendingId, setPendingId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [teacherLevels, setTeacherLevels] = useState(null);

  useEffect(() => {
    if (!canAwardAtAll) return;
    listPointCategories()
      .then((rows) => setCategories(rows || []))
      .catch(() => setCategories([]));
  }, [canAwardAtAll]);

  useEffect(() => {
    if (!isTeacher || !session?.user?.id) return;
    listMyTeacherLevels(session.user.id)
      .then((levels) => setTeacherLevels(levels || []))
      .catch(() => setTeacherLevels([]));
  }, [isTeacher, session?.user?.id]);

  // Admin can award for any level. A teacher can only award for levels
  // they're assigned to (see migration 0017) - this is a UX nicety, not
  // the actual security boundary, which the database enforces
  // independently on every insert (RLS policy + a BEFORE INSERT trigger
  // that checks the target student's real level, see migration 0019).
  const canAwardLevel = (level) => isAdmin || (isTeacher && (teacherLevels || []).includes(level));
  const awardableLevels = isAdmin ? LEVELS : teacherLevels || [];

  const categoryByKey = useMemo(() => {
    const map = {};
    for (const c of categories) map[c.key] = c;
    return map;
  }, [categories]);

  const ranked = useMemo(() => {
    return students
      .filter((s) => s.status === 'Active')
      .map((s) => ({ ...s, points: Number(s.points || 0) }))
      .sort((a, b) => b.points - a.points || a.real_name.localeCompare(b.real_name));
  }, [students]);

  const awardableStudents = useMemo(() => ranked.filter((s) => canAwardLevel(s.level)), [ranked, isAdmin, isTeacher, teacherLevels]);

  // ---------- Quick Points (primary workflow) ----------
  // Always tags bonus/penalty with a fixed reason - no category or reason
  // picker. This is deliberately the fast path: every click is exactly one
  // point_transactions insert.
  const quickAdjust = async (student, delta) => {
    if (!canAwardLevel(student.level) || delta === 0) return;
    const categoryKey = delta > 0 ? 'bonus' : 'penalty';
    setPendingId(student.id);
    try {
      await awardStudentPoints({
        studentId: student.id,
        level: student.level,
        categoryId: categoryByKey[categoryKey]?.id ?? null,
        categoryKey,
        points: delta,
        reason: 'Quick manual adjustment via Rankings',
        awardedBy: session.user.id,
      });
    } finally {
      setPendingId(null);
    }
  };

  // ---------- Detailed / Advanced Award (secondary, collapsed) ----------
  const [detailedOpen, setDetailedOpen] = useState(false);
  const [awardStudentId, setAwardStudentId] = useState('');
  const [awardCategoryId, setAwardCategoryId] = useState('');
  const [awardPointsValue, setAwardPointsValue] = useState('');
  const [awardReason, setAwardReason] = useState('');
  const [awardPending, setAwardPending] = useState(false);
  const [awardMessage, setAwardMessage] = useState('');

  const handleCategoryChange = (categoryId) => {
    setAwardCategoryId(categoryId);
    const cat = categories.find((c) => String(c.id) === String(categoryId));
    if (cat) setAwardPointsValue(String(cat.default_points));
  };

  const submitAward = async (e) => {
    e.preventDefault();
    const student = students.find((s) => String(s.id) === String(awardStudentId));
    const category = categories.find((c) => String(c.id) === String(awardCategoryId));
    const points = Number(awardPointsValue);
    if (!student || !category || !Number.isFinite(points) || points === 0 || !canAwardLevel(student.level)) return;
    setAwardPending(true);
    setAwardMessage('');
    try {
      await awardStudentPoints({
        studentId: student.id,
        level: student.level,
        categoryId: category.id,
        categoryKey: category.key,
        points,
        reason: awardReason.trim() || null,
        awardedBy: session.user.id,
      });
      setAwardMessage(`Awarded ${points > 0 ? '+' : ''}${points} to ${student.real_name}.`);
      setAwardStudentId('');
      setAwardCategoryId('');
      setAwardPointsValue('');
      setAwardReason('');
    } catch {
      setAwardMessage('Could not award points. Please try again.');
    } finally {
      setAwardPending(false);
    }
  };

  // ---------- Award Class Points (secondary, collapsed) ----------
  // One bulkAwardStudentPoints() call inserts every non-zero row in a
  // single request (see bulkAwardPoints() in storageBridge.js) - same RLS
  // and level-match trigger as every other award path, just batched.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLevel, setBulkLevel] = useState('A');
  const [bulkGroup, setBulkGroup] = useState('');
  const [bulkValues, setBulkValues] = useState({});
  const [bulkFillValue, setBulkFillValue] = useState('');
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const bulkLevelInitialized = useRef(false);

  useEffect(() => {
    if (isTeacher && teacherLevels && teacherLevels.length > 0 && !bulkLevelInitialized.current) {
      setBulkLevel(teacherLevels[0]);
      bulkLevelInitialized.current = true;
    }
  }, [isTeacher, teacherLevels]);

  const bulkGroups = useMemo(() => {
    const set = new Set();
    for (const s of awardableStudents) {
      if (s.level === bulkLevel && s.group_name) set.add(s.group_name);
    }
    return [...set].sort();
  }, [awardableStudents, bulkLevel]);

  const bulkStudents = useMemo(
    () => awardableStudents.filter((s) => s.level === bulkLevel && (!bulkGroup || s.group_name === bulkGroup)),
    [awardableStudents, bulkLevel, bulkGroup]
  );

  const setBulkValue = (studentId, value) => setBulkValues((prev) => ({ ...prev, [studentId]: value }));

  const applyFillToAll = () => {
    if (bulkFillValue === '') return;
    const next = { ...bulkValues };
    for (const s of bulkStudents) next[s.id] = bulkFillValue;
    setBulkValues(next);
  };

  const bulkPendingCount = bulkStudents.filter((s) => {
    const v = Number(bulkValues[s.id]);
    return Number.isFinite(v) && v !== 0;
  }).length;

  const submitBulk = async () => {
    const entries = bulkStudents
      .map((s) => ({ student: s, points: Number(bulkValues[s.id]) }))
      .filter((r) => Number.isFinite(r.points) && r.points !== 0);
    if (entries.length === 0) return;
    setBulkPending(true);
    setBulkMessage('');
    try {
      await bulkAwardStudentPoints(
        entries.map(({ student, points }) => ({
          studentId: student.id,
          level: student.level,
          categoryId: categoryByKey[points > 0 ? 'bonus' : 'penalty']?.id ?? null,
          categoryKey: points > 0 ? 'bonus' : 'penalty',
          points,
          reason: 'Bulk class points via Rankings',
          awardedBy: session.user.id,
        }))
      );
      setBulkMessage(`Awarded points to ${entries.length} student${entries.length === 1 ? '' : 's'}.`);
      setBulkValues({});
      setBulkFillValue('');
    } catch {
      setBulkMessage('Could not award bulk points. Please try again.');
    } finally {
      setBulkPending(false);
    }
  };

  // ---------- Level Leaderboard (read-only, level + period scoped) ----------
  const [boardLevel, setBoardLevel] = useState('A');
  const [boardPeriod, setBoardPeriod] = useState('week');
  const [board, setBoard] = useState(null);
  const boardLevelInitialized = useRef(false);

  useEffect(() => {
    if (isTeacher && teacherLevels && teacherLevels.length > 0 && !boardLevelInitialized.current) {
      setBoardLevel(teacherLevels[0]);
      boardLevelInitialized.current = true;
    }
  }, [isTeacher, teacherLevels]);

  useEffect(() => {
    let cancelled = false;
    setBoard(null);
    getGroupLeaderboard(boardLevel, boardPeriod)
      .then((rows) => {
        if (!cancelled) setBoard(rows || []);
      })
      .catch(() => {
        if (!cancelled) setBoard([]);
      });
    return () => {
      cancelled = true;
    };
  }, [boardLevel, boardPeriod]);

  // ---------- Class-by-class breakdown (Week/Month leaderboard views) ----------
  // week_bounds()/month_bounds() (migration 0023, exposed via
  // get_period_bounds in 0025) stay the single source of truth for what
  // "this week"/"this month" means - period_start/period_end are always
  // asked of the server, never computed here, so this can't quietly drift
  // from the same boundaries get_group_leaderboard() itself uses.
  const [classTransactions, setClassTransactions] = useState(null);

  useEffect(() => {
    if (boardPeriod === 'all_time') {
      setClassTransactions(null);
      return;
    }
    let cancelled = false;
    setClassTransactions(null);
    getPeriodBounds(boardPeriod)
      .then((bounds) => listClassPointTransactions(boardLevel, bounds.period_start, bounds.period_end))
      .then((rows) => {
        if (!cancelled) setClassTransactions(rows || []);
      })
      .catch(() => {
        if (!cancelled) setClassTransactions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [boardLevel, boardPeriod]);

  // Distinct class dates actually present in the ledger for this
  // level/period - not hardcoded to 3 or 12, since a real week/month can
  // have more, fewer, or zero recorded classes.
  const classDates = useMemo(() => {
    if (!classTransactions) return [];
    return [...new Set(classTransactions.map((t) => t.lesson_date))].sort();
  }, [classTransactions]);

  // Pivoted student x date grid, fully sorted before it's ever rendered -
  // the sort happens in this same memo as the pivot/total calculation, so
  // there's no intermediate unsorted render to flash before a "correct"
  // one replaces it. Every active student in the level is included (not
  // just students with a transaction) so a student with zero recorded
  // points still appears, ranked last, with 0 in every class column
  // rather than being silently omitted.
  const classRows = useMemo(() => {
    if (!classTransactions) return [];
    const byStudent = {};
    for (const t of classTransactions) {
      const perDate = byStudent[t.student_id] || (byStudent[t.student_id] = {});
      perDate[t.lesson_date] = (perDate[t.lesson_date] || 0) + Number(t.points);
    }
    const rows = students
      .filter((s) => s.status === 'Active' && s.level === boardLevel)
      .map((s) => {
        const perDate = byStudent[s.id] || {};
        const total = classDates.reduce((sum, d) => sum + (perDate[d] || 0), 0);
        return { student: s, perDate, total };
      });
    rows.sort((a, b) => b.total - a.total || a.student.real_name.localeCompare(b.student.real_name));
    return rows;
  }, [students, classTransactions, classDates, boardLevel]);

  // Date-only formatting via Date.UTC, deliberately never touching the
  // browser's local timezone - same reasoning as addDaysISO in utils/date.js
  // (a plain `new Date(iso)` parse-then-local-getter can shift the
  // displayed day depending on where the browser is).
  const formatClassDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  const medal = (i) => (i === 0 ? 'bg-levelB' : i === 1 ? 'bg-ink/20' : i === 2 ? 'bg-levelA' : 'bg-ink/5');
  const medalText = (i) => (i <= 2 ? 'text-white' : 'text-ink/50');

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Rankings</h1>
        <p className="mt-1 text-sm text-ink/50">
          {isAdmin
            ? 'Quick +1/+3/+5 and -1 buttons record an instant ledger adjustment for any student. Use Detailed Award for a specific category, or Award Class Points for a whole level/group at once.'
            : isTeacher
              ? teacherLevels === null
                ? 'Loading your assigned levels...'
                : teacherLevels.length > 0
                  ? `Quick points are editable for your assigned level(s): ${teacherLevels.join(', ')}.`
                  : "You haven't been assigned to any levels yet - ask your administrator."
              : 'Ranked by points.'}
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
          <div className="mb-4 hidden overflow-hidden rounded-xl bg-white shadow-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-ink/[0.02]">
                    <th className="px-4 py-3 font-semibold text-ink/70">Rank</th>
                    <th className="px-4 py-3 font-semibold text-ink/70">Real Name</th>
                    <th className="px-4 py-3 font-semibold text-ink/70">English Name</th>
                    <th className="px-4 py-3 font-semibold text-ink/70">Level</th>
                    <th className="px-4 py-3 font-semibold text-ink/70">Quick Points</th>
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
                      <td className="px-4 py-3 font-medium text-ink">{s.real_name}</td>
                      <td className="px-4 py-3 text-ink/70">{s.english_name || '—'}</td>
                      <td className="px-4 py-3"><LevelBadge level={s.level} /></td>
                      <td className="px-4 py-3">
                        {canAwardLevel(s.level) ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => quickAdjust(s, -1)}
                              disabled={pendingId === s.id}
                              className="rounded-md p-1 text-ink/50 hover:bg-ink/5 disabled:opacity-40"
                              aria-label={`Subtract a point from ${s.real_name}`}
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-10 text-center text-sm font-bold text-brand-500">{s.points}</span>
                            <button
                              type="button"
                              onClick={() => quickAdjust(s, 1)}
                              disabled={pendingId === s.id}
                              className="rounded-md p-1 text-ink/50 hover:bg-ink/5 disabled:opacity-40"
                              aria-label={`Add a point to ${s.real_name}`}
                            >
                              <Plus size={14} />
                            </button>
                            {QUICK_DELTAS.slice(1).map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => quickAdjust(s, d)}
                                disabled={pendingId === s.id}
                                className="rounded-md px-1.5 py-1 text-xs font-bold text-ink/50 hover:bg-ink/5 hover:text-active disabled:opacity-40"
                                aria-label={`Add ${d} points to ${s.real_name}`}
                              >
                                +{d}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="font-bold text-brand-500">{s.points}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="mb-4 space-y-2 md:hidden">
            {ranked.map((s, i) => (
              <div key={s.id} className="rounded-xl bg-white p-3 shadow-card">
                <div className="flex items-center gap-3">
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
                  {!canAwardLevel(s.level) && <p className="flex-shrink-0 text-sm font-bold text-brand-500">{s.points} pts</p>}
                </div>
                {canAwardLevel(s.level) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-ink/5 pt-2">
                    <button
                      type="button"
                      onClick={() => quickAdjust(s, -1)}
                      disabled={pendingId === s.id}
                      className="rounded-md p-1.5 text-ink/50 active:bg-ink/5 disabled:opacity-40"
                      aria-label={`Subtract a point from ${s.real_name}`}
                    >
                      <Minus size={15} />
                    </button>
                    <span className="w-10 text-center text-sm font-bold text-brand-500">{s.points}</span>
                    <button
                      type="button"
                      onClick={() => quickAdjust(s, 1)}
                      disabled={pendingId === s.id}
                      className="rounded-md p-1.5 text-ink/50 active:bg-ink/5 disabled:opacity-40"
                      aria-label={`Add a point to ${s.real_name}`}
                    >
                      <Plus size={15} />
                    </button>
                    {QUICK_DELTAS.slice(1).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => quickAdjust(s, d)}
                        disabled={pendingId === s.id}
                        className="rounded-md px-2 py-1.5 text-xs font-bold text-ink/50 active:bg-ink/5 disabled:opacity-40"
                        aria-label={`Add ${d} points to ${s.real_name}`}
                      >
                        +{d}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {canAwardAtAll && awardableStudents.length > 0 && (
        <section className="mb-4 rounded-xl bg-white shadow-card">
          <button
            type="button"
            onClick={() => setDetailedOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 p-4 text-left"
          >
            <span className="flex items-center gap-2">
              <Tag size={16} className="text-brand-500" />
              <h2 className="font-display text-sm font-bold text-ink">Detailed / Advanced Award</h2>
            </span>
            {detailedOpen ? <ChevronUp size={16} className="text-ink/40" /> : <ChevronDown size={16} className="text-ink/40" />}
          </button>
          {detailedOpen && (
            <div className="border-t border-ink/5 p-4 pt-3">
              <p className="mb-3 text-xs text-ink/50">
                Award points with a specific category and reason - use this when it matters for reporting (Homework, Attendance,
                Behavior, etc.) instead of a generic bonus/penalty.
              </p>
              <form onSubmit={submitAward} className="grid gap-2 sm:grid-cols-4">
                <select
                  value={awardStudentId}
                  onChange={(e) => setAwardStudentId(e.target.value)}
                  className="input sm:col-span-1"
                  required
                >
                  <option value="">Select student...</option>
                  {awardableStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.real_name}
                    </option>
                  ))}
                </select>
                <select
                  value={awardCategoryId}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="input sm:col-span-1"
                  required
                >
                  <option value="">Select category...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="1"
                  value={awardPointsValue}
                  onChange={(e) => setAwardPointsValue(e.target.value)}
                  placeholder="Points"
                  className="input sm:col-span-1"
                  required
                />
                <input
                  type="text"
                  value={awardReason}
                  onChange={(e) => setAwardReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="input sm:col-span-1"
                />
                <button
                  type="submit"
                  disabled={awardPending}
                  className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 sm:col-span-4"
                >
                  {awardPending ? 'Awarding...' : 'Award points'}
                </button>
              </form>
              {awardMessage && <p className="mt-2 text-sm text-ink/60">{awardMessage}</p>}
            </div>
          )}
        </section>
      )}

      {canAwardAtAll && awardableLevels.length > 0 && (
        <section className="mb-4 rounded-xl bg-white shadow-card">
          <button type="button" onClick={() => setBulkOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 p-4 text-left">
            <span className="flex items-center gap-2">
              <Users size={16} className="text-brand-500" />
              <h2 className="font-display text-sm font-bold text-ink">Award Class Points</h2>
            </span>
            {bulkOpen ? <ChevronUp size={16} className="text-ink/40" /> : <ChevronDown size={16} className="text-ink/40" />}
          </button>
          {bulkOpen && (
            <div className="border-t border-ink/5 p-4 pt-3">
              <p className="mb-3 text-xs text-ink/50">
                Set a points value per student and submit them together as one batch - each still records its own ledger entry.
              </p>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex gap-1">
                  {awardableLevels.map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => {
                        setBulkLevel(lvl);
                        setBulkGroup('');
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        bulkLevel === lvl ? 'bg-brand-500 text-white' : 'bg-ink/5 text-ink/60 hover:text-ink'
                      }`}
                    >
                      Level {lvl}
                    </button>
                  ))}
                </div>
                {bulkGroups.length > 0 && (
                  <select value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)} className="input w-auto text-xs">
                    <option value="">All groups</option>
                    {bulkGroups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <input
                    type="number"
                    step="1"
                    value={bulkFillValue}
                    onChange={(e) => setBulkFillValue(e.target.value)}
                    placeholder="Fill value"
                    className="input w-24 text-xs"
                  />
                  <button
                    type="button"
                    onClick={applyFillToAll}
                    className="rounded-lg bg-ink/5 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/10"
                  >
                    Apply to all shown
                  </button>
                </div>
              </div>

              {bulkStudents.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink/50">No active students in this level/group.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-ink/10">
                  {bulkStudents.map((s, i) => (
                    <div
                      key={s.id}
                      className={`flex items-center gap-3 px-3 py-2 ${i > 0 ? 'border-t border-ink/5' : ''}`}
                    >
                      <p className="flex-1 truncate text-sm font-medium text-ink">{s.real_name}</p>
                      <input
                        type="number"
                        step="1"
                        value={bulkValues[s.id] ?? ''}
                        onChange={(e) => setBulkValue(s.id, e.target.value)}
                        placeholder="0"
                        className="w-20 rounded-lg border border-ink/10 px-2 py-1 text-center text-sm font-bold text-brand-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={submitBulk}
                disabled={bulkPending || bulkPendingCount === 0}
                className="mt-3 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {bulkPending ? 'Awarding...' : `Award to ${bulkPendingCount} student${bulkPendingCount === 1 ? '' : 's'}`}
              </button>
              {bulkMessage && <p className="mt-2 text-sm text-ink/60">{bulkMessage}</p>}
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl bg-white p-4 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold text-ink">Level Leaderboard</h2>
          <div className="flex flex-wrap gap-1.5">
            <div className="flex gap-1">
              {LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setBoardLevel(lvl)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    boardLevel === lvl ? 'bg-brand-500 text-white' : 'bg-ink/5 text-ink/60 hover:text-ink'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setBoardPeriod(p)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    boardPeriod === p ? 'bg-brand-500 text-white' : 'bg-ink/5 text-ink/60 hover:text-ink'
                  }`}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {boardPeriod === 'all_time' ? (
          board === null ? (
            <p className="py-6 text-center text-sm text-ink/50">Loading...</p>
          ) : board.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink/50">No active students in Level {boardLevel}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-3 py-2 font-semibold text-ink/70">Rank</th>
                    <th className="px-3 py-2 font-semibold text-ink/70">Name</th>
                    <th className="px-3 py-2 font-semibold text-ink/70">Points</th>
                    <th className="px-3 py-2 font-semibold text-ink/70">Change</th>
                    <th className="px-3 py-2 font-semibold text-ink/70">Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((row) => (
                    <tr key={row.student_id} className="border-b border-ink/5 last:border-0">
                      <td className="px-3 py-2 font-bold text-ink/70">{row.rank}</td>
                      <td className="px-3 py-2 font-medium text-ink">{row.real_name}</td>
                      <td className="px-3 py-2 font-bold text-brand-500">{row.points}</td>
                      <td className="px-3 py-2">
                        {row.rank_change == null || row.rank_change === 0 ? (
                          <span className="text-ink/30">—</span>
                        ) : (
                          <span className={`flex items-center gap-0.5 font-semibold ${row.rank_change > 0 ? 'text-active' : 'text-inactive'}`}>
                            {row.rank_change > 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                            {Math.abs(row.rank_change)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink/60">{row.attendance_rate != null ? `${row.attendance_rate}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : classTransactions === null ? (
          <p className="py-6 text-center text-sm text-ink/50">Loading...</p>
        ) : classRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/50">No active students in Level {boardLevel}.</p>
        ) : (
          // Class-by-class breakdown: one column per actual class date in
          // the period (never hardcoded to 3/12), a 0 cell wherever a
          // student has no recorded points for that class rather than a
          // blank/ambiguous dash, and a Total column that's always exactly
          // the sum of the cells shown in that row - computed together in
          // the classRows memo above, so the number can never disagree
          // with what's visibly added up. The student-name column stays
          // pinned while the date columns scroll horizontally, which is
          // what keeps a 12-column monthly table usable on a phone.
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-semibold text-ink/70">Student</th>
                  {classDates.map((d) => (
                    <th key={d} className="whitespace-nowrap px-3 py-2 text-center font-semibold text-ink/70">
                      {formatClassDate(d)}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-2 text-center font-bold text-ink">
                    {boardPeriod === 'week' ? 'Weekly Total' : 'Monthly Total'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {classRows.map((row, i) => (
                  <tr key={row.student.id} className="border-b border-ink/5 last:border-0">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${medal(i)} ${medalText(i)}`}>
                          {i + 1}
                        </span>
                        <span className="font-medium text-ink">{row.student.real_name}</span>
                      </div>
                    </td>
                    {classDates.map((d) => (
                      <td key={d} className="px-3 py-2 text-center text-ink/70">
                        {row.perDate[d] ?? 0}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center text-base font-bold text-brand-500">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {classDates.length === 0 && (
              <p className="py-3 text-center text-xs text-ink/40">No classes recorded for Level {boardLevel} in this period yet.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
