// LessonLibrary.jsx
// Admin/teacher view: a reusable catalog of lesson templates (title,
// description, level, optional reference file) - separate from the
// actual scheduled sessions in Lessons.jsx. Picking a template to start a
// new lesson from is a separate, follow-up change; this page only manages
// the catalog itself.

import { useState, useMemo } from 'react';
import { Plus, Library, Pencil, Trash2, Paperclip, Download } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';

const EMPTY_FORM = { title: '', description: '', level: 'A' };

export default function LessonLibrary() {
  const { lessonTemplates, addLessonTemplate, editLessonTemplate, removeLessonTemplate, error } = useAcademy();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deletingTemplate, setDeletingTemplate] = useState(null);

  const sortedTemplates = useMemo(
    () => [...lessonTemplates].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [lessonTemplates]
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFile(null);
    setFormOpen(false);
    setEditingId(null);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      let fileFields = {};
      if (file) {
        const uploaded = await uploadAttachment(file, 'lesson-templates');
        fileFields = { file_url: uploaded.path, file_name: uploaded.name, file_type: uploaded.type };
      }
      const payload = {
        title: form.title,
        description: form.description || null,
        level: form.level || null,
        ...fileFields,
      };
      if (editingId) {
        await editLessonTemplate(editingId, payload);
      } else {
        await addLessonTemplate(payload);
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (template) => {
    setEditingId(template.id);
    setForm({
      title: template.title,
      description: template.description || '',
      level: template.level || 'A',
    });
    setFile(null);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    await removeLessonTemplate(deletingTemplate.id);
    setDeletingTemplate(null);
  };

  const handleOpenFile = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Lesson Library</h1>
          <p className="mt-1 text-sm text-ink/50">Reusable lesson templates for recurring curriculum topics.</p>
        </div>
        <button
          onClick={() => (formOpen ? resetForm() : setFormOpen(true))}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Plus size={16} /> New template
        </button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      {formOpen && (
        <form onSubmit={handleCreate} className="mb-4 grid gap-3 rounded-xl bg-white p-4 shadow-card sm:grid-cols-2">
          <input
            required
            placeholder="Template title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="input sm:col-span-2"
          />
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="input resize-none sm:col-span-2"
          />
          <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="input">
            <option value="A">Level A</option>
            <option value="B">Level B</option>
            <option value="C">Level C</option>
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink/60 hover:text-ink sm:col-span-2">
            <Paperclip size={14} />
            {file ? file.name : editingId ? 'Replace reference file (optional)' : 'Attach reference file (optional)'}
            <input
              type="file"
              accept=".pdf,.doc,.docx,image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add template'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink/60">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {sortedTemplates.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No lesson templates yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedTemplates.map((t) => (
            <div key={t.id} className="flex flex-wrap items-start gap-3 rounded-xl bg-white p-3 shadow-card">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <Library size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-semibold text-ink">{t.title}</p>
                  {t.level && <LevelBadge level={t.level} />}
                </div>
                {t.description && <p className="mt-1 text-sm text-ink/60">{t.description}</p>}
                {t.file_url && (
                  <button
                    onClick={() => handleOpenFile(t.file_url)}
                    className="mt-2 flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                  >
                    <Download size={13} /> {t.file_name || 'Reference file'}
                  </button>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button onClick={() => startEdit(t)} className="rounded-md p-1.5 text-brand-500 hover:bg-brand-50" aria-label="Edit template">
                  <Pencil size={15} />
                </button>
                <button onClick={() => setDeletingTemplate(t)} className="rounded-md p-1.5 text-inactive hover:bg-inactive/10" aria-label="Delete template">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deletingTemplate && (
        <ConfirmDialog
          title="Delete lesson template?"
          message={`This will permanently remove "${deletingTemplate.title}" from the library. It won't affect any lessons already scheduled from it. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeletingTemplate(null)}
        />
      )}
    </div>
  );
}
