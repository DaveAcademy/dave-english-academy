// Certificates.jsx

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Award, Plus, Download, Printer, Search, Pencil, Trash2, RotateCcw, X, Check, Image as ImageIcon, MessageSquare } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import { LevelBadge } from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { downloadCertificatePdf, printCertificatePdf, pickCertificateTemplate } from '../utils/pdf';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';

const EMPTY_FORM = { studentId: '', title: '' };

export default function Certificates() {
  const { students, certificates, certificateTemplates, addCertificate, editCertificate, removeCertificate, updateCertificateTemplate, error } =
    useAcademy();
  const { role } = useAuth();
  const isAdmin = role === 'administrator';
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState(null);

  const [filters, setFilters] = useState({ search: '', level: '', studentId: '', type: '' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [deletingCert, setDeletingCert] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const studentsById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const activeStudents = useMemo(
    () => [...students].filter((s) => s.status === 'Active').sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students]
  );

  const typeOptions = useMemo(() => {
    const set = new Set(certificates.map((c) => c.title?.trim()).filter(Boolean));
    return Array.from(set).sort();
  }, [certificates]);

  const sortedCertificates = useMemo(
    () => [...certificates].sort((a, b) => new Date(b.issued_date) - new Date(a.issued_date)),
    [certificates]
  );

  const visible = useMemo(() => {
    let list = sortedCertificates;
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter((c) => {
        const studentName = studentsById[c.student_id]?.real_name || '';
        return studentName.toLowerCase().includes(q) || (c.title || '').toLowerCase().includes(q);
      });
    }
    if (filters.level) list = list.filter((c) => studentsById[c.student_id]?.level === filters.level);
    if (filters.studentId) list = list.filter((c) => String(c.student_id) === filters.studentId);
    if (filters.type) list = list.filter((c) => c.title === filters.type);
    return list;
  }, [sortedCertificates, filters, studentsById]);

  const handleIssue = async (e) => {
    e.preventDefault();
    if (!form.studentId || !form.title.trim()) return;
    setSaving(true);
    try {
      await addCertificate(Number(form.studentId), form.title);
      setForm(EMPTY_FORM);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditForm({ studentId: String(c.student_id), title: c.title, issuedDate: c.issued_date });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  };

  const saveEdit = async (id) => {
    if (!editForm.studentId || !editForm.title.trim()) return;
    setBusyId(id);
    try {
      await editCertificate(id, {
        student_id: Number(editForm.studentId),
        title: editForm.title,
        issued_date: editForm.issuedDate,
      });
      cancelEdit();
    } finally {
      setBusyId(null);
    }
  };

  const handleReissue = async (c) => {
    setBusyId(c.id);
    try {
      await addCertificate(c.student_id, c.title);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    setBusyId(deletingCert.id);
    try {
      await removeCertificate(deletingCert.id);
    } finally {
      setBusyId(null);
      setDeletingCert(null);
    }
  };

  // Resolves which certificate_templates row applies to this title (see
  // migration 0026 / pickCertificateTemplate()), then turns its storage
  // path into a short-lived signed URL right before generating a PDF
  // rather than caching one, so it can never go stale.
  const resolveTemplate = async (title) => {
    const row = pickCertificateTemplate(certificateTemplates, title);
    return {
      templateImageUrl: row?.file_url ? await getAttachmentUrl(row.file_url) : null,
      showTitleOverlay: row?.show_title_overlay ?? true,
    };
  };

  const handleDownload = async (c, student) => {
    const { templateImageUrl, showTitleOverlay } = await resolveTemplate(c.title);
    await downloadCertificatePdf({
      studentName: student?.real_name || 'Student',
      title: c.title,
      issuedDate: c.issued_date,
      templateImageUrl,
      showTitleOverlay,
    });
  };

  const handlePrint = async (c, student) => {
    const { templateImageUrl, showTitleOverlay } = await resolveTemplate(c.title);
    await printCertificatePdf({
      studentName: student?.real_name || 'Student',
      title: c.title,
      issuedDate: c.issued_date,
      templateImageUrl,
      showTitleOverlay,
    });
  };

  const handleTemplateUpload = async (key, file) => {
    if (!file) return;
    setUploadingKey(key);
    try {
      const uploaded = await uploadAttachment(file, 'certificate-template');
      await updateCertificateTemplate(key, { file_url: uploaded.path, file_name: uploaded.name });
    } finally {
      setUploadingKey(null);
    }
  };

  const handleToggleShowTitle = async (key, checked) => {
    await updateCertificateTemplate(key, { show_title_overlay: checked });
  };

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Certificates</h1>
        <p className="mt-1 text-sm text-ink/50">Issue, edit, reissue, and manage student certificates.</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      {isAdmin && (
        <section className="mb-4 rounded-xl bg-white p-4 shadow-card">
          <div className="mb-1 flex items-center gap-2">
            <ImageIcon size={16} className="text-brand-500" />
            <h2 className="font-display text-sm font-bold text-ink">Certificate templates</h2>
          </div>
          <p className="mb-3 text-xs text-ink/50">
            Set a background image per certificate type. A type with no image of its own falls back to the default template, then to
            the built-in design.
          </p>
          <div className="space-y-2">
            {certificateTemplates.map((tpl) => (
              <div key={tpl.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink/10 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{tpl.label}</p>
                  <p className="text-xs text-ink/50">{tpl.file_name || 'No image uploaded - falls back to the default template.'}</p>
                </div>
                {tpl.file_url && (
                  <label className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 text-xs text-ink/60">
                    <input
                      type="checkbox"
                      checked={tpl.show_title_overlay}
                      onChange={(e) => handleToggleShowTitle(tpl.key, e.target.checked)}
                    />
                    Show award title text
                  </label>
                )}
                <label className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50">
                  <ImageIcon size={13} /> {uploadingKey === tpl.key ? 'Uploading...' : tpl.file_url ? 'Replace image' : 'Upload image'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={!!uploadingKey}
                    onChange={(e) => handleTemplateUpload(tpl.key, e.target.files?.[0])}
                  />
                </label>
              </div>
            ))}
          </div>
        </section>
      )}

      <form onSubmit={handleIssue} className="mb-6 grid gap-3 rounded-xl bg-white p-4 shadow-card sm:grid-cols-3">
        <select
          required
          value={form.studentId}
          onChange={(e) => setForm({ ...form, studentId: e.target.value })}
          className="input sm:col-span-1"
        >
          <option value="">Select student...</option>
          {activeStudents.map((s) => (
            <option key={s.id} value={s.id}>
              {s.real_name}
            </option>
          ))}
        </select>
        <input
          required
          placeholder="Certificate title (e.g. Level A Completion)"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="input sm:col-span-1"
        />
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 sm:col-span-1"
        >
          <Plus size={16} /> {saving ? 'Issuing...' : 'Issue certificate'}
        </button>
      </form>

      <div className="mb-4 flex flex-col gap-3 rounded-xl bg-white p-3 shadow-card sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search student or title..."
            className="w-full rounded-lg border border-ink/10 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })} className="input sm:w-36">
          <option value="">All levels</option>
          <option value="A">Level A</option>
          <option value="B">Level B</option>
          <option value="C">Level C</option>
        </select>
        <select value={filters.studentId} onChange={(e) => setFilters({ ...filters, studentId: e.target.value })} className="input sm:w-44">
          <option value="">All students</option>
          {[...students].sort((a, b) => a.real_name.localeCompare(b.real_name)).map((s) => (
            <option key={s.id} value={s.id}>
              {s.real_name}
            </option>
          ))}
        </select>
        {typeOptions.length > 0 && (
          <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="input sm:w-44">
            <option value="">All types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">
            {certificates.length === 0 ? 'No certificates issued yet' : 'No certificates match these filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => {
            const isEditing = editingId === c.id;
            const student = studentsById[c.student_id];
            const isBusy = busyId === c.id;

            if (isEditing) {
              return (
                <div key={c.id} className="rounded-xl bg-white p-3 shadow-card">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select
                      value={editForm.studentId}
                      onChange={(e) => setEditForm({ ...editForm, studentId: e.target.value })}
                      className="input"
                    >
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.real_name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="input"
                      placeholder="Certificate title"
                    />
                    <input
                      type="date"
                      value={editForm.issuedDate}
                      onChange={(e) => setEditForm({ ...editForm, issuedDate: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={cancelEdit}
                      className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
                    >
                      <X size={14} /> Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(c.id)}
                      disabled={isBusy}
                      className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                    >
                      <Check size={14} /> {isBusy ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-card">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                  <Award size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{c.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-ink/50">{student?.real_name || 'Unknown student'} · issued {c.issued_date}</span>
                    {student?.level && <LevelBadge level={student.level} />}
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => handleDownload(c, student)}
                    className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button
                    onClick={() => handlePrint(c, student)}
                    className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
                  >
                    <Printer size={14} /> Print
                  </button>
                  <button
                    onClick={() => handleReissue(c)}
                    disabled={isBusy}
                    className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5 disabled:opacity-60"
                  >
                    <RotateCcw size={14} /> {isBusy ? 'Reissuing...' : 'Reissue'}
                  </button>
                  <button
                    onClick={() => startEdit(c)}
                    className="rounded-md p-1.5 text-brand-500 hover:bg-brand-50"
                    aria-label="Edit certificate"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeletingCert(c)}
                    className="rounded-md p-1.5 text-inactive hover:bg-inactive/10"
                    aria-label="Delete certificate"
                  >
                    <Trash2 size={15} />
                  </button>
                  <Link
                    to={`/chat?type=certificate&id=${c.id}`}
                    className="rounded-md p-1.5 text-ink/40 hover:bg-ink/5"
                    aria-label="Discuss this certificate"
                  >
                    <MessageSquare size={15} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deletingCert && (
        <ConfirmDialog
          title="Delete certificate?"
          message={`This will permanently remove "${deletingCert.title}" issued to ${studentsById[deletingCert.student_id]?.real_name || 'this student'}. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeletingCert(null)}
        />
      )}
    </div>
  );
}
