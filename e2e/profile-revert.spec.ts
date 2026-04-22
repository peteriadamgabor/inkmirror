import { test, expect } from '@playwright/test';

/**
 * Near tier — profile revert flow.
 *
 * Covers the deep → lightweight path from Settings → AI → Advanced.
 * Validates that:
 *   - the Revert button only appears under Advanced when profile is Deep
 *   - clicking it flips localStorage + the Rich/Basic "Active" badge
 *   - the ConsistencyPanel disappears once the profile is Basic
 *     (mixed-state: Rich-analyzed sentiment rows stay, but the Deep-only
 *     inconsistency surface hides — matching src/ui/features/ConsistencyPanel
 *     which gates on `profile() === 'deep'`)
 *
 * Stays offline from HuggingFace; the test's job is the UI wiring, not
 * the model lifecycle.
 */
test.describe('Near tier — profile revert flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('inkmirror.hasVisited', '1');
        // Skip the opt-in dance; boot already in Deep.
        localStorage.setItem('inkmirror.aiProfile', 'deep');
      } catch {
        /* private mode — ignore */
      }
    });
    await page.route(/huggingface\.co/, (route) =>
      route.fulfill({ status: 500, body: 'blocked-in-e2e' }),
    );
  });

  test('revert flips profile to lightweight and hides the ConsistencyPanel', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    await page.getByRole('button', { name: /Try the demo/ }).first().click();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });

    // Consistency panel should be visible while profile is Deep.
    await expect(page.locator('[data-testid="consistency-panel"]')).toBeVisible({
      timeout: 10_000,
    });

    await page.getByLabel('More actions').click();
    await page.getByRole('menuitem', { name: /Settings|Beállítások/ }).click();

    // AI tab should be the initial tab. Rich card should be Active.
    const richCard = page.locator('[data-profile="rich"]');
    const basicCard = page.locator('[data-profile="basic"]');
    await expect(richCard).toContainText(/Active|Aktív/);
    await expect(basicCard).not.toContainText(/Active|Aktív/);

    // Open the Advanced section and hit Revert. No confirm dialog on
    // this path — chooseProfile('lightweight') skips the confirmation.
    await page.getByRole('button', { name: /Show advanced|Haladó megjelenítése/ }).click();
    await page
      .getByRole('button', { name: /^(Revert|Visszaállítás)$/ })
      .click();

    // Profile should flip in localStorage.
    await page.waitForFunction(
      () => localStorage.getItem('inkmirror.aiProfile') === 'lightweight',
      undefined,
      { timeout: 5_000 },
    );

    // Active badge moves to Basic.
    await expect(basicCard).toContainText(/Active|Aktív/);
    await expect(richCard).not.toContainText(/Active|Aktív/);

    // Close the Settings modal so the right panel is observable.
    await page.keyboard.press('Escape');

    // Consistency panel hides — it's Deep-only.
    await expect(page.locator('[data-testid="consistency-panel"]')).toBeHidden({
      timeout: 5_000,
    });
  });

  test('after revert, re-opening Settings shows Basic active and no revert button', async ({
    page,
  }) => {
    // Start already in lightweight — confirms the revert UI only shows
    // when it's relevant.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('inkmirror.aiProfile', 'lightweight');
      } catch {
        /* private mode — ignore */
      }
    });

    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    await page.getByRole('button', { name: /Try the demo/ }).first().click();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });

    // No ConsistencyPanel in lightweight mode.
    await expect(page.locator('[data-testid="consistency-panel"]')).toBeHidden();

    await page.getByLabel('More actions').click();
    await page.getByRole('menuitem', { name: /Settings|Beállítások/ }).click();

    await expect(page.locator('[data-profile="basic"]')).toContainText(/Active|Aktív/);

    // The Advanced toggle is gated on profile === 'deep', so its
    // "Show advanced" button should not exist in lightweight.
    await expect(
      page.getByRole('button', { name: /Show advanced|Haladó megjelenítése/ }),
    ).toHaveCount(0);
  });
});
