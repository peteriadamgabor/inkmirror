import { test, expect } from '@playwright/test';

/**
 * Echoes panel: manual repeated-language scan in the right panel, and
 * the click-to-highlight handoff into the search bar.
 */
test.describe('Echoes panel', () => {
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
    await page.getByPlaceholder('Document title…').fill('Echo Chamber');
    await page.getByText('Create').click();
    await expect(page.locator('[data-editable]').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('scan finds a close echo and clicking it lights up the search bar', async ({
    page,
  }) => {
    const editable = page.locator('[data-editable]').first();
    await editable.click();
    await page.keyboard.type(
      'The lighthouse stood dark. The lighthouse waited. Nobody watched the lighthouse anymore.',
    );
    // Let the 300ms commit debounce flush into the store.
    await page.waitForTimeout(800);

    const panel = page.locator('[data-testid="echoes-panel"]');
    await panel.getByRole('button', { name: 'Scan', exact: true }).click();

    // Worker round-trip is fast; the finding row carries the term and count.
    const finding = panel.getByRole('button', { name: /lighthouse/ });
    await expect(finding).toBeVisible({ timeout: 5_000 });
    await expect(panel.getByText('Close echoes')).toBeVisible();
    await expect(finding).toContainText('×3');

    await finding.click();
    const search = page.getByPlaceholder(/Search the document/);
    await expect(search).toBeVisible();
    await expect(search).toHaveValue('lighthouse');
    await expect(page.locator('[data-testid="search-counter"]')).toHaveText('1 / 3', {
      timeout: 2_000,
    });
  });

  test('clean prose reports no echoes', async ({ page }) => {
    const editable = page.locator('[data-editable]').first();
    await editable.click();
    await page.keyboard.type('Every word here appears exactly once, nothing repeats today.');
    await page.waitForTimeout(800);

    const panel = page.locator('[data-testid="echoes-panel"]');
    await panel.getByRole('button', { name: 'Scan', exact: true }).click();
    await expect(panel.getByText(/no echoes/i)).toBeVisible({ timeout: 5_000 });
  });
});
