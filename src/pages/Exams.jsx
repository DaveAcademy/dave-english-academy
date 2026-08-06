// Exams.jsx
// Admin/teacher view: create, edit, delete exams, attach/replace a file,
// set a deadline, and enter scores. Students see their own assigned exams
// on the separate portal page src/pages/portal/MyExams.jsx (RLS-backed,
// not a filtered version of this page - same structural split the rest of
// the app already uses between admin/teacher pages and the student portal).

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, FileCheck2, Pencil, Trash2, Paperclip, MessageSquare, Download, X } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';
import ExamGradingRoster from '../components/ExamGradingRoster';

const EXAM_TYPES = ['Written', 'Oral'];

const EMPTY_FORM = {
  title: '',
  level: 'A',
  description: '',
  exam_date: new Date().toISOString().slice(0, 10),
  deadline: '',
  max_score: 100,
  exam_type: 'Written',
  lesson_id: '',
};

export default function Exams() {
  const { t } = useTranslation(['exams', 'common']);
  const { students, exams, examScores, lessons, addExam, editExam, removeExam, setExamScoreForStudent, error } = useAcademy();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deletingExam, setDeletingExam] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const sortedExams = useMemo(() => [...exams].sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date)), [exams]);
  const selectedExam = sortedExams.find((e) => e.id === selectedExamId) || sortedExams[0] || null;
  const editingExam = editingId ? exams.find((e) => e.id === editingId) : null;

  const sortedLessons = useMemo(
    () =>
      [...lessons].sort((a, b) => {
        const an = a.curriculum_lessons?.lesson_number;
        const bn = b.curriculum_lessons?.lesson_number;
        if (an != null && bn != null) return an - bn;
        if (an != null) return -1;
        if (bn != null) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      }),
    [lessons]
  );
  const lessonOf = (lessonId) => (lessonId ? lessons.find((l) => l.id === lessonId) : null);
  const studentCountOf = (exam) => students.filter((s) => s.status === 'Active' && (!exam.level || s.level === exam.level)).length;

  const activeStudents = useMemo(
    () =>
      [...students]
        .filter((s) => s.status === 'Active' && (!selectedExam?.level || s.level === selectedExam.level))
        .sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students, selectedExam]
  );

  const answerOf = (studentId) => examScores.find((s) => s.exam_id === selectedExam?.id && s.student_id === studentId) || {};

  const filteredStudents = useMemo(
    () =>
      activeStudents.filter((s) => {
        const answer = answerOf(s.id);
        const submitted = !!answer.answer_file_url;
        const graded = answer.score != null;
        if (statusFilter === 'submitted') return submitted;
        if (statusFilter === 'notSubmitted') return !submitted;
        if (statusFilter === 'graded') return graded;
        if (statusFilter === 'notGraded') return !graded;
        return true;
      }),
    [activeStudents, examScores, selectedExam, statusFilter]
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
        exam_date: form.exam_date,
        deadline: form.deadline || null,
        max_score: Number(form.max_score) || 100,
        exam_type: form.exam_type || 'Written',
        lesson_id: form.lesson_id || null,
      };

      if (editingId) {
        let payload = basePayload;
        if (file) {
          setUploading(true);
          try {
            const uploaded = await uploadAttachment(file, 'exams');
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
        await editExam(editingId, payload);
      } else {
        const record = await addExam(basePayload);
        setSelectedExamId(record.id);
        if (file) {
          setUploading(true);
          try {
            const uploaded = await uploadAttachment(file, 'exams');
            await editExam(record.id, { file_url: uploaded.path, file_name: uploaded.name, file_type: uploaded.type });
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

  const startEdit = (exam) => {
    setEditingId(exam.id);
    setForm({
      title: exam.title,
      level: exam.level || 'A',
      description: exam.description || '',
      exam_date: exam.exam_date,
      deadline: exam.deadline ? exam.deadline.slice(0, 10) : '',
      max_score: exam.max_score,
      exam_type: exam.exam_type || 'Written',
      lesson_id: exam.lesson_id || '',
    });
    setFile(null);
    setRemoveFile(false);
    setUploadError(null);
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
          <select value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })} className="input">
            {EXAM_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`examType.${type}`)}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            placeholder={t('maxScorePlaceholder')}
            value={form.max_score}
            onChange={(e) => setForm({ ...form, max_score: e.target.value })}
            className="input"
          />
          <select value={form.lesson_id} onChange={(e) => setForm({ ...form, lesson_id: e.target.value })} className="input">
            <option value="">{t('noLinkedLesson')}</option>
            {sortedLessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.topic} · {new Date(l.scheduled_at).toLocaleDateString()}
              </option>
            ))}
          </select>
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
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink/60 hover:text-ink">
              <Paperclip size={14} />
              {file ? file.name : editingExam?.file_name && !removeFile ? t('replaceFile') : t('attachFile')}
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
            {editingExam?.file_url && !file && !removeFile && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenFile(editingExam.file_url)}
                  className="flex items-center gap-1 text-xs font-semibold text-brand-500 hover:underline"
                >
                  <Download size={13} /> {editingExam.file_name || t('examFileDefault')}
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
              {uploading ? t('uploading') : saving ? t('common:saving') : editingId ? t('common:saveChanges') : t('addExam')}
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
        <div className="mb-4 overflow-x-auto rounded-xl bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs font-semibold uppercase tracking-wide text-ink/40">
                <th className="px-3 py-2">{t('colTitle')}</th>
                <th className="px-3 py-2">{t('colType')}</th>
                <th className="px-3 py-2">{t('colLesson')}</th>
                <th className="px-3 py-2">{t('colDate')}</th>
                <th className="px-3 py-2">{t('colStudentCount')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sortedExams.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setSelectedExamId(e.id)}
                  className={`cursor-pointer border-b border-ink/5 last:border-0 ${
                    selectedExam?.id === e.id ? 'bg-brand-50' : 'hover:bg-ink/5'
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileCheck2 size={15} className="flex-shrink-0 text-brand-500" />
                      <span className="font-semibold text-ink">{e.title}</span>
                      {e.level && <LevelBadge level={e.level} />}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-ink/70">{t(`examType.${e.exam_type || 'Written'}`)}</td>
                  <td className="px-3 py-2 text-ink/70">{lessonOf(e.lesson_id)?.topic || '—'}</td>
                  <td className="px-3 py-2 text-ink/70">{e.exam_date}</td>
                  <td className="px-3 py-2 text-ink/70">{studentCountOf(e)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          startEdit(e);
                        }}
                        className="text-brand-500 hover:bg-brand-50"
                        aria-label={t('editExamAria')}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setDeletingExam(e);
                        }}
                        className="text-inactive hover:bg-inactive/10"
                        aria-label={t('deleteExamAria')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedExam && (
        <>
          <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink/50">
              {t('scoresFor', { title: selectedExam.title, max: selectedExam.max_score })}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-ink/10 px-2 py-1.5 text-xs"
              >
                <option value="all">{t('filterAll')}</option>
                <option value="submitted">{t('filterSubmitted')}</option>
                <option value="notSubmitted">{t('filterNotSubmitted')}</option>
                <option value="graded">{t('filterGraded')}</option>
                <option value="notGraded">{t('filterNotGraded')}</option>
              </select>
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
          <ExamGradingRoster
            examMaxScore={selectedExam.max_score}
            students={filteredStudents}
            answerOf={answerOf}
            onOpenFile={handleOpenFile}
            onSetScore={(studentId, score, feedback) => setExamScoreForStudent(selectedExam.id, studentId, score, feedback)}
            t={t}
          />
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
