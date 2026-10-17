// CategoryBreakdown.jsx - server-provided Category Performance section.
// Input is the attempt's category_scores object: { logic: {earned, max}, ... }
// Percentages come from the server; none are computed here.
import { useTranslation } from 'react-i18next';

const ORDER = ['logic', 'number_patterns', 'visual_patterns', 'spatial', 'memory'];

export default function CategoryBreakdown({ categoryScores }) {
  const { t } = useTranslation('iqbrain');
  const raw = (categoryScores && typeof categoryScores === 'object') ? categoryScores : {};
  const keys = Object.keys(raw);
  if (keys.length === 0) return null;
  keys.sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <section aria-label={t('categoryPerformance')} className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-6">
      <h2 className="mb-4 font-display text-base font-bold text-ink">{t('categoryPerformance')}</h2>
      <ul className="space-y-3.5">
        {keys.map((key) => {
          const cell = raw[key] || {};
          const earned = Number(cell.earned) || 0;
          const max = Number(cell.max) || 0;
          const pct = max > 0 ? Math.min(100, Math.max(0, (earned * 100) / max)) : 0;
          return (
            <li key={key}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-ink">{t(`category.${key}`)}</span>
                <span className="text-xs font-bold tabular-nums text-ink/55">
                  {earned}/{max}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.06]"
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t(`category.${key}`)}
              >
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
