// Homework.jsx
// Admin/teacher view: create, edit, delete homework, attach/replace a
// file, set a deadline, track status, and leave feedback. Students see
// their own assignments on the separate portal page
// src/pages/portal/MyHomework.jsx (same admin/portal split as Exams).

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, BookOpen, Pencil, Trash2, Paperclip, MessageSquare, Download, X, Image as ImageIcon } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';

const EMPTY_FORM = { title: '', level: 'A', description: '', due_date: new Date().toISOString().slice(0, 10), lesson_id: '' };
const STATUS_OPTIONS = ['Assigned', 'Submitted', 'Graded'];

export default function Homework() {
  const { t } = useTranslation(['homework', 'common']);
  const statusLabels = { Assigned: t('statusAssigned'), Submitted: t('statusSubmitted'), Graded: t('statusGraded') };
  const {
    students,
    homework,
    homeworkStatus,
    homeworkSubmissionFiles,
    lessons,
    addHomework,
    editHomework,
    removeHomework,
    setHomeworkStatusForStudent,
    error,
  } = useAcademy();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [selectedHomeworkId, setSelectedHomeworkId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deletingHomework, setDeletingHomework] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const sortedHomework = useMemo(() => [...homework].sort((a, b) => new Date(b.due_date) - new Date(a.due_date)), [homework]);
  const selected = sortedHomework.find((h) => h.id === selectedHomeworkId) || sortedHomework[0] || null;
  const editingHomework = editingId ? homework.find((h) => h.id === editingId) : null;

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

  // H4: a submission may be the legacy single answer_file_url, or one or
  // more homework_submission_files rows (multi-image) - never both for a
  // new submission, but both are checked so old and new data read the
  // same way.
  const filesOf = (studentId) =>
    homeworkSubmissionFiles
      .filter((f) => f.homework_id === selected?.id && f.student_id === studentId)
      .sort((a, b) => a.position - b.position);

  // Badges/filters are derived from answer_file_url/score/submission
  // files directly, not the manually-editable status dropdown - a
  // teacher can freely change status without that ever desyncing what
  // "submitted"/"graded" means.
  const gradingStateOf = (studentId) => {
    const current = statusOf(studentId);
    if (current.score != null) return 'graded';
    if (current.answer_file_url || filesOf(studentId).length > 0) return 'needsGrading';
    return 'notSubmitted';
  };

  const sortedLessons = useMemo(
    () => [...lessons].sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)),
    [lessons]
  );
  const lessonOf = (lessonId) => (lessonId ? lessons.find((l) => l.id === lessonId) : null);

  const filteredStudents = useMemo(
    () => activeStudents.filter((s) => statusFilter === 'all' || gradingStateOf(s.id) === statusFilter),
    [activeStudents, homeworkStatus, homeworkSubmissionFiles, selected, statusFilter]
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFile(null);
    setRemoveFile(false);
    setUploadError(null);
    setFormOpen(false);
    setEditingId(null);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setUploadError(null);
    try {
      const basePayload = {
        title: form.title,
        level: form.level || null,
        description: form.description || null,
        due_date: form.due_date,
        lesson_id: form.lesson_id || null,
      };

      if (editingId) {
        let payload = basePayload;
        if (file) {
          setUploading(true);
          try {
            const uploaded = await uploadAttachment(file, 'homework');
            payload = { ...payload, file_url: uploaded.path, file_name: uploaded.name, file_type: uploaded.type };
          } catch {
            setUploadError(t('uploadFailedEdit'));
            return;
          } finally {
            setUploading(false);
          }
        } else if (removeFile) {
          payload = { ...payload, file_url: null, file_name: null, file_type: null };
        }
        await editHomework(editingId, payload);
      } else {
        const record = await addHomework(basePayload);
        setSelectedHomeworkId(record.id);
        if (file) {
          setUploading(true);
          try {
            const uploaded = await uploadAttachment(file, 'homework');
            await editHomework(record.id, { file_url: uploaded.path, file_name: uploaded.name, file_type: uploaded.type });
          } catch {
            setUploadError(t('uploadFailedCreate'));
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

  const startEdit = (hw) => {
    setEditingId(hw.id);
    setForm({
      title: hw.title,
      level: hw.level || 'A',
      description: hw.description || '',
      due_date: hw.due_date,
      lesson_id: hw.lesson_id || '',
    });
    setFile(null);
    setRemoveFile(false);
    setUploadError(null);
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
      {uploadError && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{uploadError}</div>}

      {formOpen && (
        <form onSubmit={handleCreate} className="mb-4 grid gap-3 rounded-xl bg-white p-4 shadow-card sm:grid-cols-2">
          <input
            required
            placeholder={t('titlePlaceholder')}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="input sm:col-span-2"
          />
          <textarea
            placeholder={t('descriptionPlaceholder')}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="input sm:col-span-2"
          />
          <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="input">
            <option value="A">{t('common:levelA')}</option>
            <option value="B">{t('common:levelB')}</option>
            <option value="C">{t('common:levelC')}</option>
          </select>
          <select
            value={form.lesson_id}
            onChange={(e) => setForm({ ...form, lesson_id: e.target.value })}
            className="input sm:col-span-2"
          >
            <option value="">{t('noLinkedLesson')}</option>
            {sortedLessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.topic} · {new Date(l.scheduled_at).toLocaleDateString()}
              </option>
            ))}
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
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink/60 hover:text-ink">
              <Paperclip size={14} />
              {file ? file.name : editingHomework?.file_name && !removeFile ? t('replaceFile') : t('attachFileOptional')}
              <input
                type="file"
                accept=".pdf,.doc,.docx,image/*"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0] || null;
                  setFile(picked);
                  if (picked) setRemoveFile(false);
                }}
              />
            </label>
            {editingHomework?.file_url && !file && !removeFile && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenFile(editingHomework.file_url)}
                  className="flex items-center gap-1 text-xs font-semibold text-brand-500 hover:underline"
                >
                  <Download size={13} /> {editingHomework.file_name || t('homeworkFileDefault')}
                </button>
                <button
                  type="button"
                  onClick={() => setRemoveFile(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-inactive hover:underline"
                >
                  <X size={13} /> {t('removeFile')}
                </button>
              </>
            )}
            {removeFile && <span className="text-xs font-semibold text-inactive">{t('fileWillBeRemoved')}</span>}
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {uploading ? t('uploading') : saving ? t('common:saving') : editingId ? t('common:saveChanges') : t('addHomework')}
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
                  <p className="text-xs opacity-70">
                    {t('due', { date: h.due_date })}
                    {lessonOf(h.lesson_id) && ` · ${lessonOf(h.lesson_id).topic}`}
                  </p>
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
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink/50">{t('statusFor', { title: selected.title })}</h2>
              {lessonOf(selected.lesson_id) && (
                <p className="mt-0.5 text-xs text-ink/50">
                  {t('lessonLabel', {
                    topic: lessonOf(selected.lesson_id).topic,
                    date: new Date(lessonOf(selected.lesson_id).scheduled_at).toLocaleDateString(),
                  })}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-ink/10 px-2 py-1.5 text-xs"
              >
                <option value="all">{t('filterAll')}</option>
                <option value="notSubmitted">{t('notSubmitted')}</option>
                <option value="needsGrading">{t('needsGrading')}</option>
                <option value="graded">{t('statusGraded')}</option>
              </select>
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
            {filteredStudents.map((s) => {
              const current = statusOf(s.id);
              const graded = current.score != null;
              const gradingState = gradingStateOf(s.id);
              return (
                <div key={s.id} className="rounded-xl bg-white p-3 shadow-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-semibold text-ink">{s.real_name}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            gradingState === 'graded'
                              ? 'bg-brand-50 text-brand-600'
                              : gradingState === 'needsGrading'
                                ? 'bg-active/10 text-active'
                                : 'bg-ink/5 text-ink/40'
                          }`}
                        >
                          {gradingState === 'graded' ? t('statusGraded') : gradingState === 'needsGrading' ? t('needsGrading') : t('notSubmitted')}
                        </span>
                      </div>
                      {current.answer_file_url && (
                        <button
                          onClick={() => handleOpenFile(current.answer_file_url)}
                          className="mt-1 flex items-center gap-1 text-xs text-brand-500 hover:underline"
                        >
                          <Paperclip size={11} /> {current.answer_file_name || t('studentSubmissionDefault')}
                        </button>
                      )}
                      {filesOf(s.id).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {filesOf(s.id).map((f, i) => (
                            <button
                              key={f.id}
                              onClick={() => handleOpenFile(f.file_url)}
                              className="flex items-center gap-1 text-xs text-brand-500 hover:underline"
                            >
                              <ImageIcon size={11} /> {t('imageN', { n: i + 1 })}
                            </button>
                          ))}
                        </div>
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
                      <input
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={current.score ?? ''}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (val !== '' && Number(val) !== current.score) {
                            setHomeworkStatusForStudent(selected.id, s.id, 'Graded', Number(val), current.feedback);
                          }
                        }}
                        placeholder={t('scorePlaceholder')}
                        className="w-24 rounded-lg border border-ink/10 px-3 py-1.5 text-right text-sm"
                      />
                    </div>
                  </div>
                  {graded && (
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
