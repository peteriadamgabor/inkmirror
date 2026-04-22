import { test, expect } from '@playwright/test';

/**
 * Inline character-row actions on the sidebar:
 *   - clicking the star toggles POV on / off
 *   - clicking the trash opens a confirm; confirming removes the row
 *
 * Replaces the old `⋯` menu surface (rename / POV / delete). Rename
 * still works via double-click and is covered by the existing
 * `character-page.spec.ts`.
 */
test.describe('Character row — inline POV + delete', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('inkmirror.hasVisited', '1');
      } catch {
        /* private mode — ignore */
      }
    });
  });

  test('star toggles POV; trash deletes after confirm', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    await page.getByRole('button', { name: /Try the demo/ }).first().click();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });

    // Grab the first character's id + name.
    const first = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('inkmirror');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const chars = await new Promise<Array<{ id: string; name: string }>>(
        (resolve, reject) => {
          const tx = db.transaction('characters', 'readonly');
          const req = tx.objectStore('characters').getAll();
          req.onsuccess = () =>
            resolve(req.result as Array<{ id: string; name: string }>);
          req.onerror = () => reject(req.error);
        },
      );
      db.close();
      return chars[0];
    });
    expect(first).toBeTruthy();

    const nameButton = page.getByRole('button', { name: first.name, exact: true }).first();
    await expect(nameButton).toBeVisible();

    // Hover the row so the inline buttons become clickable.
    await nameButton.hover();

    // Scope toggles to this character's row so we don't accidentally
    // hit another character's star/trash.
    const row = nameButton.locator(
      'xpath=ancestor::div[contains(@class, "group")][1]',
    );
    const star = row.locator('[data-testid="character-pov-toggle"]');
    const trash = row.locator('[data-testid="character-delete"]');

    // POV starts off — the star's `data-pov-active` attribute is absent.
    await expect(star).not.toHaveAttribute('data-pov-active', '1');
    await star.click({ force: true });
    await expect(star).toHaveAttribute('data-pov-active', '1');
    // Persisted?
    await page.waitForFunction(
      async (id) => {
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
        const doc = docs[0] as { pov_character_id?: string | null } | undefined;
        return doc?.pov_character_id === id;
      },
      first.id,
      { timeout: 5_000 },
    );

    // Click the star again → POV cleared.
    await star.click({ force: true });
    await expect(star).not.toHaveAttribute('data-pov-active', '1');

    // Trash → confirm → row disappears.
    await nameButton.hover();
    await trash.click({ force: true });
    await page
      .getByRole('button', { name: /^(Delete|Törlés)$/ })
      .click();
    await expect(nameButton).toBeHidden({ timeout: 5_000 });
  });
});
