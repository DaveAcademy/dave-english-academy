// SectionLabel.jsx
// Small eyebrow heading above a group of cards (Quick actions, Needs
// attention, Analytics, ...) so the dashboard reads as labeled sections
// instead of an undifferentiated stack of cards - purely a scanning aid,
// separate from each individual Panel/AttentionCard's own title.

export default function SectionLabel({ children }) {
  return <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">{children}</h2>;
}
