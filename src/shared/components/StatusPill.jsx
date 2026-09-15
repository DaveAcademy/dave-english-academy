// StatusPill.jsx
// Small text+color status label ("On track" / "Watch" / "Needs attention" /
// "Waiting for data") so status is never communicated by color alone.
// Colors come from the shared utils/tone.js palette (same as StatCard/
// AttentionCard) instead of a second, parallel tone vocabulary - this used
// to define its own good/watch/attention/info classes that happened to
// match TONE's success/warning/danger/info by coincidence. ALIAS keeps
// every existing call site (good/watch/attention) working unchanged;
// info/success/warning/danger/brand/neutral can also be passed directly.

import { TONE } from '../../utils/tone';

const ALIAS = { good: 'success', watch: 'warning', attention: 'danger' };

export default function StatusPill({ tone = 'success', children }) {
  const key = ALIAS[tone] || tone;
  const t = TONE[key] || TONE.success;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${t.soft} ${t.text}`}>{children}</span>;
}
