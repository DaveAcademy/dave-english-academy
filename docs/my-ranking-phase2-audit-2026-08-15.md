# MyRanking.jsx — Phase 2 Audit (pre-implementation)

Read-only. No edits made. Scope: card idiom + mobile only, matching Phase 1's boundaries.

## Ranking V2 overlap check (the important question first)
**No conceptual overlap risk.** `docs/ranking-v2-class-session-design.md` (§ RPC plan) states `get_group_leaderboard()`/`get_student_ranking_summary()` — the two RPCs `MyRanking.jsx` calls — are being **extended, not replaced**; the new `class_session`-backed RPCs (`0139_class_session_leaderboard_rpcs.sql`) are additive and feed the admin `Rankings.jsx` class_session breakdown only. `MyRanking.jsx`'s data layer is untouched by that work and safe to leave alone. Phase 2 is pure UI — no RPC/data-shape changes needed or intended.

## Against `StatCard`
The "My Points Summary" 3-card row (week / month / lifetime points) is hand-rolled JSX (`rounded-xl bg-white p-3 text-center shadow-card`), not `StatCard`, despite being a textbook KPI-card use case. It's also the **only** unbordered, non-`StatCard` stat block left in the portal after Phase 1. Straightforward swap: 3× `StatCard` with `tone="brand"`/`"info"`/`"brand"` (lifetime keeps its filled-brand emphasis via a tone choice, not a bespoke background) and `value={summary ? row : '—'}` using `StatCard`'s own `loading` prop instead of the current inline `'…'` placeholder.

## Against `Panel`
Recognition, Achievements, and Leaderboard are each a raw `<section><h2>...` — not `Panel`. `Panel` already provides the exact `title` + bordered-card wrapper this needs. Swapping the three section headers to `Panel` (content unchanged inside) removes the last un-bordered `rounded-xl bg-white shadow-card` cards outside the leaderboard grid itself.

## Existing portal spacing/layout conventions
Card padding here is `p-3` uniformly, no `sm:p-4` bump (Phase 1 pattern). Recognition/achievement/leaderboard cards are missing `border border-ink/[0.06]` — same defect class Phase 1 fixed elsewhere. Grid pattern (`grid gap-2 sm:grid-cols-2 lg:grid-cols-3`) already matches portal convention and is fine as-is.

## Mobile behavior
- Points-summary `grid-cols-3` has **no mobile override** — three cards squeeze into one row at 320–375px; numbers/labels will be cramped (worse once `StatCard`'s larger `font-display text-2xl` numeral is applied). Needs `grid-cols-3` kept (identity/comparison value of seeing all 3 at once) but with tighter mobile padding, or drop to a 2-col/1-col stack below `sm`. Needs a decision, not just copy from Phase 1.
- Leaderboard row: `truncate` is used correctly here (`min-w-0 flex-1` wraps the name), unlike the Phase 1 filename bug — no equivalent defect found on first pass, but worth re-checking after `StatCard`/`Panel` swap in case new width constraints appear.
- Period-tab buttons (`This Week/Month/All-Time`) — no responsive sizing issue found; row already wraps via natural button flow, screen width is adequate for 3 short labels.
- Rank-change arrow + points column (`flex-shrink-0 flex-col items-end`) — safe on mobile, fixed-width numeric column, no overflow risk identified.

## Achievements grid — flag, not a Phase 2 fix
Locked/earned achievement cards duplicate `BadgeShelf`'s visual concept with a second, incompatible markup (per the original audit). Reconciling that is explicitly **deferred** (achievement redesign is out of scope this phase) — leaving both cards as-is, just adding the border/Panel wrapper consistency fix, not touching the two-pattern problem itself.

## Proposed Phase 2 change list (UI-only, same boundary as Phase 1)
1. Points-summary row → 3× `StatCard`, with an explicit mobile-safe grid decision (likely keep `grid-cols-3` but reduce padding/font-size at the smallest breakpoint, or confirm 3-across is acceptable at 320px — needs a call before implementing).
2. Recognition section → wrap in `Panel`; award cards get `border-ink/[0.06]` + `sm:p-4` bump (content/logic unchanged).
3. Achievements section → wrap in `Panel`; earned/locked cards get `border-ink/[0.06]` + `sm:p-4` bump only (no markup reconciliation).
4. Leaderboard section → wrap header/tabs area in consistent spacing; leaderboard row cards get `border-ink/[0.06]` + `sm:p-4` bump. Leave `isMe` highlight, medal colors, rank-change arrows untouched (ranking presentation logic, not card idiom).
5. No RPC changes, no ranking math changes, no achievement redesign, no admin `Rankings.jsx` changes.

Waiting for a decision on item 1 (mobile grid behavior for the 3-stat row) before implementing — everything else is a mechanical repeat of the Phase 1 pattern.
