import { test, expect } from '@playwright/test';

/**
 * Backup round-trip: export a document bundle from the picker, re-import
 * it, and exercise the collision dialog (Cancel / Keep both / Replace).
 *
 * The import funnel is `importBridge` (src/store/import-bridge.ts) —
 * the same path the PWA share_target and launchQueue use, so this spec
 * covers the collision UX for all three entry points.
 */
test.describe('Backup export → import round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('inkmirror.hasVisited', '1');
      } catch {
        /* private mode — ignore */
      }
    });
  });

  test('export, then re-import with Cancel / Keep both / Replace', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    // --- Create a document with some content ---------------------------
    await page.getByText('+ New document').click();
    await page.getByPlaceholder('Document title…').fill('Roundtrip Novel');
    await page.getByText('Create').click();
    const editable = page.locator('[data-editable]').first();
    await expect(editable).toBeVisible({ timeout: 10_000 });
    await editable.click();
    await editable.type('The lighthouse keeper counted the waves.');
    await page.waitForTimeout(1000); // persistence pulse

    // --- Back to the picker via the sidebar overflow menu ---------------
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Documents' }).click();
    await expect(page.getByText('Your documents')).toBeVisible({ timeout: 10_000 });

    // --- Export the bundle ----------------------------------------------
    const row = page.locator('.group', { hasText: 'Roundtrip Novel' });
    await row.hover();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export: Roundtrip Novel' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.inkmirror\.json$/);
    const bundlePath = await download.path();
    expect(bundlePath).toBeTruthy();

    const importBundle = async () => {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: 'Import…' }).click(),
      ]);
      await chooser.setFiles(bundlePath!);
    };

    const exportButtons = (title: string) =>
      page.getByRole('button', { name: `Export: ${title}`, exact: true });

    // --- Re-import #1: collision dialog → Cancel ------------------------
    await importBundle();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('"Roundtrip Novel" already exists')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
    // Nothing imported, nothing replaced — still exactly one document.
    await expect(exportButtons('Roundtrip Novel')).toHaveCount(1);

    // --- Re-import #2: collision dialog → Keep both ----------------------
    await importBundle();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole('button', { name: 'Keep both' }).click();
    // The copy gets fresh ids and a disambiguated title.
    await expect(page.getByText('Imported "Roundtrip Novel (imported)"')).toBeVisible({
      timeout: 5_000,
    });
    await expect(exportButtons('Roundtrip Novel')).toHaveCount(1);
    await expect(exportButtons('Roundtrip Novel (imported)')).toHaveCount(1);

    // --- Re-import #3: collision dialog → Replace ------------------------
    await importBundle();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole('button', { name: 'Replace' }).click();
    await expect(page.getByText('Replaced "Roundtrip Novel"')).toBeVisible({
      timeout: 5_000,
    });
    // Replace targets the colliding id — the "(imported)" copy is untouched.
    await expect(exportButtons('Roundtrip Novel')).toHaveCount(1);
    await expect(exportButtons('Roundtrip Novel (imported)')).toHaveCount(1);

    // The replaced document still opens with its content intact.
    await page.getByText('Roundtrip Novel', { exact: true }).click();
    await expect(page.getByText('The lighthouse keeper counted the waves.')).toBeVisible({
      timeout: 10_000,
    });
  });
});
