// QuickActions.jsx
// Row of role-appropriate shortcuts to real existing routes. Every action
// must point at a page that already exists and that the current role can
// already reach from the nav - this never invents functionality.

import { Link } from 'react-router-dom';

export default function QuickActions({ actions }) {
  if (!actions || actions.length === 0) return null;

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {actions.map(({ to, label, Icon }) => (
        <Link
          key={to + label}
          to={to}
          className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-ink/[0.08] bg-white px-3.5 py-2.5 text-sm font-semibold text-ink shadow-card transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600 active:bg-brand-100"
        >
          <Icon size={16} className="flex-shrink-0 text-brand-500" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </div>
  );
}
