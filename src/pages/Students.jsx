// Students.jsx

import { useState, useMemo } from 'react';
import { Search, Plus, Upload, Pencil, Trash2, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import { LevelBadge, StatusBadge } from '../components/Badge';
import StudentForm from '../components/StudentForm';
import ConfirmDialog from '../components/ConfirmDialog';
import ImportModal from '../components/ImportModal';
import { formatUZS } from '../utils/format';

export default function Students() {
  const { students, loading, error, addStudent, editStudent, removeStudent, importStudents } = useAcademy();
  const { role } = useAuth();
  const isAdmin = role === 'administrator';

  const [filters, setFilters] = useState({ search: '', level: '', status: '', group: '' });
  const [sortKey, setSortKey] = useState('real_name');
  const [sortDir, setSortDir] = useState('asc');

  const [formOpen, setFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [deletingStudent, setDeletingStudent] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const groups = useMemo(() => {
    const set = new Set(students.map((s) => s.group_name?.trim()).filter(Boolean));
    return Array.from(set).sort();
  }, [students]);

  const visible = useMemo(() => {
    let list = [...students];
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.real_name.toLowerCase().includes(q) ||
          (s.english_name || '').toLowerCase().includes(q) ||
          (s.phone || '').includes(q) ||
          (s.parent_phone || '').includes(q)
      );
    }
    if (filters.level) list = list.filter((s) => s.level === filters.level);
    if (filters.status) list = list.filter((s) => s.status === filters.status);
    if (filters.group) list = list.filter((s) => (s.group_name || '') === filters.group);

    list.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [students, filters, sortKey, sortDir]);

  const handleHeaderSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleSave = async (formData) => {
    if (editingStudent) await editStudent(editingStudent.id, formData);
    else await addStudent(formData);
    setFormOpen(false);
    setEditingStudent(null);
  };

  const handleDelete = async () => {
    await removeStudent(deletingStudent.id);
    setDeletingStudent(null);
  };

  // monthly_fee is financial information - only administrators see it here
  // (see fix/hide-financial-fields-from-teachers). This is a UI-level
  // restriction, not a database one: RLS is row-level, not column-level,
  // so this column stays out of the table/columns list entirely rather
  // than being rendered and then hidden.
  const columns = [
    { key: 'real_name', label: 'Real Name' },
    { key: 'english_name', label: 'English Name' },
    { key: 'level', label: 'Level' },
    { key: 'group_name', label: 'Group' },
    { key: 'phone', label: 'Phone' },
    { key: 'payment_deadline', label: 'Payment Day' },
    ...(isAdmin ? [{ key: 'monthly_fee', label: 'Fee' }] : []),
    { key: 'status', label: 'Status' },
  ];

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Students</h1>
          <p className="mt-1 text-sm text-ink/50">Add, edit, search, and filter your roster.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-2 text-sm font-semibold text-brand-500 hover:bg-brand-50"
            >
              <Upload size={16} /> Import
            </button>
            <button
              onClick={() => {
                setEditingStudent(null);
                setFormOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              <Plus size={16} /> Add student
            </button>
          </div>
        )}
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search name or phone..."
            className="w-full rounded-lg border border-ink/10 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-brand-500"
          />
        </div>
        <select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })} className="input sm:w-40">
          <option value="">All levels</option>
          <option value="A">Level A</option>
          <option value="B">Level B</option>
          <option value="C">Level C</option>
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="input sm:w-40">
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        {groups.length > 0 && (
          <select value={filters.group} onChange={(e) => setFilters({ ...filters, group: e.target.value })} className="input sm:w-40">
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl bg-white p-10 text-center text-sm text-ink/50 shadow-card">Loading students...</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No students found</p>
          <p className="mt-1 text-sm text-ink/50">Try adjusting filters, add a student, or import your roster.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl bg-white shadow-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-ink/[0.02]">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleHeaderSort(col.key)}
                        className="cursor-pointer select-none whitespace-nowrap px-4 py-3 font-semibold text-ink/70 hover:text-ink"
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {sortKey === col.key ? (
                            sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-brand-500" /> : <ChevronDown className="h-3 w-3 text-brand-500" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-ink/25" />
                          )}
                        </span>
                      </th>
                    ))}
                    {isAdmin && <th className="px-4 py-3 text-right font-semibold text-ink/70">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <tr key={s.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.015]">
                      <td className="px-4 py-3 font-medium text-ink">{s.real_name}</td>
                      <td className="px-4 py-3 text-ink/70">{s.english_name || '—'}</td>
                      <td className="px-4 py-3"><LevelBadge level={s.level} /></td>
                      <td className="px-4 py-3 text-ink/70">{s.group_name || '—'}</td>
                      <td className="px-4 py-3 text-ink/70">{s.phone || '—'}</td>
                      <td className="px-4 py-3 text-ink/70">Day {s.payment_deadline}</td>
                      {isAdmin && <td className="px-4 py-3 text-ink/70">{formatUZS(s.monthly_fee)}</td>}
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingStudent(s);
                                setFormOpen(true);
                              }}
                              className="rounded-md px-2 py-1 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                            >
                              Edit
                            </button>
                            <button onClick={() => setDeletingStudent(s)} className="rounded-md px-2 py-1 text-xs font-semibold text-inactive hover:bg-inactive/10">
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {visible.map((s) => (
              <div key={s.id} className="rounded-xl bg-white p-3 shadow-card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-ink">{s.real_name}</p>
                    {s.english_name && <p className="text-xs text-ink/40">{s.english_name}</p>}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingStudent(s);
                          setFormOpen(true);
                        }}
                        className="rounded-md p-1.5 text-brand-500 active:bg-brand-50"
                      >
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => setDeletingStudent(s)} className="rounded-md p-1.5 text-inactive active:bg-inactive/10">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <LevelBadge level={s.level} />
                  <StatusBadge status={s.status} />
                  {s.group_name && <span className="text-xs text-ink/40">{s.group_name}</span>}
                  <span className="text-xs text-ink/40">Pays day {s.payment_deadline}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  {s.phone && <p className="text-xs text-ink/50">{s.phone}</p>}
                  {isAdmin && <p className="text-xs font-semibold text-brand-500">{formatUZS(s.monthly_fee)}/mo</p>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {formOpen && (
        <StudentForm
          student={editingStudent}
          onClose={() => {
            setFormOpen(false);
            setEditingStudent(null);
          }}
          onSave={handleSave}
        />
      )}

      {deletingStudent && (
        <ConfirmDialog
          title="Delete student?"
          message={`This will permanently remove ${deletingStudent.real_name} and their payment/attendance history. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeletingStudent(null)}
        />
      )}

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onImport={importStudents} />}
    </div>
  );
}
