// Panel.jsx
// Small bordered card with a title (and optional action) used across the
// admin/teacher/student dashboards - extracted here once it was needed in
// a third place, rather than duplicated again.

export default function Panel({ title, children, action, icon: Icon }) {
  return (
    <div className="rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink/50">
          {Icon && <Icon size={14} className="text-ink/40" aria-hidden="true" />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}
