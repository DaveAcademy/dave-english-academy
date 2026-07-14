// Attendance.jsx

import { useState, useMemo } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { todayISO } from '../utils/date';

const LEVEL_TABS = [
  { key: '', label: 'All' },
  { key: 'A', label: 'Level A' },
  { key: 'B', label: 'Level B' },
  { key: 'C', label: 'Level C' },
];

export default function Attendance() {
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
        <h1 className="font-display text-2xl font-bold text-ink">Attendance</h1>
        <p className="mt-1 text-sm text-ink/50">Mark Present, Late, or Absent for each active student.</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {LEVEL_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setLevel(t.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
              level === t.key ? 'bg-brand-500 text-white' : 'bg-white text-ink/60 shadow-sm'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="rounded-xl bg-white p-3 shadow-card sm:w-64">
          <label className="mb-1 block text-xs font-semibold text-ink/50">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm" />
        </div>
        <div className="grid flex-1 grid-cols-3 gap-3">
          <div className="rounded-xl bg-white p-3 text-center shadow-card">
            <p className="text-xs text-ink/50">Present</p>
            <p className="text-xl font-bold text-active">{counts.Present}</p>
          </div>
          <div className="rounded-xl bg-white p-3 text-center shadow-card">
            <p className="text-xs text-ink/50">Late</p>
            <p className="text-xl font-bold text-levelB">{counts.Late}</p>
          </div>
          <div className="rounded-xl bg-white p-3 text-center shadow-card">
            <p className="text-xs text-ink/50">Absent</p>
            <p className="text-xl font-bold text-inactive">{counts.Absent}</p>
          </div>
        </div>
      </div>

      {activeStudents.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">
            {level ? `No active students in Level ${level}` : 'No active students'}
          </p>
          <p className="mt-1 text-sm text-ink/50">
            {level ? 'Try a different level, or switch back to All.' : 'Add active students to start taking attendance.'}
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
                    <CheckCircle2 size={14} /> Present
                  </button>
                  <button
                    onClick={() => setAttendanceStatus(s.id, date, 'Late')}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold ${
                      current === 'Late' ? 'bg-levelB text-white' : 'bg-ink/5 text-ink/50'
                    }`}
                  >
                    <Clock size={14} /> Late
                  </button>
                  <button
                    onClick={() => setAttendanceStatus(s.id, date, 'Absent')}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold ${
                      current === 'Absent' ? 'bg-inactive text-white' : 'bg-ink/5 text-ink/50'
                    }`}
                  >
                    <XCircle size={14} /> Absent
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
