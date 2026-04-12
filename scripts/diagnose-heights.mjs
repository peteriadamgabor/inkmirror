/**
 * Diagnostic: compare virtualizer's measured heights vs the real DOM heights
 * of rendered blocks. A big mismatch means virtualization will drift.
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/home/peteriadam/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:4173/perf', { waitUntil: 'networkidle0' });

  // Wait for the editor to populate.
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-scroll-root="editor"]');
    if (!root) return false;
    const inner = root.firstElementChild;
    return inner && parseFloat(inner.style.height || '0') > 1000;
  }, { timeout: 10000 });

  // Give ResizeObserver a tick or two to settle.
  await new Promise((r) => setTimeout(r, 500));

  const result = await page.evaluate(() => {
    const scroller = document.querySelector('[data-scroll-root="editor"]');
    const inner = scroller?.firstElementChild;
    const totalHeight = parseFloat(inner?.style.height || '0');

    const blocks = Array.from(document.querySelectorAll('[data-block-id]'));
    const samples = blocks.slice(0, 10).map((el) => ({
      id: el.dataset.blockId,
      domHeight: Math.round(el.offsetHeight),
    }));
    return {
      totalHeight,
      scrollHeight: scroller?.scrollHeight ?? 0,
      clientHeight: scroller?.clientHeight ?? 0,
      renderedBlockCount: blocks.length,
      firstBlockSamples: samples,
    };
  });

  console.log('Before scroll:', JSON.stringify(result, null, 2));

  // Scroll down a bit and re-check — does totalHeight stay stable?
  await page.evaluate(() => {
    const scroller = document.querySelector('[data-scroll-root="editor"]');
    if (scroller) scroller.scrollTop = 2000;
  });
  await new Promise((r) => setTimeout(r, 300));

  const afterScroll = await page.evaluate(() => {
    const scroller = document.querySelector('[data-scroll-root="editor"]');
    const inner = scroller?.firstElementChild;
    return {
      totalHeight: parseFloat(inner?.style.height || '0'),
      scrollHeight: scroller?.scrollHeight ?? 0,
      scrollTop: scroller?.scrollTop ?? 0,
      renderedBlockCount: document.querySelectorAll('[data-block-id]').length,
    };
  });

  console.log('After scroll to 2000:', JSON.stringify(afterScroll, null, 2));

  // Scroll further
  await page.evaluate(() => {
    const scroller = document.querySelector('[data-scroll-root="editor"]');
    if (scroller) scroller.scrollTop = 10000;
  });
  await new Promise((r) => setTimeout(r, 300));

  const afterScroll2 = await page.evaluate(() => {
    const scroller = document.querySelector('[data-scroll-root="editor"]');
    const inner = scroller?.firstElementChild;
    return {
      totalHeight: parseFloat(inner?.style.height || '0'),
      scrollHeight: scroller?.scrollHeight ?? 0,
      scrollTop: scroller?.scrollTop ?? 0,
      maxScroll: (scroller?.scrollHeight ?? 0) - (scroller?.clientHeight ?? 0),
      renderedBlockCount: document.querySelectorAll('[data-block-id]').length,
    };
  });

  console.log('After scroll to 10000:', JSON.stringify(afterScroll2, null, 2));
} finally {
  await browser.close();
}
