// Rankings.jsx

import { useMemo } from 'react';
import { useAcademy } from '../lib/AcademyDataContext';
import { rankStudentsByPoints } from '../utils/points';

export default function Rankings() {
  const { students, lessonAttendance, exams, examScores, homeworkStatus } = useAcademy();

  const activeStudents = useMemo(() => students.filter((s) => s.status === 'Active'), [students]);

  const ranked = useMemo(
    () => rankStudentsByPoints(activeStudents, { lessonAttendance, examScores, exams, homeworkStatus }),
    [activeStudents, lessonAttendance, examScores, exams, homeworkStatus]
  );

  const medal = (i) => (i === 0 ? 'bg-levelB' : i === 1 ? 'bg-ink/20' : i === 2 ? 'bg-levelA' : 'bg-ink/5');
  const medalText = (i) => (i <= 2 ? 'text-white' : 'text-ink/50');

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Rankings</h1>
        <p className="mt-1 text-sm text-ink/50">
          Points from lesson attendance, exam scores, and homework combined.
        </p>
      </header>

      {ranked.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No data yet</p>
          <p className="mt-1 text-sm text-ink/50">Mark lesson attendance, exams, or homework to see rankings here.</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ranked.map(({ student, points }, i) => (
            <div key={student.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card">
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${medal(i)} ${medalText(i)}`}>
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-ink">{student.real_name}</p>
              </div>
              <p className="text-sm font-bold text-brand-500">{points} pts</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
