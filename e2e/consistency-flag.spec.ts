import { test, expect } from '@playwright/test';

/**
 * Near tier — inconsistency flag UI surface.
 *
 * Covers the ConsistencyPanel flow without running the real NLI model:
 *   - seeded flag renders in the Active group
 *   - Dismiss moves it into the "Dismissed" details list
 *   - Reactivate brings it back into the Active group
 *
 * The "re-edit → flag disappears" path (hash-mismatch invalidation in
 * `updateBlockContent`) is covered by a dedicated store-level unit test
 * rather than E2E — driving contenteditable edits through Playwright is
 * flaky because Solid's content-sync effect fights external DOM mutations.
 * The "re-emerges after a fresh scan" step of the original spec requires
 * a real NLI pass, so it's left to manual QA with the real worker.
 */
test.describe('Near tier — consistency flag UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('inkmirror.hasVisited', '1');
        // Skip the opt-in dance; boot the app already in the Deep profile.
        localStorage.setItem('inkmirror.aiProfile', 'deep');
      } catch {
        /* private mode — ignore */
      }
    });
    // Reject any HuggingFace download so the worker fails fast and the
    // Consistency panel renders without blocking on a model load.
    await page.route(/huggingface\.co/, (route) =>
      route.fulfill({ status: 500, body: 'blocked-in-e2e' }),
    );
  });

  test('seeded flag appears, dismisses, and reactivates', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('inkmirror'));
    await page.reload();

    await page.getByRole('button', { name: /Try the demo/ }).first().click();
    await expect(page.getByText("Rothschild's Fiddle — a demo").first()).toBeVisible({
      timeout: 10_000,
    });

    // The Consistency panel only renders when profile === 'deep', which
    // we set above via addInitScript. Wait for it to appear.
    await expect(page.locator('[data-testid="consistency-panel"]')).toBeVisible({
      timeout: 10_000,
    });

    // Grab document/character/block ids from the booted demo, then seed
    // a flag directly into the `inconsistencies` IDB store. Reloading
    // replays loadDocument, which reads the flag back into the store.
    await page.evaluate(async () => {
      const openDb = (): Promise<IDBDatabase> =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('inkmirror');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      const db = await openDb();
      const all = <T,>(store: string): Promise<T[]> =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(store, 'readonly');
          const req = tx.objectStore(store).getAll();
          req.onsuccess = () => resolve(req.result as T[]);
          req.onerror = () => reject(req.error);
        });
      interface DocRow { id: string }
      interface CharRow { id: string; document_id: string; name: string }
      interface BlockRow {
        id: string;
        document_id: string;
        content: string;
        type: string;
        deleted_at: number | null;
      }
      const [docs, chars, blocks] = await Promise.all([
        all<DocRow>('documents'),
        all<CharRow>('characters'),
        all<BlockRow>('blocks'),
      ]);
      const doc = docs[0];
      const char = chars.find((c) => c.document_id === doc.id);
      const textBlocks = blocks
        .filter(
          (b) =>
            b.document_id === doc.id && b.deleted_at === null && b.type === 'text',
        )
        .slice(0, 2);
      const [a, b] = textBlocks;
      if (!doc || !char || !a || !b) throw new Error('demo seed missing rows');

      // Simple FNV-like hash identical in spirit to src/utils/hash.contentHash,
      // but we re-derive it inline so the test doesn't need bundler imports.
      const hash = (s: string): string => {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(16).padStart(8, '0');
      };

      const flag = {
        id: `flag-${a.id}-0-${b.id}-0`,
        document_id: doc.id,
        character_id: char.id,
        block_a_id: a.id,
        block_a_hash: hash(a.content),
        block_a_sentence_idx: 0,
        block_a_sentence: 'Eva has green eyes.',
        block_b_id: b.id,
        block_b_hash: hash(b.content),
        block_b_sentence_idx: 0,
        block_b_sentence: 'Eva has brown eyes.',
        trigger_categories: ['physical'],
        contradiction_score: 0.88,
        status: 'active' as const,
        created_at: Date.now(),
        dismissed_at: null,
      };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('inconsistencies', 'readwrite');
        const req = tx.objectStore('inconsistencies').put(flag);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      db.close();
    });

    // Reload so loadDocument picks up the seeded flag.
    await page.reload();
    await expect(page.locator('[data-testid="consistency-panel"]')).toBeVisible({
      timeout: 10_000,
    });

    const panel = page.locator('[data-testid="consistency-panel"]');
    await expect(panel.getByText('Eva has green eyes.')).toBeVisible();
    await expect(panel.getByText('Eva has brown eyes.')).toBeVisible();

    // Dismiss — flag should leave the Active group and land in the
    // "Dismissed" details list.
    await panel.getByRole('button', { name: /Dismiss|Elvetés/ }).first().click();
    await expect(panel.getByText('Eva has green eyes.')).toBeHidden();

    const dismissedSummary = panel.locator('summary');
    await expect(dismissedSummary).toBeVisible();
    await dismissedSummary.click();
    await expect(panel.getByText('Eva has green eyes.')).toBeVisible();

    // Reactivate — comes back to Active.
    await panel.getByRole('button', { name: /Reactivate|Visszaaktiválás/ }).click();
    await expect(panel.getByText('Eva has brown eyes.')).toBeVisible();
  });
});
