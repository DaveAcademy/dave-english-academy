// ExampleBox.jsx — one static instructional example per stage.
// Same for every test (present and future): demonstrates the task method
// with content verified distinct from all real items. Never graded,
// never counted. English sample material; label localized.
import { ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';

const SAMPLE_KEY = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  sentences: 'Sentences',
  writing: 'Writing',
};

export default function ExampleBox({ stage, t, collapsed, onToggle }) {
  const suffix = SAMPLE_KEY[stage];
  if (!suffix) return null;
  return (
    <div className="mb-3 rounded-2xl border border-dashed border-brand-300 bg-brand-50/50 px-3 py-2.5 sm:px-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <Lightbulb size={13} className="shrink-0 text-brand-600" aria-hidden />
        <span className="flex-1 text-[11px] font-bold uppercase tracking-wide text-brand-700">{t('sampleLabel')}</span>
        {collapsed
          ? <ChevronDown size={14} className="shrink-0 text-brand-600" aria-hidden />
          : <ChevronUp size={14} className="shrink-0 text-brand-600" aria-hidden />}
      </button>
      {!collapsed && (
        <>
          <p className="mt-1 text-sm font-semibold text-ink">{t(`sample${suffix}Q`)}</p>
          <p className="mt-0.5 text-sm font-bold text-brand-700">✓ {t(`sample${suffix}A`)}</p>
        </>
      )}
    </div>
  );
}
