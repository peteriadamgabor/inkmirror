// One-shot Playwright capture for the three manifest screenshots.
// Not a permanent script — kept under scripts/ for re-runs but not
// added to package.json scripts (manifest screenshots only need
// regeneration when the editor/picker UI changes meaningfully).
//
// Usage:
//   1. npm run dev  (in another shell)
//   2. node scripts/capture-screenshots.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function shot({ url, viewport, file, beforeShot }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  if (beforeShot) await beforeShot(page);
  await page.waitForTimeout(400);
  const out = path.join(OUT_DIR, file);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`✓ ${file} (${viewport.width}×${viewport.height})`);
  await ctx.close();
}

const tryDemo = async (page) => {
  const candidates = [
    'button:has-text("demo")',
    'button:has-text("Demo")',
    'text=/try the demo/i',
    'text=/load demo/i',
    'text=/load the demo/i',
    '[data-demo]',
  ];
  for (const sel of candidates) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) > 0) {
      try {
        await btn.click({ timeout: 2000 });
        await page.waitForTimeout(2500);
        return;
      } catch {}
    }
  }
};

await shot({
  url: 'http://localhost:5173/',
  viewport: { width: 1280, height: 720 },
  file: 'picker-wide.png',
});

await shot({
  url: 'http://localhost:5173/',
  viewport: { width: 1280, height: 720 },
  file: 'editor-wide.png',
  beforeShot: tryDemo,
});

await shot({
  url: 'http://localhost:5173/',
  viewport: { width: 720, height: 1280 },
  file: 'editor-narrow.png',
  beforeShot: tryDemo,
});

await browser.close();
console.log('Done.');
