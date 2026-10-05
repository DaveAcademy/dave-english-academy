// Attendance.jsx

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, XCircle, Search, X } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { useAuth } from '../../../lib/AuthContext';
import { listMyTeacherLevels } from '../../../lib/db';
import { initialsOf, avatarToneIndex, searchStudents, bulkPlan } from '../../../lib/attendanceWorkflow';
import { todayTashkentISO } from '../../../shared/utils/date';
import { LEVELS, levelToken } from '../../../lib/levels';

// labelKey is a translation key (looked up at render time inside the
// component, not here at module scope - see Nav.jsx for the same pattern).
// Tabs are derived from the shared LEVELS source (see lib/levels.js) rather
// than a local list, so a level added there (like A1 was) never silently
// goes missing from Attendance again.
const LEVEL_TABS = [
  { key: '', labelKey: 'allTab' },
  ...LEVELS.map((lvl) => ({ key: lvl, labelKey: `common:level${lvl}` })),
];

// Subtle deterministic avatar tones (existing palette only).
const AVATAR_TONES = [
  'bg-brand-100 text-brand-700',
  'bg-active/15 text-active',
  'bg-levelB/15 text-levelB',
  'bg-levelC/15 text-levelC',
  'bg-levelA/15 text-levelA',
];

export default function Attendance() {
  const { t } = useTranslation(['attendance', 'common']);
  const { students, attendance, setAttendanceStatus, pendingAttendance, loading, error } = useAcademy();
  const { role, session } = useAuth();
  const isTeacher = role === 'teacher';
  const [date, setDate] = useState(todayTashkentISO());
  const [level, setLevel] = useState('');
  // Display-only roster search (never touches attendance data).
  const [query, setQuery] = useState('');
  // Bulk-mark state: two-step confirm before overwriting Late/Absent.
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  // Polite save confirmation for screen readers (set after each save).
  const [announcement, setAnnouncement] = useState('');

  // Teachers only see levels they are assigned to (same source the backend
  // RLS enforces via teacher_group_assignments — see listMyTeacherLevels).
  // Admins and other roles are unfiltered, exactly as before.
  const [teacherLevels, setTeacherLevels] = useState(null);
  useEffect(() => {
    if (!isTeacher || !session?.user?.id) return;
    let cancelled = false;
    listMyTeacherLevels(session.user.id)
      .then((levels) => { if (!cancelled) setTeacherLevels(levels || []); })
      .catch(() => { if (!cancelled) setTeacherLevels([]); });
    return () => { cancelled = true; };
  }, [isTeacher, session?.user?.id]);

  // While the teacher scope is unknown, show loading rather than a roster
  // that would be pulled away (or contain unmarkable students).
  const showLoading = loading || (isTeacher && teacherLevels === null);

  const activeStudents = useMemo(
    () =>
      [...students]
        .filter((s) => s.status === 'Active')
        .filter((s) => !level || s.level === level)
        .filter((s) => !isTeacher || (teacherLevels || []).includes(s.level))
        .sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students, level, isTeacher, teacherLevels]
  );

  const dayRecords = useMemo(() => {
    const activeIds = new Set(activeStudents.map((s) => s.id));
    return attendance.filter((a) => a.date === date && activeIds.has(a.student_id));
  }, [attendance, date, activeStudents]);

  const counts = {
    Present: dayRecords.filter((a) => a.status === 'Present').length,
    Late: dayRecords.filter((a) => a.status === 'Late').length,
    Absent: dayRecords.filter((a) => a.status === 'Absent').length,
  };

  const statusOf = (studentId) => dayRecords.find((a) => a.student_id === studentId)?.status || null;

  // Search is a display filter only; progress below always uses the full
  // eligible roster (activeStudents), never the filtered list.
  const displayedStudents = useMemo(
    () => searchStudents(activeStudents, query),
    [activeStudents, query]
  );

  // Completion: every status (Present/Late/Absent) counts as marked.
  // dayRecords derives from committed attendance state, so failed saves
  // (rolled back) can never falsely advance this.
  const marked = dayRecords.length;
  const total = activeStudents.length;
  const markedPct = total === 0 ? 0 : Math.round((marked / total) * 100);

  const statusLabel = { Present: t('present'), Late: t('late'), Absent: t('absent') };

  // Bulk "mark all Present": acts on the currently displayed roster.
  // Already-Present rows are excluded — re-saving them would toggle OFF.
  const { unmarked: bulkUnmarked, overwrite: bulkOverwrite } = useMemo(() => {
    if (showLoading) return { unmarked: [], overwrite: [] };
    return bulkPlan(displayedStudents.map((s) => ({ student: s, status: statusOf(s.id) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedStudents, attendance, date, showLoading]);
  const bulkTargets = bulkConfirm ? [...bulkUnmarked, ...bulkOverwrite] : bulkUnmarked;

  // Disarm the overwrite confirm whenever the target set may have changed.
  useEffect(() => {
    setBulkConfirm(false);
  }, [date, query, level, attendance]);

  // Sequential saves through the normal save path (same guards, rollback,
  // and RLS as single taps). Progress bar advances live per save.
  const runBulk = async () => {
    if (bulkRunning || bulkTargets.length === 0) return;
    setBulkRunning(true);
    setBulkConfirm(false);
    let ok = 0;
    let fail = 0;
    for (const st of bulkTargets) {
      try {
        await setAttendanceStatus(st.id, date, 'Present');
        ok += 1;
      } catch {
        fail += 1;
      }
      setBulkProgress({ done: ok + fail, total: bulkTargets.length });
    }
    setBulkRunning(false);
    setBulkProgress(null);
    // One summary announcement (individual taps keep their own feedback).
    setAnnouncement(t('bulkResult', { ok, fail }));
  };

  // Await the save so screen readers get one confirmation per completed
  // mark. Failures are already surfaced via the error banner + rollback.
  const handleStatus = async (student, status) => {
    try {
      await setAttendanceStatus(student.id, date, status);
      setAnnouncement(t('statusSaved', { status: statusLabel[status], name: student.real_name }));
    } catch {
      // No-op: central error handling already rolled back and bannered.
    }
  };

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink/50">{t('subtitle')}</p>
      </header>

      {error && <div role="alert" className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      <p aria-live="polite" className="sr-only">{announcement}</p>

      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {LEVEL_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setLevel(tab.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold max-sm:min-h-[44px] ${
              level === tab.key ? 'bg-brand-600 text-white' : 'bg-white text-ink/60 shadow-sm'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="rounded-xl bg-white p-3 shadow-card sm:w-64">
          <label className="mb-1 block text-xs font-semibold text-ink/50">{t('date')}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm" />
        </div>
        <div className="grid flex-1 grid-cols-3 gap-3">
          <div className="rounded-xl bg-white p-3 text-center shadow-card">
            <p className="text-xs text-ink/50">{t('present')}</p>
            <p className="text-xl font-bold text-active">{counts.Present}</p>
          </div>
          <div className="rounded-xl bg-white p-3 text-center shadow-card">
            <p className="text-xs text-ink/50">{t('late')}</p>
            <p className="text-xl font-bold text-levelB">{counts.Late}</p>
          </div>
          <div className="rounded-xl bg-white p-3 text-center shadow-card">
            <p className="text-xs text-ink/50">{t('absent')}</p>
            <p className="text-xl font-bold text-inactive">{counts.Absent}</p>
          </div>
        </div>
      </div>

      <div className="mb-3 rounded-xl bg-white p-3 shadow-card">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="w-full rounded-lg border border-ink/10 py-2 pl-9 pr-9 text-sm max-sm:min-h-[44px]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('clearSearch')}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink/50"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (bulkRunning) return;
              if (bulkOverwrite.length > 0 && !bulkConfirm) {
                setBulkConfirm(true);
                return;
              }
              runBulk();
            }}
            disabled={bulkRunning || showLoading || (bulkUnmarked.length === 0 && bulkOverwrite.length === 0)}
            aria-label={t('markAllPresent')}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold max-sm:min-h-[44px] ${
              bulkConfirm ? 'bg-inactive text-white' : 'bg-brand-600 text-white'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {bulkRunning && bulkProgress
              ? t('bulkMarking', { done: bulkProgress.done, total: bulkProgress.total })
              : bulkConfirm
                ? t('confirmOverwrite', { count: bulkOverwrite.length })
                : t('markAllPresent')}
          </button>
          {bulkConfirm && !bulkRunning && (
            <button
              type="button"
              onClick={() => setBulkConfirm(false)}
              aria-label={t('common:cancel')}
              className="rounded-lg bg-ink/5 px-3 py-2 text-xs font-semibold text-ink/60 max-sm:min-h-[44px]"
            >
              {t('common:cancel')}
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="whitespace-nowrap text-xs font-semibold text-ink/60">
            {t('progressMarked', { marked, total })}
          </span>
          <div
            role="progressbar"
            aria-label={t('progressMarked', { marked, total })}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={marked}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10"
          >
            <div className="h-full rounded-full bg-active" style={{ width: `${markedPct}%` }} />
          </div>
        </div>
      </div>

      {showLoading ? (
        <div>
          <p role="status" className="mb-2 text-sm text-ink/50">{t('loading')}</p>
          <div aria-hidden="true" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-xl bg-white p-3 shadow-card">
                <div className="mb-2 h-5 w-2/3 rounded bg-ink/10" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-8 rounded-lg bg-ink/5 max-sm:min-h-[44px]" />
                  <div className="h-8 rounded-lg bg-ink/5 max-sm:min-h-[44px]" />
                  <div className="h-8 rounded-lg bg-ink/5 max-sm:min-h-[44px]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeStudents.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">
            {level ? t('noActiveStudentsInLevel', { level: levelToken(level) }) : t('noActiveStudents')}
          </p>
          <p className="mt-1 text-sm text-ink/50">
            {level ? t('tryDifferentLevel') : t('addActiveStudentsHint')}
          </p>
        </div>
      ) : displayedStudents.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('noMatch', { q: query })}</p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="mt-2 rounded-lg bg-ink/5 px-3 py-2 text-xs font-semibold text-ink/60 max-sm:min-h-[44px]"
          >
            {t('clearSearch')}
          </button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {displayedStudents.map((s) => {
            const current = statusOf(s.id);
            const pending = pendingAttendance?.has(`${s.id}:${date}`);
            return (
              <div key={s.id} className="rounded-xl bg-white p-3 shadow-card">
                <div className="mb-2 flex min-h-[2rem] items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${AVATAR_TONES[avatarToneIndex(s.real_name, AVATAR_TONES.length)]}`}
                  >
                    {initialsOf(s.real_name)}
                  </span>
                  <p title={s.real_name} className="min-w-0 flex-1 truncate font-semibold leading-tight text-ink">{s.real_name}</p>
                  <span className="shrink-0 rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-bold text-ink/50">{levelToken(s.level)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleStatus(s, 'Present')}
                    disabled={pending}
                    aria-pressed={current === 'Present'}
                    aria-label={`${statusLabel.Present} — ${s.real_name}`}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-opacity max-sm:min-h-[44px] max-sm:py-2.5 ${
                      current === 'Present' ? 'bg-active text-white' : 'bg-ink/5 text-ink/50'
                    } ${pending ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <CheckCircle2 size={14} /> {t('present')}
                  </button>
                  <button
                    onClick={() => handleStatus(s, 'Late')}
                    disabled={pending}
                    aria-pressed={current === 'Late'}
                    aria-label={`${statusLabel.Late} — ${s.real_name}`}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-opacity max-sm:min-h-[44px] max-sm:py-2.5 ${
                      current === 'Late' ? 'bg-levelB text-white' : 'bg-ink/5 text-ink/50'
                    } ${pending ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Clock size={14} /> {t('late')}
                  </button>
                  <button
                    onClick={() => handleStatus(s, 'Absent')}
                    disabled={pending}
                    aria-pressed={current === 'Absent'}
                    aria-label={`${statusLabel.Absent} — ${s.real_name}`}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-opacity max-sm:min-h-[44px] max-sm:py-2.5 ${
                      current === 'Absent' ? 'bg-inactive text-white' : 'bg-ink/5 text-ink/50'
                    } ${pending ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <XCircle size={14} /> {t('absent')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
