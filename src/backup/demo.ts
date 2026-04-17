/**
 * "Try the demo" — open the bundled Chekhov manuscript.
 *
 * Reuses the normal import path (importDocumentBundle). If a demo
 * already exists in IDB, asks the user what to do via the existing
 * tri-state confirm (Replace / Keep both / Cancel). No new persistence
 * code needed.
 */

import { lang, t } from '@/i18n';
import { askConfirmChoice } from '@/ui/shared/confirm';
import { getDb } from '@/db/connection';
import { DEMO_DOC_ID, getDemoBundle } from './demo-bundle';
import { importDocumentBundle } from './import';
import type { ImportResult } from './import';

/** Outcome hints used by the caller to decide what to do next. */
export type OpenDemoResult =
  | { kind: 'imported'; docId: string }
  | { kind: 'replaced'; docId: string }
  | { kind: 'kept-both'; docId: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; error: string };

export async function openDemo(): Promise<OpenDemoResult> {
  try {
    const bundle = getDemoBundle(lang());

    // Does a demo already exist locally?
    const db = await getDb();
    const existing = await db.get('documents', DEMO_DOC_ID);

    if (!existing) {
      await importDocumentBundle(bundle, 'copy');
      // First-time import: id collision can't happen, so the import
      // preserves the bundle's original id.
      return { kind: 'imported', docId: DEMO_DOC_ID };
    }

    // Already present. Ask what to do.
    const choice = await askConfirmChoice({
      title: t('demo.collisionTitle'),
      message: t('demo.collisionBody'),
      confirmLabel: t('demo.collisionReplace'),
      neutralLabel: t('demo.collisionKeepBoth'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });

    if (choice === 'cancel') {
      // Open the existing copy — they already have it, might as well
      // deliver them to it so the click wasn't wasted.
      return { kind: 'cancelled' };
    }

    if (choice === 'confirm') {
      await importDocumentBundle(bundle, 'replace');
      return { kind: 'replaced', docId: DEMO_DOC_ID };
    }

    // 'neutral' → keep both (copy remap).
    const result: ImportResult = await importDocumentBundle(bundle, 'copy');
    // Copy-mode remaps ids; the new one isn't DEMO_DOC_ID. The caller
    // doesn't actually need the new id (returning to picker is fine),
    // but return a hint anyway.
    void result;
    return { kind: 'kept-both', docId: DEMO_DOC_ID };
  } catch (err) {
    return {
      kind: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Returns true if the given document id is the demo's fixed id. */
export function isDemoDocument(docId: string | null | undefined): boolean {
  return docId === DEMO_DOC_ID;
}
