import { test, expect } from '@playwright/test';

/**
 * EPUB cover-image picker — file input → preview → persistence.
 *
 * Drives the Document Settings → Cover image section by setting a
 * file on the hidden `<input type="file">` and asserting:
 *   - the preview appears (dropzone disappears)
 *   - the cover payload is written to IDB settings
 *   - removing the cover clears the IDB field and restores the dropzone
 */

// 1x1 JPEG — same fixture as the unit test.
const ONE_PIXEL_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9S6KKKAP/2Q==';

test.describe('EPUB cover image picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('inkmirror.hasVisited', '1');
      } catch {
        /* private mode — ignore */
      }
    });
  });

  test('uploading an image shows preview, persists, and can be removed', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    await page.getByRole('button', { name: /Try the demo/ }).first().click();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTitle(/Edit document settings|Dokumentum beállítások/).click();

    // Dropzone visible initially.
    await expect(page.locator('[data-testid="cover-image-dropzone"]')).toBeVisible();

    // Decode the fixture into binary so we can hand it to the input.
    const buffer = Buffer.from(ONE_PIXEL_JPEG_BASE64, 'base64');
    await page.locator('[data-testid="cover-image-input"]').first().setInputFiles({
      name: 'cover.jpg',
      mimeType: 'image/jpeg',
      buffer,
    });

    // Preview appears, dropzone is replaced.
    await expect(page.locator('[data-testid="cover-image-preview"]')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('[data-testid="cover-image-dropzone"]')).toBeHidden();

    // Persisted to IDB?
    await page.waitForFunction(
      async () => {
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
        const doc = docs[0] as
          | { settings?: { cover_image?: { mimeType?: string } | null } }
          | undefined;
        return doc?.settings?.cover_image?.mimeType === 'image/jpeg';
      },
      undefined,
      { timeout: 5_000 },
    );

    // Remove clears it. The button sits near the bottom of an overflow-
    // auto modal at 1280x800 viewport — dispatch the click programmatically
    // so Playwright's out-of-viewport safety doesn't block us.
    await page
      .locator('[data-testid="cover-image-remove"]')
      .evaluate((el) => (el as HTMLButtonElement).click());
    await expect(page.locator('[data-testid="cover-image-dropzone"]')).toBeVisible();
    await page.waitForFunction(
      async () => {
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
        const doc = docs[0] as
          | { settings?: { cover_image?: unknown } }
          | undefined;
        const cov = doc?.settings?.cover_image;
        return cov === null || cov === undefined;
      },
      undefined,
      { timeout: 5_000 },
    );
  });
});
