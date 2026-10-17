// normalizeTranslation.js
// Pure input normalizer for translation answers (four-stage Homework).
//
// What it does: trims, collapses repeated whitespace, and strips harmless
// surrounding wrappers (quotes/brackets/parens) so trivial typing
// differences don't reach the grader. It does NOT strip sentence-final
// punctuation and does NOT fuzzy-match, reorder words, or accept synonyms.
//
// Why no trailing-punctuation stripping: the RPC compares against the
// stored key VERBATIM, and 287/294 seeded keys end with [. ! ?]. Stripping
// the student's final period would turn every exact answer into a mismatch
// (regression). Sentence-final parity needs both sides normalized, which
// requires an RPC change — deliberately out of scope. The stored key stays
// the source of truth and the RPC still decides correct/incorrect.

const LEAD_WRAP = /^[(\[{"'«“‘\s]+/u;
const TRAIL_WRAP = /[)\]}"'»”’\s]+$/u;

export function normalizeTranslationAnswer(text) {
  if (typeof text !== 'string') return '';
  let s = text.replace(/\s+/g, ' ').trim();
  // Peel surrounding wrappers until stable (bounded — mid-word characters
  // such as o'/g' and sentence-final punctuation are never touched).
  for (let i = 0; i < 4; i++) {
    const next = s.replace(LEAD_WRAP, '').replace(TRAIL_WRAP, '').trim();
    if (next === s) break;
    s = next;
  }
  return s;
}
