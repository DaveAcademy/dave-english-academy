# App Icon — Design Update (superseding "Windowed D")

The "Windowed D" concept (`docs/app-icon-redesign-exploration-2026-08-15.md`, Variation C, shipped in commit `d170ae2`) has been **replaced** with a new direction based on a reference Dave supplied: a rounded-square card with a white D drawn as an open ring, and a forward-pointing arrow filling the counter.

## What changed and why
The reference image used a glossy blue gradient. First pass rebuilt this in solid `brand.700` teal instead, to stay on the app's existing palette and avoid a gradient. **Dave then explicitly asked for the blue gradient as-is** ("I like the color, design, everything... keep it the same"), confirmed again after I flagged the brand-palette departure via a direct yes/no question. Final version:
- Blue diagonal gradient (`#5B8DEF` → `#3355C8`, top-left to bottom-right), matching the reference — a deliberate, confirmed departure from the app's teal `brand` palette for the icon specifically, not applied anywhere else in the product.
- Still an **original re-creation**, not a pixel copy — the reference was a pasted image of unknown origin (unclear if it was a stock icon, AI-generated, or an existing app's actual icon), so the shape was reimplemented from scratch as the app's own D-ring + arrow geometry, only the color now matches.

## Geometry
- `scripts/generate-icons.mjs` — `dRingPath()` (open D stroke, round caps/joins, stroke-width 40) + `arrowPath()` (solid right-pointing triangle in the counter), both on a plain full-bleed square background.
- **Important correction made during this pass:** the first draft pre-baked rounded corners into the source PNG, which left transparent corners (`sharp` confirmed `isOpaque: false`). iOS specifically flattens transparency in an apple-touch-icon to solid black, so this was fixed before shipping — the standard/favicon/maskable icons are now plain opaque squares, and the "rounded card" look is what iOS/Android already apply automatically when they mask the source icon, not something duplicated in the asset itself. Verified `isOpaque: true` after the fix.

## Verification
- Preview sheet regenerated (`scripts/preview-icon-sheet.mjs`) across the same 8 contexts as before: Android/iPhone home screen, true-16px favicon, Windows taskbar, light/dark background, circular/rounded-square mask crops. Reviewed visually via rendered PNGs (no live device/browser test — same limitation as the original exploration).
- At true 16×16, this design reads slightly *better* than the triangle-in-D version — the ring's open counter gives more contrast at tiny sizes.
- `npm run build`: passes. `git diff --check`: clean.
- Files changed: `public/favicon.ico`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `scripts/generate-icons.mjs`, `scripts/preview-icon-sheet.mjs`. No manifest/index.html changes needed — filenames unchanged.
