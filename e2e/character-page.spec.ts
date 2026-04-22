import { test, expect } from '@playwright/test';

/**
 * Character profile page — mention-dot-as-doorway MVP.
 *
 * Covers:
 *   - clicking a character name in the sidebar opens the profile
 *   - the description field persists to IDB + survives reload
 *   - a mention dot rendered inside a block header opens the page
 *     for that character
 *   - Escape / backdrop click closes the page
 */
test.describe('Character profile page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('inkmirror.hasVisited', '1');
      } catch {
        /* private mode — ignore */
      }
    });
  });

  test('sidebar click opens page; description persists after reload', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    // Demo manuscript seeds characters; use it as the bootstrap surface.
    await page.getByRole('button', { name: /Try the demo/ }).first().click();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });

    // Pull the first character's id + name from IDB so we can target it
    // without coupling to demo text.
    const firstCharacter = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('inkmirror');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const chars = await new Promise<Array<{ id: string; name: string }>>(
        (resolve, reject) => {
          const tx = db.transaction('characters', 'readonly');
          const req = tx.objectStore('characters').getAll();
          req.onsuccess = () => resolve(req.result as Array<{ id: string; name: string }>);
          req.onerror = () => reject(req.error);
        },
      );
      db.close();
      return chars[0] ?? null;
    });
    expect(firstCharacter).not.toBeNull();
    const charId = firstCharacter!.id;
    const charName = firstCharacter!.name;

    // Sidebar row renders as a button with the character's name.
    await page.getByRole('button', { name: charName, exact: true }).first().click();

    const page_ = page.locator('[data-testid="character-page"]');
    await expect(page_).toBeVisible();
    await expect(page_).toHaveAttribute('data-character-id', charId);

    // Type a description.
    const desc = page.locator('[data-testid="character-description"]');
    await desc.fill('A thoughtful violinist with a stubborn hope.');

    // Wait for the autosave write to flush to IDB.
    await page.waitForFunction(
      async (id) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('inkmirror');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const got = await new Promise<unknown>((resolve, reject) => {
          const tx = db.transaction('characters', 'readonly');
          const req = tx.objectStore('characters').get(id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        db.close();
        const row = got as { description?: string } | undefined;
        return row?.description === 'A thoughtful violinist with a stubborn hope.';
      },
      charId,
      { timeout: 5_000 },
    );

    // Reload and open the page again — description should come back.
    await page.reload();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: charName, exact: true }).first().click();
    await expect(page.locator('[data-testid="character-description"]')).toHaveValue(
      'A thoughtful violinist with a stubborn hope.',
    );

    // Close with Escape.
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="character-page"]')).toBeHidden();
  });

  test('mentions and dialogue sections are collapsible', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    await page.getByRole('button', { name: /Try the demo/ }).first().click();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });

    // Grab any character with a non-zero appearance count.
    const firstCharacter = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('inkmirror');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const chars = await new Promise<Array<{ name: string }>>((resolve, reject) => {
        const tx = db.transaction('characters', 'readonly');
        const req = tx.objectStore('characters').getAll();
        req.onsuccess = () => resolve(req.result as Array<{ name: string }>);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return chars[0];
    });

    await page.getByRole('button', { name: firstCharacter.name, exact: true }).first().click();

    const mentions = page.locator('[data-testid="character-mentions-section"]');
    const dialogue = page.locator('[data-testid="character-dialogue-section"]');

    // Both sections open by default.
    await expect(mentions).toHaveAttribute('open', '');
    await expect(dialogue).toHaveAttribute('open', '');

    // Clicking the summary collapses the section.
    await mentions.locator('summary').click();
    await expect(mentions).not.toHaveAttribute('open', '');
    // Dialogue stays open — sections collapse independently.
    await expect(dialogue).toHaveAttribute('open', '');

    // Click again to expand.
    await mentions.locator('summary').click();
    await expect(mentions).toHaveAttribute('open', '');
  });

  test('mention dot in a block header opens that character’s page', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    await page.getByRole('button', { name: /Try the demo/ }).first().click();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });

    // Wait for at least one mention dot to render. The demo manuscript
    // mentions characters inside prose, which triggers mention detection
    // on load.
    const mentionDot = page.locator('[data-mention-character-id]').first();
    await expect(mentionDot).toBeVisible({ timeout: 10_000 });
    const expectedId = await mentionDot.getAttribute('data-mention-character-id');
    expect(expectedId).toBeTruthy();

    await mentionDot.click();
    await expect(page.locator('[data-testid="character-page"]')).toHaveAttribute(
      'data-character-id',
      expectedId!,
    );
  });
});
