import { For, createSignal, Show } from 'solid-js';
import {
  store,
  createChapter,
  deleteChapter,
  renameChapter,
  setActiveChapter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from '@/store/document';
import {
  toggleFocusMode,
  toggleZenMode,
  toggleGraveyard,
  togglePlotTimeline,
} from '@/store/ui-state';
import type { ChapterKind, UUID } from '@/types';

const CHAPTER_KIND_MENU: Array<{ kind: ChapterKind; label: string }> = [
  { kind: 'standard',        label: 'New chapter' },
  { kind: 'cover',           label: 'Cover' },
  { kind: 'dedication',      label: 'Dedication' },
  { kind: 'epigraph',        label: 'Epigraph' },
  { kind: 'acknowledgments', label: 'Acknowledgments' },
  { kind: 'afterword',       label: 'Afterword' },
];

const CHAPTER_KIND_GLYPH: Record<ChapterKind, string> = {
  standard:        '',
  cover:           '◆',
  dedication:      '♡',
  epigraph:        '“',
  acknowledgments: '✦',
  afterword:       '·',
};
import { jsonExporter } from '@/exporters/json';
import { markdownExporter } from '@/exporters/markdown';
import { fountainExporter } from '@/exporters/fountain';
import { epubExporter } from '@/exporters/epub';
import { docxExporter } from '@/exporters/docx';
import { pdfExporter } from '@/exporters/pdf';
import {
  downloadBlob,
  sanitizeFilename,
  type Exporter,
  type ExportInput,
} from '@/exporters';
import { askConfirm } from '@/ui/shared/confirm';
import { toast } from '@/ui/shared/toast';

const EXPORTERS: Exporter[] = [
  markdownExporter,
  jsonExporter,
  fountainExporter,
  epubExporter,
  docxExporter,
  pdfExporter,
];

function currentExportInput(): ExportInput | null {
  if (!store.document) return null;
  return {
    document: store.document,
    chapters: store.chapters,
    blocks: store.blockOrder.map((id) => store.blocks[id]).filter(Boolean),
    characters: store.characters,
  };
}

const [exportingFormat, setExportingFormat] = createSignal<string | null>(null);

async function runExport(exporter: Exporter): Promise<void> {
  const input = currentExportInput();
  if (!input) return;
  setExportingFormat(exporter.format);
  try {
    const blob = await exporter.run(input);
    const name = sanitizeFilename(input.document.title);
    downloadBlob(blob, `${name}.${exporter.extension}`);
    toast.success(`${exporter.label} exported`);
  } catch (err) {
    toast.error(
      `${exporter.label} export failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    setExportingFormat(null);
  }
}

export const Sidebar = () => {
  const [editingChapterId, setEditingChapterId] = createSignal<UUID | null>(null);
  const [editingCharacterId, setEditingCharacterId] = createSignal<UUID | null>(null);
  const [draft, setDraft] = createSignal('');
  const [newCharDraft, setNewCharDraft] = createSignal('');
  const [chapterMenuOpen, setChapterMenuOpen] = createSignal(false);

  const startRenameChapter = (id: UUID, currentTitle: string) => {
    setEditingChapterId(id);
    setDraft(currentTitle);
  };

  const commitChapterRename = () => {
    const id = editingChapterId();
    if (id) renameChapter(id, draft());
    setEditingChapterId(null);
  };

  const startRenameCharacter = (id: UUID, currentName: string) => {
    setEditingCharacterId(id);
    setDraft(currentName);
  };

  const commitCharacterRename = () => {
    const id = editingCharacterId();
    if (id) updateCharacter(id, { name: draft() });
    setEditingCharacterId(null);
  };

  const handleNewChapter = (kind: ChapterKind = 'standard') => {
    createChapter(kind);
    setChapterMenuOpen(false);
  };

  const handleNewCharacter = () => {
    const name = newCharDraft().trim();
    if (!name) return;
    createCharacter(name);
    setNewCharDraft('');
  };

  return (
    <div class="h-full bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 overflow-auto flex flex-col gap-5">
      {/* --- Chapters --- */}
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
            Chapters
          </div>
          <div class="relative">
            <button
              type="button"
              onClick={() => setChapterMenuOpen((v) => !v)}
              title="New chapter or front/back matter"
              class="text-stone-500 hover:text-violet-500 dark:text-stone-400 dark:hover:text-violet-400 text-lg leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
            >
              +
            </button>
            <Show when={chapterMenuOpen()}>
              <div
                class="absolute right-0 top-7 z-20 w-[170px] rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-xl p-1"
                onClick={(e) => e.stopPropagation()}
              >
                <For each={CHAPTER_KIND_MENU}>
                  {(item) => (
                    <button
                      type="button"
                      onClick={() => handleNewChapter(item.kind)}
                      class="w-full text-left px-2 py-1.5 text-xs text-stone-700 dark:text-stone-200 rounded hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center gap-2 transition-colors"
                    >
                      <span class="w-3 text-[10px] text-stone-400">
                        {CHAPTER_KIND_GLYPH[item.kind]}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>

        <div class="flex flex-col gap-0.5">
          <For
            each={store.chapters}
            fallback={<div class="text-stone-500 text-sm">No chapters</div>}
          >
            {(c) => {
              const isActive = () => store.activeChapterId === c.id;
              const isEditing = () => editingChapterId() === c.id;
              const canDelete = () => store.chapters.length > 1;
              const onDelete = async (e: MouseEvent) => {
                e.stopPropagation();
                if (!canDelete()) return;
                const blockCount = store.blockOrder.filter(
                  (id) => store.blocks[id]?.chapter_id === c.id,
                ).length;
                const ok = await askConfirm({
                  title: `Delete "${c.title}"?`,
                  message: `${blockCount} block${
                    blockCount === 1 ? '' : 's'
                  } will be moved to the graveyard and can be restored individually.`,
                  confirmLabel: 'Delete chapter',
                  danger: true,
                });
                if (!ok) return;
                if (deleteChapter(c.id)) {
                  toast.success(
                    `"${c.title}" deleted · ${blockCount} block${
                      blockCount === 1 ? '' : 's'
                    } in graveyard`,
                  );
                }
              };
              return (
                <div
                  onClick={() => !isEditing() && setActiveChapter(c.id)}
                  onDblClick={() => startRenameChapter(c.id, c.title)}
                  class="group relative py-1.5 pl-3 pr-2 text-sm text-stone-800 dark:text-stone-200 rounded cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center"
                  classList={{
                    'bg-stone-100 dark:bg-stone-700': isActive(),
                  }}
                  style={{
                    'border-left': isActive() ? '2px solid #7F77DD' : '2px solid transparent',
                  }}
                >
                  <div class="flex-1 min-w-0">
                    <Show
                      when={isEditing()}
                      fallback={
                        <span class="flex items-center gap-1.5 truncate">
                          <Show when={c.kind !== 'standard'}>
                            <span class="text-[10px] text-stone-400 italic">
                              {CHAPTER_KIND_GLYPH[c.kind]}
                            </span>
                          </Show>
                          <span class="truncate">{c.title}</span>
                        </span>
                      }
                    >
                      <input
                        type="text"
                        value={draft()}
                        onInput={(e) => setDraft(e.currentTarget.value)}
                        onBlur={commitChapterRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitChapterRename();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingChapterId(null);
                          }
                        }}
                        ref={(el) => {
                          queueMicrotask(() => {
                            el.focus();
                            el.select();
                          });
                        }}
                        class="w-full bg-transparent outline-none border-b border-violet-500 text-stone-800 dark:text-stone-200"
                      />
                    </Show>
                  </div>
                  <Show when={!isEditing() && canDelete()}>
                    <button
                      type="button"
                      onClick={onDelete}
                      title="Delete chapter (blocks go to graveyard)"
                      class="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 text-xs w-5 h-5 flex items-center justify-center rounded transition-opacity ml-1 shrink-0"
                    >
                      ×
                    </button>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* --- Characters --- */}
      <div class="flex flex-col gap-2">
        <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
          Characters
        </div>

        <div class="flex flex-col gap-0.5">
          <For
            each={store.characters}
            fallback={<div class="text-stone-500 text-xs italic">No characters yet</div>}
          >
            {(c) => {
              const isEditing = () => editingCharacterId() === c.id;
              return (
                <div
                  onDblClick={() => startRenameCharacter(c.id, c.name)}
                  class="group relative flex items-center gap-2 py-1 pl-2 pr-1 text-sm text-stone-800 dark:text-stone-200 rounded hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                >
                  <span
                    class="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ 'background-color': c.color }}
                  />
                  <Show when={isEditing()} fallback={<span class="flex-1">{c.name}</span>}>
                    <input
                      type="text"
                      value={draft()}
                      onInput={(e) => setDraft(e.currentTarget.value)}
                      onBlur={commitCharacterRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitCharacterRename();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingCharacterId(null);
                        }
                      }}
                      ref={(el) => {
                        queueMicrotask(() => {
                          el.focus();
                          el.select();
                        });
                      }}
                      class="flex-1 bg-transparent outline-none border-b border-violet-500 text-stone-800 dark:text-stone-200"
                    />
                  </Show>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await askConfirm({
                        title: `Delete character "${c.name}"?`,
                        message:
                          'Character mentions in existing blocks will stop highlighting this person. The character can be recreated by name later.',
                        confirmLabel: 'Delete',
                        danger: true,
                      });
                      if (!ok) return;
                      deleteCharacter(c.id);
                      toast.info(`Character "${c.name}" deleted`);
                    }}
                    title="Delete character"
                    class="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 text-xs w-5 h-5 flex items-center justify-center rounded transition-opacity"
                  >
                    ×
                  </button>
                </div>
              );
            }}
          </For>
        </div>

        <div class="flex items-center gap-1 pt-1">
          <input
            type="text"
            aria-label="New character name"
            value={newCharDraft()}
            onInput={(e) => setNewCharDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleNewCharacter();
              }
            }}
            placeholder="+ Add character"
            class="flex-1 bg-transparent outline-none border-b border-stone-200 dark:border-stone-700 focus:border-violet-500 text-xs text-stone-800 dark:text-stone-200 py-1 placeholder-stone-400"
          />
        </div>
      </div>

      {/* --- Export --- */}
      <div class="flex flex-col gap-1.5 mt-2">
        <div class="text-[10px] uppercase tracking-wider font-medium text-stone-400">
          Export
        </div>
        <div class="flex flex-wrap gap-1">
          <For each={EXPORTERS}>
            {(exp) => {
              const busy = () => exportingFormat() === exp.format;
              const anyBusy = () => exportingFormat() !== null;
              return (
                <button
                  type="button"
                  disabled={anyBusy()}
                  onClick={() => void runExport(exp)}
                  class="px-2 py-1 text-[11px] rounded border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-violet-500 hover:text-violet-500 transition-colors disabled:opacity-50 disabled:cursor-wait"
                  title={`Download as ${exp.label}`}
                >
                  {busy() ? '…' : exp.label}
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* --- Workspace actions --- */}
      <div class="mt-auto pt-3 border-t border-stone-200 dark:border-stone-700 flex flex-col gap-1">
        <button
          type="button"
          onClick={toggleFocusMode}
          class="flex items-center justify-between px-2 py-1.5 text-xs text-stone-600 dark:text-stone-300 hover:text-violet-500 hover:bg-stone-100 dark:hover:bg-stone-700 rounded transition-colors"
          title="Hide sidebars, dim surrounding blocks"
        >
          <span>Focus mode</span>
          <span class="font-mono text-[10px] text-stone-400">⌘·</span>
        </button>
        <button
          type="button"
          onClick={toggleZenMode}
          class="flex items-center justify-between px-2 py-1.5 text-xs text-stone-600 dark:text-stone-300 hover:text-violet-500 hover:bg-stone-100 dark:hover:bg-stone-700 rounded transition-colors"
          title="Strip all chrome — just prose"
        >
          <span>Zen mode</span>
          <span class="font-mono text-[10px] text-stone-400">∅</span>
        </button>
        <button
          type="button"
          onClick={togglePlotTimeline}
          class="flex items-center justify-between px-2 py-1.5 text-xs text-stone-600 dark:text-stone-300 hover:text-violet-500 hover:bg-stone-100 dark:hover:bg-stone-700 rounded transition-colors"
          title="Timeline of all scene blocks"
        >
          <span>Plot timeline</span>
          <span class="font-mono text-[10px] text-stone-400">~</span>
        </button>
        <button
          type="button"
          onClick={toggleGraveyard}
          class="flex items-center justify-between px-2 py-1.5 text-xs text-stone-600 dark:text-stone-300 hover:text-violet-500 hover:bg-stone-100 dark:hover:bg-stone-700 rounded transition-colors"
          title="Review and restore deleted blocks"
        >
          <span>Dead text graveyard</span>
          <span class="font-mono text-[10px] text-stone-400">†</span>
        </button>
      </div>
    </div>
  );
};
