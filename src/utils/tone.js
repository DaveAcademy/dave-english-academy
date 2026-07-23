// tone.js
// Single semantic color mapping shared by every dashboard stat card, alert,
// and status dot, so "success"/"warning"/"danger"/"info" mean the same
// thing everywhere instead of each component picking its own accent name.
// Maps onto colors already defined in tailwind.config.js (active/inactive/
// levelA/levelB/brand) rather than introducing new design tokens, so
// nothing outside the dashboards is affected by this file existing.

export const TONE = {
  success: { bar: 'bg-active', soft: 'bg-active/10', text: 'text-active', dot: 'bg-active' },
  warning: { bar: 'bg-levelB', soft: 'bg-levelB/10', text: 'text-levelB', dot: 'bg-levelB' },
  danger: { bar: 'bg-inactive', soft: 'bg-inactive/10', text: 'text-inactive', dot: 'bg-inactive' },
  info: { bar: 'bg-levelA', soft: 'bg-levelA/10', text: 'text-levelA', dot: 'bg-levelA' },
  brand: { bar: 'bg-brand-500', soft: 'bg-brand-50', text: 'text-brand-500', dot: 'bg-brand-500' },
  neutral: { bar: 'bg-ink/30', soft: 'bg-ink/5', text: 'text-ink/50', dot: 'bg-ink/30' },
};
