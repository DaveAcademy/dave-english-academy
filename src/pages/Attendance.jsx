// Attendance.jsx

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { todayISO } from '../utils/date';

// labelKey is a translation key (looked up at render time inside the
// component, not here at module scope - see Nav.jsx for the same pattern).
const LEVEL_TABS = [
  { key: '', labelKey: 'allTab' },
  { key: 'A', labelKey: 'common:levelA' },
  { key: 'B', labelKey: 'common:levelB' },
  { key: 'C', labelKey: 'common:levelC' },
];

export default function Attendance() {
  const { t } = useTranslation(['attendance', 'common']);
  const { students, attendance, setAttendanceStatus, error } = useAcademy();
  const [date, setDate] = useState(todayISO());
  const [level, setLevel] = useState('');

  const activeStudents = useMemo(
    () =>
      [...students]
        .filter((s) => s.status === 'Active')
        .filter((s) => !level || s.level === level)
        .sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students, level]
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

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink/50">{t('subtitle')}</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {LEVEL_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setLevel(tab.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
              level === tab.key ? 'bg-brand-500 text-white' : 'bg-white text-ink/60 shadow-sm'
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

      {activeStudents.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">
            {level ? t('noActiveStudentsInLevel', { level }) : t('noActiveStudents')}
          </p>
          <p className="mt-1 text-sm text-ink/50">
            {level ? t('tryDifferentLevel') : t('addActiveStudentsHint')}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {activeStudents.map((s) => {
            const current = statusOf(s.id);
            return (
              <div key={s.id} className="rounded-xl bg-white p-3 shadow-card">
                <p className="mb-2 font-semibold text-ink">{s.real_name}</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setAttendanceStatus(s.id, date, 'Present')}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold ${
                      current === 'Present' ? 'bg-active text-white' : 'bg-ink/5 text-ink/50'
                    }`}
                  >
                    <CheckCircle2 size={14} /> {t('present')}
                  </button>
                  <button
                    onClick={() => setAttendanceStatus(s.id, date, 'Late')}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold ${
                      current === 'Late' ? 'bg-levelB text-white' : 'bg-ink/5 text-ink/50'
                    }`}
                  >
                    <Clock size={14} /> {t('late')}
                  </button>
                  <button
                    onClick={() => setAttendanceStatus(s.id, date, 'Absent')}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold ${
                      current === 'Absent' ? 'bg-inactive text-white' : 'bg-ink/5 text-ink/50'
                    }`}
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
