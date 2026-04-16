import { createResource, createSignal, For, Show } from 'solid-js';
import * as repo from '@/db/repository';
import type { Document } from '@/types';
import { askConfirm } from '@/ui/shared/confirm';
import { toast } from '@/ui/shared/toast';
import { useTheme } from '@/ui/theme';

interface Props {
  onSelect: (docId: string) => void;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export const DocumentPicker = (props: Props) => {
  const { theme, toggleTheme } = useTheme();
  const [docs, { refetch }] = createResource(() => repo.listDocuments());
  const [creating, setCreating] = createSignal(false);
  const [showNewForm, setShowNewForm] = createSignal(false);
  const [newTitle, setNewTitle] = createSignal('');

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

  const deleteDoc = async (doc: Document) => {
    const ok = await askConfirm({
      title: `Delete "${doc.title || 'Untitled'}"?`,
      message:
        'This permanently removes the document and all its chapters, blocks, characters, and history from this browser. This cannot be undone.',
      confirmLabel: 'Delete permanently',
      danger: true,
    });
    if (!ok) return;
    try {
      // Delete all associated data via IDB directly.
      const db = await import('@/db/connection').then((m) => m.getDb());
      const loaded = await repo.loadDocument(doc.id);
      if (loaded) {
        for (const b of loaded.blocks) {
          await db.delete('blocks', b.id);
        }
        for (const ch of loaded.chapters) {
          await db.delete('chapters', ch.id);
        }
        for (const c of loaded.characters) {
          await db.delete('characters', c.id);
        }
      }
      // Also delete any remaining soft-deleted blocks.
      const allBlocks = await db.getAllFromIndex('blocks', 'by_document', doc.id);
      for (const row of allBlocks) {
        await db.delete('blocks', row.id);
      }
      // Sentiments and revisions.
      const sentiments = await db.getAllFromIndex('sentiments', 'by_document', doc.id);
      for (const s of sentiments) {
        await db.delete('sentiments', s.block_id);
      }
      await db.delete('documents', doc.id);
      toast.success(`"${doc.title || 'Untitled'}" deleted`);
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
            StoryForge
          </div>
          <div class="text-sm text-stone-500 dark:text-stone-400">
            Two hearts, one soul — the writer's and the story's pulse.
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            class="mt-3 px-3 py-1 text-xs rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:text-violet-500 hover:border-violet-500 transition-colors"
            aria-label="Toggle theme"
          >
            {theme() === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>

        <div class="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-xl overflow-hidden">
          <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
              Your documents
            </div>
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              class="px-3 py-1 text-xs rounded-lg bg-violet-500 text-white hover:bg-violet-600 transition-colors"
            >
              + New document
            </button>
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
                  placeholder="Document title…"
                  class="flex-1 bg-transparent outline-none border-b border-violet-300 dark:border-violet-700 focus:border-violet-500 text-stone-800 dark:text-stone-100 font-serif text-base py-1"
                />
                <button
                  type="button"
                  onClick={() => void createNew()}
                  disabled={creating()}
                  class="px-3 py-1 text-xs rounded-lg bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 transition-colors"
                >
                  {creating() ? '…' : 'Create'}
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
                  <div class="px-5 py-8 text-center text-sm text-stone-400">
                    {docs.loading ? 'Loading…' : 'No documents yet. Create your first one.'}
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
                          {doc.title || 'Untitled'}
                        </div>
                        <div class="text-[11px] text-stone-400 mt-0.5">
                          {doc.author || 'No author'} · updated {timeAgo(doc.updated_at)}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteDoc(doc)}
                        class="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 text-xs px-1 transition-opacity"
                        title="Delete document"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};
