// Central payment UI config — single source of truth for frontend thresholds.
// Backend keeps its own 5-day constant (0220) for status calculation; this
// mirrors it for the additional client-side due_soon hint (daysFromToday).
// Change here and both classifyPayment + duplicate guard update together.
export const DUE_SOON_DAYS = 5;
export const TIMELINE_INITIAL_LIMIT = 20;
