---
name: ui-consistency-auditor
description: >
  Visual and structural consistency review for Dave English Academy UI
  changes — trigger whenever a component, page, or style is added or
  edited in src/components/ or src/pages/. Checks spacing, typography,
  colors, border radius, responsiveness across mobile/tablet/desktop, dark
  mode, localization display, overflow, and browser console errors before
  the change is considered ready to show the user or deploy. Trigger on
  "add a page for X", "redesign Y", "make this responsive", or any request
  to build or change something visible in the app.
---

# UI Consistency Auditor

## Purpose

Dave English Academy is a two-role-facing app (admin/teacher dashboard +
student portal) with bilingual UI (English/Uzbek) and real usage on phones,
not just desktop. Inconsistency compounds fast in a codebase this size —
one page with different spacing or an unhandled dark-mode color becomes the
pattern the next page copies. This skill is the pass that catches that
before it spreads, and before a UI change reaches [[release-checklist]]'s
pre-deploy gate.

## When it activates

Any addition or edit to a component (`src/components/`) or page
(`src/pages/`, including `src/pages/portal/`), or any global style change
(`index.css`, Tailwind config, shared UI primitives like `Panel.jsx`,
`StatCard.jsx`, `Badge.jsx`). Does not activate for pure backend/data-layer
changes with no rendered output.

## What it checks

- **Spacing:** matches the spacing scale already in use nearby (check a
  sibling component/page before inventing a new gap value).
- **Typography:** font size/weight/line-height consistent with equivalent
  elements elsewhere (a card title shouldn't be a different size than every
  other card title).
- **Colors:** uses existing theme tokens/Tailwind classes rather than a new
  hard-coded color; especially check this holds in dark mode, not just
  light.
- **Border radius:** consistent with the shared primitives (`Panel`,
  `Badge`, `StatCard`, etc.) rather than a one-off value.
- **Responsiveness:** actually verified at mobile, tablet, and desktop
  widths via the browser preview — not just assumed from Tailwind
  responsive classes being present. Layout shouldn't break, overlap, or
  require horizontal scroll at any of the three.
- **Dark mode:** verified, not just "should work because we used theme
  classes" — some combinations only reveal contrast/legibility problems
  when actually rendered dark.
- **Localization display:** Uzbek text (often longer than English) doesn't
  overflow, truncate awkwardly, or break layout — check with real EN and
  UZ strings, not lorem ipsum. Coordinate with [[translation-auditor]] for
  the correctness of the strings themselves; this skill only checks how
  they render.
- **Overflow:** no unintended scrollbars, clipped content, or text overrun
  at any of the three breakpoints.
- **Console errors:** the browser console is clean (no new warnings/errors)
  after the change, checked via the preview tools, not assumed.

## What actions it takes

Verify visually using the browser preview tools before reporting anything
— this skill should not report a hunch about spacing without having
actually looked. If everything checks out, say so briefly. If something's
off, report it; UI inconsistencies are rarely urgent enough to block
mid-task the way [[security-auditor]] findings are, but should be reported
before the change is called done or deployed.

## Report format

```
🎨 UI Consistency Report — <component/page>

Checked: <breakpoints/modes actually verified, e.g. "mobile, desktop, dark mode">
Findings: <list, or "None">
Console: Clean / Errors found (list)
Blocking for deploy: Yes / No
```

## Examples

**Reports a finding:** a new `StatCard` variant uses `rounded-lg` while
every other card in the dashboard uses `rounded-xl` → flag as a small
inconsistency, non-blocking, recommend matching the existing radius.

**Reports and blocks:** a new portal page overflows horizontally on mobile
because a table isn't wrapped in a scroll container → flag as blocking for
deploy, since it breaks the mobile experience real students use.

**Doesn't trigger:** editing a Supabase RPC function with no UI change.

## Thresholds

Report visual deviations that are visible without zooming in or that break
usability (overflow, unreadable dark-mode contrast, broken responsive
layout). Skip sub-pixel or highly subjective spacing differences that
wouldn't be noticed without a side-by-side comparison — that's not worth
interrupting for at this project's size.

## Token usage rules

- Verify via the browser preview tools directly rather than trying to
  infer rendering from source alone — but scope the check to the
  component/page actually changed, not a full site walkthrough, unless the
  change is global (shared primitive, `index.css`).
- Take one screenshot per state that matters (e.g. mobile + dark) rather
  than an exhaustive matrix of every breakpoint × theme combination, unless
  the change specifically affects breakpoint or theme logic.
- Don't paste full component source into the report — reference file and
  line.
