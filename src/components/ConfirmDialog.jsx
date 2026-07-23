// ConfirmDialog.jsx

import { useTranslation } from 'react-i18next';

export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }) {
  const { t } = useTranslation('common');
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-ink/60">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5">
            {t('cancel')}
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-inactive px-4 py-2 text-sm font-semibold text-white hover:bg-inactive/90">
            {confirmLabel || t('delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
