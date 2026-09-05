// vocabularyImport.js
// Parses the Vocabulary bulk-import textarea. Accepts one word pair per
// line, split on the first occurrence of any of - – — : | =. Known
// limitation: an english word/phrase that itself contains one of these
// characters (e.g. "co-worker") splits at that character, not the
// intended separator - acceptable for the target format (short word
// pairs), not worth a stricter grammar for this use case.

const SEPARATOR_PATTERN = /\s*[-–—:|=]\s*/;

export function parseVocabularyBulkImport(text, existingEnglish = []) {
  const seen = new Set(existingEnglish.map((w) => w.trim().toLowerCase()));
  const valid = [];
  const invalidLines = [];
  let duplicateCount = 0;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(SEPARATOR_PATTERN);
    if (!match) {
      invalidLines.push(rawLine);
      continue;
    }

    const english = line.slice(0, match.index).trim();
    const uzbek = line.slice(match.index + match[0].length).trim();
    if (!english || !uzbek) {
      invalidLines.push(rawLine);
      continue;
    }

    const key = english.toLowerCase();
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    valid.push({ english, uzbek });
  }

  return { valid, invalidLines, duplicateCount };
}
