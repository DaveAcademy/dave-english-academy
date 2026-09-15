# Game Content Bank — Authoring Standards (2026-08-16)

Applies to the 3 `game_content_bank`-driven games: Sentence Scramble, Word Detective, Grammar Battle. The 6 vocabulary-driven games (Word Scramble, Vocabulary Quiz, Word Match, Speed Challenge, Word Builder, Listening Challenge) already draw from `lesson_vocabulary` (938 active words) and need no content expansion.

Target: **≥100 items per game**, split **45 easy / 35 medium / 20 hard** (revised down from an even 40/35/25 — many younger learners, frequent success matters more than volume of hard content). A content-bank size, not a round size — rounds stay 8–10 items as today, drawn from this larger pool so students don't see repeats.

Sentence-purpose mix (applies wherever the game has a `type`/purpose field — Sentence Scramble today): roughly 50% statement / 20% question / 15% negative / 10% command / 5% exclamation overall. Commands and exclamations concentrate at easy (they're grammatically simple by nature); hard tier is statements/questions only.

Content should favor **concrete, everyday situations a 10-14 year old actually experiences** ("My mom is making breakfast," "We forgot our homework," "The bus is late again") over generic template sentences ("She reads books"), and include generous humor/absurdity (~10-15%, more than originally planned) — memorable content, not just grammatically correct content. Avoid references that assume a specific place/experience a student may not share (e.g. "have you visited Paris") — prefer universal experiences.

**Vocabulary discipline (hard rule, not a suggestion):** at every difficulty tier, vocabulary must stay within words a 10-14 year old already knows. Difficulty comes ONLY from grammatical structure — never from vocabulary rarity, at any tier including hard. If a sentence is hard because of one unfamiliar word (e.g. "despite," "museum," "mailman"), that's a vocabulary problem being disguised as a grammar problem — rewrite it with simpler words while keeping the same grammatical structure. Litmus test for every item: natural? every word understood by a 10-14 year old? is the difficulty intentional (grammar) rather than accidental (vocabulary)? would someone actually say this? memorable? If any answer is "not really," rewrite it.

**Smooth difficulty progression within medium/hard:** avoid jumps in modal/structure difficulty within a tier — e.g. "might" is noticeably harder than "can/should/must" and shouldn't appear alongside them at the same medium-tier density without deliberate placement toward the harder end of medium.

## Sentence Scramble

`payload`: `{ type: 'statement'|'question'|'negative'|'command'|'exclamation', tense: text, words: text[] }`. `category` = grammar topic (matches `tense` today).

- Natural, correct English only — no invented or stilted phrasing.
- Exactly one valid word order per sentence (no sentences where two shuffles would both read naturally — that's ambiguous, not just hard).
- Hard tier must be genuinely hard: mixed/third conditionals, passive with modals, defining/non-defining relative clauses, indirect questions, perfect modals, complex conjunctions/concession — not just "add a subordinate clause." A simple reported-speech sentence like "She said that she was busy" belongs at medium, not hard.
- No duplicate sentences, and avoid near-duplicates (same verb+object with only the subject swapped, repeated more than 2-3 times).
- Difficulty = sentence length + clause complexity + tense complexity, not vocabulary rarity (vocabulary should stay ordinary/common at every tier — the challenge is grammar, not obscure words).
- Coverage target across the ~100: present simple, present continuous, past simple, future, questions, negatives, modals, conditionals, passive, mixed/other — no single topic dominating.

## Grammar Battle

`payload`: `{ question: text, options: text[4], correct_index: int, category: text }`. `category` = grammar topic.

- One unambiguous correct answer; the other three options must each be a genuine, plausible learner mistake — not a nonsense filler.
- Coverage across tenses, articles, prepositions, conditionals, passive voice, relative clauses, modals, comparatives.
- Hard-tier questions test genuine subtlety (a mistake a B2-ish learner would actually make), not obscure grammar trivia unrelated to the curriculum.
- No duplicate questions; avoid testing the same rule with only the verb swapped more than 2-3 times.

## Word Detective

`payload`: `{ sentence: text, wrong_index: int, correction: text }`. `category` = mistake type (e.g. `subject_verb_agreement`, `preposition`, `article`, `tense`, `word_choice`).

- The sentence must contain exactly one clearly identifiable error — no sentences where more than one word could plausibly be "the" mistake.
- Errors must be real, common learner mistakes (the kind an actual student would make), not artificial trick constructions.
- `correction` should be short and specific (the corrected word/phrase, not a full essay explanation).
- Difficulty = how subtle the error is (obvious tense mismatch at easy → a mistake requiring real understanding at hard), not sentence length alone.
- Coverage across mistake categories, not concentrated in one type.

## Shared rules (all three)

- No copyrighted source text — original or clearly generic/public-domain-style sentences only.
- No repeated items within a game, and limited near-duplicates.
- Every item must have exactly one correct answer path.
