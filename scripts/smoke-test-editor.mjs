/**
 * Smoke test the contenteditable BlockView: focus the starter block, type,
 * hit Enter, type more, hit Backspace at offset 0 to merge, and verify the
 * store ends up in a sensible state.
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/home/peteriadam/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
});

const results = { steps: [], failures: [] };
function record(name, info) { results.steps.push({ name, ...info }); }
function fail(name, reason) { results.failures.push({ name, reason }); }

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => fail('pageerror', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') fail('console.error', m.text());
  });

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });

  // Wait for the starter block to render.
  await page.waitForSelector('[data-editable]', { timeout: 5000 });

  // --- Step 1: focus the first editable, read its contents ---
  const step1 = await page.evaluate(() => {
    const el = document.querySelector('[data-editable]');
    if (!el) return { error: 'no editable' };
    el.focus();
    return { content: el.innerText, focused: document.activeElement === el };
  });
  record('focus-starter', step1);
  if (!step1.focused) fail('focus-starter', 'editable did not receive focus');

  // --- Step 2: type "HELLO" at the current caret (start of block) ---
  await page.keyboard.type('HELLO');
  await new Promise((r) => setTimeout(r, 400)); // wait past debounce

  const step2 = await page.evaluate(() => {
    const el = document.querySelector('[data-editable]');
    return { content: el?.innerText ?? null };
  });
  record('type-hello', step2);
  if (!step2.content?.startsWith('HELLO')) fail('type-hello', `expected to start with HELLO, got: ${step2.content?.slice(0, 30)}`);

  // --- Step 3: hit Enter (should create a new block below) ---
  // First move the caret to the end of the current block so Enter splits cleanly at the end.
  await page.keyboard.down('End');
  await page.keyboard.up('End');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 200));

  const step3 = await page.evaluate(() => {
    const blocks = document.querySelectorAll('[data-block-id]');
    return { blockCount: blocks.length, focusedBlockId: document.activeElement?.closest('[data-block-id]')?.getAttribute('data-block-id') };
  });
  record('enter-new-block', step3);
  if (step3.blockCount !== 2) fail('enter-new-block', `expected 2 blocks after Enter, got ${step3.blockCount}`);

  // --- Step 4: type "WORLD" into the new block ---
  await page.keyboard.type('WORLD');
  await new Promise((r) => setTimeout(r, 400));

  const step4 = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('[data-editable]'));
    return { contents: blocks.map((b) => b.innerText) };
  });
  record('type-world', step4);
  if (step4.contents[1] !== 'WORLD') fail('type-world', `expected second block to be WORLD, got: ${step4.contents[1]}`);

  // --- Step 5: move caret to start of second block, press Backspace → should merge ---
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
  await new Promise((r) => setTimeout(r, 300));

  const step5 = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('[data-editable]'));
    return { blockCount: blocks.length, contents: blocks.map((b) => b.innerText) };
  });
  record('backspace-merge', step5);
  if (step5.blockCount !== 1) fail('backspace-merge', `expected 1 block after merge, got ${step5.blockCount}`);
  if (!step5.contents[0]?.endsWith('WORLD')) fail('backspace-merge', `expected merged content to end with WORLD, got: ${step5.contents[0]?.slice(-20)}`);

  // --- Step 6: IME smoke test — type a Hungarian accented character via keyboard ---
  // We can't really simulate IME composition events through puppeteer's keyboard API,
  // but we can verify that typing an accented character directly still works.
  await page.keyboard.type(' árvíztűrő');
  await new Promise((r) => setTimeout(r, 400));

  const step6 = await page.evaluate(() => {
    const el = document.querySelector('[data-editable]');
    return { content: el?.innerText ?? null };
  });
  record('type-hungarian', step6);
  if (!step6.content?.includes('árvíztűrő')) fail('type-hungarian', `missing Hungarian text: ${step6.content}`);
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
if (results.failures.length > 0) process.exit(1);
