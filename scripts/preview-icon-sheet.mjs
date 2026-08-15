// preview-icon-sheet.mjs
// Read-only review artifact: composites the already-approved Windowed D
// icon (scripts/generate-icons.mjs - not modified here) into realistic
// mock contexts so it can be judged at true relative scale instead of as
// an isolated 512px PNG. Does not touch any shipped asset.
// Run with: npm install --no-save sharp && node scripts/preview-icon-sheet.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { svg, BRAND_700, PAPER } from './generate-icons.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Written outside the repo (scratchpad) - this is a review artifact, not a
// shipped asset, so it should never be at risk of being staged/committed.
const outPath = 'C:\\Users\\miste\\AppData\\Local\\Temp\\claude\\C--Users-miste--claude-projects\\e59d0505-1353-4681-9ef4-a417bcb161af\\scratchpad\\icon-preview-sheet.png';

const standardSvg = svg({ bg: PAPER, glyph: BRAND_700, scale: 1 }); // opaque card, for OSes that don't remask
const maskableSvg = svg({ bg: BRAND_700, glyph: PAPER, scale: 0.62 }); // safe-zone inset, for OS-masked contexts
const NEAR_BLACK = '#15181D';
const WALLPAPER = '#3A4A55';

async function png(svgString, size) {
  return sharp(Buffer.from(svgString)).resize(size, size).png().toBuffer();
}

function roundedRectMask(size, radiusRatio) {
  const r = size * radiusRatio;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`;
}
function circleMask(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`;
}

async function clip(iconBuffer, maskSvg, size) {
  const mask = await sharp(Buffer.from(maskSvg)).resize(size, size).png().toBuffer();
  return sharp(iconBuffer).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

// One labeled cell: a background swatch with the given icon buffer
// centered, plus a caption baked in below it.
async function cell({ width, height, bg, icon, iconSize, iconY, label, labelColor = '#1B2430' }) {
  const layers = [];
  if (icon) {
    layers.push({ input: icon, left: Math.round((width - iconSize) / 2), top: iconY });
  }
  const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <text x="${width / 2}" y="${height - 14}" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="600" fill="${labelColor}">${label}</text>
  </svg>`;
  layers.push({ input: Buffer.from(labelSvg), left: 0, top: 0 });
  return sharp({ create: { width, height, channels: 4, background: bg } }).composite(layers).png().toBuffer();
}

async function main() {
  const CW = 340, CH = 340; // cell size
  const cols = 4, rows = 2;

  // 1. Android home screen - adaptive icon, circle mask (common launcher
  //    default), maskable-safe render, on a wallpaper-like background, with
  //    a home-screen app label.
  const androidIcon = await clip(await png(maskableSvg, 512), circleMask(512), 108);
  const androidCell = await cell({
    width: CW, height: CH, bg: WALLPAPER, icon: androidIcon, iconSize: 108, iconY: 90,
    label: 'Android home screen (circle mask)', labelColor: '#FFFFFF',
  });

  // 2. iPhone home screen - superellipse-ish rounded-square, opaque
  //    (iOS icons are always fully opaque - using the standard "any" icon
  //    since that's genuinely what iOS would show, not the maskable one).
  const iosIcon = await clip(await png(standardSvg, 512), roundedRectMask(512, 0.223), 120);
  const iosCell = await cell({
    width: CW, height: CH, bg: '#20242C', icon: iosIcon, iconSize: 120, iconY: 84,
    label: 'iPhone home screen (rounded-square)', labelColor: '#FFFFFF',
  });

  // 3. Browser favicon at true 16x16 scale, shown inside a mock tab so its
  //    real-world tiny size next to text is honest, not zoomed up.
  const favicon16 = await png(standardSvg, 16);
  const tabSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="34">
    <rect width="220" height="34" rx="8" fill="#E4E7EB"/>
    <rect x="0" y="0" width="220" height="34" rx="8" fill="#ffffff" opacity="0.001"/>
    <text x="42" y="21" font-family="Arial, sans-serif" font-size="12" fill="#333">Dave Academy</text>
  </svg>`;
  const tabBg = await sharp(Buffer.from(tabSvg)).png().toBuffer();
  const tabWithIcon = await sharp(tabBg).composite([{ input: favicon16, left: 16, top: 9 }]).png().toBuffer();
  const faviconCell = await cell({
    width: CW, height: CH, bg: '#F0F1F3', icon: tabWithIcon, iconSize: 220, iconY: 150,
    label: 'Browser favicon, actual 16×16px', labelColor: '#1B2430',
  });

  // 4. Windows taskbar - plain square (no mask), small, in a taskbar strip.
  const winIcon = await png(standardSvg, 40);
  const taskbarSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="48">
    <rect width="260" height="48" fill="#1F1F1F"/>
    <rect x="14" y="4" width="40" height="40" rx="4" fill="#3A3A3A"/>
    <rect x="66" y="4" width="40" height="40" rx="4" fill="#3A3A3A"/>
  </svg>`;
  const taskbarBg = await sharp(Buffer.from(taskbarSvg)).png().toBuffer();
  const taskbarWithIcon = await sharp(taskbarBg).composite([{ input: winIcon, left: 118, top: 4 }]).png().toBuffer();
  const winCell = await cell({
    width: CW, height: CH, bg: '#2B2B2B', icon: taskbarWithIcon, iconSize: 260, iconY: 160,
    label: 'Windows taskbar, 40px', labelColor: '#FFFFFF',
  });

  // 5. Light background swatch.
  const lightIcon = await png(standardSvg, 160);
  const lightCell = await cell({ width: CW, height: CH, bg: PAPER, icon: lightIcon, iconSize: 160, iconY: 90, label: 'Light background' });

  // 6. Dark background - the standard opaque-card icon sitting on a dark
  //    host page/OS chrome (this is what actually happens for "any"-purpose
  //    icons; the OS doesn't strip their background tile).
  const darkHostIcon = await png(standardSvg, 160);
  const darkCell = await cell({ width: CW, height: CH, bg: NEAR_BLACK, icon: darkHostIcon, iconSize: 160, iconY: 90, label: 'Dark background (card icon)', labelColor: '#FFFFFF' });

  // 7. Circular crop of the maskable-safe render, large, to judge how much
  //    of the D+A survives a full circle mask.
  const circleIcon = await clip(await png(maskableSvg, 512), circleMask(512), 200);
  const circleCell = await cell({ width: CW, height: CH, bg: '#E7E9EC', icon: circleIcon, iconSize: 200, iconY: 70, label: 'Circular mask (maskable safe zone)' });

  // 8. Rounded-square crop of the same maskable-safe render.
  const squareIcon = await clip(await png(maskableSvg, 512), roundedRectMask(512, 0.22), 200);
  const squareCell = await cell({ width: CW, height: CH, bg: '#E7E9EC', icon: squareIcon, iconSize: 200, iconY: 70, label: 'Rounded-square mask' });

  const cells = [androidCell, iosCell, faviconCell, winCell, lightCell, darkCell, circleCell, squareCell];

  const sheetW = CW * cols;
  const sheetH = CH * rows;
  const composite = cells.map((buf, i) => ({ input: buf, left: (i % cols) * CW, top: Math.floor(i / cols) * CH }));
  const sheet = sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: '#FFFFFF' } }).composite(composite).png();
  await sheet.toFile(outPath);
  console.log('wrote', outPath);
}

main();
