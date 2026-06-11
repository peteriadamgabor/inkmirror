import {
  importDatabaseBackup,
  importDocumentBundle,
  parseBundle,
} from '@/backup/import';
import * as repo from '@/db/repository';
import { t } from '@/i18n';

export type ImportConfirmResult = 'confirm' | 'neutral' | 'cancel';

/** Structural mirror of the UI layer's ConfirmOptions — declared here so
 * store/ never imports from ui/ (the import rule is ui/ → store/ → db/). */
export interface ImportConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  neutralLabel?: string;
  danger?: boolean;
}

/**
 * UI capabilities injected by the caller (DI, mirroring the sentimentHook
 * pattern in `./document`). The real implementations live in
 * `@/ui/shared/import-ui` and wrap askConfirmChoice / toast.
 */
export interface ImportBridgeUi {
  /** Tri-state collision modal: Replace / Keep both / Cancel. */
  confirmChoice(opts: ImportConfirmOptions): Promise<ImportConfirmResult>;
  notifySuccess(message: string): void;
  notifyError(message: string): void;
}

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
  ui: ImportBridgeUi,
  options: ImportBridgeOptions = {},
): Promise<void> {
  try {
    const bundle = await parseBundle(file);
    if (bundle.kind === 'inkmirror.document') {
      const existing = await repo.loadDocument(bundle.document.id);
      let strategy: 'copy' | 'replace' = 'copy';
      if (existing) {
        const title = existing.document.title || t('common.untitled');
        const choice = await ui.confirmChoice({
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
        ui.notifySuccess(t('picker.replacedToast', { title: resultTitle }));
      } else {
        ui.notifySuccess(t('picker.importedToast', { title: resultTitle }));
      }
    } else {
      const result = await importDatabaseBackup(bundle);
      const parts = [t('picker.restoreAdded', { n: result.documentsAdded })];
      if (result.documentsSkipped > 0) {
        parts.push(t('picker.restoreSkipped', { n: result.documentsSkipped }));
      }
      ui.notifySuccess(t('picker.restoreComplete', { detail: parts.join(', ') }));
    }
    options.onAfterImport?.();
  } catch (err) {
    ui.notifyError(
      t('toast.importFailed', {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
