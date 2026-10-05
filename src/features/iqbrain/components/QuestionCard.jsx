// QuestionCard.jsx - renders ONE keyless question. The answer key never
// reaches the browser: correctness, difficulty factor and earned points are
// decided only by the server at submit time.
//
// stimulus.rule / stimulus.figure are authoring metadata and are never
// displayed - rule is effectively the answer. Only an explicit reveal_ms
// sequence (memory questions) is shown, and only until it hides.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import OptionGrid from './OptionGrid';
import { difficultyLabel } from '../lib/iqScoring';

export default function QuestionCard({ item, index, total, value, disabled, onChange }) {
  const { t } = useTranslation('iqbrain');
  const type = item.question_type || 'multiple_choice';
  const stimulus = (item.stimulus && typeof item.stimulus === 'object') ? item.stimulus : {};
  const prompt = (item.prompt && typeof item.prompt === 'object') ? item.prompt : {};
  const stem = prompt.stem || prompt.text || String(item.prompt || '');
  const stemUz = typeof prompt.stem_uz === 'string' && prompt.stem_uz.trim() ? prompt.stem_uz : '';
  const sequence = Array.isArray(stimulus.sequence) ? stimulus.sequence : null;
  const revealMs = Number(stimulus.reveal_ms) > 0 ? Number(stimulus.reveal_ms) : 0;
  const memoryReveal = Boolean(sequence) && revealMs > 0;

  const [hidden, setHidden] = useState(!memoryReveal);
  const [phase, setPhase] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!memoryReveal) { setHidden(true); return undefined; }
    setHidden(false);
    setPhase(0);
    let i = 0;
    const step = () => {
      i += 1;
      if (i >= sequence.length) { setHidden(true); return; }
      setPhase(i);
      timerRef.current = window.setTimeout(step, revealMs);
    };
    timerRef.current = window.setTimeout(step, revealMs);
    return () => window.clearTimeout(timerRef);
  }, [memoryReveal, sequence, revealMs, item.id]);

  const isNumericEntry = type === 'number_sequence'
    && (!Array.isArray(item.options) || item.options.length === 0);
  const numericValue = value && typeof value === 'object' && 'value' in value ? String(value.value) : '';

  return (
    <section
      className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-6"
      aria-label={t('questionN', { n: index + 1, total })}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">
          {t('questionN', { n: index + 1, total })}
        </p>
        <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-[11px] font-bold text-ink/55">
          {t(`difficulty.${difficultyLabel(item.difficulty)}`)}
        </span>
      </div>

      {memoryReveal ? (
        <div className="mb-5 flex min-h-[72px] items-center justify-center rounded-2xl bg-ink/[0.04] p-4">
          <p className="font-display text-2xl font-bold tabular-nums tracking-widest text-ink">
            {hidden ? t('rememberYourChoice') : String(sequence[phase])}
          </p>
        </div>
      ) : null}

      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('promptEnLabel')}</p>
      <h2 className="mb-4 font-display text-lg font-semibold leading-snug text-ink sm:text-xl">{stem}</h2>

      {stemUz ? (
        <div className="mb-4 rounded-xl bg-ink/[0.03] px-3.5 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('promptUzLabel')}</p>
          <p className="mt-0.5 text-sm font-medium leading-snug text-ink/70">{stemUz}</p>
        </div>
      ) : null}

      {isNumericEntry ? (
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={numericValue}
          aria-label={t('typeAnswer')}
          placeholder={t('typeAnswer')}
          onChange={(e) => onChange && onChange({ value: e.target.value.replace(/[^0-9-]/g, '') })}
          className="min-h-[56px] w-full rounded-2xl border border-ink/[0.1] bg-white px-4 font-display text-xl font-bold tabular-nums text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/25"
        />
      ) : (
        <OptionGrid
          options={item.options || []}
          value={value}
          disabled={disabled}
          onSelect={onChange}
        />
      )}

      <p className="mt-4 text-xs text-ink/45">{t('autoSavedHint')}</p>
    </section>
  );
}
