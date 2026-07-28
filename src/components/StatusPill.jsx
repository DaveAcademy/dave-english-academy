// StatusPill.jsx
// Small text+color status label ("On track" / "Watch" / "Needs attention" /
// "Waiting for data") so status is never communicated by color alone.

const TONE = {
  good: 'bg-active/10 text-active',
  watch: 'bg-levelB/10 text-levelB',
  attention: 'bg-inactive/10 text-inactive',
  info: 'bg-levelA/10 text-levelA',
};

export default function StatusPill({ tone = 'good', children }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[tone] || TONE.good}`}>{children}</span>;
}
