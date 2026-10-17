// PerformanceBadge.jsx - renders the performance_level the server computed.
// The label comes straight from the attempt payload; the client never derives
// a band from a percentage it calculated.
import { useTranslation } from 'react-i18next';
import { Award } from 'lucide-react';
import { performanceTone, performanceKey } from '../lib/iqScoring';

const TONES = {
  neutral: 'bg-ink/[0.06] text-ink/70 ring-ink/[0.08]',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export default function PerformanceBadge({ level }) {
  const { t } = useTranslation('iqbrain');
  if (!level) return null;
  const tone = TONES[performanceTone(level)] || TONES.neutral;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${tone}`}>
      <Award size={13} aria-hidden />
      {t(`level.${performanceKey(level)}`)}
    </span>
  );
}
