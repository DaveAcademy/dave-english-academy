// homeworkListPaging.js
// Presentation-only pagination for the student lesson-homework hub list.
// The list is already lesson-sequential (ascending lesson_number, unnumbered
// last); these pure helpers slice it into groups of PAGE_SIZE for display.
// No queries, no reordering, no renumbering, no hidden items - the slice
// window is the only thing that changes.

export const HOMEWORK_PAGE_SIZE = 10;

export function pageCount(total, size = HOMEWORK_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

// Clamp any page index into [0, totalPages - 1] and slice the window.
export function paginate(items, pageIdx, size = HOMEWORK_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const pages = pageCount(list.length, size);
  const safe = Math.min(Math.max(0, pageIdx), pages - 1);
  const start = safe * size;
  return { page: safe, items: list.slice(start, start + size), start, totalPages: pages };
}

function lessonNumOf(lesson) {
  const n = lesson?.curriculum_lessons?.lesson_number;
  return typeof n === 'number' ? n : null;
}

// Range label from the ACTUAL lesson numbers in the window ("1–10"),
// falling back to positional labels when numbers are absent, so a label
// never claims numbers the slice does not contain.
export function pageRangeLabel(windowItems, startIdx) {
  const list = Array.isArray(windowItems) ? windowItems : [];
  if (list.length === 0) return `${startIdx + 1}–${startIdx}`;
  const first = lessonNumOf(list[0]);
  const last = lessonNumOf(list[list.length - 1]);
  if (first != null && last != null) return `${first}–${last}`;
  return `${startIdx + 1}–${startIdx + list.length}`;
}
