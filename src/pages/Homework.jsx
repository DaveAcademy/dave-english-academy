// Homework.jsx
// Admin/teacher view: create, edit, delete homework, attach/replace a
// file, set a deadline, track status, and leave feedback. Students see
// their own assignments on the separate portal page
// src/pages/portal/MyHomework.jsx (same admin/portal split as Exams).

import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, BookOpen, Pencil, Trash2, Paperclip, MessageSquare, Download, X, Image as ImageIcon, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  uploadAttachment,
  getAttachmentUrl,
  listAllLessonWorkSubmissions,
  listLessonWorkSubmissionFilesForSubmissions,
} from '../lib/db';
import { LEVELS } from '../lib/levels';
import HomeworkGradingRoster from '../components/HomeworkGradingRoster';

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
  const [expandedStudentId, setExpandedStudentId] = useState(null);

  // "Submit Work" domain (lesson_work_submissions) - separate from the
  // Homework domain above, written from LessonHub.jsx's per-lesson
  // widget. Loaded here read-only so admins can find a submission
  // regardless of which widget the student used; grading itself still
  // happens in LessonHub's per-lesson Review panel (linked below), not
  // duplicated here.
  const [workSubmissions, setWorkSubmissions] = useState([]);
  const [workFiles, setWorkFiles] = useState([]);
  const [workLoading, setWorkLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const submissions = await listAllLessonWorkSubmissions();
        if (cancelled) return;
        setWorkSubmissions(submissions);
        const files = await listLessonWorkSubmissionFilesForSubmissions(submissions.map((s) => s.id));
        if (cancelled) return;
        setWorkFiles(files);
      } catch {
        // Non-fatal: the Homework-domain UI above still works if this fails.
      } finally {
        if (!cancelled) setWorkLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Level -> Student -> merged submission list (both domains), used by
  // the "Pending Submissions" section below. A student appears only if
  // they have at least one actual submission row (Homework-domain
  // answer_file_url/files, or any Submit Work row) in either domain -
  // "Assigned but never touched" homework_status rows are not activity.
  // Pending = Homework: score == null on a submitted item (same
  // needsGrading definition as gradingStateOf above); Submit Work:
  // points_awarded == null && status !== 'reviewed' (same needsReview
  // definition LessonWorkReviewRoster.jsx uses).
  const levelGroups = useMemo(() => {
    const groups = {};
    for (const lvl of LEVELS) groups[lvl] = [];
    for (const s of students) {
      const hwItems = homework
        .map((h) => {
          const hs = homeworkStatus.find((x) => x.homework_id === h.id && x.student_id === s.id);
          if (!hs) return null;
          const files = homeworkSubmissionFiles
            .filter((f) => f.homework_id === h.id && f.student_id === s.id)
            .sort((a, b) => a.position - b.position);
          const hasSubmission = Boolean(hs.answer_file_url) || files.length > 0;
          if (hs.score == null && !hasSubmission) return null;
          return {
            source: 'homework',
            id: `hw-${h.id}-${s.id}`,
            homeworkId: h.id,
            title: h.title,
            lessonTopic: lessonOf(h.lesson_id)?.topic,
            date: hs.submitted_at || h.due_date,
            pending: hs.score == null,
            files,
            answerFileUrl: hs.answer_file_url,
            answerFileName: hs.answer_file_name,
            score: hs.score,
          };
        })
        .filter(Boolean);

      const workItems = workSubmissions
        .filter((w) => w.student_id === s.id)
        .map((w) => {
          const files = workFiles.filter((f) => f.submission_id === w.id).sort((a, b) => a.position - b.position);
          return {
            source: 'work',
            id: `wk-${w.id}`,
            lessonId: w.lesson_id,
            lessonTopic: lessonOf(w.lesson_id)?.topic,
            date: w.submitted_at,
            pending: w.points_awarded == null && w.status !== 'reviewed',
            files,
            pointsAwarded: w.points_awarded,
          };
        });

      const items = [...hwItems, ...workItems];
      if (items.length === 0) continue;
      items.sort((a, b) => new Date(b.date) - new Date(a.date));
      const lvl = s.level && groups[s.level] ? s.level : null;
      if (!lvl) continue;
      groups[lvl].push({ student: s, submissionCount: items.length, items });
    }
    for (const lvl of Object.keys(groups)) {
      groups[lvl].sort((a, b) => b.submissionCount - a.submissionCount || a.student.real_name.localeCompare(b.student.real_name));
    }
    return groups;
  }, [students, homework, homeworkStatus, homeworkSubmissionFiles, workSubmissions, workFiles, lessons]);

  const goToHomeworkGrading = (homeworkId) => {
    setSelectedHomeworkId(homeworkId);
    setStatusFilter('all');
    requestAnimationFrame(() => {
      document.getElementById('homework-grading-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

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
            {LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>{t(`common:level${lvl}`)}</option>
            ))}
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
          <div id="homework-grading-section" className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
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
          <HomeworkGradingRoster
            students={filteredStudents}
            statusOf={statusOf}
            filesOf={filesOf}
            gradingStateOf={gradingStateOf}
            onOpenFile={handleOpenFile}
            onSetStatus={(studentId, status, score, feedback) => setHomeworkStatusForStudent(selected.id, studentId, status, score, feedback)}
            statusLabels={statusLabels}
            t={t}
          />
        </>
      )}

      {/* Pending Submissions: Level -> Student -> expand, merging both the
          Homework domain (graded inline via HomeworkGradingRoster, reached
          by "Go to grading" which selects the item above) and the "Submit
          Work" domain (lesson_work_submissions, reviewed/pointed on the
          lesson's own Review panel via "Review on lesson"). Replaces the
          previous flat Submit Work list - this is now the one place to
          find who has pending work across either domain. */}
      <div className="mt-8">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink/50">Pending Submissions</h2>
        <p className="mb-2 text-xs text-ink/50">
          Students with any homework or Submit Work history, grouped by level. Click a student to see their submissions.
        </p>
        {workLoading && <p className="mb-2 text-xs text-ink/40">Loading Submit Work submissions…</p>}
        {LEVELS.every((lvl) => levelGroups[lvl].length === 0) ? (
          <div className="rounded-xl bg-white p-6 text-center text-sm text-ink/50 shadow-card">No submissions yet.</div>
        ) : (
          <div className="space-y-4">
            {LEVELS.filter((lvl) => levelGroups[lvl].length > 0).map((lvl) => (
              <div key={lvl}>
                <div className="mb-1.5 flex items-center gap-2">
                  <LevelBadge level={lvl} />
                  <span className="text-xs font-semibold text-ink/40">{levelGroups[lvl].length} student{levelGroups[lvl].length === 1 ? '' : 's'}</span>
                </div>
                <div className="space-y-1.5">
                  {levelGroups[lvl].map(({ student, submissionCount, items }) => {
                    const expanded = expandedStudentId === student.id;
                    return (
                      <div key={student.id} className="rounded-xl bg-white shadow-card">
                        <button
                          onClick={() => setExpandedStudentId(expanded ? null : student.id)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                        >
                          <span className="flex items-center gap-1.5">
                            {expanded ? <ChevronDown size={14} className="text-ink/40" /> : <ChevronRight size={14} className="text-ink/40" />}
                            <span className="font-semibold text-ink">{student.real_name}</span>
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              submissionCount > 0 ? 'bg-active/10 text-active' : 'bg-ink/5 text-ink/40'
                            }`}
                          >
                            {submissionCount > 0 ? `${submissionCount} submission${submissionCount === 1 ? '' : 's'}` : 'No submissions'}
                          </span>
                        </button>
                        {expanded && (
                          <div className="space-y-2 border-t border-ink/5 p-3 pt-2">
                            {items.map((item) => (
                              <div key={item.id} className="rounded-lg bg-ink/[0.02] p-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold text-ink/50">
                                        {item.source === 'homework' ? 'Homework' : 'Submit Work'}
                                      </span>
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                          !item.pending ? 'bg-brand-50 text-brand-600' : 'bg-active/10 text-active'
                                        }`}
                                      >
                                        {item.source === 'homework'
                                          ? item.pending
                                            ? 'Needs grading'
                                            : `Graded · ${item.score}`
                                          : item.pending
                                            ? 'Needs review'
                                            : item.pointsAwarded != null
                                              ? `Reviewed · +${item.pointsAwarded}`
                                              : 'Reviewed'}
                                      </span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-ink/50">
                                      {item.source === 'homework' ? item.title : item.lessonTopic || 'Unknown lesson'}
                                      {item.date && ` · ${new Date(item.date).toLocaleString()}`}
                                    </p>
                                    {(item.answerFileUrl || item.files.length > 0) && (
                                      <div className="mt-1 flex flex-wrap gap-2">
                                        {item.answerFileUrl && (
                                          <button
                                            onClick={() => handleOpenFile(item.answerFileUrl)}
                                            className="flex items-center gap-1 text-xs text-brand-500 hover:underline"
                                          >
                                            <Paperclip size={11} /> {item.answerFileName || 'Submission'}
                                          </button>
                                        )}
                                        {item.files.map((f, i) => (
                                          <button
                                            key={f.id}
                                            onClick={() => handleOpenFile(f.file_url)}
                                            className="flex items-center gap-1 text-xs text-brand-500 hover:underline"
                                          >
                                            <ImageIcon size={11} /> Image {i + 1}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {item.source === 'homework' ? (
                                    <button
                                      onClick={() => goToHomeworkGrading(item.homeworkId)}
                                      className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
                                    >
                                      <Pencil size={13} /> Go to grading
                                    </button>
                                  ) : (
                                    item.lessonId && (
                                      <Link
                                        to={`/lessons/${item.lessonId}`}
                                        className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
                                      >
                                        <ExternalLink size={13} /> Review on lesson
                                      </Link>
                                    )
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
