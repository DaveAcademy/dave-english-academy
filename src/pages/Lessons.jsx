// Lessons.jsx

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, CalendarClock, MessageSquare, MessageSquareOff, Paperclip, Download, X } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';

const EMPTY_FORM = { topic: '', group_name: '', level: 'A', scheduled_at: '', discussion_enabled: false };

export default function Lessons() {
  const { lessons, addLesson, editLesson, removeLesson, error } = useAcademy();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [file, setFile] = useState(null);
  const [removePdf, setRemovePdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [selectedLessonId, setSelectedLessonId] = useState(null);

  const sortedLessons = useMemo(() => [...lessons].sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)), [lessons]);
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
      scheduled_at: lesson.scheduled_at ? new Date(lesson.scheduled_at).toISOString().slice(0, 16) : '',
      discussion_enabled: !!lesson.discussion_enabled,
    });
    setFile(null);
    setRemovePdf(false);
    setUploadError(null);
    setFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.topic.trim() || !form.scheduled_at) return;
    setSaving(true);
    setUploadError(null);
    try {
      const basePayload = {
        topic: form.topic,
        group_name: form.group_name || null,
        level: form.level || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        discussion_enabled: form.discussion_enabled,
      };

      if (editingId) {
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
        const record = await addLesson(basePayload);
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

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Lessons</h1>
          <p className="mt-1 text-sm text-ink/50">Schedule and manage lesson sessions.</p>
        </div>
        <button
          onClick={() => (formOpen ? resetForm() : setFormOpen(true))}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Plus size={16} /> Schedule lesson
        </button>
      </header>

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
                  {l.pdf_path && <span className="rounded-full bg-active/20 px-1.5 py-0.5 text-[10px] font-bold">PDF attached</span>}
                </div>
              </div>
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
          ))}
        </div>
      )}

    </div>
  );
}
