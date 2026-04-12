/**
 * Phase 1 perf measurement script.
 * Drives a headless Chromium against the local preview server at /perf,
 * waits for the synthetic 500-block doc to load AND for pretext measurements
 * to populate, then programmatically scrolls while sampling FPS via rAF.
 *
 * Usage: node scripts/measure-perf.mjs
 * Requires: preview server running at http://localhost:4173/
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/home/peteriadam/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome';
const URL = 'http://localhost:4173/perf';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  // Surface page errors.
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      console.error('console.' + m.type() + ':', m.text());
  });

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  const initialLoadMs = Date.now() - t0;

  // Wait until the scroll container has overflow (i.e., measurements ran).
  await page.waitForFunction(
    () => {
      // The Editor is the element with a child div whose style.height is > 0 and set via inline style.
      const candidates = Array.from(document.querySelectorAll('.overflow-auto'));
      for (const el of candidates) {
        const inner = el.firstElementChild;
        if (!inner) continue;
        const h = parseFloat(inner.style.height || '0');
        if (h > 1000) return true;
      }
      return false;
    },
    { timeout: 10000 },
  );
  const measurementsReadyMs = Date.now() - t0;

  // Give an additional tick for createMemo to settle.
  await new Promise((r) => setTimeout(r, 200));

  // Inspect the computed layout state.
  const state = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('.overflow-auto'));
    let editor = null;
    let inner = null;
    let innerHeight = 0;
    for (const el of candidates) {
      const i = el.firstElementChild;
      if (!i) continue;
      const h = parseFloat(i.style.height || '0');
      if (h > innerHeight) {
        editor = el;
        inner = i;
        innerHeight = h;
      }
    }
    const visibleBlocks = document.querySelectorAll('[data-block-id]').length;
    return {
      editorFound: !!editor,
      innerHeightPx: innerHeight,
      editorClientHeight: editor ? editor.clientHeight : 0,
      editorScrollHeight: editor ? editor.scrollHeight : 0,
      maxScroll: editor ? editor.scrollHeight - editor.clientHeight : 0,
      visibleBlocks,
    };
  });

  // Pass the scroll-container selector strategy into page.evaluate via function body.
  const fpsResults = await page.evaluate(async () => {
    // Find the editor scroller (same strategy as above).
    const candidates = Array.from(document.querySelectorAll('.overflow-auto'));
    let scroller = null;
    let innerHeight = 0;
    for (const el of candidates) {
      const i = el.firstElementChild;
      if (!i) continue;
      const h = parseFloat(i.style.height || '0');
      if (h > innerHeight) {
        scroller = el;
        innerHeight = h;
      }
    }
    if (!scroller) return { error: 'scroller not found', innerHeight };

    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    if (maxScroll < 100) return { error: 'not scrollable', maxScroll, innerHeight };

    const samples = [];
    let lastFrameTime = performance.now();
    let stopRaf = false;

    const tick = (now) => {
      samples.push(now - lastFrameTime);
      lastFrameTime = now;
      if (!stopRaf) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // Scroll from top to bottom over 3 seconds with smooth rAF-driven interpolation.
    const startTime = performance.now();
    const scrollDuration = 3000;

    await new Promise((resolve) => {
      const scrollTick = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / scrollDuration);
        scroller.scrollTop = maxScroll * progress;
        if (progress < 1) {
          requestAnimationFrame(scrollTick);
        } else {
          setTimeout(resolve, 200);
        }
      };
      requestAnimationFrame(scrollTick);
    });

    stopRaf = true;

    // Discard the first few warm-up samples and the very last sample.
    const trimmed = samples.slice(3, -1);
    if (trimmed.length === 0) return { error: 'no samples', samples };

    const sortedFrames = [...trimmed].sort((a, b) => a - b);
    const median = sortedFrames[Math.floor(sortedFrames.length / 2)];
    const p95 = sortedFrames[Math.floor(sortedFrames.length * 0.95)];
    const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

    const droppedFrames = trimmed.filter((f) => f > 20).length;

    return {
      sampleCount: trimmed.length,
      meanFrameMs: mean,
      medianFrameMs: median,
      p95FrameMs: p95,
      medianFps: Math.round(1000 / median),
      meanFps: Math.round(1000 / mean),
      p5Fps: Math.round(1000 / p95),
      droppedFrames,
      droppedFramePercent: +(100 * droppedFrames / trimmed.length).toFixed(2),
      finalScrollTop: scroller.scrollTop,
      maxScroll,
    };
  });

  // Input latency: navigate to the / starter route (which has a writable
  // block) and measure keydown → next paint for a sequence of inserted chars.
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-editable]', { timeout: 5000 });

  const inputLatency = await page.evaluate(async () => {
    const editable = document.querySelector('[data-editable]');
    if (!editable) return { error: 'no editable block' };
    editable.focus();
    // Place caret at the end.
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const samples = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      document.execCommand('insertText', false, 'x');
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      const end = performance.now();
      samples.push(end - start);
    }

    const trimmed = samples.slice(5); // warm-up
    if (trimmed.length === 0) return { error: 'no samples' };
    const sorted = [...trimmed].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    return {
      sampleCount: trimmed.length,
      meanMs: +mean.toFixed(3),
      medianMs: +median.toFixed(3),
      p95Ms: +p95.toFixed(3),
      passedTarget: median < 16,
    };
  });

  const metrics = await page.metrics();

  const result = {
    chromeVersion: await browser.version(),
    url: URL,
    initialNavigationMs: initialLoadMs,
    measurementsReadyMs,
    layoutState: state,
    fps: fpsResults,
    inputLatency,
    heapUsedMB: +(metrics.JSHeapUsedSize / (1024 * 1024)).toFixed(2),
    heapTotalMB: +(metrics.JSHeapTotalSize / (1024 * 1024)).toFixed(2),
  };

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
