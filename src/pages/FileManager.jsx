// FileManager.jsx
// Phase 10: a centralized library for files not already tied to a
// specific record via their own upload flow (exams/homework keep using
// their own file_url columns from the earlier Exams/Homework work - see
// migration 0010's header comment for why this is a separate, additive
// catalog rather than a rewrite of those). Admin/teacher only, matching
// the RLS in migration 0010.

import { useState, useMemo } from 'react';
import {
  Upload, Search, Trash2, RefreshCw, Eye, Download,
  FileText, BookOpen, FileCheck2, Award, Image as ImageIcon, Video, File as FileIcon,
} from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';

const CATEGORIES = [
  { key: 'lesson', label: 'Lesson', Icon: FileText },
  { key: 'homework', label: 'Homework', Icon: BookOpen },
  { key: 'exam', label: 'Exam', Icon: FileCheck2 },
  { key: 'certificate_template', label: 'Certificate Template', Icon: Award },
  { key: 'image', label: 'Image', Icon: ImageIcon },
  { key: 'video', label: 'Video', Icon: Video },
  { key: 'other', label: 'Other', Icon: FileIcon },
];
const categoryMeta = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EMPTY_FORM = { category: 'lesson', description: '' };

export default function FileManager() {
  const { files, addFile, editFile, removeFile, error } = useAcademy();
  const { profile } = useAuth();

  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [filters, setFilters] = useState({ category: '', search: '' });
  const [replacingId, setReplacingId] = useState(null);
  const [deletingFile, setDeletingFile] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const visible = useMemo(() => {
    let list = [...files];
    if (filters.category) list = list.filter((f) => f.category === filters.category);
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter((f) => f.file_name.toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q));
    }
    return list;
  }, [files, filters]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadAttachment(file, `library/${form.category}`);
      await addFile({
        category: form.category,
        file_path: uploaded.path,
        file_name: uploaded.name,
        file_type: uploaded.type,
        file_size: file.size,
        description: form.description || null,
        uploaded_by: profile.id,
      });
      setForm(EMPTY_FORM);
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleReplace = async (fileRecord, newFile) => {
    if (!newFile) return;
    setBusyId(fileRecord.id);
    try {
      const uploaded = await uploadAttachment(newFile, `library/${fileRecord.category}`);
      await editFile(fileRecord.id, {
        file_path: uploaded.path,
        file_name: uploaded.name,
        file_type: uploaded.type,
        file_size: newFile.size,
      });
    } finally {
      setBusyId(null);
      setReplacingId(null);
    }
  };

  const handleDelete = async () => {
    setBusyId(deletingFile.id);
    try {
      await removeFile(deletingFile.id);
    } finally {
      setBusyId(null);
      setDeletingFile(null);
    }
  };

  const handleOpen = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">File Manager</h1>
        <p className="mt-1 text-sm text-ink/50">
          Lesson materials, certificate templates, images, videos, and other shared files.
        </p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      <form onSubmit={handleUpload} className="mb-4 grid gap-3 rounded-xl bg-white p-4 shadow-card sm:grid-cols-3">
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="input"
        />
        <label className="input flex cursor-pointer items-center gap-1.5 text-ink/60">
          <Upload size={14} />
          {file ? file.name : 'Choose file...'}
          <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <button
          type="submit"
          disabled={uploading || !file}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 sm:col-span-3"
        >
          <Upload size={16} /> {uploading ? 'Uploading...' : 'Upload file'}
        </button>
      </form>

      <div className="mb-4 flex flex-col gap-3 rounded-xl bg-white p-3 shadow-card sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search file name..."
            className="w-full rounded-lg border border-ink/10 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className="input sm:w-56">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">
            {files.length === 0 ? 'No files uploaded yet' : 'No files match these filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((f) => {
            const meta = categoryMeta[f.category] || categoryMeta.other;
            const isBusy = busyId === f.id;
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-card">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                  <meta.Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{f.file_name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink/50">
                    <span className="rounded-full bg-ink/5 px-1.5 py-0.5 font-semibold">{meta.label}</span>
                    <span>{formatFileSize(f.file_size)}</span>
                    <span>· {new Date(f.created_at).toLocaleDateString()}</span>
                    {f.description && <span className="truncate">· {f.description}</span>}
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => handleOpen(f.file_path)}
                    className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                  >
                    <Eye size={13} /> Preview
                  </button>
                  <button
                    onClick={() => handleOpen(f.file_path)}
                    className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
                  >
                    <Download size={13} /> Download
                  </button>
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5">
                    <RefreshCw size={13} /> {isBusy && replacingId === f.id ? 'Replacing...' : 'Replace'}
                    <input
                      type="file"
                      className="hidden"
                      disabled={isBusy}
                      onChange={(e) => {
                        setReplacingId(f.id);
                        handleReplace(f, e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <button
                    onClick={() => setDeletingFile(f)}
                    className="rounded-md p-1.5 text-inactive hover:bg-inactive/10"
                    aria-label="Delete file"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deletingFile && (
        <ConfirmDialog
          title="Delete file?"
          message={`This will permanently remove "${deletingFile.file_name}" from the library. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeletingFile(null)}
        />
      )}
    </div>
  );
}
