// SettingsSection.jsx
// Compact collapsible wrapper for Admin Settings groups. Single-open
// accordion behavior is managed by the parent via `open`/`onToggle`.
// Content JSX is unchanged - this only controls visibility.

import { ChevronDown } from 'lucide-react';

export default function SettingsSection({ id, icon: Icon, title, subtitle, open, onToggle, children, defaultOpen = false }) {
  const expanded = open ?? defaultOpen;
  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-card">
      <button
        type="button"
        onClick={() => onToggle?.(id)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/[0.02] sm:px-5"
      >
        {Icon && <Icon size={18} className="flex-shrink-0 text-brand-500" aria-hidden="true" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-base font-bold text-ink">{title}</span>
          {subtitle && <span className="block truncate text-xs text-ink/50">{subtitle}</span>}
        </span>
        <ChevronDown size={18} className={`flex-shrink-0 text-ink/40 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {expanded && <div className="border-t border-ink/[0.06] px-4 py-4 sm:px-5">{children}</div>}
    </section>
  );
}
