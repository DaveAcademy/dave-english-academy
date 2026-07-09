// Homework.jsx

import { useState, useMemo } from 'react';
import { Plus, BookOpen } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';

const EMPTY_FORM = { title: '', level: 'A', due_date: new Date().toISOString().slice(0, 10) };
const STATUS_OPTIONS = ['Assigned', 'Submitted', 'Graded'];

export default function Homework() {
  const { students, homework, homeworkStatus, addHomework, setHomeworkStatusForStudent, error } = useAcademy();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selectedHomeworkId, setSelectedHomeworkId] = useState(null);

  const sortedHomework = useMemo(() => [...homework].sort((a, b) => new Date(b.due_date) - new Date(a.due_date)), [homework]);
  const selected = sortedHomework.find((h) => h.id === selectedHomeworkId) || sortedHomework[0] || null;

  const activeStudents = useMemo(
    () => [...students].filter((s) => s.status === 'Active').sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students]
  );

  const statusOf = (studentId) =>
    homeworkStatus.find((h) => h.homework_id === selected?.id && h.student_id === studentId) || { status: 'Assigned', score: null };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const record = await addHomework({ title: form.title, level: form.level || null, due_date: form.due_date });
      setSelectedHomeworkId(record.id);
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
          <h1 className="font-display text-2xl font-bold text-ink">Homework</h1>
          <p className="mt-1 text-sm text-ink/50">Assign homework and track status.</p>
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Plus size={16} /> New homework
        </button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      {formOpen && (
        <form onSubmit={handleCreate} className="mb-4 grid gap-3 rounded-xl bg-white p-4 shadow-card sm:grid-cols-2">
          <input
            required
            placeholder="Homework title"
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
            required
            type="date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            className="input"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 sm:col-span-2"
          >
            {saving ? 'Saving...' : 'Add homework'}
          </button>
        </form>
      )}

      {sortedHomework.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No homework assigned yet</p>
        </div>
      ) : (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {sortedHomework.map((h) => (
            <button
              key={h.id}
              onClick={() => setSelectedHomeworkId(h.id)}
              className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left shadow-card ${
                selected?.id === h.id ? 'bg-brand-500 text-white' : 'bg-white text-ink'
              }`}
            >
              <BookOpen size={16} />
              <div>
                <p className="text-sm font-semibold">{h.title}</p>
                <p className="text-xs opacity-70">Due {h.due_date}</p>
              </div>
              {h.level && <LevelBadge level={h.level} />}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-ink/50">Status for "{selected.title}"</h2>
          <div className="space-y-2">
            {activeStudents.map((s) => {
              const current = statusOf(s.id);
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-card">
                  <p className="font-semibold text-ink">{s.real_name}</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={current.status}
                      onChange={(e) => setHomeworkStatusForStudent(selected.id, s.id, e.target.value, current.score)}
                      className="rounded-lg border border-ink/10 px-2 py-1.5 text-sm"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    {current.status === 'Graded' && (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={current.score ?? ''}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (val !== '') setHomeworkStatusForStudent(selected.id, s.id, 'Graded', Number(val));
                        }}
                        placeholder="Score /100"
                        className="w-24 rounded-lg border border-ink/10 px-3 py-1.5 text-right text-sm"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
