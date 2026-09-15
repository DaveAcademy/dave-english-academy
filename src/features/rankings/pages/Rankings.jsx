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
// Add Points (primary, open by default): student + custom points +
// free-text reason, one confirm. No category picker - category is
// inferred from the sign of the points (positive -> bonus, negative
// -> penalty). Ultimately calls awardStudentPoints(), a plain
// point_transactions insert - RLS and the level-match trigger enforce the
// real security boundary.
//
// The Level Leaderboard below is read-only: no award controls in its rows.
// Four tabs: Class / Week / Month / All Time. All Time renders the
// Rank/Points/Change/Attendance table straight from get_group_leaderboard()
// (migration 0129), unchanged. Class/Week/Month render a per-session
// breakdown from get_class_leaderboard()/get_weekly_class_leaderboard()/
// get_monthly_class_leaderboard() (migration 0139) - real class_session
// rows, not lesson_date. This replaced an older per-class-date breakdown
// (retired 2026-08-15) that inferred "a class" from raw lesson_date under
// an assumed Tue/Thu/Sat schedule that turned out not to hold.

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Tag, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { useAuth } from '../../../lib/AuthContext';
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
  listClassScores,
} from '../../../lib/db';
import { LEVELS } from '../../../lib/levels';
import { addDaysISO, addMonthsISO, todayISO, todayTashkentISO, formatMonthDay } from '../../../utils/date';

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
  // Bumped after any successful award so the Level
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

  // ---------- Class Session (auto-found/created, never teacher-managed) ----------
  // Ranking Model V3: the teacher never opens a session, picks a date, or
  // manages class_session_id - they only enter Class Scores below. This
  // section resolves today's session for the selected level/group purely
  // for read purposes (so already-recorded scores show up); the session
  // row itself is created lazily, on first submit, by submitClassScores()
  // via getOrCreateTodaySession() - see that function. sessionDate is
  // always "today" per the academy's own timezone (Asia/Tashkent, matching
  // week_bounds()/month_bounds() and the leaderboard RPCs), never a
  // teacher-editable field.
  const sessionDate = todayTashkentISO();

  const [sessionLevel, setSessionLevel] = useState('');
  const [sessionClassGroups, setSessionClassGroups] = useState(null);
  const [sessionGroupId, setSessionGroupId] = useState('');
  const [openSession, setOpenSession] = useState(null); // { id, class_group_id, session_date } | null
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

  // Lazily finds-or-creates today's session for a class group - the one
  // place a session gets created now (Ranking Model V3). openClassSession()
  // is already idempotent (insert-then-fetch-on-23505, see storageBridge.js),
  // so calling this from every Class Score submit is safe even if two
  // submits race or a session already exists from an earlier submit today.
  const getOrCreateTodaySession = async (classGroupId) => {
    if (openSession && String(openSession.class_group_id) === String(classGroupId)) return openSession;
    const row = await openClassSession({ classGroupId, sessionDate, openedBy: session.user.id });
    setOpenSession(row);
    return row;
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

  // ---------- Class Score (Ranking Model V3 primary workflow) ----------
  // One final Class Score per student per open class_session - the
  // teacher's single number already reflects homework/PDF prep/vocab/
  // games/participation/bonuses/penalties for that lesson, so there is no
  // category picker here (always categoryKey 'class_score') and no
  // per-activity breakdown. Requires an open session: unlike Add Points
  // (which still works session-less, for ad-hoc awards), a Class Score
  // with nothing to attach to isn't a valid score under this model, so
  // submission is disabled until one is open.
  // Duplicate/accidental-resubmit protection is two-layered: the same
  // batch-signature + time-window guard Add Points already uses, backed
  // by a real DB-level UNIQUE(student_id, class_session_id) partial index
  // (migration 0164) that rejects a second score for the same
  // student+session outright, even across reloads/devices/tabs.
  const [classScoreValues, setClassScoreValues] = useState({});
  const [classScorePending, setClassScorePending] = useState(false);
  const [classScoreMessage, setClassScoreMessage] = useState('');
  const [lastClassScoreSignature, setLastClassScoreSignature] = useState(null);
  const [recordedClassScores, setRecordedClassScores] = useState({}); // { [studentId]: points } for the open session

  // Load already-recorded scores whenever the open session changes, so
  // reopening a session shows what's already saved instead of blank
  // inputs - the teacher shouldn't have to guess, or find out via a
  // 23505 error on resubmit.
  useEffect(() => {
    if (!openSession) {
      setRecordedClassScores({});
      return;
    }
    let cancelled = false;
    listClassScores(openSession.id)
      .then((rows) => {
        if (cancelled) return;
        // Sum, not overwrite: a corrected score (see Manual Class Score
        // Entry, migration 0172) is a second class_score row for the same
        // session - the net total is what "already recorded" must show.
        const map = {};
        for (const row of rows || []) map[row.student_id] = (map[row.student_id] ?? 0) + Number(row.points);
        setRecordedClassScores(map);
      })
      .catch(() => {
        if (!cancelled) setRecordedClassScores({});
      });
    return () => {
      cancelled = true;
    };
  }, [openSession]);

  const openSessionGroupName = useMemo(
    () => sessionClassGroups?.find((g) => String(g.id) === String(sessionGroupId))?.name,
    [sessionClassGroups, sessionGroupId]
  );

  // Scoped to the open session's actual roster (level + group), not just
  // level, so a teacher scoring one group's session doesn't see students
  // from a different group at the same level mixed into the list.
  const classScoreStudents = useMemo(
    () =>
      awardableStudents.filter(
        (s) =>
          s.level === sessionLevel &&
          (!sessionClassGroups || sessionClassGroups.length <= 1 || s.group_name === openSessionGroupName)
      ),
    [awardableStudents, sessionLevel, openSessionGroupName, sessionClassGroups]
  );

  // Split by whether this session already has a Class Score for the
  // student - already-scored students are shown read-only (their saved
  // value), never re-offered an input, so a resubmit can't attempt a
  // duplicate insert the DB constraint would just reject anyway.
  const classScorePendingStudents = useMemo(
    () => classScoreStudents.filter((s) => recordedClassScores[s.id] === undefined),
    [classScoreStudents, recordedClassScores]
  );
  const classScoreDoneStudents = useMemo(
    () => classScoreStudents.filter((s) => recordedClassScores[s.id] !== undefined),
    [classScoreStudents, recordedClassScores]
  );

  const setClassScoreValue = (studentId, value) => setClassScoreValues((prev) => ({ ...prev, [studentId]: value }));

  const classScoreEntries = () =>
    classScorePendingStudents
      .map((s) => ({ student: s, points: Number(classScoreValues[s.id]) }))
      .filter((r) => classScoreValues[r.student.id] !== undefined && classScoreValues[r.student.id] !== '' && Number.isFinite(r.points) && r.points >= 0);

  const classScorePendingCount = classScoreEntries().length;

  const submitClassScores = async () => {
    if (!sessionGroupId) return;
    const entries = classScoreEntries();
    if (entries.length === 0) return;
    const batchKey = `${sessionGroupId}|${sessionDate}|${entries.map(({ student, points }) => `${student.id}:${points}`).sort().join('|')}`;
    if (lastClassScoreSignature?.sig === batchKey && Date.now() - lastClassScoreSignature.at < DUP_WINDOW_MS) {
      setClassScoreMessage('That exact set of scores was just submitted. Check the Class tab before resubmitting.');
      return;
    }
    setLastClassScoreSignature({ sig: batchKey, at: Date.now() });
    setClassScorePending(true);
    setClassScoreMessage('');
    try {
      const activeSession = await getOrCreateTodaySession(sessionGroupId);
      await bulkAwardStudentPoints(
        entries.map(({ student, points }) => ({
          studentId: student.id,
          level: student.level,
          categoryId: categoryByKey.class_score?.id ?? null,
          categoryKey: 'class_score',
          points,
          reason: 'Class Score',
          awardedBy: session.user.id,
          classSessionId: activeSession.id,
        }))
      );
      setClassScoreMessage(`Recorded the Class Score for ${entries.length} student${entries.length === 1 ? '' : 's'}.`);
      setRecordedClassScores((prev) => {
        const next = { ...prev };
        for (const { student, points } of entries) next[student.id] = points;
        return next;
      });
      setClassScoreValues({});
      bumpRefresh();
    } catch (err) {
      setClassScoreMessage(
        err?.code === '23505'
          ? 'One or more of these students already has a Class Score recorded for this session.'
          : 'Could not record Class Scores. Please try again.'
      );
    } finally {
      setClassScorePending(false);
    }
  };

  // ---------- Level Leaderboard (read-only, level + period scoped) ----------
  // Four tabs: Class / Week / Month / All Time.
  //
  // All Time still comes straight from get_group_leaderboard() - the
  // authoritative point_transactions ledger, unchanged.
  //
  // Class/Week/Month all render the class_session-backed matrix now
  // (get_class_leaderboard()/get_weekly_class_leaderboard()/
  // get_monthly_class_leaderboard(), migration 0139) - real
  // class_session.session_date columns, one Class Score per student per
  // session, never lesson-number or day-of-week inference. Week/Month
  // were briefly wired to these RPCs once before (2026-08-15) and
  // reverted because every historical row had class_session_id = null,
  // so the RPCs silently showed 0 for every student - a real
  // students-see-wrong-points incident. Re-enabling here (Phase 7) is
  // safe against a repeat of that same failure mode because of one added
  // check: the RPCs themselves coalesce an unscored session to 0 (there's
  // no way to tell "scored 0" from "not recorded yet" from their output
  // alone), so the weekMonthBoard loader below cross-checks each
  // session's real class_score rows via the existing listClassScores()
  // and only renders a number for a cell that actually has one -
  // everything else renders as "not recorded" instead of a fabricated
  // zero. week_total/month_total/rank are still read straight off the
  // RPC, never recomputed client-side.
  const [boardLevel, setBoardLevel] = useState('A');
  const [boardPeriod, setBoardPeriod] = useState('month');
  const [board, setBoard] = useState(null); // all_time only
  const [boardGroups, setBoardGroups] = useState(null);
  const [boardGroupId, setBoardGroupId] = useState('');
  const [boardReferenceDate, setBoardReferenceDate] = useState(todayISO);
  const [sessionBoard, setSessionBoard] = useState(null); // class tab raw RPC rows
  const [weekMonthBoard, setWeekMonthBoard] = useState(null); // week/month: { sessions, rows } | null while loading
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
    getGroupLeaderboard(boardLevel, boardPeriod, null)
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
    if (boardPeriod !== 'class' || !boardGroupId) return;
    let cancelled = false;
    setSessionBoard(null);
    const load = async () => {
      const existing = await getClassSession(boardGroupId, boardReferenceDate);
      if (!existing) return [];
      return getClassLeaderboard(existing.id);
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

  // Week/Month: pivot the long-form RPC rows (one row per student per
  // session) into a student x session matrix. Real recorded-ness per cell
  // comes from listClassScores(sessionId) - see the big comment above for
  // why that check exists (the RPC's own coalesce-to-0 can't distinguish
  // "recorded a 0" from "nothing recorded yet").
  useEffect(() => {
    if (boardPeriod !== 'week' && boardPeriod !== 'month') return;
    if (!boardGroupId) return;
    let cancelled = false;
    setWeekMonthBoard(null);
    const load = async () => {
      const rows =
        boardPeriod === 'week'
          ? await getWeeklyClassLeaderboard(boardGroupId, boardReferenceDate)
          : await getMonthlyClassLeaderboard(boardGroupId, boardReferenceDate);
      if (!rows || rows.length === 0) return { sessions: [], rows: [] };

      const sessionDates = new Map();
      rows.forEach((r) => {
        if (!sessionDates.has(r.session_id)) sessionDates.set(r.session_id, r.session_date);
      });
      const sessions = [...sessionDates.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, date]) => ({ id, date }));

      const recordedLists = await Promise.all(sessions.map((s) => listClassScores(s.id)));
      const recordedBySession = new Map(
        sessions.map((s, i) => [s.id, new Set((recordedLists[i] || []).map((row) => row.student_id))])
      );

      const totalKey = boardPeriod === 'week' ? 'week_total' : 'month_total';
      const rankKey = boardPeriod === 'week' ? 'week_rank' : 'month_rank';
      const byStudent = new Map();
      rows.forEach((r) => {
        if (!byStudent.has(r.student_id)) {
          byStudent.set(r.student_id, {
            studentId: r.student_id,
            realName: r.real_name,
            perSession: {},
            total: Number(r[totalKey]),
            rank: r[rankKey],
            // month tab only (migration 0168): historical August 2026 class
            // points already folded into month_total/month_rank above -
            // kept here only to drive a small "includes historical points"
            // transparency indicator, never added again client-side.
            legacyPoints: boardPeriod === 'month' ? Number(r.legacy_points || 0) : 0,
          });
        }
        const wasRecorded = recordedBySession.get(r.session_id)?.has(r.student_id);
        byStudent.get(r.student_id).perSession[r.session_id] = wasRecorded ? Number(r.session_points) : null;
      });

      const outRows = [...byStudent.values()].sort((a, b) => a.rank - b.rank || a.realName.localeCompare(b.realName));
      return { sessions, rows: outRows };
    };
    load()
      .then((result) => {
        if (!cancelled) setWeekMonthBoard(result);
      })
      .catch(() => {
        if (!cancelled) setWeekMonthBoard({ sessions: [], rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [boardPeriod, boardGroupId, boardReferenceDate, refreshKey]);

  // Class tab only - a single real class_session's points, one row per
  // student, no columns to pivot.
  const sessionView = useMemo(() => {
    if (!sessionBoard) return null;
    return {
      sessions: [],
      rows: [...sessionBoard]
        .sort((a, b) => a.rank - b.rank || a.real_name.localeCompare(b.real_name))
        .map((r) => ({ studentId: r.student_id, realName: r.real_name, perSession: {}, total: Number(r.points), rank: r.rank })),
    };
  }, [sessionBoard]);

  // Which matrix backs the current tab, plus whether any cell in it has a
  // real recorded score - drives the "not recorded yet" empty state below.
  const matrixView = boardPeriod === 'class' ? sessionView : boardPeriod !== 'all_time' ? weekMonthBoard : null;
  const matrixAnyRecorded =
    matrixView?.rows.some((row) => Object.values(row.perSession).some((v) => v != null)) ?? false;
  const hasLegacyPoints =
    boardPeriod === 'month' && (weekMonthBoard?.rows.some((row) => row.legacyPoints !== 0) ?? false);

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
            ? 'Ranked by points.'
            : isTeacher
              ? teacherLevels === null
                ? 'Loading your assigned levels...'
                : teacherLevels.length > 0
                  ? `Showing your assigned level(s): ${teacherLevels.join(', ')}.`
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

      <section className="mb-4 rounded-xl bg-white p-4 shadow-card">
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
                    boardLevel === lvl ? 'bg-brand-600 text-white' : 'bg-ink/5 text-ink/60 hover:text-ink'
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
                    boardPeriod === p ? 'bg-brand-600 text-white' : 'bg-ink/5 text-ink/60 hover:text-ink'
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
            {boardPeriod !== 'all_time' && boardGroups && boardGroups.length > 1 && (
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
                    {boardPeriod !== 'all_time' && <th className="px-3 py-2 font-semibold text-ink/70">Change</th>}
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
                      <td className="px-3 py-2 font-bold text-brand-600">{row.points}</td>
                      {boardPeriod !== 'all_time' && (
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
                      )}
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
        ) : matrixView === null ? (
          <p className="py-6 text-center text-sm text-ink/50">Loading...</p>
        ) : boardPeriod === 'class' && matrixView.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/50">No session opened for this date.</p>
        ) : boardPeriod !== 'class' && matrixView.sessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/50">
            No classes were held {boardPeriod === 'week' ? 'this week' : 'this month'} yet.
          </p>
        ) : boardPeriod !== 'class' && !matrixAnyRecorded && !hasLegacyPoints ? (
          <p className="py-6 text-center text-sm text-ink/50">No Class Scores have been recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            {hasLegacyPoints && (
              <p className="mb-2 text-xs text-ink/50">Includes historical August class points.</p>
            )}
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-semibold text-ink/70">Student</th>
                  {matrixView.sessions.map((s) => (
                    <th key={s.id} className="whitespace-nowrap px-3 py-2 text-center font-semibold text-ink/70">
                      {formatMonthDay(new Date(`${s.date}T00:00:00Z`))}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-2 text-center font-bold text-ink">
                    {boardPeriod === 'week' ? 'Weekly Total' : boardPeriod === 'month' ? 'Monthly Total' : 'Points'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrixView.rows.map((row) => (
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
                    {matrixView.sessions.map((s) => (
                      <td key={s.id} className="px-3 py-2 text-center text-ink/70">
                        {row.perSession[s.id] == null ? <span className="text-ink/30">—</span> : row.perSession[s.id]}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center text-base font-bold text-brand-600">
                      {row.total}
                      {row.legacyPoints !== 0 && (
                        <span
                          className="ml-1 align-top text-xs font-normal text-amber-700"
                          title="Includes historical August class points"
                        >
                          *
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canAwardAtAll && awardableLevels.length > 0 && (
        <section className="mb-4 rounded-xl bg-white p-4 shadow-card">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold text-ink">Class Score</h2>
            <Link to="/rankings/manual-entry" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Enter a past date &rarr;
            </Link>
          </div>
          <p className="mb-3 text-xs text-ink/50">
            One final score per student for this class - your complete evaluation of the lesson (homework, prep,
            vocabulary, participation, games, everything). No separate categories. Select the level (and group, if
            it has more than one), enter each student's score, and submit - today's class session is found or
            created automatically. Need to backfill a missed or past class? Use{' '}
            <Link to="/rankings/manual-entry" className="font-medium text-brand-600 hover:underline">
              Manual Class Score Entry
            </Link>{' '}
            instead.
          </p>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div className="flex gap-1">
              {awardableLevels.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSessionLevel(lvl)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    sessionLevel === lvl ? 'bg-brand-600 text-white' : 'bg-ink/5 text-ink/60 hover:text-ink'
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
          </div>
          {classScoreStudents.length === 0 && (
            <p className="rounded-lg bg-ink/5 p-3 text-xs text-ink/60">No students found for this level/group.</p>
          )}
          {classScoreStudents.length > 0 && (
            <>
              <p className="mb-2 text-xs font-medium text-active">
                Level {sessionLevel}
                {openSessionGroupName ? ` (${openSessionGroupName})` : ''} - {sessionDate}.
                {classScoreDoneStudents.length > 0 &&
                  ` ${classScoreDoneStudents.length} of ${classScoreStudents.length} already recorded.`}
              </p>
              {classScorePendingStudents.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {classScorePendingStudents.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink/5 px-3 py-2">
                      <span className="text-sm text-ink">{s.real_name}</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={classScoreValues[s.id] ?? ''}
                        onChange={(e) => setClassScoreValue(s.id, e.target.value)}
                        placeholder="Score"
                        className="input w-20 text-right text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}
              {classScoreDoneStudents.length > 0 && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {classScoreDoneStudents.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-active/10 px-3 py-2">
                      <span className="text-sm text-ink">{s.real_name}</span>
                      <span className="text-sm font-semibold text-active">{recordedClassScores[s.id]} pts</span>
                    </div>
                  ))}
                </div>
              )}
              {classScorePendingStudents.length > 0 && (
                <button
                  type="button"
                  onClick={submitClassScores}
                  disabled={classScorePending || classScorePendingCount === 0}
                  className="mt-3 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {classScorePending
                    ? 'Saving...'
                    : `Record Class Score${classScorePendingCount === 1 ? '' : 's'}${classScorePendingCount > 0 ? ` (${classScorePendingCount})` : ''}`}
                </button>
              )}
              {classScorePendingStudents.length === 0 && (
                <p className="mt-3 text-xs font-medium text-active">All students in this session have a Class Score recorded.</p>
              )}
            </>
          )}
          {classScoreMessage && <p className="mt-2 text-xs text-ink/60">{classScoreMessage}</p>}
        </section>
      )}

      {/* Add Points hidden 2026-08-19 at Dave's request - only affects All-Time,
          not Week/Month, and he grades by class now via Class Score. Logic/state
          below is untouched; flip this back to `canAwardAtAll && awardableStudents.length > 0`
          to restore. */}
      {false && canAwardAtAll && awardableStudents.length > 0 && (
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
                  className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:col-span-3"
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
    </div>
  );
}
