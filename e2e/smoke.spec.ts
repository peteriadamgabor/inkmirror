import { test, expect } from '@playwright/test';

/**
 * The app flow tests assume a "returning visitor" — localStorage
 * pre-seeded with the hasVisited marker so the first-visit redirect
 * doesn't fire. The Public site tests below exercise the redirect
 * explicitly.
 */
test.describe('App flow (returning visitor)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('inkmirror.hasVisited', '1');
      } catch {
        /* private mode — ignore */
      }
    });
  });

  test.describe('Boot + Documents', () => {
    test('first boot shows document picker with no documents', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
      await page.reload();
      await expect(page.getByText('Your documents')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('A blank page.')).toBeVisible();
    });

    test('creating a document opens the editor', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
      await page.reload();
      await page.getByText('+ New document').click();
      await page.getByPlaceholder('Document title…').fill('Test Novel');
      await page.getByText('Create').click();
      await expect(page.getByText('Test Novel')).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Editor basics', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
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
      await page.waitForTimeout(1000);
      await page.reload();
      await expect(page.getByText('Hello from Playwright')).toBeVisible({ timeout: 10_000 });
    });

    test('creating a new chapter appears in the sidebar', async ({ page }) => {
      await page.locator('.text-lg.leading-none').filter({ hasText: '+' }).click();
      await page.getByText('New chapter').click();
      await expect(page.getByText('Chapter 2').first()).toBeVisible();
    });

    test('changing block type via context menu', async ({ page }) => {
      const block = page.locator('[data-block-id]').first();
      await block.hover();
      await block.locator('button[aria-label="Open block menu"]').click();
      await page.getByText('Dialogue').click();
      await expect(block.locator('button').filter({ hasText: 'DIALOGUE' })).toBeVisible();
    });

    test('undo reverts content change', async ({ page }) => {
      const editable = page.locator('[data-editable]').first();
      await editable.click();
      await editable.type('Undo me');
      await page.waitForTimeout(500);
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(300);
      const text = await editable.innerText();
      expect(text).not.toContain('Undo me');
    });

    test('export downloads a file', async ({ page }) => {
      const editable = page.locator('[data-editable]').first();
      await editable.click();
      await editable.type('Export test content');
      await page.waitForTimeout(500);
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
});

test.describe('Public site (first-time visitor)', () => {
  test('/ redirects a fresh visitor to /landing', async ({ page }) => {
    // No hasVisited marker set — default state for new visitors.
    await page.goto('/');
    await expect(page).toHaveURL(/\/landing$/);
    // "Two hearts, one soul" appears in both the hero and the
    // philosophy section — either one being visible proves landing
    // rendered.
    await expect(page.getByText('Two hearts, one soul').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('/roadmap loads directly without booting the editor', async ({ page }) => {
    await page.goto('/roadmap');
    // Opening section header from the essay.
    await expect(page.getByText('A quiet beginning.')).toBeVisible({ timeout: 10_000 });
    // Status chips should render.
    await expect(page.getByText('SHIPPED').first()).toBeVisible();
    await expect(page.getByText('IN PROGRESS').first()).toBeVisible();
  });

  test('landing nav has a Roadmap link that goes to /roadmap', async ({ page }) => {
    await page.goto('/landing');
    await page.getByRole('link', { name: 'Roadmap' }).click();
    await expect(page).toHaveURL(/\/roadmap$/);
    await expect(page.getByText('A quiet beginning.')).toBeVisible({ timeout: 10_000 });
  });

  test('roadmap feedback CTA opens the feedback modal', async ({ page }) => {
    await page.goto('/roadmap');
    // Scroll to the bottom so the closing section is fully visible.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // The page-level "Send feedback" button (closing CTA).
    await page.getByRole('button', { name: 'Send feedback' }).click();
    // Feedback modal textarea placeholder.
    await expect(page.getByPlaceholder("What's on your mind?")).toBeVisible({
      timeout: 5_000,
    });
  });
});
