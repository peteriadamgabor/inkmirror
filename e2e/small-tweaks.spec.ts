import { test, expect } from '@playwright/test';

/**
 * Three small premium tweaks bundled together — kept in one spec because
 * they share the "fresh document" boot dance and run quickly:
 *   - auto-typography (em-dash + ellipsis)
 *   - session word counter chip
 *   - in-app search (Ctrl+F)
 */
test.describe('Small premium tweaks', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('inkmirror.hasVisited', '1');
      } catch {
        /* private mode — ignore */
      }
    });
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();
    await page.getByText('+ New document').click();
    await page.getByPlaceholder('Document title…').fill('Tweaks');
    await page.getByText('Create').click();
    await expect(page.locator('[data-editable]').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('auto-typography rewrites -- to em-dash and ... to ellipsis', async ({
    page,
  }) => {
    const editable = page.locator('[data-editable]').first();
    await editable.click();
    // Type "say --" and watch the dash collapse.
    await page.keyboard.type('say --');
    await expect(editable).toContainText('say —', { timeout: 2_000 });

    // New line, type "trail..." → "trail…"
    await page.keyboard.press('Enter');
    await page.keyboard.type('trail...');
    const second = page.locator('[data-editable]').nth(1);
    await expect(second).toContainText('trail…', { timeout: 2_000 });
  });

  test('session counter chip appears after typing new words', async ({
    page,
  }) => {
    const editable = page.locator('[data-editable]').first();
    await editable.click();
    await page.keyboard.type('alpha beta gamma delta epsilon');
    // Wait for the debounced commit (300ms) plus a margin.
    await page.waitForTimeout(800);
    // The chip is the small violet `+N` next to the document total.
    await expect(page.locator('.text-violet-500').filter({ hasText: /^\+\d+$/ }))
      .toBeVisible({ timeout: 3_000 });
  });

  test('Ctrl+F opens search, finds matches, jumps with Enter', async ({
    page,
  }) => {
    const editable = page.locator('[data-editable]').first();
    await editable.click();
    await page.keyboard.type('The fox is quick.');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    // Click into the freshly created second block to defeat any race
    // between the rAF-deferred focus and Playwright's next keypress.
    await page.locator('[data-editable]').nth(1).click();
    await page.keyboard.type('Another fox appears.');
    await page.waitForTimeout(500);

    // Open search.
    await page.keyboard.press('Control+f');
    const input = page.getByPlaceholder(/Search the manuscript/);
    await expect(input).toBeVisible({ timeout: 2_000 });

    // Type query → counter shows total matches.
    await input.fill('fox');
    await expect(page.locator('[data-testid="search-counter"]'))
      .toHaveText('1 / 2', { timeout: 2_000 });

    // Enter → moves to next match.
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="search-counter"]'))
      .toHaveText('2 / 2');

    // Esc closes the bar.
    await page.keyboard.press('Escape');
    await expect(input).not.toBeVisible();
  });
});
