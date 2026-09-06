# Student Portal Visual QA Audit — 2026-08-15

Read-only, no edits. Covers the 7 student-facing pages after the card-idiom (Phase 1), MyRanking (Phase 2), and StatusPill/ErrorBanner/Skeleton (Phase 3) sessions. Ranking V2 work excluded per standing boundary.

## Coherence check: StatusPill / Skeleton / ErrorBanner together
The three now share one visual grammar — `rounded-full`/`rounded-lg`/`rounded-xl` at consistent radii, the same `TONE` colors, same `border-ink/[0.06]` card border, same `animate-pulse bg-ink/5` weight — so where they've been adopted (Homework, Certificates, Progress, Ranking) the portal reads as one system, not three. The problem is adoption isn't complete yet (below), not that the components disagree with each other.

## New inconsistency introduced by the last session (highest priority)
**`MyExams.jsx` was not updated and is now the odd one out.** Its own header comment states it "mirrors `MyHomework.jsx` exactly" — before this session's work that was true; now it isn't. Confirmed via grep:
- Still has the raw duplicated error banner (`border-inactive/30 bg-inactive/5 ...`) instead of `ErrorBanner`.
- Still has the inline 3-way ternary status-pill markup (`rounded-full px-2 py-0.5 text-[10px] font-bold ${...}`) instead of `StatusPill`.
- Almost certainly still lacks the responsive/border fixes Homework got in Phase 1 (not re-verified line-by-line this pass, but the file wasn't touched in any commit).

Since Homework and Exams are meant to be twins, this is now a visible regression in consistency, not just a pre-existing gap. **Recommend this be the first fix in the next implementation session** — it's a mechanical repeat of already-proven Phase 1/3 patterns, not new design work.

## Per-page status
| Page | Card idiom | Loading state | Status pills | Notes |
|---|---|---|---|---|
| MyHomework | ✅ bordered, responsive | ✅ Skeleton | ✅ StatusPill | Clean |
| MyCertificates | ✅ bordered, responsive | ✅ Skeleton | n/a | Clean |
| MyProgress | ✅ bordered | ✅ Skeleton (non-ranking sections) | ✅ StatusPill | KPI grid loading state intentionally deferred (ranking-derived) |
| MyRanking | ✅ StatCard/Panel (Phase 2) | partial (`PointsSummary` has its own `loading` prop) | n/a | Now diverged further — uses `PointsSummary`, a Ranking V2-specific component; out of scope to touch |
| MyExams | ❌ not updated | ❌ no `loading` usage | ❌ inline duplicate | See above — top fix candidate |
| PortalHomeV3 | mostly ✅ — one un-bordered card (`notLinkedYet` fallback, line ~298) | ❌ doesn't read `useAcademy().loading` | ✅ StatusPill (tone aliases) | Otherwise the most mature page; the one un-bordered card is a low-traffic edge state |
| MyVocabulary/Dictionary/GameCenter/word games | not reviewed this pass | — | — | Lower priority per original audit; largely self-contained game UIs, not part of the KPI/card system |

## Mobile (320–375px) — static review
No new risk found beyond what Phase 1/3 already fixed. Everything touched in prior sessions carries `border-ink/[0.06]`, `sm:p-4`, and `break-words`/`min-w-0` where text can be long. **`MyExams.jsx` is the one page still carrying the pre-Phase-1 zero-breakpoint pattern** (same defect class as Homework/Certificates had before) — needs the identical treatment.

## Micro-interactions
Not evaluated in depth this pass — deliberately deferred per the original session boundary ("animations/micro-interactions" out of scope for Phases 1–3). Worth a dedicated look once `MyExams` is caught up, so motion is added to a portal that's already visually consistent rather than layered onto a still-inconsistent one.

## Browser verification
Still not possible — no student test account available this session either. Everything above is static/code-level review plus the already-passing build from prior commits; nothing new was built or run in this pass since no code changed.

## Recommendation for next implementation session
1. Bring `MyExams.jsx` up to parity with `MyHomework.jsx` (ErrorBanner, StatusPill, card border/responsive fixes, Skeleton loading) — mechanical, low-risk, closes the one real regression.
2. Add the same un-bordered-card fix to `PortalHomeV3`'s `notLinkedYet` fallback (one-line change, but only if picking this up so it doesn't get missed).
3. Only after that: consider micro-interactions and a MyVocabulary/Dictionary/GameCenter pass, per the original session scope ordering.
