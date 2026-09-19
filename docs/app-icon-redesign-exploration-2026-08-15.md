# App Icon Redesign Exploration — 2026-08-15

Design exploration only. No production files modified — see Verification.

## ⚠️ Premise correction (important)

The brief describes the current icon as "essentially a D-shaped mark." **That is not what the current assets show.** Both `public/icons/icon-512.png` (used for the PWA icon/favicon) and `public/brand/logo-full.png` (used on the login screen, `src/components/auth/Login.jsx:30`) are the same composition: a peaked house/shield outline containing an open book with a lightbulb rising from its spine, with the word **"DAVE"** (and, on the full logo, "ENGLISH ACADEMY", a tagline, laurels, and "SINCE 2025") baked directly into the image as text. Colors are dark navy and gold/tan — not a "D" silhouette, and not built from the app's teal `brand` palette at all.

This matters for two of the stated constraints:
- **"Preserve a recognizable D silhouette"** — there is no existing D silhouette to preserve. The current mark's shape language is a shield/house, not a letterform.
- **"Remain visually connected to the existing D icon so students don't perceive it as unrelated"** — the honest continuity available is *color family* (if we choose to keep navy/gold) or *general geometric spirit* (rounded, architectural), not shape, since the current icon has no D to echo.

I've treated this as a genuine new-mark design (informed by, not derived from, the current logo) rather than forcing a false "evolution of the D" narrative. Flagging this explicitly rather than silently reinterpreting your brief — worth a quick decision on which continuity story you actually want before this goes further.

Also worth noting: the current icon already violates several of the constraints listed for the *new* icon (generic open book, generic lightbulb, embedded text) — so this redesign is a real improvement on the stated principles regardless of the D-mark question.

## 1. Current icon implementation and asset locations
- `public/icons/icon-192.png`, `public/icons/icon-512.png` — PWA/favicon icons, referenced from:
  - `vite.config.js:12,23-25` (VitePWA manifest `icons` array + `includeAssets`)
  - `index.html:8-9` (`<link rel="icon">`, `<link rel="apple-touch-icon">`, both point at `icon-192.png`)
- `public/brand/logo-full.png` — separate, larger/more detailed logo used once, on the login screen (`src/components/auth/Login.jsx:30`).
- No SVG source, no dedicated `favicon.ico`, no maskable-specific icon variant (the 512 PNG is reused with `purpose: 'maskable'` — see Technical issues below).
- No other component/page referencing a logo or icon asset (checked `Settings.jsx` — no logo usage found there despite initial expectation).

## 2. Existing icon dimensions/formats
- `icon-192.png` — 192×192, PNG, ~44.7 KB.
- `icon-512.png` — 512×512, PNG, ~291.8 KB (declared twice in the manifest: once plain, once `purpose: 'maskable'`, same file both times).
- `logo-full.png` — PNG, ~658 KB, larger/more detailed composition (not sized for icon use — a marketing/login-screen graphic).
- No SVG, no WebP, no dedicated favicon size (16×16/32×32 .ico).

## 3. Existing brand colors relevant to the icon
From `tailwind.config.js`, the app's actual UI palette (used everywhere in the student/admin portal):
- `ink` `#1B2430` (near-black text)
- `paper` `#F5F6F8` (app background)
- `brand.50` `#EAF3F3`, `brand.100` `#CFE4E3`, `brand.400` `#3E8E8C`, `brand.500` `#1F5E6B`, `brand.600` `#164A54`, `brand.700` `#0F373F` (teal scale — this is the app's real primary color)
- Semantic: `active` `#1F9D7C`, `inactive` `#E1584B`, `levelA` `#3E7CB1`, `levelA1` `#2C9E8F`, `levelB` `#F2A93B`, `levelC` `#7856A6`

Notably, `vite.config.js:17`'s PWA `theme_color: '#0f373f'` is exactly `brand.700` — the manifest's theme color already matches the app's teal UI palette, **not** the current icon's navy/gold. That's a pre-existing mismatch between "what color the OS chrome uses" and "what color the icon actually is." Documented only, not fixed here.

**Recommendation for the new mark:** build it from the `brand` teal scale (specifically `brand.700` as the dominant fill, `brand.50`/white as the counter/background) so the new icon and the app's own UI finally agree on a color identity — rather than continuing the navy/gold that appears nowhere else in the product.

## 4. Proposed D+A concept
A single-weight, rounded-geometric capital **D** as the primary silhouette, with the **A** discovered through a triangular negative-space cutout inside the D's bowl — not through an added stroke, decoration, or a literal second letterform overlaid on top. The cutout's proportions (apex-up triangle, sitting where a capital A's counter would be) are what carries the "A" reading once someone looks for it; at a glance and at small sizes it reads simply as a clean D mark.

Single fill color + background color only (no gradient, no outline-plus-fill combination) so it survives 48×48 legibly and works as a flat maskable icon.

## 5. Concrete variations

**A — Notch Column.** A bold capital D built from one thick vertical stroke on the left and one smooth continuous outer arc on the right, rounded terminals top and bottom, medium-heavy stroke weight (~18% of the glyph width). Where the vertical stroke meets the arc's counter, cut a single upward-pointing triangular notch into the counter (apex near the top, base near the bottom-center of the counter) — the triangle's silhouette against the D's white/paper-colored interior reads as an A when isolated. Single flat fill, `brand.700` on `paper`/white background, no outline.

**B — Split Peak D.** The bowl of the D is formed by two overlapping arcs (like two nested parentheses) whose outer edges define the D silhouette; where the arcs converge near the top of the bowl, let them taper to a visible peak/point before curving back out and down to close the shape — so the very top of the D's own outline forms a subtle A-apex, with no separate line added. Most minimal and abstract of the four; the A is the most "discovered," the D is unmistakable at any size. Single flat fill, `brand.700` on `brand.50`.

**C — Windowed D (recommended).** A solid, rounded-rectangle-based D silhouette (thick vertical spine, full rounded bowl — closer in weight/roundness to a friendly, "premium app icon" D than a typographic one). Cut one triangular negative-space window into the bowl, apex-up, positioned and proportioned to match a capital A's counter exactly (wide base near the bottom third of the bowl, narrowing to a point about two-thirds up) — cleaner and more centered than Variation A's notch, sized so the triangle is roughly 30–35% of the bowl's area. Two-tone: solid `brand.700` D-shape, triangle cutout shows the background color straight through (white/`paper` on light, `paper`/near-white on dark — see §8).

**D — Chevron-Leg D.** The left "spine" of the D is built from two diagonal strokes converging near the top (literally the two legs of a capital A) joined by a short horizontal crossbar tick about two-thirds up; a single clean arc sweeps from the convergence point down and around to close the bowl on the right, completing the D silhouette. The most literal "A hidden inside D" of the four — legible as A on close inspection, but still reads as D first because the arc dominates the silhouette. Slightly busier at 48×48 than A/B/C; best suited to 192×512 contexts (favicon/login) rather than the smallest home-screen size.

## 6. Recommended primary direction
**Variation C, "Windowed D."** Reasoning:
- Single solid shape + one simple negative-space cutout is the most robust pattern at 48×48 (fewest edges to lose to anti-aliasing/scaling).
- Reads as D immediately, A only on closer inspection — matches the stated design principle exactly ("D is the primary reading, A is discovered").
- A single flat cutout (vs. B's subtle taper or D's compound strokes) is also the easiest to keep crisp as a maskable/adaptive icon, where the OS applies its own mask shape over the icon and can clip subtle details.
- Two-tone flat fill translates cleanly to a monochrome favicon and a single-color app-icon-badge style if ever needed.

Variation A is the safe fallback if C's cutout proves too subtle in testing. Variation B is worth keeping as the "quieter/more abstract" alternative if a less literal mark is preferred. Variation D is the weakest fit for the smallest sizes — recommend not pursuing it further unless the icon will only ever be shown at ≥192px.

## 7. Small-size requirements
- **48×48** (approximate real-world minimum — Android home screen icons, browser tab favicon at high DPI): single fill color, single cutout only, stroke/spine width no thinner than ~4px at this size, no fine detail, no secondary color. This is the size that should drive the final proportions — design at 512 but continuously check by downscaling to 48.
- **96×96**: same shape, no added detail — this is a scaling checkpoint, not a chance to add anything back.
- **192×192**: current PWA icon size; safe to keep identical geometry to 48/96, just higher-fidelity edges.
- **512×512**: master size and the maskable-icon source. Must keep the D+cutout fully inside the "safe zone" (roughly the center 80% of the canvas) since Android applies its own mask shape (circle/squircle/rounded-square) that can crop up to ~20% off each edge.

## 8. Light-background and dark-background requirements
- **Light background** (favicon in a browser tab, `paper`/white app chrome): `brand.700` fill on white/`paper` — matches §3's recommendation and the existing manifest `background_color: '#f5f6f8'`.
- **Dark background** (dark-mode OS home screens, dark browser chrome, potential future dark-mode app UI): needs a second variant, not just "hope it still works" — either (a) invert to a `paper`/`brand.50` fill on a `brand.700` or `ink` background tile, or (b) keep the `brand.700` fill but add a subtle solid background tile (`paper` circle/rounded-square) behind it so it doesn't disappear against a dark OS background. Maskable icons in particular need an opaque background tile regardless of light/dark — a transparent-background icon gets whatever the OS mask default is, which is a real risk with the current single-PNG-reused-as-maskable setup (see Technical issues).
- Favicon specifically should be tested at both `prefers-color-scheme: light` and `dark` if the browser tab is ever styled to follow it — not currently handled by anything in `index.html`.

## 9. Migration plan (for a future, separately-approved session)
1. Finalize the chosen variation (C, or A as fallback) as a vector master (SVG) at 512×512, safe-zone-checked.
2. Export flat PNGs at 48, 96, 192, 512, plus a true maskable variant with the icon inset into the safe zone against an opaque `paper`-colored full-bleed background tile (fixes the current "same file reused for maskable" gap).
3. Generate a proper multi-size `favicon.ico` (16/32/48) instead of relying on a single 192px PNG for `<link rel="icon">`.
4. Replace `public/icons/icon-192.png` / `icon-512.png` in place (same filenames) so `vite.config.js` and `index.html` need no changes — or, if filenames change, update both in the same commit.
5. Decide separately whether `public/brand/logo-full.png` (login screen) is redesigned to match, kept as-is (it's a different asset serving a different purpose — full wordmark, not an icon), or retired in favor of the new mark plus a text lockup.
6. Bump the PWA manifest's cached-asset versioning implicitly via the existing `autoUpdate` registerType (no manual cache-bust step needed) but manually verify the new icon actually appears after deploy — same "confirm what's live" discipline as any other deploy per the project's release checklist.
7. Do **not** touch `theme_color`/`background_color` in this pass unless explicitly asked — that's a separate decision from the icon artwork itself.

## Technical issues found (documented only, not fixed)
- The maskable icon entry in `vite.config.js:25` reuses the exact same `icon-512.png` as the plain entry — a maskable icon needs its subject inset into a safe zone with a full-bleed background, or Android will crop into the book/bulb/text on many mask shapes. Currently the whole "DAVE" wordmark almost certainly gets clipped on non-square masks.
- No dedicated favicon `.ico` — `<link rel="icon">` points straight at the 192px PWA PNG, which is fine in modern browsers but isn't a fallback-safe favicon.
- `theme_color` (`brand.700` teal) doesn't match the current icon's navy/gold palette — an existing, unrelated inconsistency between manifest chrome color and the actual logo.

## Verification
- `npm run build`: passes.
- `git diff --check`: clean (no changes to check — no code files touched).
- Confirmed no production/application files modified — `git status` shows only this new document as a change.
- Files inspected (read-only): `vite.config.js`, `index.html`, `tailwind.config.js`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/brand/logo-full.png`, `src/components/auth/Login.jsx` (grep only), `src/pages/Settings.jsx` (grep only, no match).
- File changed: `docs/app-icon-redesign-exploration-2026-08-15.md` (this file) only.
