// Lessons.jsx

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, CheckCircle2, Clock, XCircle, Trash2, CalendarClock, MessageSquare, MessageSquareOff } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';

const EMPTY_FORM = { topic: '', group_name: '', level: 'A', scheduled_at: '', discussion_enabled: false };

export default function Lessons() {
  const { students, lessons, lessonAttendance, addLesson, editLesson, removeLesson, markLessonAttendance, error } = useAcademy();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState(null);

  const sortedLessons = useMemo(() => [...lessons].sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)), [lessons]);
  const selectedLesson = sortedLessons.find((l) => l.id === selectedLessonId) || sortedLessons[0] || null;

  const activeStudents = useMemo(
    () => [...students].filter((s) => s.status === 'Active').sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students]
  );

  const statusOf = (studentId) =>
    lessonAttendance.find((a) => a.lesson_id === selectedLesson?.id && a.student_id === studentId)?.status || null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.topic.trim() || !form.scheduled_at) return;
    setSaving(true);
    try {
      const record = await addLesson({
        topic: form.topic,
        group_name: form.group_name || null,
        level: form.level || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        discussion_enabled: form.discussion_enabled,
      });
      setSelectedLessonId(record.id);
      setForm(EMPTY_FORM);
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await removeLesson(id);
    if (selectedLessonId === id) setSelectedLessonId(null);
  };

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Lessons</h1>
          <p className="mt-1 text-sm text-ink/50">Schedule sessions and mark who attended.</p>
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Plus size={16} /> Schedule lesson
        </button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      {formOpen && (
        <form onSubmit={handleCreate} className="mb-4 grid gap-3 rounded-xl bg-white p-4 shadow-card sm:grid-cols-2">
          <input
            required
            placeholder="Topic"
            value={form.topic}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
            className="input sm:col-span-2"
          />
          <input
            placeholder="Group (optional)"
            value={form.group_name}
            onChange={(e) => setForm({ ...form, group_name: e.target.value })}
            className="input"
          />
          <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="input">
            <option value="A">Level A</option>
            <option value="B">Level B</option>
            <option value="C">Level C</option>
          </select>
          <input
            required
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            className="input sm:col-span-2"
          />
          <label className="flex items-center gap-2 text-sm text-ink/70 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.discussion_enabled}
              onChange={(e) => setForm({ ...form, discussion_enabled: e.target.checked })}
              className="h-4 w-4 rounded border-ink/20"
            />
            Allow students to discuss this lesson in Messages
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 sm:col-span-2"
          >
            {saving ? 'Saving...' : 'Add lesson'}
          </button>
        </form>
      )}

      {sortedLessons.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No lessons scheduled yet</p>
        </div>
      ) : (
        <div className="mb-4 space-y-2">
          {sortedLessons.map((l) => (
            <div
              key={l.id}
              onClick={() => setSelectedLessonId(l.id)}
              className={`flex cursor-pointer items-center justify-between rounded-xl p-3 shadow-card ${
                selectedLesson?.id === l.id ? 'bg-brand-500 text-white' : 'bg-white text-ink'
              }`}
            >
              <div>
                <p className="font-semibold">{l.topic}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-80">
                  <CalendarClock size={12} /> {new Date(l.scheduled_at).toLocaleString()}
                  {l.group_name && <span>· {l.group_name}</span>}
                  {l.level && <LevelBadge level={l.level} />}
                  {l.discussion_enabled && <span className="rounded-full bg-active/20 px-1.5 py-0.5 text-[10px] font-bold">Discussion on</span>}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    editLesson(l.id, { discussion_enabled: !l.discussion_enabled });
                  }}
                  className={`rounded-md p-1.5 ${selectedLesson?.id === l.id ? 'text-white/80 hover:bg-white/10' : 'text-ink/40 hover:bg-ink/5'}`}
                  aria-label={l.discussion_enabled ? 'Disable discussion' : 'Enable discussion'}
                  title={l.discussion_enabled ? 'Disable student discussion' : 'Enable student discussion'}
                >
                  {l.discussion_enabled ? <MessageSquareOff size={15} /> : <MessageSquare size={15} />}
                </button>
                <Link
                  to={`/chat?type=lesson&id=${l.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className={`rounded-md p-1.5 ${selectedLesson?.id === l.id ? 'text-white/80 hover:bg-white/10' : 'text-ink/40 hover:bg-ink/5'}`}
                  aria-label="Open discussion"
                >
                  <MessageSquare size={15} />
                </Link>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(l.id);
                  }}
                  className={`rounded-md p-1.5 ${selectedLesson?.id === l.id ? 'text-white/80 hover:bg-white/10' : 'text-inactive hover:bg-inactive/10'}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedLesson && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-ink/50">
            Attendance for "{selectedLesson.topic}"
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeStudents.map((s) => {
              const current = statusOf(s.id);
              return (
                <div key={s.id} className="rounded-xl bg-white p-3 shadow-card">
                  <p className="mb-2 font-semibold text-ink">{s.real_name}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => markLessonAttendance(selectedLesson.id, s.id, 'Present')}
                      className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold ${
                        current === 'Present' ? 'bg-active text-white' : 'bg-ink/5 text-ink/50'
                      }`}
                    >
                      <CheckCircle2 size={14} /> Present
                    </button>
                    <button
                      onClick={() => markLessonAttendance(selectedLesson.id, s.id, 'Late')}
                      className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold ${
                        current === 'Late' ? 'bg-levelB text-white' : 'bg-ink/5 text-ink/50'
                      }`}
                    >
                      <Clock size={14} /> Late
                    </button>
                    <button
                      onClick={() => markLessonAttendance(selectedLesson.id, s.id, 'Absent')}
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
        </>
      )}
    </div>
  );
}
