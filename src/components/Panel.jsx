// Panel.jsx
// Small bordered card with a title (and optional action) used across the
// admin/teacher/student dashboards - extracted here once it was needed in
// a third place, rather than duplicated again.

export default function Panel({ title, children, action }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink/50">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
