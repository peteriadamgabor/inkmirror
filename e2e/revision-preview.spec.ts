import { test, expect } from '@playwright/test';

/**
 * Block revision preview & restore — E2E.
 *
 * The snapshot gate (60s of inactivity at default preset) makes a real-time
 * test slow and flaky. Instead we seed two `block_revisions` rows directly
 * into IDB, then drive the popover and banner from the seeded data. This
 * exercises everything user-visible: ⟲ button → popover → row click →
 * banner → Cancel/Restore → store update + new pre-restore row.
 *
 * Because the editor is virtualised, we look up a block that is already in
 * the DOM rather than sorting IDB rows by order_idx (which can surface a
 * block that is off-screen and therefore not rendered).
 */
test.describe('Block revision preview & restore', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('inkmirror.hasVisited', '1');
        localStorage.setItem('inkmirror.lang', 'en');
      } catch {
        /* private mode — ignore */
      }
    });
  });

  /**
   * Helper: boot the demo document and return the ID of the first visible
   * text block in the virtualised editor.
   */
  async function bootDemo(page: import('@playwright/test').Page): Promise<string> {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    await page.getByRole('button', { name: /Try the demo/ }).first().click();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });

    // The virtualiser renders whichever blocks are in the viewport. Pick the
    // first one that is a text block and is attached to the DOM.
    const blockId = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-block-type="text"][data-block-id]');
      if (!el) throw new Error('no text block rendered in the initial viewport');
      return el.dataset.blockId!;
    });

    return blockId;
  }

  /**
   * Helper: seed `count` revision rows for `blockId` into IDB and return the
   * ISO timestamp strings so tests can reference them.
   */
  async function seedRevisions(
    page: import('@playwright/test').Page,
    blockId: string,
    rows: Array<{ minsAgo: number; content: string }>,
  ) {
    await page.evaluate(
      async ({ blockId, rows }: { blockId: string; rows: Array<{ minsAgo: number; content: string }> }) => {
        const openDb = (): Promise<IDBDatabase> =>
          new Promise((resolve, reject) => {
            const req = indexedDB.open('inkmirror');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
        const db = await openDb();

        // Grab document_id for this block.
        const docId = await new Promise<string>((resolve, reject) => {
          const tx = db.transaction('blocks', 'readonly');
          const req = tx.objectStore('blocks').get(blockId);
          req.onsuccess = () => resolve((req.result as { document_id: string }).document_id);
          req.onerror = () => reject(req.error);
        });

        const now = Date.now();
        const revisions = rows.map(({ minsAgo, content }) => {
          const iso = new Date(now - minsAgo * 60 * 1000).toISOString();
          return {
            id: `${blockId}|${iso}`,
            block_id: blockId,
            document_id: docId,
            content,
            snapshot_at: iso,
          };
        });

        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('block_revisions', 'readwrite');
          let pending = revisions.length;
          revisions.forEach((r) => {
            const req = tx.objectStore('block_revisions').put(r);
            req.onsuccess = () => {
              pending--;
              if (pending === 0) resolve();
            };
            req.onerror = () => reject(req.error);
          });
        });

        db.close();
      },
      { blockId, rows },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: click row → preview banner → cancel restores live content
  // ─────────────────────────────────────────────────────────────────────────
  test('click row → preview banner → cancel restores live content', async ({ page }) => {
    const blockId = await bootDemo(page);

    await seedRevisions(page, blockId, [
      { minsAgo: 15, content: 'OLDER VERSION SEEDED FOR TEST' },
      { minsAgo: 5, content: 'MIDDLE VERSION SEEDED FOR TEST' },
    ]);

    // Read the live content for later assertion.
    const liveContent = await page.evaluate((id: string) => {
      const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"] [data-editable]`);
      return el?.textContent ?? '';
    }, blockId);

    // The history button lives inside a named Tailwind group (group/header).
    // Hover the header div directly so group-hover/header:opacity-100 fires.
    const blockEl = page.locator(`[data-block-id="${blockId}"]`);
    const headerEl = blockEl.locator('.group\\/header').first();
    await headerEl.hover();

    // Click the history button (aria-label = "Block history").
    await blockEl
      .getByRole('button', { name: /Block history|revision history|verzió|előzmény/i })
      .first()
      .click();

    // The popover is open. The oldest row renders as "(initial snapshot) OLDER
    // VERSION SEEDED…" — click it.
    const olderRow = page.getByRole('button').filter({ hasText: /OLDER VERSION SEEDED/i });
    await expect(olderRow).toBeVisible({ timeout: 5_000 });
    await olderRow.click();

    // Preview banner should appear.
    await expect(
      page.getByRole('status').filter({ hasText: /Previewing|Előnézet/i }),
    ).toBeVisible();

    // The contenteditable shows the older version.
    const editor = blockEl.locator('[data-editable]');
    await expect(editor).toContainText('OLDER VERSION SEEDED');

    // Cancel — banner disappears, live content is restored.
    await page.getByRole('button', { name: /^Cancel$|^Mégse$/i }).click();

    await expect(
      page.getByRole('status').filter({ hasText: /Previewing|Előnézet/i }),
    ).not.toBeVisible();

    // The first 30 chars of the live content should be back.
    await expect(editor).toContainText(liveContent.slice(0, 30));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: click row → Restore commits and writes pre-restore snapshot
  // ─────────────────────────────────────────────────────────────────────────
  test('click row → Restore commits and writes pre-restore snapshot', async ({ page }) => {
    const blockId = await bootDemo(page);

    await seedRevisions(page, blockId, [
      { minsAgo: 10, content: 'RESTORED VERSION FROM PAST' },
    ]);

    const blockEl = page.locator(`[data-block-id="${blockId}"]`);
    const headerEl2 = blockEl.locator('.group\\/header').first();
    await headerEl2.hover();
    await blockEl
      .getByRole('button', { name: /Block history|revision history|verzió|előzmény/i })
      .first()
      .click();

    const oldRow = page.getByRole('button').filter({ hasText: /RESTORED VERSION FROM PAST/i });
    await expect(oldRow).toBeVisible({ timeout: 5_000 });
    await oldRow.click();

    // Click Restore.
    await page.getByRole('button', { name: /^Restore$|^Visszaállítás$/i }).click();

    // Block content should now be the restored version. Wait for this first
    // (setStore is synchronous so DOM updates quickly).
    const editor = blockEl.locator('[data-editable]');
    await expect(editor).toContainText('RESTORED VERSION FROM PAST');

    // Wait for commitPreview's async IDB writes to land (saveRevision +
    // saveBlock). Poll IDB until the revision count rises above 1.
    await page.waitForFunction(
      (id: string) => {
        return new Promise<boolean>((resolve) => {
          const req = indexedDB.open('inkmirror');
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('block_revisions', 'readonly');
            const idx = tx.objectStore('block_revisions').index('by_block');
            const countReq = idx.count(id);
            countReq.onsuccess = () => {
              db.close();
              resolve(countReq.result > 1);
            };
            countReq.onerror = () => { db.close(); resolve(false); };
          };
          req.onerror = () => resolve(false);
        });
      },
      blockId,
      { timeout: 5_000 },
    );

    // Re-open history. There should now be MORE rows than the one we seeded
    // (commitPreview writes a pre-restore snapshot of the old live content).
    const headerEl3 = blockEl.locator('.group\\/header').first();
    await headerEl3.hover();
    await blockEl
      .getByRole('button', { name: /Block history|revision history|verzió|előzmény/i })
      .first()
      .click();

    // The history header shows "{count} / 50". Wait until it shows > 1.
    const header = page.locator('text=/\\d+ \\/ 50/').first();
    await expect(header).toBeVisible({ timeout: 5_000 });
    // Poll the header until count > 1 (the resource may load with stale data
    // on the first render tick, then update as the resource re-fetches).
    await expect(async () => {
      const headerText = await header.textContent();
      const match = headerText?.match(/(\d+)\s*\/\s*50/);
      if (!match) throw new Error(`could not parse history header: ${headerText}`);
      expect(parseInt(match[1], 10)).toBeGreaterThan(1);
    }).toPass({ timeout: 5_000 });
  });
});
