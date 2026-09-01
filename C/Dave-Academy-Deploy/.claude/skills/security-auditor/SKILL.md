---
name: security-auditor
description: >
  Application-layer security review for Dave English Academy — trigger on
  any change touching authentication, authorization/role checks, RLS
  policies, Supabase storage policies, JWT handling, secrets/env vars, raw
  SQL construction, user-supplied content rendered in the UI, or anything
  crossing a permission boundary (student vs teacher vs admin). This is a
  hard gate: security must never be weakened to make a feature easier to
  ship, even temporarily. Trigger on requests like "add a login flow",
  "let teachers upload X", "add an admin-only page", or "why can a student
  see Y they shouldn't".
---

# Security Auditor

## Purpose

Dave English Academy has real student data, real payments, and three
distinct trust levels (student, teacher, admin). This skill is the
app-layer counterpart to [[database-safety-auditor]] — that skill locks
down the database itself (RLS, `SECURITY DEFINER`), this one checks that
the application code built on top of it doesn't create a way around those
protections.

## When it activates

- New or changed authentication/session logic.
- New or changed role/permission checks (anything gating student vs
  teacher vs admin access).
- Storage bucket policies (file uploads — homework, PDFs, images).
- Anywhere a JWT or session token is read, passed, or stored.
- Anywhere a secret or API key would need to be referenced.
- Any raw SQL string building (even if rare in a Supabase-client codebase,
  check for it) or any place user input flows into a query.
- Any place user-supplied content (names, chat messages, homework text) is
  rendered into the DOM, where XSS is possible if unescaped.

It does not activate for changes with no permission or trust-boundary
implications (e.g. reformatting a stat card, adjusting a color).

## What it checks

- **Authentication:** session/token handling doesn't leak into logs, URLs,
  or client-visible state beyond what's necessary.
- **Authorization:** every new UI surface and API path checks role
  correctly, not just hides a button — a hidden button is not a security
  boundary if the underlying request still succeeds for the wrong role.
- **RLS alignment:** the application's assumption about what a role can
  read/write actually matches the RLS policy enforcing it (cross-check with
  [[database-safety-auditor]] rather than trusting the UI alone).
- **Storage policies:** upload/download policies scope access the same way
  the corresponding table's RLS does — a common gap is table RLS correctly
  scoped but the storage bucket left broader.
- **JWT usage:** tokens aren't decoded/trusted for authorization decisions
  on data they don't actually cover; role claims are checked against the
  source of truth, not assumed from client state alone.
- **Secrets:** no API key, service-role key, or credential is added to
  client-bundled code, committed to a migration, or logged.
- **SQL safety:** any dynamic SQL uses parameterization; no string
  concatenation of user input into a query.
- **XSS:** user-supplied strings rendered as HTML (not just text) are
  sanitized or escaped; be specific about which fields are affected.
- **Permission boundaries:** a student-facing change can't reach
  teacher/admin-only data or actions, and vice versa isn't accidentally
  restricted either.

## What actions it takes

This is a hard gate on regressions: if a change weakens an existing
security boundary, block and say so plainly, then propose the fix that
preserves the boundary. "Ship it now, harden later" is not an acceptable
resolution for a security regression — that pattern is exactly what
produced the need for migration 0056's hardening pass on payment functions.
If the change is neutral or strengthens security, confirm briefly and move
on without a full report.

## Report format

```
🔐 Security Review — <feature/change>

Boundary affected: <student/teacher/admin, or specific resource>
Finding: <what's at risk, or "no regression found">
Severity: Critical / High / Medium / Low
Fix required before proceeding: Yes / No
```

## Examples

**Blocks:** a new teacher file-upload feature where the storage bucket
policy allows any authenticated user to write, not just teachers assigned
to that lesson → Critical, block until scoped correctly.

**Non-blocking, informational:** a new admin report page reads data already
covered by existing admin-only RLS, UI just adds a new view over it → no
new boundary, confirm and proceed.

**Doesn't trigger:** changing the spacing on the login form — no
permission logic touched.

## Thresholds

No threshold for severity classification by volume or scale — a security
gap is worth flagging regardless of how few users would be affected today,
because the cost of an exploited gap doesn't scale down with user count.
What does scale with judgment: don't invent hypothetical attack vectors
that require capabilities the app doesn't expose (e.g. flagging theoretical
timing attacks in a small internal admin tool is premature).

## Token usage rules

- Check only the code paths actually touched by the current change plus
  the specific RLS policy or storage policy it depends on — not a full
  security audit of the whole app on every change.
- Where [[database-safety-auditor]] has already verified the DB-side
  policy in the same session, reference that result instead of re-querying
  it.
- Keep reports to the finding and fix — don't restate general security
  theory the user already knows.
