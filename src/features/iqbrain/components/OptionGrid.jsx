// OptionGrid.jsx - fixed 2x2 answer grid, identical structure for every
// reasoning question so the layout never shifts between questions.
import { useTranslation } from 'react-i18next';

const SLOTS = [0, 1, 2, 3];

export default function OptionGrid({ options = [], value, disabled, onSelect }) {
  const { t } = useTranslation('iqbrain');
  const chosen = value && typeof value === 'object' ? value.selected_index : null;
  const letters = ['A', 'B', 'C', 'D'];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3" role="group" aria-label={t('chooseAnswer')}>
      {SLOTS.map((i) => {
        const option = options[i];
        const has = option !== undefined && option !== null && option !== '';
        const selected = chosen === i;
        return (
          <button
            key={i}
            type="button"
            disabled={disabled || !has}
            aria-pressed={selected}
            onClick={() => has && onSelect && onSelect({ selected_index: i })}
            className={`flex min-h-[64px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors sm:min-h-[72px] ${
              !has
                ? 'cursor-not-allowed border-dashed border-ink/[0.08] bg-ink/[0.02] opacity-40'
                : selected
                  ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/30'
                  : 'border-ink/[0.08] bg-white hover:border-brand-300 hover:bg-brand-50/40'
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                selected ? 'bg-brand-600 text-white' : 'bg-ink/[0.06] text-ink/60'
              }`}
              aria-hidden
            >
              {letters[i]}
            </span>
            <span className="min-w-0 break-words font-display text-base font-semibold text-ink">
              {has ? String(option) : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
