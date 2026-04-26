import { test, expect } from '@playwright/test';

/**
 * Focus mode (typewriter feel):
 *   - Alt+Shift+F toggles focus mode.
 *   - Preference persists across reload via localStorage.
 *   - Focusing a block while focus mode is on calls scrollIntoView so the
 *     block lands near the editor's vertical center.
 *
 * The dimming + side-panel hide are pre-existing behaviors covered
 * implicitly here by asserting on the `.inkmirror-focus` root class.
 */
test.describe('Focus mode — typewriter scroll + persistence', () => {
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
    await page.getByPlaceholder('Document title…').fill('Focus Mode Test');
    await page.getByText('Create').click();
    await expect(page.locator('[data-editable]').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('Alt+Shift+F toggles focus mode and the preference persists', async ({
    page,
  }) => {
    const root = page.locator('.inkmirror-focus');
    await expect(root).toHaveCount(0);

    await page.keyboard.press('Alt+Shift+F');
    await expect(root).toHaveCount(1);

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('inkmirror.focusMode')))
      .toBe('1');

    await page.reload();
    // The class should still be on the root after reload.
    await expect(page.locator('.inkmirror-focus')).toHaveCount(1, {
      timeout: 10_000,
    });

    // Toggle off — class disappears, preference flips to '0'.
    await page.keyboard.press('Alt+Shift+F');
    await expect(page.locator('.inkmirror-focus')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('inkmirror.focusMode')))
      .toBe('0');
  });

  test('focusing a block while focus mode is on calls scrollIntoView({block:"center"})', async ({
    page,
  }) => {
    // Type a couple of paragraphs so there are at least two blocks to
    // toggle focus between. Virtualization only renders what's in the
    // viewport, so we don't try to click block #20.
    const editable = page.locator('[data-editable]').first();
    await editable.click();
    await page.keyboard.type('First paragraph.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second paragraph.');
    await page.waitForTimeout(200);

    // Turn focus mode on.
    await page.keyboard.press('Alt+Shift+F');
    await expect(page.locator('.inkmirror-focus')).toHaveCount(1);

    // Install a spy on scrollIntoView so we can verify the typewriter
    // centering call happens. Asserting on scrollTop deltas is flaky when
    // the document fits in the viewport.
    await page.evaluate(() => {
      const w = window as unknown as { __siv?: number };
      w.__siv = 0;
      const orig = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (arg) {
        if (
          typeof arg === 'object' &&
          arg !== null &&
          (arg as ScrollIntoViewOptions).block === 'center'
        ) {
          w.__siv = (w.__siv ?? 0) + 1;
        }
        return orig.call(this, arg as ScrollIntoViewOptions);
      };
    });

    // Click into the first block — that's a focus change, which should
    // trigger the typewriter scroll while focus mode is on.
    await page.locator('[data-editable]').first().click();

    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { __siv?: number }).__siv ?? 0),
        { timeout: 3_000 },
      )
      .toBeGreaterThan(0);
  });
});
