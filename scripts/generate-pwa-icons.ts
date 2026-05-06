import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_SVG = path.join(ROOT, 'public', 'icon.svg');
const ICONS_DIR = path.join(ROOT, 'public', 'icons');
const SPLASH_DIR = path.join(ROOT, 'public', 'splashes');

const VIOLET = '#7F77DD';
const ORANGE = '#D85A30';
const CREAM = '#f5f5f4';

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function svgToPng(svgString: string, w: number, h: number, out: string) {
  await sharp(Buffer.from(svgString)).resize(w, h).png().toFile(out);
  console.log(`  ✓ ${path.relative(ROOT, out)} (${w}×${h})`);
}

function brandSvg(): string {
  return readFileSync(SRC_SVG, 'utf8');
}

function maskableSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${VIOLET}"/>
  <g transform="translate(51.2,51.2) scale(0.8)">
    <rect width="512" height="512" rx="96" fill="${CREAM}"/>
    <circle cx="190" cy="256" r="110" fill="${VIOLET}" opacity="0.85"/>
    <circle cx="322" cy="256" r="110" fill="${ORANGE}" opacity="0.85"/>
    <circle cx="256" cy="256" r="46" fill="#1c1917"/>
  </g>
</svg>`;
}

function monochromeSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <circle cx="190" cy="256" r="110" fill="white"/>
  <circle cx="322" cy="256" r="110" fill="white"/>
</svg>`;
}

function shortcutSvg(glyph: 'plus' | 'clock', tint: string): string {
  const inner =
    glyph === 'plus'
      ? '<line x1="48" y1="32" x2="48" y2="64" stroke-linecap="round"/>' +
        '<line x1="32" y1="48" x2="64" y2="48" stroke-linecap="round"/>'
      : '<circle cx="48" cy="48" r="22" fill="none"/>' +
        '<line x1="48" y1="48" x2="48" y2="34" stroke-linecap="round"/>' +
        '<line x1="48" y1="48" x2="58" y2="48" stroke-linecap="round"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="20" fill="${CREAM}"/>
  <g stroke="${tint}" stroke-width="6" fill="none">${inner}</g>
</svg>`;
}

function splashSvg(width: number, height: number): string {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.12;
  const offset = r * 0.6;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${CREAM}"/>
  <circle cx="${cx - offset}" cy="${cy}" r="${r}" fill="${VIOLET}" opacity="0.85"/>
  <circle cx="${cx + offset}" cy="${cy}" r="${r}" fill="${ORANGE}" opacity="0.85"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.42}" fill="#1c1917"/>
</svg>`;
}

async function main() {
  ensureDir(ICONS_DIR);
  ensureDir(SPLASH_DIR);
  const brand = brandSvg();
  console.log('Generating PWA icons…');
  await svgToPng(brand, 192, 192, path.join(ICONS_DIR, 'icon-192.png'));
  await svgToPng(brand, 512, 512, path.join(ICONS_DIR, 'icon-512.png'));
  await svgToPng(maskableSvg(), 512, 512, path.join(ICONS_DIR, 'icon-maskable-512.png'));
  await svgToPng(monochromeSvg(), 512, 512, path.join(ICONS_DIR, 'icon-monochrome-512.png'));
  await svgToPng(shortcutSvg('plus', VIOLET), 96, 96, path.join(ICONS_DIR, 'shortcut-new.png'));
  await svgToPng(shortcutSvg('clock', ORANGE), 96, 96, path.join(ICONS_DIR, 'shortcut-last.png'));
  await svgToPng(brand, 180, 180, path.join(ROOT, 'public', 'apple-touch-icon.png'));

  console.log('Generating iOS splash images…');
  const splashes: Array<[string, number, number]> = [
    ['iphone-14-portrait.png', 1170, 2532],
    ['iphone-15-portrait.png', 1179, 2556],
    ['iphone-15-pro-portrait.png', 1179, 2556],
    ['iphone-15-pro-max-portrait.png', 1290, 2796],
    ['ipad-air-portrait.png', 1640, 2360],
    ['ipad-pro-13-portrait.png', 2048, 2732],
  ];
  for (const [name, w, h] of splashes) {
    await svgToPng(splashSvg(w, h), w, h, path.join(SPLASH_DIR, name));
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
