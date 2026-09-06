---
name: translation-auditor
description: >
  Bilingual completeness and correctness review for Dave English Academy,
  which ships in English and Uzbek via src/locales/en and src/locales/uz.
  Trigger whenever UI-facing strings are added or changed, whenever a new
  component/page is built, or when the user asks about translations,
  localization, or "does this work in Uzbek". Checks for missing
  translation keys, hardcoded strings that bypass i18n, inconsistent
  wording between the two languages, and locale-aware date/time/number
  formatting.
---

# Translation Auditor

## Purpose

Every new piece of UI text in this app needs to exist correctly in both
`src/locales/en` and `src/locales/uz` — a string that only exists in
English silently breaks the Uzbek experience for real students and
teachers using that language. This skill is the check specifically for
translation completeness and correctness; how the translated string
*renders* (overflow, truncation) is [[ui-consistency-auditor]]'s job, not
this one.

## When it activates

- Any new UI string is introduced anywhere in `src/`.
- Any existing string is changed in meaning (not just checking the key
  exists — checking the translation still matches).
- A new component or page is added (new pages almost always mean new
  keys).
- The user directly asks about translation/localization completeness.

## What it checks

- **Missing keys:** every key added to `src/locales/en` has a
  corresponding key in `src/locales/uz`, and vice versa — check both
  directions, not just "did I add the English one."
- **Hardcoded strings:** UI text written directly in JSX instead of routed
  through the i18n lookup (`src/i18n/index.js`) — these are invisible to
  translation entirely and are the most common way bilingual coverage
  quietly degrades.
- **Inconsistent wording:** the same concept translated differently in
  different places (e.g. "Homework" translated one way on the dashboard and
  differently in the portal) — check against how the term is already used
  elsewhere in the same locale file before adding a new phrasing.
- **Locale formatting:** dates, times, and numbers use locale-aware
  formatting rather than a hardcoded format string, so they render
  correctly for both languages' conventions.
- **Bilingual completeness:** for a feature to be called done, both locale
  files need every key it introduced — this feeds directly into
  [[feature-completion-checker]]'s "truly complete" verdict for anything
  with new UI text.

## What actions it takes

If a key is missing in one locale, add it (matching the tone/register of
existing entries in that file) rather than just flagging it — this is
usually a small, mechanical fix. If a hardcoded string is found, route it
through i18n and add both locale entries. If wording is inconsistent,
flag it for the user to confirm the correct phrasing rather than guessing,
since getting the Uzbek wrong is worse than leaving it flagged.

## Report format

Only needed when something can't be auto-resolved (ambiguous wording,
uncertain translation) — mechanical fixes (adding a missing key using the
existing pattern) don't need a report, just do them and note it briefly.

```
🌐 Translation Note — <feature/component>

Missing: <keys missing from en/uz, or "None">
Hardcoded: <strings bypassing i18n, or "None">
Needs confirmation: <ambiguous wording that needs the user's call, or "None">
```

## Examples

**Auto-fixes:** a new "Certificate issued" toast has an English key added
but no Uzbek entry → add the Uzbek translation matching existing tone, note
it was added.

**Flags for confirmation:** a new feature uses "progress" in a context
where the existing Uzbek translations use two different words for
"progress" depending on context (academic progress vs. task progress) →
ask which fits before picking one.

**Doesn't trigger:** a pure backend/migration change with no new UI string.

## Thresholds

Missing keys and hardcoded strings: always worth fixing, no threshold —
these are binary correctness issues, not judgment calls. Wording
consistency: only worth flagging when the same concept is genuinely
user-facing in both places (not two unrelated uses of a common word like
"add").

## Token usage rules

- Check only the locale keys relevant to the feature being worked on —
  don't diff the entire `en`/`uz` trees against each other on every small
  change unless doing a dedicated full-coverage audit.
- When adding a translation, match existing patterns in the locale file
  rather than reasoning from scratch each time.
- Report only what needs the user's input; silently-correct mechanical
  fixes don't need a full report block.
