// StudentAchievementsModal.jsx
// Read-only teacher/admin view of one student's earned achievements.
// Achievements are awarded exclusively by the production evaluator - this
// modal never writes to student_achievements/achievement_definitions.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { getStudentAchievements } from '../../../lib/storageBridge';

export default function StudentAchievementsModal({ student, onClose }) {
  const { t } = useTranslation(['students', 'common']);
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getStudentAchievements(student.id)
      .then((data) => {
        if (!cancelled) setRows(data || []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [student.id]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">
            {t('achievementsModalTitle', { name: student.real_name, defaultValue: `${student.real_name}'s achievements` })}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink/40 hover:bg-ink/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        {rows === null ? (
          <p className="py-6 text-center text-sm text-ink/50">{t('common:loading')}</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/50">
            {t('achievementsModalEmpty', { defaultValue: 'No achievements earned yet.' })}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((a) => (
              <div key={a.achievement?.key} className="flex items-center gap-3 rounded-xl bg-ink/[0.02] p-2.5">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-base">
                  {a.achievement?.icon || '🏆'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{a.achievement?.name}</p>
                  <p className="text-xs text-ink/40">
                    {new Date(a.earned_at).toLocaleDateString()}
                    {a.bonus_transaction?.points > 0 ? ` · +${a.bonus_transaction.points} pts` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={onClose} className="mt-4 w-full rounded-lg border border-ink/15 py-2.5 text-sm font-semibold text-ink/60">
          {t('common:close', { defaultValue: 'Close' })}
        </button>
      </div>
    </div>
  );
}
