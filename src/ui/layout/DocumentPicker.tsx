import { createResource, createSignal, For, Show } from 'solid-js';
import * as repo from '@/db/repository';
import type { Document } from '@/types';
import { askConfirm, askConfirmChoice } from '@/ui/shared/confirm';
import { toast } from '@/ui/shared/toast';
import { useTheme } from '@/ui/theme';
import {
  bundleToBlob,
  databaseBackupFilename,
  documentBundleFilename,
  exportDatabaseBackup,
  exportDocumentBundle,
} from '@/backup/export';
import {
  importDatabaseBackup,
  importDocumentBundle,
  parseBundle,
} from '@/backup/import';
import { openDemo } from '@/backup/demo';
import { DEMO_DOC_ID } from '@/backup/demo-bundle';
import { downloadBlob } from '@/exporters';
import { openFeedback } from '@/ui/shared/feedback';
import { t } from '@/i18n';
import { LanguagePicker } from '@/ui/shared/LanguagePicker';

interface Props {
  onSelect: (docId: string) => void;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return t('picker.justNow');
  if (m < 60) return t('picker.minutesAgo', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('picker.hoursAgo', { n: h });
  const d = Math.round(h / 24);
  return t('picker.daysAgo', { n: d });
}

export const DocumentPicker = (props: Props) => {
  const { theme, toggleTheme } = useTheme();
  const [docs, { refetch }] = createResource(() => repo.listDocuments());
  const [creating, setCreating] = createSignal(false);
  const [showNewForm, setShowNewForm] = createSignal(false);
  const [newTitle, setNewTitle] = createSignal('');
  const [loadingDemo, setLoadingDemo] = createSignal(false);

  const tryDemo = async () => {
    if (loadingDemo()) return;
    setLoadingDemo(true);
    try {
      const result = await openDemo();
      if (result.kind === 'error') {
        toast.error(t('demo.openFailed', { error: result.error }));
        return;
      }
      if (result.kind === 'imported' || result.kind === 'replaced') {
        toast.success(t('demo.openedToast'));
      }
      if (result.kind !== 'cancelled') {
        // Let the resource see the new row.
        await refetch();
      }
      // Whether imported/replaced/kept-both/cancelled, the demo exists
      // now — open it.
      props.onSelect(DEMO_DOC_ID);
    } catch (err) {
      toast.error(
        t('demo.openFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setLoadingDemo(false);
    }
  };

  const createNew = async () => {
    const title = newTitle().trim() || 'Untitled';
    setCreating(true);
    try {
      const now = new Date().toISOString();
      const docId = crypto.randomUUID();
      const chapterId = crypto.randomUUID();
      const blockId = crypto.randomUUID();
      const doc: Document = {
        id: docId,
        title,
        author: '',
        synopsis: '',
        settings: {
          font_family: 'Georgia, serif',
          font_size: 16,
          line_height: 1.8,
          editor_width: 680,
          theme: 'light',
        },
        pov_character_id: null,
        created_at: now,
        updated_at: now,
      };
      await repo.saveDocument(doc);
      await repo.saveChapter({
        id: chapterId,
        document_id: docId,
        title: 'Chapter 1',
        order: 0,
        kind: 'standard',
        created_at: now,
        updated_at: now,
      });
      await repo.saveBlock(
        {
          id: blockId,
          chapter_id: chapterId,
          type: 'text',
          content: '',
          order: 0,
          metadata: { type: 'text' },
          deleted_at: null,
          deleted_from: null,
          created_at: now,
          updated_at: now,
        },
        docId,
      );
      props.onSelect(docId);
    } catch (err) {
      toast.error(`Failed to create document: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
      setShowNewForm(false);
      setNewTitle('');
    }
  };

  const exportDoc = async (doc: Document) => {
    try {
      const bundle = await exportDocumentBundle(doc.id);
      const blob = bundleToBlob(bundle);
      downloadBlob(blob, documentBundleFilename(doc.title, bundle.exported_at));
      toast.success(
        t('picker.exportedToast', { title: doc.title || t('common.untitled') }),
      );
    } catch (err) {
      toast.error(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const exportAll = async () => {
    try {
      const backup = await exportDatabaseBackup();
      const blob = bundleToBlob(backup);
      downloadBlob(blob, databaseBackupFilename(backup.exported_at));
      toast.success(
        `Backup exported (${backup.stores.documents.length} document${
          backup.stores.documents.length === 1 ? '' : 's'
        })`,
      );
    } catch (err) {
      toast.error(
        `Backup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleImportFile = async (file: File) => {
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
          if (choice === 'cancel') return; // user aborted
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
      refetch();
    } catch (err) {
      toast.error(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const triggerImport = () => {
    const input = globalThis.document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void handleImportFile(file);
    };
    input.click();
  };

  const deleteDoc = async (doc: Document) => {
    const title = doc.title || t('common.untitled');
    const ok = await askConfirm({
      title: t('picker.deleteConfirmTitle', { title }),
      message: t('picker.deleteConfirmBody'),
      confirmLabel: t('picker.deleteConfirmConfirm'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await repo.deleteDocumentAllRows(doc.id);
      toast.success(t('picker.deleteSuccess', { title }));
      refetch();
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div class="h-full w-full bg-stone-100 dark:bg-stone-900 flex items-center justify-center">
      <div class="w-[520px] max-w-[92vw]">
        <div class="text-center mb-8">
          <div class="font-serif text-3xl text-stone-900 dark:text-stone-50 mb-1">
            InkMirror
          </div>
          <div class="text-sm text-stone-500 dark:text-stone-400">
            {t('picker.tagline')}
          </div>
          <div class="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              class="px-3 py-1 text-xs rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:text-violet-500 hover:border-violet-500 transition-colors"
              aria-label="Toggle theme"
            >
              {theme() === 'dark' ? t('picker.lightMode') : t('picker.darkMode')}
            </button>
            <LanguagePicker />
          </div>
        </div>

        <div class="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-xl overflow-hidden">
          <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div class="text-[10px] font-medium text-stone-400 inkmirror-smallcaps">
              {t('picker.yourDocuments')}
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={triggerImport}
                class="px-3 py-1 text-xs rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:text-violet-500 hover:border-violet-500 transition-colors"
                title={t('picker.importTitle')}
              >
                {t('picker.importButton')}
              </button>
              <button
                type="button"
                onClick={() => setShowNewForm(true)}
                class="px-3 py-1 text-xs rounded-lg bg-violet-500 text-white hover:bg-violet-600 transition-colors"
              >
                {t('picker.newDocument')}
              </button>
            </div>
          </div>

          <div class="max-h-[50vh] overflow-auto">
            <Show when={showNewForm()}>
              <div class="flex items-center gap-2 px-5 py-3 border-b border-stone-200 dark:border-stone-700 bg-violet-50 dark:bg-violet-950/20">
                <input
                  type="text"
                  value={newTitle()}
                  onInput={(e) => setNewTitle(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void createNew(); }
                    if (e.key === 'Escape') { e.preventDefault(); setShowNewForm(false); setNewTitle(''); }
                  }}
                  ref={(el) => queueMicrotask(() => el.focus())}
                  placeholder={t('picker.titlePlaceholder')}
                  class="flex-1 bg-transparent outline-none border-b border-violet-300 dark:border-violet-700 focus:border-violet-500 text-stone-800 dark:text-stone-100 font-serif text-base py-1"
                />
                <button
                  type="button"
                  onClick={() => void createNew()}
                  disabled={creating()}
                  class="px-3 py-1 text-xs rounded-lg bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 transition-colors"
                >
                  {creating() ? '…' : t('common.create')}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewForm(false); setNewTitle(''); }}
                  class="text-stone-400 hover:text-stone-600 text-xs"
                >
                  ×
                </button>
              </div>
            </Show>
            <Show
              when={!docs.loading && (docs() ?? []).length > 0}
              fallback={
                <Show when={!showNewForm()}>
                  <div class="px-5 py-10 text-center flex flex-col items-center gap-4">
                    <div class="font-serif text-base text-stone-500 dark:text-stone-400">
                      {docs.loading ? t('common.loading') : t('picker.emptyTitle')}
                    </div>
                    <Show when={!docs.loading}>
                      <div class="text-[12px] text-stone-400 max-w-[320px] leading-relaxed">
                        {t('picker.emptyBody', { ext: '.inkmirror.json' })}
                      </div>
                      {/* Demo card — only shown when the library is empty. */}
                      <button
                        type="button"
                        onClick={() => void tryDemo()}
                        disabled={loadingDemo()}
                        class="mt-2 w-full max-w-[360px] text-left rounded-xl border border-violet-200/60 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-900/10 px-4 py-3 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors disabled:opacity-60 disabled:cursor-wait"
                      >
                        <div class="flex items-center gap-2 font-serif text-sm text-violet-700 dark:text-violet-200">
                          <span class="text-violet-500">✶</span>
                          <span>{t('demo.ctaPickerHeader')}</span>
                        </div>
                        <div class="mt-1 text-[12px] text-stone-500 dark:text-stone-400 leading-relaxed">
                          {t('demo.ctaPickerBody')}
                        </div>
                      </button>
                    </Show>
                  </div>
                </Show>
              }
            >
              <div class="flex flex-col">
                <For each={docs()}>
                  {(doc) => (
                    <div class="group flex items-center gap-3 px-5 py-3 border-b border-stone-100 dark:border-stone-700/50 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-700/30 transition-colors">
                      <button
                        type="button"
                        onClick={() => props.onSelect(doc.id)}
                        class="flex-1 text-left min-w-0"
                      >
                        <div class="font-serif text-base text-stone-900 dark:text-stone-50 truncate">
                          {doc.title || t('common.untitled')}
                        </div>
                        <div class="text-[11px] text-stone-400 mt-0.5">
                          {doc.author || t('picker.noAuthor')} · {t('picker.updatedAgo', { ago: timeAgo(doc.updated_at) })}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void exportDoc(doc)}
                        class="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-violet-500 text-[11px] px-1 transition-opacity"
                        title={t('picker.exportTitle')}
                      >
                        {t('picker.exportLabel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteDoc(doc)}
                        class="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 text-xs px-1 transition-opacity"
                        title={t('picker.deleteTitle')}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <div class="flex items-center justify-between gap-2 px-5 py-2.5 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40">
            <div class="text-[10px] text-stone-400 inkmirror-smallcaps">
              {t('picker.backupLabel')}
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void exportAll()}
                class="text-[11px] text-stone-500 dark:text-stone-400 hover:text-violet-500 transition-colors"
                title={t('picker.backupAllTitle')}
              >
                {t('picker.backupAll')}
              </button>
              <span class="text-stone-300 dark:text-stone-600">·</span>
              <button
                type="button"
                onClick={triggerImport}
                class="text-[11px] text-stone-500 dark:text-stone-400 hover:text-violet-500 transition-colors"
                title={t('picker.restoreTitle')}
              >
                {t('picker.restore')}
              </button>
            </div>
          </div>
        </div>

        <div class="mt-3 text-center text-[11px] text-stone-400 dark:text-stone-500">
          {t('picker.privacyTagline')}
          <span class="mx-1.5">·</span>
          <button
            type="button"
            onClick={openFeedback}
            class="underline decoration-dotted underline-offset-2 hover:text-violet-500 transition-colors"
          >
            {t('picker.privacyFeedback')}
          </button>
        </div>
      </div>
    </div>
  );
};
