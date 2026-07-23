// Exams.jsx
// Admin/teacher view: create, edit, delete exams, attach/replace a file,
// set a deadline, and enter scores. Students see their own assigned exams
// on the separate portal page src/pages/portal/MyExams.jsx (RLS-backed,
// not a filtered version of this page - same structural split the rest of
// the app already uses between admin/teacher pages and the student portal).

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, FileCheck2, Pencil, Trash2, Paperclip, MessageSquare, Download } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';

const EMPTY_FORM = { title: '', level: 'A', exam_date: new Date().toISOString().slice(0, 10), deadline: '', max_score: 100 };

export default function Exams() {
  const { t } = useTranslation(['exams', 'common']);
  const { students, exams, examScores, addExam, editExam, removeExam, setExamScoreForStudent, error } = useAcademy();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deletingExam, setDeletingExam] = useState(null);

  const sortedExams = useMemo(() => [...exams].sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date)), [exams]);
  const selectedExam = sortedExams.find((e) => e.id === selectedExamId) || sortedExams[0] || null;

  const activeStudents = useMemo(
    () => [...students].filter((s) => s.status === 'Active').sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students]
  );

  const scoreOf = (studentId) => examScores.find((s) => s.exam_id === selectedExam?.id && s.student_id === studentId)?.score ?? '';
  const answerOf = (studentId) => examScores.find((s) => s.exam_id === selectedExam?.id && s.student_id === studentId);

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
        const uploaded = await uploadAttachment(file, 'exams');
        fileFields = { file_url: uploaded.path, file_name: uploaded.name, file_type: uploaded.type };
      }
      const payload = {
        title: form.title,
        level: form.level || null,
        exam_date: form.exam_date,
        deadline: form.deadline || null,
        max_score: Number(form.max_score) || 100,
        ...fileFields,
      };
      if (editingId) {
        await editExam(editingId, payload);
      } else {
        const record = await addExam(payload);
        setSelectedExamId(record.id);
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (exam) => {
    setEditingId(exam.id);
    setForm({
      title: exam.title,
      level: exam.level || 'A',
      exam_date: exam.exam_date,
      deadline: exam.deadline ? exam.deadline.slice(0, 10) : '',
      max_score: exam.max_score,
    });
    setFile(null);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    await removeExam(deletingExam.id);
    if (selectedExamId === deletingExam.id) setSelectedExamId(null);
    setDeletingExam(null);
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
          <Plus size={16} /> {t('newExam')}
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
          <input
            type="number"
            min="1"
            placeholder={t('maxScorePlaceholder')}
            value={form.max_score}
            onChange={(e) => setForm({ ...form, max_score: e.target.value })}
            className="input"
          />
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink/50">{t('examDateLabel')}</label>
            <input
              required
              type="date"
              value={form.exam_date}
              onChange={(e) => setForm({ ...form, exam_date: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink/50">{t('deadlineLabel')}</label>
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              className="input"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink/60 hover:text-ink sm:col-span-2">
            <Paperclip size={14} />
            {file ? file.name : editingId ? t('replaceFile') : t('attachFile')}
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
              {saving ? t('common:saving') : editingId ? t('common:saveChanges') : t('addExam')}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink/60">
                {t('common:cancel')}
              </button>
            )}
          </div>
        </form>
      )}

      {sortedExams.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('noExamsYet')}</p>
        </div>
      ) : (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {sortedExams.map((e) => (
            <div
              key={e.id}
              className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 shadow-card ${
                selectedExam?.id === e.id ? 'bg-brand-500 text-white' : 'bg-white text-ink'
              }`}
            >
              <button onClick={() => setSelectedExamId(e.id)} className="flex items-center gap-2 text-left">
                <FileCheck2 size={16} />
                <div>
                  <p className="text-sm font-semibold">{e.title}</p>
                  <p className="text-xs opacity-70">
                    {e.exam_date} · {t('outOfScore', { max: e.max_score })}
                    {e.deadline && ` · ${t('dueDate', { date: e.deadline.slice(0, 10) })}`}
                  </p>
                </div>
                {e.level && <LevelBadge level={e.level} />}
              </button>
              <button onClick={() => startEdit(e)} className={selectedExam?.id === e.id ? 'text-white/80 hover:text-white' : 'text-brand-500 hover:bg-brand-50'} aria-label={t('editExamAria')}>
                <Pencil size={14} />
              </button>
              <button onClick={() => setDeletingExam(e)} className={selectedExam?.id === e.id ? 'text-white/80 hover:text-white' : 'text-inactive hover:bg-inactive/10'} aria-label={t('deleteExamAria')}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedExam && (
        <>
          <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink/50">
              {t('scoresFor', { title: selectedExam.title, max: selectedExam.max_score })}
            </h2>
            <div className="flex items-center gap-2">
              {selectedExam.file_url && (
                <button
                  onClick={() => handleOpenFile(selectedExam.file_url)}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                >
                  <Download size={13} /> {selectedExam.file_name || t('examFileDefault')}
                </button>
              )}
              <Link
                to={`/chat?type=exam&id=${selectedExam.id}`}
                className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
              >
                <MessageSquare size={13} /> {t('discuss')}
              </Link>
            </div>
          </div>
          <div className="space-y-2">
            {activeStudents.map((s) => {
              const answer = answerOf(s.id);
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-card">
                  <div>
                    <p className="font-semibold text-ink">{s.real_name}</p>
                    {answer?.answer_file_url && (
                      <button
                        onClick={() => handleOpenFile(answer.answer_file_url)}
                        className="mt-1 flex items-center gap-1 text-xs text-brand-500 hover:underline"
                      >
                        <Paperclip size={11} /> {answer.answer_file_name || t('studentAnswerDefault')}
                      </button>
                    )}
                  </div>
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
                    placeholder={t('scorePlaceholder')}
                    className="w-24 rounded-lg border border-ink/10 px-3 py-1.5 text-right text-sm"
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      {deletingExam && (
        <ConfirmDialog
          title={t('deleteExamTitle')}
          message={t('deleteExamMessage', { title: deletingExam.title })}
          confirmLabel={t('common:delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingExam(null)}
        />
      )}
    </div>
  );
}
