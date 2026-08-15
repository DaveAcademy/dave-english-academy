// generate-icons.mjs
// Builds the "Windowed D" app icon (docs/app-icon-redesign-exploration-2026-08-15.md,
// Variation C) from a single SVG source into every PWA/favicon asset the app
// needs: icon-512.png, icon-192.png, icon-maskable-512.png, favicon.ico.
//
// Run with: npm install --no-save sharp && node scripts/generate-icons.mjs
// (sharp is intentionally not a persisted devDependency - install it
// on-demand with --no-save when regenerating, this is a one-off asset
// build step, not part of the app runtime or Vite build).
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
const publicDir = path.join(__dirname, '..', 'public');
mkdirSync(iconsDir, { recursive: true });

const BRAND_700 = '#0F373F';
const PAPER = '#F5F6F8';

// The "D" outer silhouette (rounded-left spine + one semicircular bowl arc,
// radius 150 centered on (256,256), bulging right to x=406 - a single
// closed path, no self-intersection) with one upward-pointing triangular
// counter cut via fill-rule evenodd - the "window" the A reads through.
// Coordinates tuned by rendering to PNG and visually checking proportions
// at 512, 48, and on a dark background during this session.
function dPath() {
  return `
    M 176 122
    A 16 16 0 0 1 192 106
    L 256 106
    A 150 150 0 0 1 406 256
    A 150 150 0 0 1 256 406
    L 192 406
    A 16 16 0 0 1 176 390
    Z
    M 321 176
    L 356 346
    L 286 346
    Z
  `;
}

// Source is always authored on a fixed 512 viewBox; sharp's resize() does
// the actual downscaling for every output size, so the path math never has
// to change per target size. scale shrinks+centers the glyph for the
// maskable variant so it stays inside the OS's safe-zone crop.
function svg({ bg, glyph, scale = 1 }) {
  const c = 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="${bg}"/>
    <g transform="translate(${c} ${c}) scale(${scale}) translate(${-c} ${-c})">
      <path fill-rule="evenodd" fill="${glyph}" d="${dPath()}"/>
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

async function main() {
  // Standard "any"-purpose icons: opaque paper background (transparent PNGs
  // render badly as apple-touch-icon - iOS flattens transparency to black),
  // full-size glyph (no safe-zone shrink needed - nothing crops these).
  const standardSvg = svg({ bg: PAPER, glyph: BRAND_700, scale: 1 });
  await renderToFile(standardSvg, path.join(iconsDir, 'icon-512.png'), 512);
  await renderToFile(standardSvg, path.join(iconsDir, 'icon-192.png'), 192);

  // Maskable: full-bleed background (the OS applies its own mask shape over
  // this), glyph scaled down so all of it stays inside the ~66% "safe zone"
  // regardless of mask shape (circle/squircle/rounded-square).
  const maskableSvg = svg({ bg: BRAND_700, glyph: PAPER, scale: 0.62 });
  await renderToFile(maskableSvg, path.join(iconsDir, 'icon-maskable-512.png'), 512);

  // favicon.ico: 16/32/48 rendered in-memory (never written to public/ as
  // loose files) and packed directly into one .ico.
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map((size) => renderToBuffer(standardSvg, size)));
  const ico = buildIco(pngs, sizes);
  writeFileSync(path.join(publicDir, 'favicon.ico'), ico);
  console.log('wrote', path.join(publicDir, 'favicon.ico'), `(${ico.length} bytes, ${sizes.join('/')}px)`);
}

main();
