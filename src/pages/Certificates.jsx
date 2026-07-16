// Certificates.jsx

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Award, Plus, Download, Printer, Search, Pencil, Trash2, RotateCcw, X, Check, Image as ImageIcon, MessageSquare } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import { LevelBadge } from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { downloadCertificatePdf, printCertificatePdf } from '../utils/pdf';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';

const EMPTY_FORM = { studentId: '', title: '' };

// Quick-pick titles for the two built-in certificate designs (see
// matchBuiltinDesign in utils/pdf.js) - clicking one just fills the title
// field below with the exact matching text, same as typing it by hand.
const CERT_PRESETS = [
  { title: 'Student of the Month', description: 'Premium gold certificate' },
  { title: 'Student of the Week', description: 'Weekly achievement certificate' },
];

export default function Certificates() {
  const { students, certificates, certificateTemplate, addCertificate, editCertificate, removeCertificate, updateCertificateTemplate, error } =
    useAcademy();
  const { role } = useAuth();
  const isAdmin = role === 'administrator';
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

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

  // certificate_template.file_url is a storage path, not a real URL (the
  // bucket is private) - resolve a short-lived signed URL right before
  // generating a PDF rather than caching one, so it can never go stale.
  const resolveTemplateUrl = async () => {
    if (!certificateTemplate?.file_url) return null;
    return getAttachmentUrl(certificateTemplate.file_url);
  };

  const handleDownload = async (c, student) => {
    const templateImageUrl = await resolveTemplateUrl();
    await downloadCertificatePdf({ studentName: student?.real_name || 'Student', title: c.title, issuedDate: c.issued_date, templateImageUrl });
  };

  const handlePrint = async (c, student) => {
    const templateImageUrl = await resolveTemplateUrl();
    await printCertificatePdf({ studentName: student?.real_name || 'Student', title: c.title, issuedDate: c.issued_date, templateImageUrl });
  };

  const handleTemplateUpload = async (file) => {
    if (!file) return;
    setUploadingTemplate(true);
    try {
      const uploaded = await uploadAttachment(file, 'certificate-template');
      await updateCertificateTemplate({ file_url: uploaded.path, file_name: uploaded.name });
    } finally {
      setUploadingTemplate(false);
    }
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
            <h2 className="font-display text-sm font-bold text-ink">Certificate template</h2>
          </div>
          <p className="mb-3 text-xs text-ink/50">
            {certificateTemplate?.file_name
              ? `Currently using "${certificateTemplate.file_name}" as the background for every generated certificate.`
              : 'No template uploaded yet - certificates use the built-in design below.'}
          </p>
          <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50">
            <ImageIcon size={13} /> {uploadingTemplate ? 'Uploading...' : certificateTemplate?.file_url ? 'Replace template image' : 'Upload template image'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingTemplate}
              onChange={(e) => handleTemplateUpload(e.target.files?.[0])}
            />
          </label>
        </section>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {CERT_PRESETS.map((preset) => (
          <button
            key={preset.title}
            type="button"
            onClick={() => setForm((f) => ({ ...f, title: preset.title }))}
            className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors ${
              form.title === preset.title ? 'border-brand-500 bg-brand-50' : 'border-ink/10 bg-white hover:bg-ink/5'
            }`}
          >
            <span className="text-sm font-semibold text-ink">{preset.title}</span>
            <span className="text-xs text-ink/50">{preset.description}</span>
          </button>
        ))}
      </div>

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
