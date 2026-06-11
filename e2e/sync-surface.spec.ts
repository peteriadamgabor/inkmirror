import { test, expect } from '@playwright/test';

/**
 * Sync settings UI surface.
 *
 * OUT OF SCOPE: the full pairing round-trip (create circle → paircode →
 * redeem on a second context → document sync). The e2e webServer is
 * `npm run dev` (vite), which only proxies /hf-proxy — there is no
 * /sync backend wired in (that lives in the Cloudflare Worker,
 * src/worker/sync.ts, covered by its own unit tests). These tests cover
 * everything client-side that gates a network call: opening the sync
 * tab, the passphrase mismatch / strength validation, and the
 * generate-passphrase helper.
 */
test.describe('Sync settings surface', () => {
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
    await expect(page.getByText('Your documents')).toBeVisible({ timeout: 10_000 });

    // Open Settings → Sync tab.
    await page.getByRole('button', { name: 'Open app settings (sync, AI, hotkeys, language)' }).click();
    await page.getByRole('button', { name: 'Sync', exact: true }).click();
  });

  test('sync tab shows the unconfigured state with both entry points', async ({ page }) => {
    await expect(
      page.getByText('Sync your documents across devices, end-to-end encrypted', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set up sync' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect to existing sync' })).toBeVisible();
    // The privacy link is always present — sync is the moment users care.
    await expect(
      page.getByRole('link', { name: 'How is my data protected? (Privacy)' }),
    ).toBeVisible();
  });

  test('passphrase mismatch is rejected before any network call', async ({ page }) => {
    await page.getByRole('button', { name: 'Set up sync' }).click();
    await expect(page.getByText('Choose a passphrase')).toBeVisible();

    await page.getByPlaceholder('Passphrase', { exact: true }).fill('correct horse battery staple');
    await page.getByPlaceholder('Confirm', { exact: true }).fill('correct horse battery stable');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(page.getByText("The two passphrases don't match.")).toBeVisible();
    // Still on the passphrase step — nothing was submitted.
    await expect(page.getByText('Choose a passphrase')).toBeVisible();
  });

  test('weak passphrase is gated with the strength meter', async ({ page }) => {
    await page.getByRole('button', { name: 'Set up sync' }).click();
    await expect(page.getByText('Choose a passphrase')).toBeVisible();

    await page.getByPlaceholder('Passphrase', { exact: true }).fill('abc');
    // Strength meter reads "weak" while typing.
    await expect(page.getByText('weak', { exact: true })).toBeVisible();

    await page.getByPlaceholder('Confirm', { exact: true }).fill('abc');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(page.getByText('Pick a stronger passphrase or use Generate.')).toBeVisible();
    await expect(page.getByText('Choose a passphrase')).toBeVisible();
  });

  test('generate fills both fields with a strong, revealed passphrase', async ({ page }) => {
    await page.getByRole('button', { name: 'Set up sync' }).click();
    await page.getByRole('button', { name: 'Generate strong passphrase' }).click();

    // Generation auto-reveals (type=text) so the user can copy it down.
    const pass = page.getByPlaceholder('Passphrase', { exact: true });
    const confirm = page.getByPlaceholder('Confirm', { exact: true });
    await expect(pass).toHaveAttribute('type', 'text');
    const passValue = await pass.inputValue();
    expect(passValue.length).toBeGreaterThan(10);
    await expect(confirm).toHaveValue(passValue);
    await expect(page.getByText('strong', { exact: true })).toBeVisible();
  });

  test('connect-to-existing modal exposes paircode + passphrase fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Connect to existing sync' }).click();
    await expect(page.getByPlaceholder('Pair code')).toBeVisible();
    await expect(page.getByPlaceholder('Passphrase', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
  });
});
