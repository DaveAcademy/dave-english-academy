// Homework.jsx
// Admin/teacher view: create, edit, delete homework, attach/replace a
// file, set a deadline, track status, and leave feedback. Students see
// their own assignments on the separate portal page
// src/pages/portal/MyHomework.jsx (same admin/portal split as Exams).

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, BookOpen, Pencil, Trash2, Paperclip, MessageSquare, Download } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';

const EMPTY_FORM = { title: '', level: 'A', due_date: new Date().toISOString().slice(0, 10) };
const STATUS_OPTIONS = ['Assigned', 'Submitted', 'Graded'];

export default function Homework() {
  const { t } = useTranslation(['homework', 'common']);
  const statusLabels = { Assigned: t('statusAssigned'), Submitted: t('statusSubmitted'), Graded: t('statusGraded') };
  const { students, homework, homeworkStatus, addHomework, editHomework, removeHomework, setHomeworkStatusForStudent, error } =
    useAcademy();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedHomeworkId, setSelectedHomeworkId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deletingHomework, setDeletingHomework] = useState(null);

  const sortedHomework = useMemo(() => [...homework].sort((a, b) => new Date(b.due_date) - new Date(a.due_date)), [homework]);
  const selected = sortedHomework.find((h) => h.id === selectedHomeworkId) || sortedHomework[0] || null;

  const activeStudents = useMemo(
    () => [...students].filter((s) => s.status === 'Active').sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students]
  );

  const statusOf = (studentId) =>
    homeworkStatus.find((h) => h.homework_id === selected?.id && h.student_id === studentId) || {
      status: 'Assigned',
      score: null,
      feedback: null,
      answer_file_url: null,
      answer_file_name: null,
    };

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
        const uploaded = await uploadAttachment(file, 'homework');
        fileFields = { file_url: uploaded.path, file_name: uploaded.name, file_type: uploaded.type };
      }
      const payload = { title: form.title, level: form.level || null, due_date: form.due_date, ...fileFields };
      if (editingId) {
        await editHomework(editingId, payload);
      } else {
        const record = await addHomework(payload);
        setSelectedHomeworkId(record.id);
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (hw) => {
    setEditingId(hw.id);
    setForm({ title: hw.title, level: hw.level || 'A', due_date: hw.due_date });
    setFile(null);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    await removeHomework(deletingHomework.id);
    if (selectedHomeworkId === deletingHomework.id) setSelectedHomeworkId(null);
    setDeletingHomework(null);
  };

  const handleOpenFile = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink/50">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => (formOpen ? resetForm() : setFormOpen(true))}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <Plus size={16} /> {t('newHomework')}
        </button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      {formOpen && (
        <form onSubmit={handleCreate} className="mb-4 grid gap-3 rounded-xl bg-white p-4 shadow-card sm:grid-cols-2">
          <input
            required
            placeholder={t('titlePlaceholder')}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="input sm:col-span-2"
          />
          <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="input">
            <option value="A">{t('common:levelA')}</option>
            <option value="B">{t('common:levelB')}</option>
            <option value="C">{t('common:levelC')}</option>
          </select>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink/50">{t('deadlineLabel')}</label>
            <input
              required
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="input"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink/60 hover:text-ink sm:col-span-2">
            <Paperclip size={14} />
            {file ? file.name : editingId ? t('replaceFile') : t('attachFileOptional')}
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
              {saving ? t('common:saving') : editingId ? t('common:saveChanges') : t('addHomework')}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink/60">
                {t('common:cancel')}
              </button>
            )}
          </div>
        </form>
      )}

      {sortedHomework.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('noHomeworkAssignedYet')}</p>
        </div>
      ) : (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {sortedHomework.map((h) => (
            <div
              key={h.id}
              className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 shadow-card ${
                selected?.id === h.id ? 'bg-brand-500 text-white' : 'bg-white text-ink'
              }`}
            >
              <button onClick={() => setSelectedHomeworkId(h.id)} className="flex items-center gap-2 text-left">
                <BookOpen size={16} />
                <div>
                  <p className="text-sm font-semibold">{h.title}</p>
                  <p className="text-xs opacity-70">{t('due', { date: h.due_date })}</p>
                </div>
                {h.level && <LevelBadge level={h.level} />}
              </button>
              <button onClick={() => startEdit(h)} className={selected?.id === h.id ? 'text-white/80 hover:text-white' : 'text-brand-500 hover:bg-brand-50'} aria-label={t('editHomeworkAria')}>
                <Pencil size={14} />
              </button>
              <button onClick={() => setDeletingHomework(h)} className={selected?.id === h.id ? 'text-white/80 hover:text-white' : 'text-inactive hover:bg-inactive/10'} aria-label={t('deleteHomeworkAria')}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink/50">{t('statusFor', { title: selected.title })}</h2>
            <div className="flex items-center gap-2">
              {selected.file_url && (
                <button
                  onClick={() => handleOpenFile(selected.file_url)}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                >
                  <Download size={13} /> {selected.file_name || t('homeworkFileDefault')}
                </button>
              )}
              <Link
                to={`/chat?type=homework&id=${selected.id}`}
                className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
              >
                <MessageSquare size={13} /> {t('discuss')}
              </Link>
            </div>
          </div>
          <div className="space-y-2">
            {activeStudents.map((s) => {
              const current = statusOf(s.id);
              return (
                <div key={s.id} className="rounded-xl bg-white p-3 shadow-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{s.real_name}</p>
                      {current.answer_file_url && (
                        <button
                          onClick={() => handleOpenFile(current.answer_file_url)}
                          className="mt-1 flex items-center gap-1 text-xs text-brand-500 hover:underline"
                        >
                          <Paperclip size={11} /> {current.answer_file_name || t('studentSubmissionDefault')}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={current.status}
                        onChange={(e) => setHomeworkStatusForStudent(selected.id, s.id, e.target.value, current.score, current.feedback)}
                        className="rounded-lg border border-ink/10 px-2 py-1.5 text-sm"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {statusLabels[opt]}
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
                            if (val !== '') setHomeworkStatusForStudent(selected.id, s.id, 'Graded', Number(val), current.feedback);
                          }}
                          placeholder={t('scorePlaceholder')}
                          className="w-24 rounded-lg border border-ink/10 px-3 py-1.5 text-right text-sm"
                        />
                      )}
                    </div>
                  </div>
                  {current.status === 'Graded' && (
                    <input
                      defaultValue={current.feedback || ''}
                      key={`${s.id}-${current.feedback || ''}`}
                      onBlur={(e) => {
                        if (e.target.value !== (current.feedback || '')) {
                          setHomeworkStatusForStudent(selected.id, s.id, 'Graded', current.score, e.target.value || null);
                        }
                      }}
                      placeholder={t('feedbackPlaceholder')}
                      className="mt-2 w-full rounded-lg border border-ink/10 px-3 py-1.5 text-sm"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {deletingHomework && (
        <ConfirmDialog
          title={t('deleteHomeworkTitle')}
          message={t('deleteHomeworkMessage', { title: deletingHomework.title })}
          confirmLabel={t('common:delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingHomework(null)}
        />
      )}
    </div>
  );
}
