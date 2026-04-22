import { test, expect } from '@playwright/test';

/**
 * Novel-first exports — dialogue style picker.
 *
 * Covers the Document Settings → Dialogue style tri-button group:
 *   - the three style buttons render with localized labels
 *   - picking `hu_dash` persists to the active document's
 *     `settings.dialogue_style` field in IDB
 *   - the persisted value survives a reload
 */
test.describe('Dialogue style picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('inkmirror.hasVisited', '1');
      } catch {
        /* private mode — ignore */
      }
    });
  });

  test('picking Hungarian dash persists and survives reload', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    // Boot the demo so a document exists.
    await page.getByRole('button', { name: /Try the demo/ }).first().click();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });

    // Open Document Settings via the topbar settings button.
    await page.getByTitle(/Edit document settings|Dokumentum beállítások/).click();

    // All three style options should render.
    const straight = page.locator('[data-dialogue-style="straight"]');
    const curly = page.locator('[data-dialogue-style="curly"]');
    const huDash = page.locator('[data-dialogue-style="hu_dash"]');
    await expect(straight).toBeVisible();
    await expect(curly).toBeVisible();
    await expect(huDash).toBeVisible();

    // Default is 'straight' — visual "active" state driven by border color.
    // Check it via the persisted settings rather than a visual attribute so
    // the assertion is resilient to tailwind class tweaks.
    const initial = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('inkmirror');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const docs = await new Promise<unknown[]>((resolve, reject) => {
        const tx = db.transaction('documents', 'readonly');
        const req = tx.objectStore('documents').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      const first = docs[0] as { settings?: { dialogue_style?: string } } | undefined;
      return first?.settings?.dialogue_style ?? null;
    });
    // Fresh docs don't set the field — null is the valid "default is
    // straight" state; anything else is a surprise.
    expect(initial === null || initial === 'straight').toBe(true);

    // Click the Hungarian dash option.
    await huDash.click();

    // Wait for the autosave to flush to IDB.
    await page.waitForFunction(
      async () => {
        const req = indexedDB.open('inkmirror');
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const tx = db.transaction('documents', 'readonly');
        const all = await new Promise<unknown[]>((resolve, reject) => {
          const r = tx.objectStore('documents').getAll();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        db.close();
        const doc = all[0] as { settings?: { dialogue_style?: string } } | undefined;
        return doc?.settings?.dialogue_style === 'hu_dash';
      },
      undefined,
      { timeout: 5_000 },
    );

    // Reload and confirm the value stuck.
    await page.reload();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });
    const afterReload = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('inkmirror');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const docs = await new Promise<unknown[]>((resolve, reject) => {
        const tx = db.transaction('documents', 'readonly');
        const req = tx.objectStore('documents').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      const doc = docs[0] as { settings?: { dialogue_style?: string } } | undefined;
      return doc?.settings?.dialogue_style ?? null;
    });
    expect(afterReload).toBe('hu_dash');
  });
});
