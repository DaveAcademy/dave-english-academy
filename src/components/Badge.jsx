// Badge.jsx

const LEVEL_STYLES = {
  A: 'bg-levelA/10 text-levelA border-levelA/30',
  B: 'bg-levelB/10 text-levelB border-levelB/30',
  C: 'bg-levelC/10 text-levelC border-levelC/30',
};

export function LevelBadge({ level }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${LEVEL_STYLES[level] || ''}`}>
      Level {level}
    </span>
  );
}

export function StatusBadge({ status }) {
  const isActive = status === 'Active';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        isActive ? 'bg-active/10 text-active border-active/30' : 'bg-inactive/10 text-inactive border-inactive/30'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-active' : 'bg-inactive'}`} />
      {status}
    </span>
  );
}
