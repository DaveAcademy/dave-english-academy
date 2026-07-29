// motivation.js
// Curated pool for the dashboard hero card's daily motivational line - a
// reusable data list, not a string inlined in JSX, so it can be reused or
// extended without touching the component.

export const MOTIVATIONAL_QUOTES = [
  'Every lesson makes you stronger.',
  'Small progress every day becomes big success.',
  'Consistency beats talent.',
  'Learn today. Lead tomorrow.',
  'Keep going. Your future self will thank you.',
  'Great things are built one lesson at a time.',
  "Success begins with today's effort.",
  'Every point you earn represents real progress.',
];

const LAST_INDEX_KEY = 'dave-academy:last-motivation-index';

// Random each call, but never immediately repeats the quote sessionStorage
// remembers from the last pick - "don't repeat every refresh" without
// needing a fixed daily rotation.
export function pickMotivation() {
  if (MOTIVATIONAL_QUOTES.length <= 1) return MOTIVATIONAL_QUOTES[0] || '';

  let lastIndex = -1;
  try {
    const stored = window.sessionStorage.getItem(LAST_INDEX_KEY);
    if (stored != null) lastIndex = Number(stored);
  } catch {
    /* sessionStorage unavailable - fall through, just skip repeat-avoidance */
  }

  let index = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  if (index === lastIndex) index = (index + 1) % MOTIVATIONAL_QUOTES.length;

  try {
    window.sessionStorage.setItem(LAST_INDEX_KEY, String(index));
  } catch {
    /* ignore */
  }

  return MOTIVATIONAL_QUOTES[index];
}
