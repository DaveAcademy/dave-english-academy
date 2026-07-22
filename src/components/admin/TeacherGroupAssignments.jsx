// TeacherGroupAssignments.jsx
// Which levels (A/B/C) each teacher may award ranking points for (see
// migration 0017). This is the only place that can change it - the
// database enforces the actual restriction independently on every
// point_transactions insert (RLS + a trigger), so a mistake here only
// affects what a teacher can attempt, never a real security bypass.
// Every existing teacher was seeded with all three levels at cutover, so
// this UI narrows access, it never has to be used just to keep things
// working as they already were.

import { useState, useEffect, useCallback } from 'react';
import { Users2 } from 'lucide-react';
import { listTeachers, listTeacherGroupAssignments, addTeacherGroupAssignment, removeTeacherGroupAssignment } from '../../lib/db';

const LEVELS = ['A', 'B', 'C'];

export default function TeacherGroupAssignments() {
  const [teachers, setTeachers] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [pending, setPending] = useState(null); // `${teacherId}-${level}` while a toggle is in flight
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [teacherRows, assignmentRows] = await Promise.all([listTeachers(), listTeacherGroupAssignments()]);
      setTeachers(teacherRows || []);
      setAssignments(assignmentRows || []);
    } catch (err) {
      setLoadError(err.message || 'Could not load teacher assignments.');
      setTeachers([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const assignmentFor = (teacherId, level) => assignments.find((a) => a.teacher_id === teacherId && a.level === level);

  const toggle = async (teacherId, level) => {
    const key = `${teacherId}-${level}`;
    setPending(key);
    try {
      const existing = assignmentFor(teacherId, level);
      if (existing) {
        await removeTeacherGroupAssignment(existing.id);
      } else {
        await addTeacherGroupAssignment(teacherId, level);
      }
      await load();
    } catch (err) {
      setLoadError(err.message || 'Could not update assignment.');
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="rounded-xl bg-white p-5 shadow-card">
      <div className="mb-1 flex items-center gap-2">
        <Users2 size={18} className="text-brand-500" />
        <h2 className="font-display text-base font-bold text-ink">Teacher level assignments</h2>
      </div>
      <p className="mb-4 text-sm text-ink/60">Which levels each teacher can award ranking points for.</p>

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
      )}

      {teachers === null ? (
        <p className="text-sm text-ink/50">Loading teachers...</p>
      ) : teachers.length === 0 ? (
        <p className="text-sm text-ink/50">No teacher accounts yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink/5 text-xs uppercase text-ink/50">
              <tr>
                <th className="px-3 py-2">Teacher</th>
                {LEVELS.map((lvl) => (
                  <th key={lvl} className="px-3 py-2 text-center">
                    Level {lvl}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id} className="border-t border-ink/5">
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink">{t.full_name || '—'}</p>
                    <p className="text-xs text-ink/40">{t.email}</p>
                  </td>
                  {LEVELS.map((lvl) => {
                    const key = `${t.id}-${lvl}`;
                    const assigned = Boolean(assignmentFor(t.id, lvl));
                    return (
                      <td key={lvl} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={assigned}
                          disabled={pending === key}
                          onChange={() => toggle(t.id, lvl)}
                          className="h-4 w-4 accent-brand-500 disabled:opacity-40"
                          aria-label={`${t.full_name || t.email} - Level ${lvl}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
