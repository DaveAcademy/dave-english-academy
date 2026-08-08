// Lessons.jsx

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, MessageSquare, MessageSquareOff, Paperclip, Download, X, Clock } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';
import { LEVELS } from '../lib/levels';

const EMPTY_FORM = { topic: '', group_name: '', level: 'A', discussion_enabled: false };

export default function Lessons() {
  const { lessons, curriculumLessons, curriculumProgress, addLesson, editLesson, removeLesson, advanceCurriculumProgress, error } = useAcademy();
  const [progressDrafts, setProgressDrafts] = useState({});
  const [progressSaving, setProgressSaving] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [file, setFile] = useState(null);
  const [removePdf, setRemovePdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all'); // all | curriculum | legacy

  // Permanent curriculum order: every curriculum_lessons row (ascending by
  // lesson_number) becomes one row here - either the real lesson attached to
  // it, or a "coming soon" placeholder if no lessons row exists yet for it.
  // Review/test/activity/final_exam curriculum entries are teacher-triggered
  // events, not planned teaching slots, so they never render as placeholders
  // (matches the "reviews/exams are not curriculum lessons" rule). Legacy
  // lessons (no curriculum_lesson_id) have no fixed position, so they're
  // appended after the curriculum, newest first - this ordering must never
  // depend on lessons.id/created_at/upload date for the curriculum rows
  // themselves.
  const orderedRows = useMemo(() => {
    const byCurriculumId = new Map();
    const legacy = [];
    for (const l of lessons) {
      if (l.curriculum_lesson_id != null) byCurriculumId.set(l.curriculum_lesson_id, l);
      else legacy.push(l);
    }
    const curriculumRows = curriculumLessons
      .filter((cl) => byCurriculumId.has(cl.id) || cl.lesson_type === 'normal')
      .map((cl) => {
        const lesson = byCurriculumId.get(cl.id);
        return lesson
          ? { kind: 'lesson', key: `lesson-${lesson.id}`, lesson, curriculum: cl }
          : { kind: 'placeholder', key: `placeholder-${cl.id}`, curriculum: cl };
      });
    const legacyRows = [...legacy]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((l) => ({ kind: 'lesson', key: `lesson-${l.id}`, lesson: l, curriculum: null }));
    return [...curriculumRows, ...legacyRows];
  }, [lessons, curriculumLessons]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orderedRows.filter((row) => {
      const isCurriculum = !!row.curriculum;
      if (scopeFilter === 'curriculum' && !isCurriculum) return false;
      if (scopeFilter === 'legacy' && isCurriculum) return false;
      if (!q) return true;
      const lessonNumber = row.curriculum?.lesson_number;
      const title = row.kind === 'placeholder' ? row.curriculum.title : row.lesson.topic;
      return (
        title?.toLowerCase().includes(q) ||
        row.curriculum?.title?.toLowerCase().includes(q) ||
        (lessonNumber != null && String(lessonNumber) === q)
      );
    });
  }, [orderedRows, search, scopeFilter]);

  // Preserves whatever order filteredRows already has (curriculum order) -
  // does not re-sort by id/created_at.
  const sortedLessons = useMemo(() => filteredRows.filter((row) => row.kind === 'lesson').map((row) => row.lesson), [filteredRows]);
  const selectedLesson = sortedLessons.find((l) => l.id === selectedLessonId) || sortedLessons[0] || null;
  const editingLesson = editingId ? lessons.find((l) => l.id === editingId) : null;

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFile(null);
    setRemovePdf(false);
    setUploadError(null);
    setFormOpen(false);
    setEditingId(null);
  };

  const startEdit = (lesson) => {
    setEditingId(lesson.id);
    setForm({
      topic: lesson.topic,
      group_name: lesson.group_name || '',
      level: lesson.level || 'A',
      discussion_enabled: !!lesson.discussion_enabled,
    });
    setFile(null);
    setRemovePdf(false);
    setUploadError(null);
    setFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.topic.trim()) return;
    setSaving(true);
    setUploadError(null);
    try {
      const basePayload = {
        topic: form.topic,
        group_name: form.group_name || null,
        level: form.level || null,
        discussion_enabled: form.discussion_enabled,
      };

      if (editingId) {
        // scheduled_at is intentionally left out of the edit payload - it's
        // no longer surfaced in this UI, and existing values (real or
        // otherwise) are left exactly as they are.
        let payload = basePayload;
        if (file) {
          setUploading(true);
          try {
            const uploaded = await uploadAttachment(file, `lesson-pdfs/${editingId}`);
            payload = { ...payload, pdf_path: uploaded.path, pdf_name: uploaded.name };
          } catch {
            setUploadError('Could not upload the PDF. Lesson changes were not saved - please try again.');
            return;
          } finally {
            setUploading(false);
          }
        } else if (removePdf) {
          payload = { ...payload, pdf_path: null, pdf_name: null };
        }
        await editLesson(editingId, payload);
      } else {
        // lessons.scheduled_at is still a NOT NULL column (see 0005) and
        // this task deliberately avoids a migration to relax that, so
        // creation still has to supply a value - it's just no longer
        // something the admin/teacher sets. Filled with "now" and never
        // shown or treated as meaningful; sorting/display everywhere else
        // in this feature uses created_at instead, exactly because this
        // value is filler.
        const record = await addLesson({ ...basePayload, scheduled_at: new Date().toISOString() });
        setSelectedLessonId(record.id);
        if (file) {
          setUploading(true);
          try {
            const uploaded = await uploadAttachment(file, `lesson-pdfs/${record.id}`);
            await editLesson(record.id, { pdf_path: uploaded.path, pdf_name: uploaded.name });
          } catch {
            setUploadError('Lesson was created, but the PDF failed to upload. Open "Edit" on it to try again.');
          } finally {
            setUploading(false);
          }
        }
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await removeLesson(id);
    if (selectedLessonId === id) setSelectedLessonId(null);
    if (editingId === id) resetForm();
  };

  const handleOpenPdf = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const progressDraftFor = (level) => {
    const current = curriculumProgress.find((p) => p.level === level)?.current_lesson_number ?? 0;
    return progressDrafts[level] ?? String(current);
  };
  const handleProgressSave = async (level) => {
    const n = Number(progressDraftFor(level));
    if (!Number.isInteger(n) || n < 0) return;
    setProgressSaving(level);
    try {
      await advanceCurriculumProgress(level, n);
      setProgressDrafts((prev) => ({ ...prev, [level]: undefined }));
    } finally {
      setProgressSaving(null);
    }
  };

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Lessons</h1>
          <p className="mt-1 text-sm text-ink/50">Create and manage lessons.</p>
        </div>
        <button
          onClick={() => (formOpen ? resetForm() : setFormOpen(true))}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Plus size={16} /> Add lesson
        </button>
      </header>

      <div className="mb-4 grid gap-2 rounded-xl bg-white p-4 shadow-card sm:grid-cols-3">
        {LEVELS.map((level) => (
          <div key={level} className="flex items-center gap-2">
            <LevelBadge level={level} />
            <span className="text-xs text-ink/50">is on lesson</span>
            <input
              type="number"
              min="0"
              value={progressDraftFor(level)}
              onChange={(e) => setProgressDrafts((prev) => ({ ...prev, [level]: e.target.value }))}
              className="input w-16 px-2 py-1 text-sm"
            />
            <button
              onClick={() => handleProgressSave(level)}
              disabled={progressSaving === level}
              className="rounded-lg bg-brand-500 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {progressSaving === level ? 'Saving...' : 'Update'}
            </button>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by lesson number or title..."
          className="input max-w-xs"
        />
        <div className="flex overflow-hidden rounded-lg border border-ink/15 text-xs font-semibold">
          {[
            ['all', 'All'],
            ['curriculum', 'Shared Curriculum'],
            ['legacy', 'Legacy'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setScopeFilter(value)}
              className={`px-3 py-2 ${scopeFilter === value ? 'bg-brand-500 text-white' : 'bg-white text-ink/60 hover:bg-ink/5'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}
      {uploadError && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{uploadError}</div>}

      {formOpen && (
        <form onSubmit={handleSubmit} className="mb-4 grid gap-3 rounded-xl bg-white p-4 shadow-card sm:grid-cols-2">
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
          <label className="flex items-center gap-2 text-sm text-ink/70 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.discussion_enabled}
              onChange={(e) => setForm({ ...form, discussion_enabled: e.target.checked })}
              className="h-4 w-4 rounded border-ink/20"
            />
            Allow students to discuss this lesson in Messages
          </label>

          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink/60 hover:text-ink">
              <Paperclip size={14} />
              {file ? file.name : editingLesson?.pdf_name && !removePdf ? 'Replace PDF' : 'Attach PDF'}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0] || null;
                  setFile(picked);
                  if (picked) setRemovePdf(false);
                }}
              />
            </label>
            {editingLesson?.pdf_path && !file && !removePdf && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenPdf(editingLesson.pdf_path)}
                  className="flex items-center gap-1 text-xs font-semibold text-brand-500 hover:underline"
                >
                  <Download size={13} /> {editingLesson.pdf_name || 'Current PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => setRemovePdf(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-inactive hover:underline"
                >
                  <X size={13} /> Remove PDF
                </button>
              </>
            )}
            {removePdf && <span className="text-xs font-semibold text-inactive">PDF will be removed on save</span>}
          </div>

          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {uploading ? 'Uploading PDF...' : saving ? 'Saving...' : editingId ? 'Save changes' : 'Add lesson'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink/60">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {filteredRows.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No lessons yet</p>
        </div>
      ) : (
        <div className="mb-4 space-y-2">
          {filteredRows.map((row) => {
            if (row.kind === 'placeholder') {
              const cl = row.curriculum;
              return (
                <div key={row.key} className="flex items-center justify-between rounded-xl border-2 border-dashed border-ink/10 bg-white/60 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink/50">
                      <span className="opacity-70">#{cl.lesson_number} · </span>
                      {cl.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-80">
                      <span className="flex items-center gap-1 rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] font-bold text-ink/50">
                        <Clock size={10} /> Coming Soon
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setForm({ ...EMPTY_FORM, topic: cl.title });
                      setFormOpen(true);
                    }}
                    className="flex-shrink-0 rounded-md p-1.5 text-ink/40 hover:bg-ink/5"
                    aria-label="Create this lesson"
                    title="Create this lesson"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              );
            }
            const l = row.lesson;
            return (
            <div
              key={row.key}
              className={`flex items-center justify-between rounded-xl p-3 shadow-card ${
                selectedLesson?.id === l.id ? 'bg-brand-500 text-white' : 'bg-white text-ink'
              }`}
            >
              <Link to={`/lessons/${l.id}`} className="min-w-0 flex-1" title="Open Lesson Hub">
                <p className="font-semibold hover:underline">
                  {l.curriculum_lessons && <span className="opacity-70">#{l.curriculum_lessons.lesson_number} · </span>}
                  {l.topic}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-80">
                  {l.curriculum_lessons ? (
                    <span className="rounded-full bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-bold">Shared Curriculum</span>
                  ) : (
                    <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] font-bold">Legacy</span>
                  )}
                  {l.group_name && <span>{l.group_name}</span>}
                  {l.level && <LevelBadge level={l.level} />}
                  {l.discussion_enabled && <span className="rounded-full bg-active/20 px-1.5 py-0.5 text-[10px] font-bold">Discussion on</span>}
                  {l.pdf_path ? (
                    <span className="rounded-full bg-active/20 px-1.5 py-0.5 text-[10px] font-bold">📄 PDF attached</span>
                  ) : (
                    <span className="rounded-full bg-inactive/20 px-1.5 py-0.5 text-[10px] font-bold">⚠️ No PDF</span>
                  )}
                  <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] font-bold">📚 {l.vocabulary_count} words</span>
                </div>
              </Link>
              <div className="flex flex-shrink-0 items-center gap-1">
                {l.pdf_path && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenPdf(l.pdf_path);
                    }}
                    className={`rounded-md p-1.5 ${selectedLesson?.id === l.id ? 'text-white/80 hover:bg-white/10' : 'text-ink/40 hover:bg-ink/5'}`}
                    aria-label="Open PDF"
                    title="Open PDF"
                  >
                    <Download size={15} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(l);
                  }}
                  className={`rounded-md p-1.5 ${selectedLesson?.id === l.id ? 'text-white/80 hover:bg-white/10' : 'text-ink/40 hover:bg-ink/5'}`}
                  aria-label="Edit lesson"
                  title="Edit lesson"
                >
                  <Pencil size={15} />
                </button>
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
            );
          })}
        </div>
      )}

    </div>
  );
}
