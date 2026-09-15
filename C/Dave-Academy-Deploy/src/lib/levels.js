// levels.js — the single source of truth for the academy's level groups.
// Every filter, dashboard, roster, ranking, form and pace control derives the
// list from here, so adding a new group is one array element here + the DB
// rows (see migrations 0095/0096) - never a scatter of hardcoded arrays.
export const LEVELS = ['A', 'A1', 'B', 'C'];