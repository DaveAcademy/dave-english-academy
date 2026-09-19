// ExampleBox.jsx — one static instructional example per stage.
// Same for every test (present and future): demonstrates the task method
// with content verified distinct from all real items. Never graded,
// never counted. English sample material; label localized.
const SAMPLE_KEY = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  sentences: 'Sentences',
  writing: 'Writing',
};

export default function ExampleBox({ stage, t }) {
  const suffix = SAMPLE_KEY[stage];
  if (!suffix) return null;
  return (
    <div className="mb-3 rounded-2xl border border-dashed border-brand-300 bg-brand-50/50 p-3 sm:p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-brand-700">{t('sampleLabel')}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{t(`sample${suffix}Q`)}</p>
      <p className="mt-0.5 text-sm font-bold text-brand-700">✓ {t(`sample${suffix}A`)}</p>
    </div>
  );
}
