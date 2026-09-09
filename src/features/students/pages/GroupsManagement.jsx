// GroupsManagement.jsx

import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { useAuth } from '../../../lib/AuthContext';
import ConfirmDialog from '../../../shared/components/ConfirmDialog';

export default function GroupsManagement() {
  const { t } = useTranslation(['groups', 'common']);
  const { groups, students, lessons, addGroup, editGroup, removeGroup, error, setError } = useAcademy();
  const { role } = useAuth();
  const isAdmin = role === 'administrator';

  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [deletingGroup, setDeletingGroup] = useState(null);
  const [form, setForm] = useState({ name: '', active: true });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const groupStats = useMemo(() => {
    const stats = {};
    groups.forEach((g) => {
      stats[g.id] = { students: 0, lessons: 0 };
    });
    students.forEach((s) => {
      if (s.group_id && stats[s.group_id]) {
        stats[s.group_id].students += 1;
      }
    });
    lessons.forEach((l) => {
      if (l.group_id && stats[l.group_id]) {
        stats[l.group_id].lessons += 1;
      }
    });
    return stats;
  }, [groups, students, lessons]);

  const handleOpenCreate = () => {
    setEditingGroup(null);
    setForm({ name: '', active: true });
    setFormError('');
    setFormOpen(true);
  };

  const handleOpenEdit = (group) => {
    setEditingGroup(group);
    setForm({ name: group.name, active: group.active });
    setFormError('');
    setFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return setFormError(t('error.nameRequired'));

    const duplicate = groups.find(
      (g) => g.id !== (editingGroup?.id ?? -1) && g.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) return setFormError(t('error.duplicateName'));

    setFormError('');
    setSaving(true);
    try {
      if (editingGroup) {
        await editGroup(editingGroup.id, { name, active: form.active });
      } else {
        await addGroup({ name, active: form.active });
      }
      setFormOpen(false);
      setEditingGroup(null);
    } catch (err) {
      setFormError(err.message || t('error.somethingWentWrong'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingGroup) return;
    try {
      await removeGroup(deletingGroup.id);
      setDeletingGroup(null);
    } catch (err) {
      setError(err.message || t('error.deleteFailed'));
    }
  };

  if (!isAdmin) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <Users className="mx-auto mb-3 h-10 w-10 text-inactive" />
        <p className="font-display text-lg font-semibold text-ink">{t('adminOnly.title')}</p>
        <p className="mt-1 text-sm text-ink/50">{t('adminOnly.description')}</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink/50">{t('subtitle')}</p>
        </div>
        <button onClick={handleOpenCreate} className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
          <Plus size={16} /> {t('addGroup')}
        </button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      {groups.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <Users className="mx-auto mb-3 h-12 w-12 text-ink/20" />
          <p className="font-display text-lg font-semibold text-ink">{t('emptyState.title')}</p>
          <p className="mt-1 text-sm text-ink/50">{t('emptyState.description')}</p>
          <button onClick={handleOpenCreate} className="mt-4 flex mx-auto items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            <Plus size={16} /> {t('createFirstGroup')}
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-white shadow-card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/[0.02]">
                <th className="px-4 py-3 font-semibold text-ink/70">{t('columns.name')}</th>
                <th className="px-4 py-3 font-semibold text-ink/70">{t('columns.status')}</th>
                <th className="px-4 py-3 font-semibold text-ink/70">{t('columns.students')}</th>
                <th className="px-4 py-3 font-semibold text-ink/70">{t('columns.lessons')}</th>
                <th className="px-4 py-3 font-semibold text-ink/70">{t('columns.created')}</th>
                <th className="px-4 py-3 text-right font-semibold text-ink/70">{t('columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const stats = groupStats[g.id] || { students: 0, lessons: 0 };
                const hasDependencies = stats.students > 0 || stats.lessons > 0;
                return (
                  <tr key={g.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.015]">
                    <td className="px-4 py-3 font-medium text-ink">{g.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${g.active ? 'bg-active/10 text-active' : 'bg-inactive/10 text-inactive'}`}>
                        {g.active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {g.active ? t('status.active') : t('status.inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink/70">{stats.students}</td>
                    <td className="px-4 py-3 text-ink/70">{stats.lessons}</td>
                    <td className="px-4 py-3 text-ink/50">{new Date(g.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(g)}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                          disabled={saving}
                        >
                          <Pencil size={12} className="inline mr-1" /> {t('edit')}
                        </button>
                        {!hasDependencies && (
                          <button
                            onClick={() => setDeletingGroup(g)}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-inactive hover:bg-inactive/10"
                            disabled={saving}
                          >
                            <Trash2 size={12} className="inline mr-1" /> {t('delete')}
                          </button>
                        )}
                        {hasDependencies && (
                          <span className="flex items-center px-2 py-1 text-xs text-ink/40" title={t('tooltip.cannotDelete')}>
                            <Trash2 size={12} className="inline mr-1 opacity-30" /> {t('delete')}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-md sm:rounded-2xl">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-ink/10 px-5 py-4">
              <h2 className="font-display text-lg font-bold text-ink">{editingGroup ? t('editGroup') : t('createGroup')}</h2>
              <button onClick={() => { setFormOpen(false); setEditingGroup(null); }} className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink">
                <X size={5} />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {formError && <div className="rounded-lg border border-inactive/30 bg-inactive/5 px-3 py-2 text-sm text-inactive">{formError}</div>}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink/60">{t('form.name')} <span className="text-inactive">*</span></label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input"
                    placeholder={t('form.namePlaceholder')}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink/70">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="h-4 w-4 rounded border-ink/30 text-brand-500 focus:ring-brand-500"
                    />
                    {t('form.active')}
                  </label>
                  <p className="mt-1 text-xs text-ink/50">{t('form.activeHint')}</p>
                </div>
              </div>
              <div className="flex flex-shrink-0 justify-end gap-2 border-t border-ink/10 px-5 py-4">
                <button type="button" onClick={() => { setFormOpen(false); setEditingGroup(null); }} className="rounded-lg px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5">
                  {t('common:cancel')}
                </button>
                <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                  {saving ? t('common:saving') : editingGroup ? t('common:saveChanges') : t('createGroup')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingGroup && (
        <ConfirmDialog
          title={t('confirm.deleteTitle', { name: deletingGroup.name })}
          message={t('confirm.deleteMessage')}
          confirmLabel={t('common:delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingGroup(null)}
        />
      )}
    </div>
  );
}