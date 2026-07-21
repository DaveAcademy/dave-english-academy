// StudentForm.jsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

const EMPTY_FORM = {
  real_name: '',
  english_name: '',
  level: 'A',
  group_name: '',
  phone: '',
  parent_phone: '',
  join_date: new Date().toISOString().slice(0, 10),
  payment_deadline: 1,
  monthly_fee: '',
  status: 'Active',
  notes: '',
};

export default function StudentForm({ student, onClose, onSave }) {
  const { t } = useTranslation(['students', 'common']);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(student);

  useEffect(() => {
    setForm(
      student
        ? {
            real_name: student.real_name || '',
            english_name: student.english_name || '',
            level: student.level || 'A',
            group_name: student.group_name || '',
            phone: student.phone || '',
            parent_phone: student.parent_phone || '',
            join_date: student.join_date || EMPTY_FORM.join_date,
            payment_deadline: student.payment_deadline || 1,
            monthly_fee: student.monthly_fee ?? '',
            status: student.status || 'Active',
            notes: student.notes || '',
          }
        : EMPTY_FORM
    );
  }, [student]);

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.real_name.trim()) return setError(t('realNameRequired'));
    const deadline = Number(form.payment_deadline);
    if (!Number.isInteger(deadline) || deadline < 1 || deadline > 31) {
      return setError(t('paymentDeadlineError'));
    }
    const fee = Number(form.monthly_fee);
    if (!Number.isFinite(fee) || fee < 0) {
      return setError(t('monthlyFeeError'));
    }
    setError('');
    setSaving(true);
    try {
      await onSave({ ...form, payment_deadline: deadline, monthly_fee: fee });
    } catch (err) {
      setError(err.message || t('genericError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink">{isEditing ? t('editStudent') : t('addStudent')}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error && <div className="rounded-lg border border-inactive/30 bg-inactive/5 px-3 py-2 text-sm text-inactive">{error}</div>}

            <div className="grid grid-cols-2 gap-4">
              <Field label={t('realNameLabel')} required span={2}>
                <input required value={form.real_name} onChange={(e) => update({ real_name: e.target.value })} className="input" />
              </Field>

              <Field label={t('englishNameLabel')} span={2}>
                <input value={form.english_name} onChange={(e) => update({ english_name: e.target.value })} className="input" />
              </Field>

              <Field label={t('levelLabel')} required>
                <select value={form.level} onChange={(e) => update({ level: e.target.value })} className="input">
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </Field>

              <Field label={t('groupOptionalLabel')}>
                <input
                  value={form.group_name}
                  onChange={(e) => update({ group_name: e.target.value })}
                  className="input"
                  placeholder={t('groupPlaceholder')}
                />
              </Field>

              <Field label={t('statusLabel')}>
                <select value={form.status} onChange={(e) => update({ status: e.target.value })} className="input">
                  <option value="Active">{t('common:active')}</option>
                  <option value="Inactive">{t('common:inactive')}</option>
                </select>
              </Field>

              <Field label={t('phoneLabel')}>
                <input type="tel" value={form.phone} onChange={(e) => update({ phone: e.target.value })} className="input" placeholder="+998 90 123 45 67" />
              </Field>

              <Field label={t('parentPhoneLabel')}>
                <input type="tel" value={form.parent_phone} onChange={(e) => update({ parent_phone: e.target.value })} className="input" placeholder="+998 90 123 45 67" />
              </Field>

              <Field label={t('joinDateLabel')} required>
                <input type="date" required value={form.join_date} onChange={(e) => update({ join_date: e.target.value })} className="input" />
              </Field>

              <Field label={t('paymentDeadlineLabel')} required>
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={form.payment_deadline}
                  onChange={(e) => update({ payment_deadline: e.target.value })}
                  className="input"
                />
              </Field>

              <Field label={t('monthlyFeeLabel')} span={2}>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={form.monthly_fee}
                  onChange={(e) => update({ monthly_fee: e.target.value })}
                  className="input"
                  placeholder={t('monthlyFeePlaceholder')}
                />
              </Field>

              <Field label={t('notesLabel')} span={2}>
                <textarea value={form.notes} onChange={(e) => update({ notes: e.target.value })} rows={3} className="input resize-none" />
              </Field>
            </div>
          </div>

          <div className="flex flex-shrink-0 justify-end gap-2 border-t border-ink/10 px-5 py-4">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5">
              {t('common:cancel')}
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
              {saving ? t('common:saving') : isEditing ? t('common:saveChanges') : t('addStudent')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, span = 1, children }) {
  return (
    <div className={span === 2 ? 'col-span-2' : 'col-span-2 sm:col-span-1'}>
      <label className="mb-1 block text-xs font-semibold text-ink/60">
        {label} {required && <span className="text-inactive">*</span>}
      </label>
      {children}
    </div>
  );
}
