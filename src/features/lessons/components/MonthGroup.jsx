// MonthGroup.jsx
// Collapsible month section for the Lesson Hub V2 list. The curriculum is
// built in 10-lesson months (curriculum_lessons.month), so the list reads
// as "Month 1, Month 2, ..." - collapsible so a long curriculum doesn't
// force endless scrolling. `forceOpen` (search/filter active) overrides
// the collapse so matches are never hidden behind a closed header.
import { useState } from 'react';
import { ChevronDown, FolderOpen, Folder } from 'lucide-react';

export default function MonthGroup({ label, count, forceOpen = false, children }) {
  const [open, setOpen] = useState(true);
  const isOpen = forceOpen || open;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-ink/5"
        aria-expanded={isOpen}
      >
        <ChevronDown size={16} className={`flex-shrink-0 text-ink/40 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
        {isOpen ? (
          <FolderOpen size={15} className="flex-shrink-0 text-brand-500" aria-hidden="true" />
        ) : (
          <Folder size={15} className="flex-shrink-0 text-ink/40" aria-hidden="true" />
        )}
        <span className="font-display text-sm font-bold text-ink">{label}</span>
        <span className="flex-shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-ink/50">{count}</span>
      </button>
      {isOpen && <div className="mt-1 space-y-2 pl-5 sm:pl-6">{children}</div>}
    </section>
  );
}
