// ManualClassScoreEntry.jsx
// Monthly Class Score management: Month -> Week -> Class Date -> Group ->
// Students -> Points, for reconstructing/correcting a whole month's worth
// of classes (e.g. August 2026), not just one date. Deliberately a thin
// layer over the exact same write path Rankings.jsx's same-day Class
// Score flow already uses - getClassSession()/openClassSession()/
// listClassScores()/bulkAwardStudentPoints(), categoryKey 'class_score' -
// this page adds no new points mechanism, only:
//   1. a pure calendar generator (getMonthlyClassSchedule) for which
//      dates are Tue/Thu/Sat class days, since Rankings.jsx hardcodes
//      "today" by Ranking V3 design and there is no day-of-week concept
//      in the schema itself;
//   2. an editable-correction path for a student who already has a score,
//      recorded as an insert-only signed-delta row (is_reversal = true,
//      reversed_transaction_id -> the row being corrected) rather than an
//      UPDATE, since point_transactions has no UPDATE/DELETE policy for
//      any role (0019). This requires migration 0172, which narrows
//      0166's uniqueness index to exempt is_reversal rows - a fresh
//      (non-correction) entry is still uniquely constrained exactly as
//      before, so the original duplicate guard is not weakened.
// Ranking RPCs already SUM(points) per (student, session,
// category_key='class_score') with no is_reversal filter (0167), so a
// correction's net effect reaches Week/Month rankings automatically -
// nothing here duplicates that calculation.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import {
  listMyTeacherLevels,
  listClassGroups,
  getClassSession,
  openClassSession,
  listClassScores,
  listClassScoresForSessions,
  listClassSessionsInRange,
} from '../lib/db';
import { formatStudentDisplayName } from '../lib/gameRecordFormat';
import { LEVELS } from '../lib/levels';
import { todayTashkentISO, formatDateOnly, getMonthlyClassSchedule } from '../utils/date';

const REASON_NEW = 'Class Score (manual entry)';
const reasonCorrection = (oldVal, newVal) => `Class Score correction: ${oldVal} -> ${newVal} (manual entry)`;

const STATUS_STYLE = {
  'Not Entered': 'bg-ink/5 text-ink/50',
  'Partially Entered': 'bg-levelB/15 text-levelB',
  Complete: 'bg-active/15 text-active',
  'Needs Review': 'bg-inactive/15 text-inactive',
  Upcoming: 'bg-ink/5 text-ink/30',
};

export default function ManualClassScoreEntry() {
  const { students, bulkAwardStudentPoints } = useAcademy();
  const { role, session } = useAuth();
  const isAdmin = role === 'administrator';
  const isTeacher = role === 'teacher';
  const canAwardAtAll = isAdmin || isTeacher;

  const [teacherLevels, setTeacherLevels] = useState(null);
  useEffect(() => {
    if (!isTeacher || !session?.user?.id) return;
    listMyTeacherLevels(session.user.id)
      .then((levels) => setTeacherLevels(levels || []))
      .catch(() => setTeacherLevels([]));
  }, [isTeacher, session?.user?.id]);

  const awardableLevels = isAdmin ? LEVELS : teacherLevels || [];
  const today = todayTashkentISO();

  // ---------- Month + calendar/status ----------
  const [monthValue, setMonthValue] = useState(today.slice(0, 7)); // "YYYY-MM"
  const [year, month] = monthValue.split('-').map(Number);
  const schedule = useMemo(() => getMonthlyClassSchedule(year, month), [year, month]);
  const monthStart = `${monthValue}-01`;
  const monthEnd = schedule.length ? schedule[schedule.length - 1].dates.slice(-1)[0] : monthStart;

  const [groupsByLevel, setGroupsByLevel] = useState(null); // { [level]: [{id,name}] }
  useEffect(() => {
    if (awardableLevels.length === 0) return;
    let cancelled = false;
    Promise.all(awardableLevels.map((lvl) => listClassGroups(lvl).then((rows) => [lvl, rows || []])))
      .then((pairs) => {
        if (cancelled) return;
        setGroupsByLevel(Object.fromEntries(pairs));
      })
      .catch(() => {
        if (!cancelled) setGroupsByLevel({});
      });
    return () => {
      cancelled = true;
    };
  }, [awardableLevels.join(',')]);

  const allGroupIds = useMemo(
    () => Object.values(groupsByLevel || {}).flatMap((rows) => rows.map((g) => String(g.id))),
    [groupsByLevel]
  );

  const [refreshKey, setRefreshKey] = useState(0);
  const [statusByDate, setStatusByDate] = useState(null); // { [date]: 'Not Entered'|'Partially Entered'|'Complete'|'Needs Review'|'Upcoming' }

  const rosterCount = useCallback(
    (level) => students.filter((s) => s.status === 'Active' && s.level === level).length,
    [students]
  );

  useEffect(() => {
    if (!groupsByLevel || allGroupIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const sessions = await listClassSessionsInRange(allGroupIds, monthStart, monthEnd);
      const sessionsByGroupDate = new Map(sessions.map((s) => [`${s.class_group_id}|${s.session_date}`, s.id]));
      const sessionIds = sessions.map((s) => s.id);
      const scoreRows = await listClassScoresForSessions(sessionIds);
      const scoredStudentsBySession = new Map(); // sessionId -> Set(student_id)
      const correctedSessions = new Set();
      for (const row of scoreRows) {
        if (!scoredStudentsBySession.has(row.class_session_id)) scoredStudentsBySession.set(row.class_session_id, new Set());
        scoredStudentsBySession.get(row.class_session_id).add(row.student_id);
        if (row.is_reversal) correctedSessions.add(row.class_session_id);
      }

      const map = {};
      for (const week of schedule) {
        for (const date of week.dates) {
          if (date > today) {
            map[date] = 'Upcoming';
            continue;
          }
          let totalRoster = 0;
          let totalScored = 0;
          let anyCorrected = false;
          for (const level of awardableLevels) {
            const groups = groupsByLevel[level] || [];
            for (const g of groups) {
              const roster = rosterCount(level);
              totalRoster += roster;
              const sessionId = sessionsByGroupDate.get(`${g.id}|${date}`);
              if (sessionId) {
                totalScored += scoredStudentsBySession.get(sessionId)?.size ?? 0;
                if (correctedSessions.has(sessionId)) anyCorrected = true;
              }
            }
          }
          if (totalScored === 0) map[date] = 'Not Entered';
          else if (totalScored < totalRoster) map[date] = 'Partially Entered';
          else map[date] = anyCorrected ? 'Needs Review' : 'Complete';
        }
      }
      if (!cancelled) setStatusByDate(map);
    })().catch(() => {
      if (!cancelled) setStatusByDate({});
    });
    return () => {
      cancelled = true;
    };
  }, [groupsByLevel, allGroupIds.join(','), monthStart, monthEnd, refreshKey]);

  // ---------- Date -> Group -> Students ----------
  const [selectedDate, setSelectedDate] = useState(null);
  const [level, setLevel] = useState('');
  const [groupId, setGroupId] = useState('');
  const [classSession, setClassSession] = useState(null); // existing class_session row, or null
  const [sessionChecked, setSessionChecked] = useState(false);
  const [scoreRows, setScoreRows] = useState([]); // raw listClassScores rows for the resolved session
  const [scoreValues, setScoreValues] = useState({}); // { [studentId]: input string }
  const [step, setStep] = useState('calendar'); // 'calendar' | 'entry' | 'review' | 'result'
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const groups = level ? groupsByLevel?.[level] || [] : [];
  const groupName = useMemo(() => groups.find((g) => String(g.id) === String(groupId))?.name, [groups, groupId]);

  const openDate = (date) => {
    setSelectedDate(date);
    setLevel(awardableLevels[0] || '');
    setGroupId('');
    setStep('entry');
    setScoreValues({});
    setResult(null);
  };

  useEffect(() => {
    if (!level) return;
    const g = groupsByLevel?.[level] || [];
    setGroupId(g.length === 1 ? String(g[0].id) : '');
  }, [level, groupsByLevel]);

  useEffect(() => {
    if (!groupId || !selectedDate) {
      setClassSession(null);
      setScoreRows([]);
      setSessionChecked(false);
      return;
    }
    let cancelled = false;
    setSessionChecked(false);
    getClassSession(groupId, selectedDate)
      .then(async (row) => {
        if (cancelled) return;
        setClassSession(row);
        if (row) {
          const rows = await listClassScores(row.id);
          if (!cancelled) setScoreRows(rows || []);
        } else {
          setScoreRows([]);
        }
        setSessionChecked(true);
      })
      .catch(() => {
        if (!cancelled) {
          setClassSession(null);
          setScoreRows([]);
          setSessionChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, selectedDate]);

  // Net current score + latest contributing row id per student - a
  // correction is a second row (sum), not an update, so "current score"
  // is always the sum of every class_score row for that student+session.
  const netByStudent = useMemo(() => {
    const map = {};
    for (const row of scoreRows) {
      if (!map[row.student_id]) map[row.student_id] = { points: 0, lastId: null };
      map[row.student_id].points += Number(row.points);
      map[row.student_id].lastId = Math.max(map[row.student_id].lastId ?? 0, row.id);
    }
    return map;
  }, [scoreRows]);

  const groupStudents = useMemo(
    () =>
      students
        .filter((s) => s.status === 'Active' && s.level === level && (groups.length <= 1 || s.group_name === groupName))
        .sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students, level, groups.length, groupName]
  );

  const setScoreValue = (studentId, value) => setScoreValues((prev) => ({ ...prev, [studentId]: value }));

  // Every student with a valid, changed value - fresh entries (no prior
  // row) and corrections (value differs from the current net) alike.
  // Unchanged values are silently excluded, never resubmitted.
  const changes = useMemo(() => {
    return groupStudents
      .map((student) => {
        const raw = scoreValues[student.id];
        if (raw === undefined || raw === '') return null;
        const newPoints = Number(raw);
        if (!Number.isFinite(newPoints) || newPoints < 0) return null;
        const existing = netByStudent[student.id];
        const oldPoints = existing?.points;
        if (oldPoints !== undefined && oldPoints === newPoints) return null;
        return {
          student,
          oldPoints,
          newPoints,
          isCorrection: oldPoints !== undefined,
          lastTransactionId: existing?.lastId ?? null,
        };
      })
      .filter(Boolean);
  }, [groupStudents, scoreValues, netByStudent]);

  const isHistorical = selectedDate && selectedDate !== today;

  const backToCalendar = () => {
    setStep('calendar');
    setSelectedDate(null);
  };

  const submit = async () => {
    setSaving(true);
    try {
      const activeSession = classSession || (await openClassSession({ classGroupId: groupId, sessionDate: selectedDate, openedBy: session.user.id }));
      setClassSession(activeSession);

      await bulkAwardStudentPoints(
        changes.map(({ student, oldPoints, newPoints, isCorrection, lastTransactionId }) => ({
          studentId: student.id,
          level: student.level,
          categoryId: null,
          categoryKey: 'class_score',
          points: isCorrection ? newPoints - oldPoints : newPoints,
          reason: isCorrection ? reasonCorrection(oldPoints, newPoints) : REASON_NEW,
          awardedBy: session.user.id,
          classSessionId: activeSession.id,
          isReversal: isCorrection,
          reversedTransactionId: isCorrection ? lastTransactionId : null,
        }))
      );

      // Verification: re-read the ledger and recompute net per student -
      // don't trust the write succeeded just because no error was thrown.
      const verifyRows = await listClassScores(activeSession.id);
      const verifyNet = {};
      const freshRowCount = {};
      for (const r of verifyRows) {
        verifyNet[r.student_id] = (verifyNet[r.student_id] ?? 0) + Number(r.points);
        if (!r.is_reversal) freshRowCount[r.student_id] = (freshRowCount[r.student_id] ?? 0) + 1;
      }

      const mismatches = [];
      for (const { student, newPoints } of changes) {
        if (verifyNet[student.id] === undefined) {
          mismatches.push(`${student.real_name}: expected ${newPoints}, not found after save`);
        } else if (Number(verifyNet[student.id]) !== newPoints) {
          mismatches.push(`${student.real_name}: expected ${newPoints}, found ${verifyNet[student.id]}`);
        }
        if ((freshRowCount[student.id] ?? 0) > 1) {
          mismatches.push(`${student.real_name}: ${freshRowCount[student.id]} fresh (non-correction) class_score rows found for this session - duplicate guard may have been bypassed`);
        }
      }

      setScoreRows(verifyRows);
      setResult({
        ok: mismatches.length === 0,
        message:
          mismatches.length === 0
            ? `Verified: ${changes.length} Class Score${changes.length === 1 ? '' : 's'} saved correctly for ${groupName || `Level ${level}`} on ${formatDateOnly(selectedDate)}.`
            : 'Verification found a discrepancy - see details below.',
        mismatches,
      });
      setStep('result');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      // P0001 is the chain-tip validation trigger from migration 0172:
      // someone else already corrected this student's score after this
      // form loaded, so the reversed_transaction_id this submit computed
      // is stale. The whole batch insert is one statement, so Postgres
      // has already rolled back everything in it - no partial write, no
      // second transaction gets created here. We only re-read below to
      // show current values; the teacher must explicitly re-review and
      // resubmit themselves, never an automatic retry.
      const isStaleCorrection = err?.code === 'P0001';
      const isDuplicate = err?.code === '23505';
      setResult({
        ok: false,
        message: isDuplicate
          ? 'A conflicting Class Score record already exists for one of these students/session. Refreshing.'
          : isStaleCorrection
            ? 'This score was changed by another user. Please reload the class and try again.'
            : 'Could not save Class Scores. Please try again.',
        // Never hide the underlying DB error, even with a friendly message above.
        mismatches: err?.message ? [err.message] : [],
      });
      setStep('result');
      try {
        const s = classSession || (await getClassSession(groupId, selectedDate));
        if (s) {
          const rows = await listClassScores(s.id);
          setClassSession(s);
          setScoreRows(rows || []);
        }
      } catch {
        // best-effort refresh only
      }
    } finally {
      setSaving(false);
    }
  };

  if (!canAwardAtAll) {
    return (
      <div>
        <p className="text-sm text-ink/60">You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4">
        <Link to="/rankings" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink/50 hover:text-ink">
          <ArrowLeft size={14} /> Back to Rankings
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">Monthly Class Score Management</h1>
        <p className="mt-1 text-sm text-ink/50">
          Reconstruct or correct a month's Class Scores: pick a scheduled class date, then a group. Existing scores can
          be edited - a correction is recorded as an audited adjustment, never a silent overwrite.
        </p>
      </header>

      {step === 'calendar' && (
        <section className="mb-4 rounded-xl bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const d = new Date(Date.UTC(year, month - 2, 1));
                setMonthValue(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
              }}
              className="rounded-lg bg-ink/5 p-1.5 text-ink/60 hover:text-ink"
            >
              <ChevronLeft size={16} />
            </button>
            <input
              type="month"
              value={monthValue}
              max={today.slice(0, 7)}
              onChange={(e) => setMonthValue(e.target.value)}
              className="input w-auto text-sm"
            />
            <button
              type="button"
              onClick={() => {
                const d = new Date(Date.UTC(year, month, 1));
                setMonthValue(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
              }}
              disabled={monthValue >= today.slice(0, 7)}
              className="rounded-lg bg-ink/5 p-1.5 text-ink/60 hover:text-ink disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {!statusByDate ? (
            <p className="text-xs text-ink/50">Loading schedule...</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {schedule.map((week) => (
                <div key={week.weekStart} className="rounded-lg bg-ink/5 p-3">
                  <p className="mb-2 text-xs font-bold text-ink/70">{week.label}</p>
                  <div className="space-y-1.5">
                    {week.dates.map((date) => {
                      const status = statusByDate[date] || 'Not Entered';
                      const disabled = status === 'Upcoming';
                      const dt = new Date(`${date}T00:00:00Z`);
                      const weekday = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
                      return (
                        <button
                          key={date}
                          type="button"
                          disabled={disabled}
                          onClick={() => openDate(date)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-left shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="text-xs text-ink">
                            {weekday} {formatDateOnly(date)}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[status]}`}>{status}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {(step === 'entry' || step === 'review') && (
        <section className="mb-4 rounded-xl bg-white p-4 shadow-card">
          <button type="button" onClick={backToCalendar} className="mb-3 text-xs font-medium text-ink/50 hover:text-ink">
            &larr; Back to calendar
          </button>

          {isHistorical && (
            <div className="mb-3 rounded-lg border border-levelB/30 bg-levelB/10 px-3 py-2 text-xs font-medium text-ink">
              Historical Entry: you are entering/correcting Class Scores for {formatDateOnly(selectedDate)}. These
              scores will affect the rankings for that week/month once saved.
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-end gap-3">
            <p className="text-sm font-semibold text-ink">{formatDateOnly(selectedDate)}</p>
            <div className="flex gap-1">
              {awardableLevels.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    setLevel(lvl);
                    setStep('entry');
                    setScoreValues({});
                  }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    level === lvl ? 'bg-brand-600 text-white' : 'bg-ink/5 text-ink/60 hover:text-ink'
                  }`}
                >
                  Level {lvl}
                </button>
              ))}
            </div>
            {groups.length > 1 && (
              <select
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value);
                  setStep('entry');
                  setScoreValues({});
                }}
                className="input w-auto text-xs"
              >
                <option value="">Select group...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {!level || !groupId ? (
            <p className="rounded-lg bg-ink/5 p-3 text-xs text-ink/60">Select a group to continue.</p>
          ) : !sessionChecked ? (
            <p className="text-xs text-ink/50">Checking for an existing session...</p>
          ) : groupStudents.length === 0 ? (
            <p className="rounded-lg bg-ink/5 p-3 text-xs text-ink/60">No students found for this level/group.</p>
          ) : step === 'entry' ? (
            <>
              <p className="mb-2 text-xs text-ink/50">
                {classSession ? 'Session already exists - edit any value to correct it.' : 'A new session will be opened on save.'}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {groupStudents.map((s) => {
                  const net = netByStudent[s.id]?.points;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink/5 px-3 py-2">
                      <span className="text-sm text-ink">{formatStudentDisplayName(s.real_name, s.english_name)}</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={scoreValues[s.id] ?? net ?? ''}
                        onChange={(e) => setScoreValue(s.id, e.target.value)}
                        placeholder="Score"
                        className="input w-20 text-right text-sm"
                      />
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setStep('review')}
                disabled={changes.length === 0}
                className="mt-3 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Review {changes.length > 0 ? `(${changes.length})` : ''}
              </button>
            </>
          ) : (
            <>
              <h2 className="mb-2 font-display text-sm font-bold text-ink">Review before saving</h2>
              <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink/70">
                <dt className="font-medium text-ink/50">Date</dt>
                <dd>{formatDateOnly(selectedDate)}</dd>
                <dt className="font-medium text-ink/50">Level/Group</dt>
                <dd>{groupName || `Level ${level}`}</dd>
                <dt className="font-medium text-ink/50">Session</dt>
                <dd>{classSession ? `Existing session #${classSession.id}` : 'New session will be created'}</dd>
                <dt className="font-medium text-ink/50">Students affected</dt>
                <dd>{changes.length}</dd>
              </dl>
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                {changes.map(({ student, oldPoints, newPoints, isCorrection }) => (
                  <div key={student.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink/5 px-3 py-2">
                    <span className="text-sm text-ink">{formatStudentDisplayName(student.real_name, student.english_name)}</span>
                    <span className="text-sm font-semibold text-ink">
                      {isCorrection
                        ? `${oldPoints} → ${newPoints} (${newPoints - oldPoints > 0 ? '+' : ''}${newPoints - oldPoints})`
                        : `${newPoints} (new)`}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('entry')}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-ink/5 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:text-ink disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : `Confirm and Save (${changes.length})`}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {step === 'result' && result && (
        <section className="mb-4 rounded-xl bg-white p-4 shadow-card">
          <p className={`text-sm font-semibold ${result.ok ? 'text-active' : 'text-inactive'}`}>{result.message}</p>
          {result.mismatches?.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-inactive">
              {result.mismatches.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setScoreValues({});
                setResult(null);
                setStep('entry');
              }}
              className="rounded-lg bg-ink/5 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:text-ink"
            >
              Continue this date/group
            </button>
            <button
              type="button"
              onClick={backToCalendar}
              className="rounded-lg bg-ink/5 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:text-ink"
            >
              Back to calendar
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
