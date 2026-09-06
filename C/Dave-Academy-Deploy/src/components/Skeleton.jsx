// Skeleton.jsx
// Shared pulse-loading placeholder, same visual pattern as AttentionCard's
// (private) SkeletonRows - extracted here so other pages reuse one loading
// treatment instead of each inventing its own.

export function SkeletonLine({ width = '100%', className = '' }) {
  return <div className={`h-4 animate-pulse rounded bg-ink/5 ${className}`} style={{ width }} />;
}

// One card-shaped placeholder matching the bordered list-row idiom used
// across the portal (MyHomework/MyCertificates/MyProgress rows).
export function SkeletonCard({ lines = 2 }) {
  return (
    <div className="rounded-xl border border-ink/[0.06] bg-white p-3 shadow-card sm:p-4">
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine key={i} width={i === 0 ? '55%' : '35%'} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3, lines = 2 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  );
}
