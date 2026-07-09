// Certificates.jsx

import { useState, useMemo } from 'react';
import { Award, Plus, Download } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { downloadCertificatePdf } from '../utils/pdf';

const EMPTY_FORM = { studentId: '', title: '' };

export default function Certificates() {
  const { students, certificates, addCertificate, error } = useAcademy();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const studentsById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const activeStudents = useMemo(
    () => [...students].filter((s) => s.status === 'Active').sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students]
  );
  const sortedCertificates = useMemo(
    () => [...certificates].sort((a, b) => new Date(b.issued_date) - new Date(a.issued_date)),
    [certificates]
  );

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

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Certificates</h1>
        <p className="mt-1 text-sm text-ink/50">Issue certificates to students.</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

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

      {sortedCertificates.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No certificates issued yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedCertificates.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <Award size={18} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-ink">{c.title}</p>
                <p className="text-xs text-ink/50">
                  {studentsById[c.student_id]?.real_name || 'Unknown student'} · issued {c.issued_date}
                </p>
              </div>
              <button
                onClick={() =>
                  downloadCertificatePdf({
                    studentName: studentsById[c.student_id]?.real_name || 'Student',
                    title: c.title,
                    issuedDate: c.issued_date,
                  })
                }
                className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
              >
                <Download size={14} /> PDF
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
