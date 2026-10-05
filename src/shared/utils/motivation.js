// motivation.js
// Curated pool for the dashboard hero card's daily motivational line - a
// reusable data list, not a string inlined in JSX, so it can be reused or
// extended without touching the component. Uzbek entries are natural
// phrasing for students, not machine-translated word-for-word.

export const MOTIVATIONAL_QUOTES = {
  en: [
    'Every lesson makes you stronger.',
    'Small progress every day becomes big success.',
    'Consistency beats talent.',
    'Learn today. Lead tomorrow.',
    'Keep going. Your future self will thank you.',
    'Great things are built one lesson at a time.',
    "Success begins with today's effort.",
    'Every point you earn represents real progress.',
  ],
  uz: [
    'Har bir dars sizni kuchliroq qiladi.',
    'Har kungi kichik qadamlar katta muvaffaqiyatga aylanadi.',
    "Barqarorlik iste'moddan ustun turadi.",
    "Bugun o'rganing. Ertaga yetakchi bo'ling.",
    "Davom eting. Kelajakdagi o'zingiz sizga minnatdor bo'ladi.",
    "Katta natijalar bitta-bitta darsdan yig'iladi.",
    'Muvaffaqiyat bugungi harakatdan boshlanadi.',
    "Har bir to'plagan balingiz haqiqiy rivojlanishni anglatadi.",
  ],
};

const LAST_INDEX_KEY_PREFIX = 'dave-academy:last-motivation-index:';

// Random each call, but never immediately repeats the quote sessionStorage
// remembers from the last pick for this language - "don't repeat every
// refresh" without needing a fixed daily rotation. Tracked per-language so
// switching languages doesn't compare indexes across two different lists.
export function pickMotivation(lang = 'en') {
  const quotes = MOTIVATIONAL_QUOTES[lang] || MOTIVATIONAL_QUOTES.en;
  if (quotes.length <= 1) return quotes[0] || '';

  const storageKey = LAST_INDEX_KEY_PREFIX + lang;
  let lastIndex = -1;
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored != null) lastIndex = Number(stored);
  } catch {
    /* sessionStorage unavailable - fall through, just skip repeat-avoidance */
  }

  let index = Math.floor(Math.random() * quotes.length);
  if (index === lastIndex) index = (index + 1) % quotes.length;

  try {
    window.sessionStorage.setItem(storageKey, String(index));
  } catch {
    /* ignore */
  }

  return quotes[index];
}
