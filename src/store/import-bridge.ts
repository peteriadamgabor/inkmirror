import {
  importDatabaseBackup,
  importDocumentBundle,
  parseBundle,
} from '@/backup/import';
import { askConfirmChoice } from '@/ui/shared/confirm';
import * as repo from '@/db/repository';
import { toast } from '@/ui/shared/toast';
import { t } from '@/i18n';

export interface ImportBridgeOptions {
  /** Run after a successful import — typically the picker's refetch. */
  onAfterImport?: () => void;
}

/**
 * Single import funnel shared by:
 *  - DocumentPicker's "Open backup" file picker
 *  - PWA `launchQueue` (file_handlers, double-click-to-open)
 *  - PWA `share_target` POST (pulled from the share-inbox cache)
 *
 * Behavior is the same in all three cases: parse → collision modal if needed → import → toast.
 * Errors are caught and toasted; this function never throws.
 */
export async function importBridge(
  file: File,
  options: ImportBridgeOptions = {},
): Promise<void> {
  try {
    const bundle = await parseBundle(file);
    if (bundle.kind === 'inkmirror.document') {
      const existing = await repo.loadDocument(bundle.document.id);
      let strategy: 'copy' | 'replace' = 'copy';
      if (existing) {
        const title = existing.document.title || t('common.untitled');
        const choice = await askConfirmChoice({
          title: t('picker.collisionTitle', { title }),
          message: t('picker.collisionBody'),
          confirmLabel: t('picker.collisionReplace'),
          neutralLabel: t('picker.collisionKeepBoth'),
          cancelLabel: t('common.cancel'),
          danger: true,
        });
        if (choice === 'cancel') return;
        strategy = choice === 'confirm' ? 'replace' : 'copy';
      }
      const result = await importDocumentBundle(bundle, strategy);
      const resultTitle = result.documentTitles[0];
      if (result.replaced) {
        toast.success(t('picker.replacedToast', { title: resultTitle }));
      } else {
        toast.success(t('picker.importedToast', { title: resultTitle }));
      }
    } else {
      const result = await importDatabaseBackup(bundle);
      const parts = [t('picker.restoreAdded', { n: result.documentsAdded })];
      if (result.documentsSkipped > 0) {
        parts.push(t('picker.restoreSkipped', { n: result.documentsSkipped }));
      }
      toast.success(t('picker.restoreComplete', { detail: parts.join(', ') }));
    }
    options.onAfterImport?.();
  } catch (err) {
    toast.error(
      t('toast.importFailed', {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
