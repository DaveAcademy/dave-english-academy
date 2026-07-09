// Exams.jsx

import { useState, useMemo } from 'react';
import { Plus, FileCheck2 } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';

const EMPTY_FORM = { title: '', level: 'A', exam_date: new Date().toISOString().slice(0, 10), max_score: 100 };

export default function Exams() {
  const { students, exams, examScores, addExam, setExamScoreForStudent, error } = useAcademy();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState(null);

  const sortedExams = useMemo(() => [...exams].sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date)), [exams]);
  const selectedExam = sortedExams.find((e) => e.id === selectedExamId) || sortedExams[0] || null;

  const activeStudents = useMemo(
    () => [...students].filter((s) => s.status === 'Active').sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students]
  );

  const scoreOf = (studentId) => examScores.find((s) => s.exam_id === selectedExam?.id && s.student_id === studentId)?.score ?? '';

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const record = await addExam({
        title: form.title,
        level: form.level || null,
        exam_date: form.exam_date,
        max_score: Number(form.max_score) || 100,
      });
      setSelectedExamId(record.id);
      setForm(EMPTY_FORM);
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Exams</h1>
          <p className="mt-1 text-sm text-ink/50">Create exams and enter scores.</p>
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Plus size={16} /> New exam
        </button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      {formOpen && (
        <form onSubmit={handleCreate} className="mb-4 grid gap-3 rounded-xl bg-white p-4 shadow-card sm:grid-cols-2">
          <input
            required
            placeholder="Exam title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="input sm:col-span-2"
          />
          <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="input">
            <option value="A">Level A</option>
            <option value="B">Level B</option>
            <option value="C">Level C</option>
          </select>
          <input
            type="number"
            min="1"
            placeholder="Max score"
            value={form.max_score}
            onChange={(e) => setForm({ ...form, max_score: e.target.value })}
            className="input"
          />
          <input
            required
            type="date"
            value={form.exam_date}
            onChange={(e) => setForm({ ...form, exam_date: e.target.value })}
            className="input sm:col-span-2"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 sm:col-span-2"
          >
            {saving ? 'Saving...' : 'Add exam'}
          </button>
        </form>
      )}

      {sortedExams.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No exams yet</p>
        </div>
      ) : (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {sortedExams.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelectedExamId(e.id)}
              className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left shadow-card ${
                selectedExam?.id === e.id ? 'bg-brand-500 text-white' : 'bg-white text-ink'
              }`}
            >
              <FileCheck2 size={16} />
              <div>
                <p className="text-sm font-semibold">{e.title}</p>
                <p className="text-xs opacity-70">{e.exam_date} · out of {e.max_score}</p>
              </div>
              {e.level && <LevelBadge level={e.level} />}
            </button>
          ))}
        </div>
      )}

      {selectedExam && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-ink/50">
            Scores for "{selectedExam.title}" (out of {selectedExam.max_score})
          </h2>
          <div className="space-y-2">
            {activeStudents.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
                <p className="font-semibold text-ink">{s.real_name}</p>
                <input
                  type="number"
                  min="0"
                  max={selectedExam.max_score}
                  defaultValue={scoreOf(s.id)}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val !== '' && val !== String(scoreOf(s.id))) {
                      setExamScoreForStudent(selectedExam.id, s.id, Number(val));
                    }
                  }}
                  placeholder="Score"
                  className="w-24 rounded-lg border border-ink/10 px-3 py-1.5 text-right text-sm"
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
