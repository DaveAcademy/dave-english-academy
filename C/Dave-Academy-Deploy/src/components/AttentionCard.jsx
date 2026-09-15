// AttentionCard.jsx
// A single "needs attention" panel: a short, capped list of real,
// actionable items (not a general-purpose notification feed). Each
// section only renders if it actually has items, so the dashboard never
// shows an empty "Attention" panel just to fill space.

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { TONE } from '../utils/tone';

function AttentionRow({ item }) {
  const dot = (TONE[item.tone] || TONE.info).dot;
  const content = (
    <div className="flex items-center gap-3 py-2">
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{item.label}</p>
        {item.detail && <p className="truncate text-xs text-ink/50">{item.detail}</p>}
      </div>
      {item.to && <ChevronRight size={15} className="flex-shrink-0 text-ink/30" aria-hidden="true" />}
    </div>
  );

  if (!item.to) return content;
  return (
    <Link to={item.to} className="-mx-1 block rounded-lg px-1 transition-colors hover:bg-ink/5 active:bg-ink/[0.07]">
      {content}
    </Link>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 py-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-4 w-full animate-pulse rounded bg-ink/5" style={{ width: `${80 - i * 15}%` }} />
      ))}
    </div>
  );
}

export default function AttentionCard({ title, icon: Icon, items, emptyText, cta, loading }) {
  return (
    <div className="rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink/50">
          {Icon && <Icon size={14} className="text-ink/40" />}
          {title}
        </h2>
        {cta}
      </div>
      {loading ? (
        <SkeletonRows />
      ) : items.length === 0 ? (
        <p className="py-1 text-sm text-ink/40">{emptyText}</p>
      ) : (
        <div className="divide-y divide-ink/5">
          {items.map((item) => (
            <AttentionRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
