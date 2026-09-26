---
name: business-rules-guardian
description: >
  Protects Dave English Academy's established business behavior — the
  ranking/points system, payment system, student progression, attendance,
  certificates, dashboard statistics, and the security/role model. Trigger
  whenever a change touches grading, scores, attendance, points, rankings,
  payments, certificates, or dashboard aggregation logic. Warn loudly if a
  proposed change would conflict with how the academy already works, and
  never let established business logic change silently — only change it
  when the user explicitly instructs it.
---

# Business Rules Guardian

## Purpose

Dave English Academy's core value chain — grading feeds points, points
feed rankings, rankings and grading feed both dashboards — is, per
[[dave-academy-regression-checklist]] (memory), the highest-risk path in
the app precisely because it's not obvious from any single file how many
things depend on it. This skill exists to stop a change from silently
altering academy behavior that students, teachers, and the business
actually rely on, as opposed to [[database-safety-auditor]] and
[[performance-watcher]], which check that changes are *technically* sound
but don't know whether the resulting behavior is what the academy actually
wants.

## When it activates

Any change touching:
- Grading/scoring (`exam_scores`, `homework_status`, `Exams.jsx`,
  `Homework.jsx`)
- Attendance (`lesson_attendance`, `Attendance.jsx`)
- Points/ranking logic (point category/transaction functions, migrations
  in the 0017–0023 and 0006–0008/0020 ranges, `get_leaderboard()`,
  `Rankings.jsx`, `MyRanking.jsx`)
- Payments (`payment_transactions`, payment status functions, migrations
  0054–0061, `Payments.jsx`, `PaymentEngineTest.jsx`)
- Student progression (level/course advancement logic)
- Certificates (`Certificates.jsx`)
- Dashboard statistics (`Dashboard.jsx`, `PortalHome.jsx`, `MyProgress.jsx`)
- The role/security model (student vs teacher vs admin behavior, not just
  the RLS enforcing it — that's [[security-auditor]]'s layer)

## What it checks

- **Does this change match established behavior, or silently redefine
  it?** E.g. does a "fix" to point calculation change how points have
  always been awarded, or genuinely correct a bug — these require
  different responses (the latter needs explicit confirmation the old
  behavior actually was a bug, not a feature).
- **Does it walk the full downstream chain?** Per
  [[dave-academy-regression-checklist]], any grading/attendance change
  needs to be checked through: grading → points awarded → student totals
  (`get_leaderboard()` + cached columns) → rankings pages → student
  dashboard → teacher/admin dashboard stats. A change that looks isolated
  to step 1 can break step 6 silently.
- **Does it preserve payment integrity?** Payment status functions were
  already hardened once (migration 0056) — any change to payment logic
  should be checked against not reintroducing a class of issue already
  fixed, and against not changing what counts as "paid"/"overdue" without
  the user explicitly deciding that.
- **Does it change who can see/do what?** A change to progression,
  certificates, or dashboard rules that alters what a student vs teacher
  vs admin can see or trigger is a business-rule change, not just a
  security question — flag it even if [[security-auditor]] finds no
  technical vulnerability.

## What actions it takes

If a change would alter established behavior and the user hasn't
explicitly said to change that behavior, stop and confirm before
proceeding — don't implement a silent behavior change even if it looks
like an improvement. If the user has explicitly instructed the change
("yes, change how points are weighted for late homework"), proceed, but
still walk the downstream chain from [[dave-academy-regression-checklist]]
so the change is applied consistently everywhere that logic surfaces
rather than just in the file directly edited.

## Report format

```
📐 Business Rules Check — <change>

Rule affected: <ranking / payment / progression / attendance / certificates / dashboard / security model>
Current behavior: <what the academy does today>
Proposed behavior: <what this change would do>
Explicitly instructed?: Yes / No
Downstream chain walked: <which of the 6 links from the regression checklist apply and were checked>
```

## Examples

**Stops and confirms:** a "quick fix" to `get_leaderboard()` changes how
tied ranks are broken, but the user only asked to fix a display bug on
`Rankings.jsx` → flag that the proposed fix touches ranking logic itself,
not just display, and confirm that's intended before proceeding.

**Proceeds with full chain:** the user explicitly says "attendance below
80% should now block certificate issuance" → this is an explicit business
rule change; implement it, but check it against all six links (does
attendance data flow correctly into whatever gates certificate issuance,
does the dashboard reflect the new rule, etc.).

**Doesn't trigger:** a copy change to a certificate's PDF header text — no
business logic touched.

## Thresholds

No threshold for "explicitly instructed" — that's binary, always confirm
if it's ambiguous. For downstream-chain walking, always walk it fully for
anything touching grading/attendance/points per
[[dave-academy-regression-checklist]]; for payments/certificates/dashboard
changes not on that specific chain, use judgment on how far the ripple
plausibly reaches.

## Token usage rules

- Reference [[dave-academy-regression-checklist]] rather than re-deriving
  the chain from scratch each time it applies.
- Check the specific downstream files the chain names rather than
  re-scanning the whole codebase for "anything that might depend on this."
- Keep the report to the rule and the delta — don't re-explain the whole
  academy's business model each time.
