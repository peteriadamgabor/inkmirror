/**
 * Smoke test for Phase 2 persistence: boot the app, wipe any existing IDB,
 * type some text, reload, and verify the text survived.
 *
 * Usage: run the preview server (`npm run preview`) in one terminal, then:
 *   node scripts/smoke-test-persistence.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/home/peteriadam/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome';
const URL = process.env.URL ?? 'http://localhost:4173/';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
});

const results = { steps: [], failures: [] };
function record(name, info) { results.steps.push({ name, ...info }); }
function fail(name, reason) { results.failures.push({ name, reason }); }

try {
  // Use a fresh BrowserContext so IndexedDB is isolated and starts empty
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => fail('pageerror', e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (text.includes('favicon')) return; // cosmetic
    fail('console.error', text);
  });

  // --- First session: type a sentence ---
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-editable]', { timeout: 10000 });

  const firstSeed = await page.evaluate(() => {
    const el = document.querySelector('[data-editable]');
    if (!el) return { error: 'no editable' };
    el.focus();
    return { content: el.innerText, focused: document.activeElement === el };
  });
  record('first-session-boot', firstSeed);

  const SENTENCE = 'The morning fog hung low over the village.';
  await page.keyboard.type(SENTENCE);
  // Enter + second paragraph
  await page.keyboard.down('End'); await page.keyboard.up('End');
  await page.keyboard.press('Enter');
  const SECOND = 'She watched it curl against the hedgerow.';
  await page.keyboard.type(SECOND);

  // wait past debounce (500ms) + a little
  await new Promise((r) => setTimeout(r, 900));

  // Blur so blur-commit fires too
  await page.evaluate(() => document.activeElement?.blur());
  await new Promise((r) => setTimeout(r, 300));

  const beforeReload = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('[data-editable]'));
    return { blockCount: blocks.length, contents: blocks.map((b) => b.innerText) };
  });
  record('before-reload', beforeReload);
  if (beforeReload.blockCount !== 2) {
    fail('before-reload', `expected 2 blocks in first session, got ${beforeReload.blockCount}`);
  }

  // --- Reload (same browser context → same IndexedDB) ---
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-editable]', { timeout: 10000 });

  const afterReload = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('[data-editable]'));
    return { blockCount: blocks.length, contents: blocks.map((b) => b.innerText) };
  });
  record('after-reload', afterReload);

  if (afterReload.blockCount !== 2) {
    fail('after-reload', `expected 2 blocks after reload, got ${afterReload.blockCount}`);
  }
  if (!afterReload.contents[0]?.includes(SENTENCE)) {
    fail('after-reload', `first block lost: ${afterReload.contents[0]}`);
  }
  if (!afterReload.contents[1]?.includes(SECOND)) {
    fail('after-reload', `second block lost: ${afterReload.contents[1]}`);
  }

  // --- Soft-delete roundtrip: backspace-merge, reload, verify merge persisted ---
  await page.evaluate(() => {
    const blocks = document.querySelectorAll('[data-editable]');
    const second = blocks[1];
    second.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(second.firstChild ?? second, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.press('Backspace');
  await new Promise((r) => setTimeout(r, 400));

  const afterMerge = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('[data-editable]'));
    return { blockCount: blocks.length, contents: blocks.map((b) => b.innerText) };
  });
  record('after-merge', afterMerge);
  if (afterMerge.blockCount !== 1) {
    fail('after-merge', `expected 1 block after merge, got ${afterMerge.blockCount}`);
  }

  await new Promise((r) => setTimeout(r, 400));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-editable]', { timeout: 10000 });

  const afterMergeReload = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('[data-editable]'));
    return { blockCount: blocks.length, contents: blocks.map((b) => b.innerText) };
  });
  record('after-merge-reload', afterMergeReload);
  if (afterMergeReload.blockCount !== 1) {
    fail('after-merge-reload', `expected 1 block after merge+reload, got ${afterMergeReload.blockCount}`);
  }
  if (!afterMergeReload.contents[0]?.includes(SENTENCE) || !afterMergeReload.contents[0]?.includes(SECOND)) {
    fail('after-merge-reload', `merged content missing parts: ${afterMergeReload.contents[0]}`);
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
if (results.failures.length > 0) process.exit(1);
