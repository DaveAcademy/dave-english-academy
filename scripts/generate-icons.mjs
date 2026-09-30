// generate-icons.mjs
// Builds the "D-ring + arrow" app icon into every PWA/favicon asset the app
// needs: icon-512.png, icon-192.png, icon-maskable-512.png, favicon.ico.
// Same D outline + forward-arrow shape as Dave's reference, reimplemented
// from scratch as an original mark (the reference was a pasted image of
// unknown origin, not something to reproduce pixel-for-pixel). Color is
// the reference's blue gradient, per explicit confirmation that this
// replaces the app's teal brand.700 for the icon specifically - a
// deliberate departure from the rest of the product's palette, not an
// oversight.
//
// Run with: npm install --no-save sharp && node scripts/generate-icons.mjs
// (sharp is intentionally not a persisted devDependency - install it
// on-demand with --no-save when regenerating, this is a one-off asset
// build step, not part of the app runtime or Vite build).
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
const publicDir = path.join(__dirname, '..', 'public');
mkdirSync(iconsDir, { recursive: true });

export const BRAND_700 = '#0F373F';
export const PAPER = '#F5F6F8';
// Icon-specific blue gradient (matches the approved reference), used only
// for the app icon - not introduced anywhere else in the app's palette.
export const ICON_BLUE_LIGHT = '#5B8DEF';
export const ICON_BLUE_DARK = '#3355C8';

// D drawn as a stroked ring (open counter, not filled) - centerline path:
// a vertical spine + one large semicircular bowl arc (radius 120, centered
// on (246,256), bulging right to x=366), rendered with round caps/joins so
// the stroke reads as one continuous, friendly shape rather than sharp
// mitered corners.
export function dRingPath() {
  return `
    M 186 146
    L 246 146
    A 120 120 0 0 1 366 256
    A 120 120 0 0 1 246 366
    L 186 366
  `;
}

// Solid right-pointing arrowhead sitting inside the D's open counter -
// "forward progress", matches the D's own visual weight so neither
// competes with the other at small sizes.
export function arrowPath() {
  return `
    M 236 196
    L 236 316
    L 326 256
    Z
  `;
}

// Source is always authored on a fixed 512 viewBox; sharp's resize() does
// the actual downscaling for every output size. scale shrinks+centers the
// glyph for the maskable variant so it stays inside the OS's own safe zone.
//
// Background is always a plain, fully-opaque, full-bleed square - never
// pre-rounded here. iOS/Android/most launchers apply their own squircle or
// circle mask on top of the source icon; baking rounded corners in ourselves
// would leave transparent corners in the PNG (confirmed: isOpaque === false
// on an earlier pre-rounded render), and iOS specifically flattens any
// transparency in an apple-touch-icon to solid black - the "rounded card"
// look this design wants is what iOS/Android already render automatically
// from a plain square source, not something to duplicate in the asset.
// bg: either a solid color string, or { from, to } for a diagonal
// (top-left to bottom-right) linear gradient, matching the reference.
export function svg({ bg, glyph, scale = 1 }) {
  const c = 256;
  const isGradient = typeof bg === 'object';
  const bgFill = isGradient ? 'url(#bg)' : bg;
  const defs = isGradient
    ? `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="${bg.from}"/>
         <stop offset="1" stop-color="${bg.to}"/>
       </linearGradient></defs>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    ${defs}
    <rect width="512" height="512" fill="${bgFill}"/>
    <g transform="translate(${c} ${c}) scale(${scale}) translate(${-c} ${-c})">
      <path d="${dRingPath()}" fill="none" stroke="${glyph}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${arrowPath()}" fill="${glyph}"/>
    </g>
  </svg>`;
}

async function renderToFile(svgString, outPath, size) {
  await sharp(Buffer.from(svgString)).resize(size, size).png().toFile(outPath);
  console.log('wrote', outPath);
}

async function renderToBuffer(svgString, size) {
  return sharp(Buffer.from(svgString)).resize(size, size).png().toBuffer();
}

// Packs PNGs into a favicon.ico via the standard (universally-supported)
// PNG-in-ICO container - no raw-bitmap re-encoding needed.
function buildIco(pngs, sizes) {
  const headerSize = 6 + 16 * pngs.length;
  let offset = headerSize;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(pngs.length, 4); // image count

  const entries = pngs.map((png, i) => {
    const size = sizes[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // image data size
    entry.writeUInt32LE(offset, 12); // offset from start of file
    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...pngs]);
}

const BG = { from: ICON_BLUE_LIGHT, to: ICON_BLUE_DARK };

async function main() {
  // Standard "any"-purpose icons: blue-gradient square, white D-ring +
  // arrow, fully opaque. Each platform applies its own rounding (iOS
  // squircle, Android circle/squircle) - see the svg() comment above.
  const standardSvg = svg({ bg: BG, glyph: PAPER, scale: 1 });
  await renderToFile(standardSvg, path.join(iconsDir, 'icon-512.png'), 512);
  await renderToFile(standardSvg, path.join(iconsDir, 'icon-192.png'), 192);

  // Maskable: same full-bleed square, glyph scaled down so it stays inside
  // the ~66% safe zone regardless of mask shape (circle/squircle/rounded-square).
  const maskableSvg = svg({ bg: BG, glyph: PAPER, scale: 0.62 });
  await renderToFile(maskableSvg, path.join(iconsDir, 'icon-maskable-512.png'), 512);

  // favicon.ico: 16/32/48 rendered in-memory (never written to public/ as
  // loose files) and packed directly into one .ico.
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map((size) => renderToBuffer(standardSvg, size)));
  const ico = buildIco(pngs, sizes);
  writeFileSync(path.join(publicDir, 'favicon.ico'), ico);
  console.log('wrote', path.join(publicDir, 'favicon.ico'), `(${ico.length} bytes, ${sizes.join('/')}px)`);
}

// Only run when executed directly (`node scripts/generate-icons.mjs`), not
// when imported by scripts/preview-icon-sheet.mjs for the shared geometry.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
