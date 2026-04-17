import { test, expect } from '@playwright/test';

/**
 * Near tier — AI profile opt-in flow.
 *
 * Covers the UI wiring: sidebar menu → Settings modal → AI tab →
 * Rich card → confirm modal → localStorage persistence. Does NOT
 * exercise the actual model download — the real 80 MB HuggingFace
 * pull would make the test slow and flaky. Network requests to
 * huggingface.co are intercepted and rejected so the worker fails
 * fast; the test just confirms the opt-in decision persisted before
 * the inevitable network failure.
 *
 * If the UI regresses (modal doesn't open, confirm doesn't fire the
 * profile write, etc.), this catches it.
 */
test.describe('Near tier — opt-in flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('inkmirror.hasVisited', '1');
      } catch {
        /* private mode — ignore */
      }
    });
    // Keep the test offline from HuggingFace. Any attempt to download
    // the model will 500 immediately so the worker fails fast and the
    // UI surfaces the error row — we only care about the opt-in path,
    // not the download.
    await page.route(/huggingface\.co/, (route) =>
      route.fulfill({ status: 500, body: 'blocked-in-e2e' }),
    );
  });

  test('sidebar → Settings → Rich → confirm persists profile=deep', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    // Boot the demo so the app lands in the editor.
    await page.getByRole('button', { name: /Try the demo/ }).first().click();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });

    // Open the sidebar "More actions" menu, then Settings.
    await page.getByLabel('More actions').click();
    await page.getByRole('menuitem', { name: /Settings|Beállítások/ }).click();

    // Settings modal should render the profile cards.
    const basicCard = page.locator('[data-profile="basic"]');
    const richCard = page.locator('[data-profile="rich"]');
    await expect(basicCard).toBeVisible({ timeout: 5_000 });
    await expect(richCard).toBeVisible();
    await expect(basicCard).toContainText(/Active|Aktív/);

    // Click Rich — confirm dialog should open with the download
    // disclosure. Confirm, then verify the profile flipped.
    await richCard.click();
    const confirmTitle = page.getByText(/Download the Rich model|Letöltsük a Gazdag modellt/);
    await expect(confirmTitle).toBeVisible({ timeout: 5_000 });

    await page
      .getByRole('button', { name: /Download and enable|Letöltés és bekapcsolás/ })
      .click();

    // Give the modal a tick to fire the storage write.
    await page.waitForFunction(
      () => localStorage.getItem('inkmirror.aiProfile') === 'deep',
      undefined,
      { timeout: 5_000 },
    );

    // Either the progress bar renders (if the worker emitted a
    // progress tick before the 500 arrived) or the failure banner
    // comes up. Both are valid terminal states given our network
    // mock — the test's job is to confirm the opt-in decision
    // persisted, which it did.
  });

  test('cancelling the confirm modal keeps profile on Basic', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    await page.getByRole('button', { name: /Try the demo/ }).first().click();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByLabel('More actions').click();
    await page.getByRole('menuitem', { name: /Settings|Beállítások/ }).click();

    await page.locator('[data-profile="rich"]').click();
    await page
      .getByRole('button', { name: /Not yet|Most nem/ })
      .click();

    // Profile should NOT have been set.
    const stored = await page.evaluate(() =>
      localStorage.getItem('inkmirror.aiProfile'),
    );
    expect(stored).not.toBe('deep');
    await expect(page.locator('[data-profile="basic"]')).toContainText(/Active|Aktív/);
  });
});
