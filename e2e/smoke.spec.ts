import { test, expect } from '@playwright/test';

// Helper: clear IDB before each test for a clean slate.
async function clearIdb(page: ReturnType<typeof test['info']> extends never ? never : Awaited<ReturnType<typeof import('@playwright/test')['chromium']['launch']>>['newPage'] extends (...args: unknown[]) => infer R ? Awaited<R> : never) {
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('storyforge');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

test.describe('Boot + Documents', () => {
  test('first boot shows document picker with no documents', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('storyforge'));
    await page.reload();
    await expect(page.getByText('Your documents')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No documents yet')).toBeVisible();
  });

  test('creating a document opens the editor', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('storyforge'));
    await page.reload();
    await page.getByText('+ New document').click();
    await page.getByPlaceholder('Document title…').fill('Test Novel');
    await page.getByText('Create').click();
    // Editor should load — check for the top bar with doc title.
    await expect(page.getByText('Test Novel')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Editor basics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('storyforge'));
    await page.reload();
    await page.getByText('+ New document').click();
    await page.getByPlaceholder('Document title…').fill('E2E Test');
    await page.getByText('Create').click();
    await expect(page.getByText('E2E Test')).toBeVisible({ timeout: 10_000 });
  });

  test('typing in a block persists on reload', async ({ page }) => {
    const editable = page.locator('[data-editable]').first();
    await editable.click();
    await editable.type('Hello from Playwright');
    // Wait for debounced persistence.
    await page.waitForTimeout(1000);
    await page.reload();
    await expect(page.getByText('Hello from Playwright')).toBeVisible({ timeout: 10_000 });
  });

  test('creating a new chapter appears in the sidebar', async ({ page }) => {
    // Open the chapter dropdown.
    await page.locator('.text-lg.leading-none').filter({ hasText: '+' }).click();
    await page.getByText('New chapter').click();
    await expect(page.getByText('Chapter 2')).toBeVisible();
  });

  test('changing block type via context menu', async ({ page }) => {
    // Hover first block to reveal the ⋯ button.
    const block = page.locator('[data-block-id]').first();
    await block.hover();
    await block.locator('button[aria-label="Open block menu"]').click();
    await page.getByText('Dialogue').click();
    // Block type label should now say DIALOGUE.
    await expect(block.locator('button').filter({ hasText: 'DIALOGUE' })).toBeVisible();
  });

  test('undo reverts content change', async ({ page }) => {
    const editable = page.locator('[data-editable]').first();
    await editable.click();
    await editable.type('Undo me');
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    // The text should be gone or reverted.
    const text = await editable.innerText();
    expect(text).not.toContain('Undo me');
  });

  test('export downloads a file', async ({ page }) => {
    const editable = page.locator('[data-editable]').first();
    await editable.click();
    await editable.type('Export test content');
    await page.waitForTimeout(500);
    // Click Markdown export button in the sidebar.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByText('Markdown').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.md$/);
  });
});

test.describe('Command palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Use existing doc if any, or create.
    try {
      await expect(page.locator('[data-editable]').first()).toBeVisible({ timeout: 5000 });
    } catch {
      await page.getByText('+ New document').click();
      await page.getByText('Create').click();
      await expect(page.locator('[data-editable]').first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('opens with Ctrl+K and finds actions', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.getByPlaceholder('Type an action or export format…')).toBeVisible();
    await page.keyboard.type('focus');
    await expect(page.getByText('Focus mode')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
