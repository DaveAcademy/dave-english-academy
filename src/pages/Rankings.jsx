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
// Two workflows, same ledger underneath:
//   - Add Points (primary, open by default): student + custom points +
//     free-text reason, one confirm. No category picker - category is
//     inferred from the sign of the points (positive -> bonus, negative
//     -> penalty), same rule bulkAwardPoints() below already uses, so this
//     stays a plain 3-field note (who / how many / why) instead of a form.
//   - Award Class Points (collapsed by default): the same ledger insert,
//     batched as one request for every student in a level/group at once.
// Both ultimately call awardStudentPoints()/bulkAwardStudentPoints(), which
// is a plain point_transactions insert - RLS and the level-match trigger
// enforce the real security boundary identically for both.
//
// The Level Leaderboard below is read-only: no award controls in its rows.
// Week/Month/All Time all render the same Rank/Points/Change/Attendance
// table, straight from get_group_leaderboard(). A per-class-date breakdown
// used to render here too; retired 2026-08-15 (see note further down) since
// it inferred "a class" from raw lesson_date under an assumed Tue/Thu/Sat
// schedule that turned out not to hold. A session-based breakdown, keyed
// on the real class_session model, replaces it once the Week/Month RPCs
// are rebuilt around class_session.

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Tag, Users, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import {
  listPointCategories,
  listMyTeacherLevels,
  getGroupLeaderboard,
  listClassGroups,
  getClassSession,
  openClassSession,
  getClassLeaderboard,
  getWeeklyClassLeaderboard,
  getMonthlyClassLeaderboard,
} from '../lib/db';
import { LEVELS } from '../lib/levels';
import { addDaysISO, addMonthsISO, todayISO, formatMonthDay } from '../utils/date';

const PERIODS = ['class', 'week', 'month', 'all_time'];
const PERIOD_LABEL = { class: 'Class', week: 'This Week', month: 'This Month', all_time: 'All Time' };

export default function Rankings() {
  const { students, awardStudentPoints, bulkAwardStudentPoints, error } = useAcademy();
  const { role, session } = useAuth();
  const isAdmin = role === 'administrator';
  const isTeacher = role === 'teacher';
  const canAwardAtAll = isAdmin || isTeacher;

  const [categories, setCategories] = useState([]);
  const [teacherLevels, setTeacherLevels] = useState(null);
  // Bumped after any successful award (Add Points / bulk) so the Level
  // Leaderboard and class-by-class breakdown refetch immediately instead
  // of requiring a level/period tab toggle to notice new data.
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

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

  // ---------- Class Session (open/select today's session) ----------
  // A point award never implies a class happened - a session must be
  // explicitly opened first (docs/ranking-v2-class-session-design.md
  // §4). This section is the explicit-open step; Add Points/Award Class
  // Points below only attach class_session_id when the session's level
  // matches the award's level, and only if a session has been opened.
  // Not opening one is fine - the award still records, just without a
  // session attached, same as before this feature existed.
  const todayLocalISO = () => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  };

  const [sessionLevel, setSessionLevel] = useState('');
  const [sessionClassGroups, setSessionClassGroups] = useState(null);
  const [sessionGroupId, setSessionGroupId] = useState('');
  const [sessionDate, setSessionDate] = useState(todayLocalISO);
  const [openSession, setOpenSession] = useState(null); // { id, class_group_id, session_date } | null
  const [sessionPending, setSessionPending] = useState(false);
  const [sessionMessage, setSessionMessage] = useState('');
  const sessionLevelInitialized = useRef(false);

  useEffect(() => {
    if (awardableLevels.length > 0 && !sessionLevelInitialized.current) {
      setSessionLevel(awardableLevels[0]);
      sessionLevelInitialized.current = true;
    }
  }, [awardableLevels]);

  useEffect(() => {
    if (!sessionLevel) return;
    let cancelled = false;
    setSessionClassGroups(null);
    setSessionGroupId('');
    listClassGroups(sessionLevel)
      .then((groups) => {
        if (cancelled) return;
        setSessionClassGroups(groups || []);
        if ((groups || []).length === 1) setSessionGroupId(String(groups[0].id));
      })
      .catch(() => {
        if (!cancelled) setSessionClassGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionLevel]);

  useEffect(() => {
    if (!sessionGroupId || !sessionDate) {
      setOpenSession(null);
      return;
    }
    let cancelled = false;
    getClassSession(sessionGroupId, sessionDate)
      .then((row) => {
        if (!cancelled) setOpenSession(row);
      })
      .catch(() => {
        if (!cancelled) setOpenSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionGroupId, sessionDate]);

  const handleOpenSession = async () => {
    if (!sessionGroupId || !sessionDate) return;
    setSessionPending(true);
    setSessionMessage('');
    try {
      const row = await openClassSession({ classGroupId: sessionGroupId, sessionDate, openedBy: session.user.id });
      setOpenSession(row);
      setSessionMessage('Session ready.');
    } catch {
      setSessionMessage('Could not open session. Please try again.');
    } finally {
      setSessionPending(false);
    }
  };

  // ---------- Add Points (primary workflow, open by default) ----------
  const [detailedOpen, setDetailedOpen] = useState(true);
  const [awardStudentId, setAwardStudentId] = useState('');
  const [awardPointsValue, setAwardPointsValue] = useState('');
  const [awardReason, setAwardReason] = useState('');
  const [awardPending, setAwardPending] = useState(false);
  const [awardMessage, setAwardMessage] = useState('');
  const [awardConfirming, setAwardConfirming] = useState(null); // { student, points, reason, categoryKey } | null

  // Idempotency guard for award submissions. The ledger is insert-only (see
  // migration 0019), so there is nothing server-side preventing an identical
  // award batch from being written twice; every aggregation then sums both
  // rows and a level's "Today's Points" can show 2x. We saw this happen for
  // real: "Bulk class points via Rankings" submitted twice ~40 s apart on
  // 2026-08-08 created two identical rows per Level-B student. The screen
  // clears the values after a successful submit, so a repeat with the same
  // values means the teacher re-typed or the first attempt "failed" on the
  // client while actually reaching the DB (timeout/retry). Guard: remember
  // the exact signature of the batch just submitted (whether it reported
  // success or a client-side error) and reject an identical resubmit within
  // a short window, so a retry can never double-write the same row.
  const [lastAwardSignature, setLastAwardSignature] = useState(null);
  const [lastBulkSignature, setLastBulkSignature] = useState(null);
  const DUP_WINDOW_MS = 2 * 60 * 1000;

  // Save opens a confirm step instead of awarding immediately - the actual
  // insert only happens from confirmAward() below, once the admin/teacher
  // has seen student/points/direction/reason spelled out and clicked
  // Confirm.
  const requestAward = (e) => {
    e.preventDefault();
    const student = students.find((s) => String(s.id) === String(awardStudentId));
    const points = Number(awardPointsValue);
    const reason = awardReason.trim();
    if (!student || !Number.isFinite(points) || points === 0 || !reason || !canAwardLevel(student.level)) return;
    const categoryKey = points > 0 ? 'bonus' : 'penalty';
    setAwardConfirming({ student, points, reason, categoryKey });
  };

  const cancelAwardConfirm = () => setAwardConfirming(null);

  const confirmAward = async () => {
    if (!awardConfirming) return;
    const { student, points, reason, categoryKey } = awardConfirming;
    const sig = `${student.id}|${categoryKey}|${points}|${reason}`;
    if (lastAwardSignature?.sig === sig && Date.now() - lastAwardSignature.at < DUP_WINDOW_MS) {
      setAwardMessage('That exact award was just submitted. Check the leaderboard before resubmitting.');
      setAwardConfirming(null);
      return;
    }
    setLastAwardSignature({ sig, at: Date.now() });
    setAwardPending(true);
    setAwardMessage('');
    try {
      await awardStudentPoints({
        studentId: student.id,
        level: student.level,
        categoryId: categoryByKey[categoryKey]?.id ?? null,
        categoryKey,
        points,
        reason,
        awardedBy: session.user.id,
        classSessionId: openSession && sessionLevel === student.level ? openSession.id : null,
      });
      setAwardMessage(`${points > 0 ? 'Added' : 'Deducted'} ${points > 0 ? '+' : ''}${points} ${points > 0 ? 'to' : 'from'} ${student.real_name}.`);
      setAwardStudentId('');
      setAwardPointsValue('');
      setAwardReason('');
      setAwardConfirming(null);
      bumpRefresh();
    } catch {
      setAwardMessage('Could not award points. Please try again.');
      setAwardConfirming(null);
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
    // Same non-idempotency guard as submitAward, but for the whole batch:
    // signature = sorted student:points of every non-zero row, so an exact
    // repeat submission (double-click, or client-error retry) is rejected
    // instead of writing the same rows a second time.
    const batchKey = entries
      .map(({ student, points }) => `${student.id}:${points}`)
      .sort()
      .join('|');
    if (lastBulkSignature?.sig === batchKey && Date.now() - lastBulkSignature.at < DUP_WINDOW_MS) {
      setBulkMessage('That exact batch was just submitted. Check the leaderboard before resubmitting.');
      return;
    }
    setLastBulkSignature({ sig: batchKey, at: Date.now() });
    setBulkPending(true);
    setBulkMessage('');
    try {
      const bulkSessionId = openSession && sessionLevel === bulkLevel ? openSession.id : null;
      await bulkAwardStudentPoints(
        entries.map(({ student, points }) => ({
          studentId: student.id,
          level: student.level,
          categoryId: categoryByKey[points > 0 ? 'bonus' : 'penalty']?.id ?? null,
          categoryKey: points > 0 ? 'bonus' : 'penalty',
          points,
          reason: 'Bulk class points via Rankings',
          awardedBy: session.user.id,
          classSessionId: bulkSessionId,
        }))
      );
      setBulkMessage(`Awarded points to ${entries.length} student${entries.length === 1 ? '' : 's'}.`);
      setBulkValues({});
      setBulkFillValue('');
      bumpRefresh();
    } catch {
      setBulkMessage('Could not award bulk points. Please try again.');
    } finally {
      setBulkPending(false);
    }
  };

  // ---------- Level Leaderboard (read-only, level + period scoped) ----------
  // Four tabs: Class / Week / Month / All Time. All Time still comes
  // straight from get_group_leaderboard() (unchanged, migration 0129) -
  // the calculation layer for Overall points was deliberately left alone
  // (see docs/ranking-v2-class-session-design.md and migration 0139's own
  // comments). Class/Week/Month now come from the class_session-backed
  // RPCs added in 0139 instead of the retired lesson_date breakdown: only
  // points explicitly attached to a real, opened class_session appear -
  // a period with no session opened yet shows "no classes recorded" markers,
  // never a fabricated zero-filled roster (see 0139's own comments on why
  // that's intentional, not a gap to fill in later).
  const [boardLevel, setBoardLevel] = useState('A');
  const [boardPeriod, setBoardPeriod] = useState('month');
  const [board, setBoard] = useState(null); // all_time only
  const [boardGroups, setBoardGroups] = useState(null);
  const [boardGroupId, setBoardGroupId] = useState('');
  const [boardReferenceDate, setBoardReferenceDate] = useState(todayISO);
  const [sessionBoard, setSessionBoard] = useState(null); // class/week/month: { sessions, rows } | []
  const boardLevelInitialized = useRef(false);

  useEffect(() => {
    if (isTeacher && teacherLevels && teacherLevels.length > 0 && !boardLevelInitialized.current) {
      setBoardLevel(teacherLevels[0]);
      boardLevelInitialized.current = true;
    }
  }, [isTeacher, teacherLevels]);

  useEffect(() => {
    if (boardPeriod !== 'all_time') return;
    let cancelled = false;
    setBoard(null);
    getGroupLeaderboard(boardLevel, 'all_time')
      .then((rows) => {
        if (!cancelled) setBoard(rows || []);
      })
      .catch(() => {
        if (!cancelled) setBoard([]);
      });
    return () => {
      cancelled = true;
    };
  }, [boardLevel, boardPeriod, refreshKey]);

  // Resolve the class_group(s) for the selected level - same lookup the
  // Class Session panel above already uses. Auto-selects the sole group
  // when there's exactly one (true for every level today).
  useEffect(() => {
    let cancelled = false;
    setBoardGroups(null);
    setBoardGroupId('');
    listClassGroups(boardLevel)
      .then((groups) => {
        if (cancelled) return;
        setBoardGroups(groups || []);
        if ((groups || []).length === 1) setBoardGroupId(String(groups[0].id));
      })
      .catch(() => {
        if (!cancelled) setBoardGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [boardLevel]);

  useEffect(() => {
    if (boardPeriod === 'all_time' || !boardGroupId) return;
    let cancelled = false;
    setSessionBoard(null);
    const load = async () => {
      if (boardPeriod === 'class') {
        const existing = await getClassSession(boardGroupId, boardReferenceDate);
        if (!existing) return [];
        return getClassLeaderboard(existing.id);
      }
      if (boardPeriod === 'week') return getWeeklyClassLeaderboard(boardGroupId, boardReferenceDate);
      return getMonthlyClassLeaderboard(boardGroupId, boardReferenceDate);
    };
    load()
      .then((rows) => {
        if (!cancelled) setSessionBoard(rows || []);
      })
      .catch(() => {
        if (!cancelled) setSessionBoard([]);
      });
    return () => {
      cancelled = true;
    };
  }, [boardPeriod, boardGroupId, boardReferenceDate, refreshKey]);

  // Pivots the long-format week/month rows (one row per student per
  // session) into one row per student with a column per real session -
  // the same shape the old, now-retired lesson_date breakdown rendered,
  // just built from real class_session rows instead of inferred dates.
  // Class period rows are already one-per-student (a single session has
  // no columns to pivot), so they pass through as-is with total=points.
  const sessionView = useMemo(() => {
    if (!sessionBoard) return null;
    if (boardPeriod === 'class') {
      return {
        sessions: [],
        rows: [...sessionBoard]
          .sort((a, b) => a.rank - b.rank || a.real_name.localeCompare(b.real_name))
          .map((r) => ({ studentId: r.student_id, realName: r.real_name, perSession: {}, total: Number(r.points), rank: r.rank })),
      };
    }
    const totalKey = boardPeriod === 'week' ? 'week_total' : 'month_total';
    const rankKey = boardPeriod === 'week' ? 'week_rank' : 'month_rank';
    const sessionsMap = new Map();
    const byStudent = new Map();
    for (const r of sessionBoard) {
      sessionsMap.set(r.session_id, r.session_date);
      let entry = byStudent.get(r.student_id);
      if (!entry) {
        entry = { studentId: r.student_id, realName: r.real_name, perSession: {}, total: Number(r[totalKey]), rank: r[rankKey] };
        byStudent.set(r.student_id, entry);
      }
      entry.perSession[r.session_id] = Number(r.session_points);
    }
    const sessions = [...sessionsMap.entries()].map(([id, date]) => ({ id, date })).sort((a, b) => a.date.localeCompare(b.date));
    const rows = [...byStudent.values()].sort((a, b) => a.rank - b.rank || a.realName.localeCompare(b.realName));
    return { sessions, rows };
  }, [sessionBoard, boardPeriod]);

  // Month navigation anchors to the 1st of the currently-viewed month
  // before stepping, so addMonthsISO never lands on a day that doesn't
  // exist in the target month (e.g. stepping from the 31st) - this only
  // touches boardReferenceDate at the moment of navigating, not as a
  // side effect of switching tabs, so Week/Class keep showing "today" by
  // default even after the Month tab has been visited.
  const navReferenceDate = (deltaWeeks, deltaMonths) => {
    setBoardReferenceDate((d) =>
      deltaMonths ? addMonthsISO(`${d.slice(0, 7)}-01`, deltaMonths) : addDaysISO(d, deltaWeeks * 7)
    );
  };

  const medal = (i) => (i === 0 ? 'bg-levelB' : i === 1 ? 'bg-ink/20' : i === 2 ? 'bg-levelA' : 'bg-ink/5');
  const medalText = (i) => (i <= 2 ? 'text-white' : 'text-ink/50');

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Rankings</h1>
        <p className="mt-1 text-sm text-ink/50">
          {isAdmin
            ? 'Use Add Points below to record points for a student, or Award Class Points for a whole level/group at once.'
            : isTeacher
              ? teacherLevels === null
                ? 'Loading your assigned levels...'
                : teacherLevels.length > 0
                  ? `You can add points for your assigned level(s): ${teacherLevels.join(', ')}.`
                  : "You haven't been assigned to any levels yet - ask your administrator."
              : 'Ranked by points.'}
        </p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      {ranked.length === 0 && (
        <div className="mb-4 rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No active students</p>
        </div>
      )}

      {canAwardAtAll && awardableLevels.length > 0 && (
        <section className="mb-4 rounded-xl bg-white p-4 shadow-card">
          <h2 className="mb-1 font-display text-sm font-bold text-ink">Class Session</h2>
          <p className="mb-3 text-xs text-ink/50">
            Open today's class before adding points, so they're tied to this session. Skipping this still records
            points - they just won't show up in the per-class breakdown once that's built.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex gap-1">
              {awardableLevels.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSessionLevel(lvl)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    sessionLevel === lvl ? 'bg-brand-500 text-white' : 'bg-ink/5 text-ink/60 hover:text-ink'
                  }`}
                >
                  Level {lvl}
                </button>
              ))}
            </div>
            {sessionClassGroups && sessionClassGroups.length > 1 && (
              <select value={sessionGroupId} onChange={(e) => setSessionGroupId(e.target.value)} className="input w-auto text-xs">
                <option value="">Select group...</option>
                {sessionClassGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="input w-auto text-xs"
            />
            <button
              type="button"
              onClick={handleOpenSession}
              disabled={sessionPending || !sessionGroupId || !!openSession}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {sessionPending ? 'Opening...' : openSession ? 'Session Open' : 'Open Session'}
            </button>
          </div>
          {openSession && (
            <p className="mt-2 text-xs font-medium text-active">
              Session open for Level {sessionLevel} on {sessionDate}. New points below will attach to it automatically for this level.
            </p>
          )}
          {sessionMessage && !openSession && <p className="mt-2 text-xs text-ink/60">{sessionMessage}</p>}
        </section>
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
              <h2 className="font-display text-sm font-bold text-ink">Add Points</h2>
            </span>
            {detailedOpen ? <ChevronUp size={16} className="text-ink/40" /> : <ChevronDown size={16} className="text-ink/40" />}
          </button>
          {detailedOpen && (
            <div className="border-t border-ink/5 p-4 pt-3">
              <p className="mb-3 text-xs text-ink/50">
                Pick a student, type the points (use a minus sign to deduct - the badge confirms ADD or DEDUCT), and write why. Reason is required.
              </p>
              <form onSubmit={requestAward} className="grid gap-2 sm:grid-cols-3">
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
                <div className="relative sm:col-span-1">
                  <input
                    type="number"
                    step="1"
                    value={awardPointsValue}
                    onChange={(e) => setAwardPointsValue(e.target.value)}
                    placeholder="Points (e.g. 5 or -2)"
                    className="input w-full pr-20"
                    required
                  />
                  {awardPointsValue !== '' && Number.isFinite(Number(awardPointsValue)) && Number(awardPointsValue) !== 0 && (
                    <span
                      className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-xs font-bold ${
                        Number(awardPointsValue) > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {Number(awardPointsValue) > 0 ? 'ADD' : 'DEDUCT'}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={awardReason}
                  onChange={(e) => setAwardReason(e.target.value)}
                  placeholder="Reason (required)"
                  className="input sm:col-span-1"
                  required
                />
                <button
                  type="submit"
                  disabled={awardPending}
                  className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 sm:col-span-3"
                >
                  {awardPending ? 'Saving...' : 'Save'}
                </button>
              </form>
              {awardConfirming && (
                <div className="mt-3 rounded-lg border border-ink/10 bg-ink/[0.02] p-3">
                  <p className="mb-2 text-sm font-semibold text-ink">Confirm this adjustment</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-sm">
                    <dt className="text-ink/50">Student</dt>
                    <dd className="font-medium text-ink">{awardConfirming.student.real_name}</dd>
                    <dt className="text-ink/50">Direction</dt>
                    <dd>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          awardConfirming.points > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {awardConfirming.points > 0 ? 'ADD' : 'DEDUCT'}
                      </span>
                    </dd>
                    <dt className="text-ink/50">Points</dt>
                    <dd className="font-medium text-ink">
                      {awardConfirming.points > 0 ? '+' : ''}
                      {awardConfirming.points}
                    </dd>
                    <dt className="text-ink/50">Reason</dt>
                    <dd className="text-ink">{awardConfirming.reason}</dd>
                  </dl>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={confirmAward}
                      disabled={awardPending}
                      className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                        awardConfirming.points > 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {awardPending ? 'Saving...' : `Confirm ${awardConfirming.points > 0 ? 'ADD' : 'DEDUCT'}`}
                    </button>
                    <button
                      type="button"
                      onClick={cancelAwardConfirm}
                      disabled={awardPending}
                      className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
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

        {boardPeriod !== 'all_time' && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {boardGroups && boardGroups.length > 1 && (
              <select value={boardGroupId} onChange={(e) => setBoardGroupId(e.target.value)} className="input w-auto text-xs">
                <option value="">Select group...</option>
                {boardGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
            {boardPeriod === 'class' ? (
              <input
                type="date"
                value={boardReferenceDate}
                onChange={(e) => setBoardReferenceDate(e.target.value)}
                className="input w-auto text-xs"
              />
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-ink/60">
                <button
                  type="button"
                  onClick={() => navReferenceDate(boardPeriod === 'week' ? -1 : 0, boardPeriod === 'month' ? -1 : 0)}
                  className="rounded-lg bg-ink/5 px-2 py-1 font-semibold hover:bg-ink/10"
                >
                  ← Prev
                </button>
                <span className="font-medium text-ink/70">
                  {boardPeriod === 'week'
                    ? `Week of ${formatMonthDay(new Date(`${boardReferenceDate}T00:00:00Z`))}`
                    : new Date(`${boardReferenceDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
                </span>
                <button
                  type="button"
                  onClick={() => navReferenceDate(boardPeriod === 'week' ? 1 : 0, boardPeriod === 'month' ? 1 : 0)}
                  className="rounded-lg bg-ink/5 px-2 py-1 font-semibold hover:bg-ink/10"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

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
                      <td className="px-3 py-2 font-bold text-ink/70">
                        <span
                          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${medal(row.rank - 1)} ${medalText(row.rank - 1)}`}
                        >
                          {row.rank}
                        </span>
                      </td>
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
        ) : !boardGroupId ? (
          <p className="py-6 text-center text-sm text-ink/50">
            {boardGroups === null ? 'Loading...' : 'Select a group to see its leaderboard.'}
          </p>
        ) : sessionView === null ? (
          <p className="py-6 text-center text-sm text-ink/50">Loading...</p>
        ) : sessionView.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/50">
            {boardPeriod === 'class'
              ? 'No session opened for this date.'
              : `No classes recorded for Level ${boardLevel} in this ${boardPeriod}.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-semibold text-ink/70">Student</th>
                  {sessionView.sessions.map((s) => (
                    <th key={s.id} className="whitespace-nowrap px-3 py-2 text-center font-semibold text-ink/70">
                      {formatMonthDay(new Date(`${s.date}T00:00:00Z`))}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-2 text-center font-bold text-ink">
                    {boardPeriod === 'class' ? 'Points' : boardPeriod === 'week' ? 'Week Total' : 'Month Total'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessionView.rows.map((row) => (
                  <tr key={row.studentId} className="border-b border-ink/5 last:border-0">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${medal(row.rank - 1)} ${medalText(row.rank - 1)}`}
                        >
                          {row.rank}
                        </span>
                        <span className="font-medium text-ink">{row.realName}</span>
                      </div>
                    </td>
                    {sessionView.sessions.map((s) => (
                      <td key={s.id} className="px-3 py-2 text-center text-ink/70">
                        {row.perSession[s.id] ?? 0}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center text-base font-bold text-brand-500">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
