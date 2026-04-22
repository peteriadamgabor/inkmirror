import { createEffect, For, createSignal, onCleanup, Show } from 'solid-js';
import {
  store,
  createChapter,
  deleteChapter,
  moveChapter,
  renameChapter,
  setActiveChapter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  setPovCharacter,
} from '@/store/document';
import {
  toggleFocusMode,
  toggleBlockTypesHelp,
  toggleChapterTypesHelp,
  toggleHotkeysModal,
  toggleCommandPalette,
  toggleSettingsModal,
  returnToPicker,
  openCharacterPage,
} from '@/store/ui-state';
import type { ChapterKind, UUID } from '@/types';

const CHAPTER_KIND_MENU: Array<{ kind: ChapterKind; labelKey: string }> = [
  { kind: 'standard',        labelKey: 'sidebar.newChapter' },
  { kind: 'cover',           labelKey: 'sidebar.chapterKinds.cover' },
  { kind: 'dedication',      labelKey: 'sidebar.chapterKinds.dedication' },
  { kind: 'epigraph',        labelKey: 'sidebar.chapterKinds.epigraph' },
  { kind: 'acknowledgments', labelKey: 'sidebar.chapterKinds.acknowledgments' },
  { kind: 'afterword',       labelKey: 'sidebar.chapterKinds.afterword' },
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
import { openContextMenuAt, type ContextMenuItem } from '@/ui/shared/contextMenu';
import { IconDots, IconStar, IconTrash } from '@/ui/shared/icons';
import { openFeedback } from '@/ui/shared/feedback';
import { t } from '@/i18n';

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
    toast.success(t('toast.exportSuccess', { n: 1, unit: exporter.label }));
  } catch (err) {
    toast.error(
      t('toast.exportFailed', {
        error: `${exporter.label}: ${err instanceof Error ? err.message : String(err)}`,
      }),
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
  let chapterMenuEl: HTMLDivElement | undefined;

  // Dismiss the chapter + dropdown on outside click, scroll, or Esc.
  createEffect(() => {
    if (!chapterMenuOpen()) return;
    const onOutside = (e: MouseEvent) => {
      if (chapterMenuEl && e.target instanceof Node && chapterMenuEl.contains(e.target)) return;
      setChapterMenuOpen(false);
    };
    const onDismiss = () => setChapterMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setChapterMenuOpen(false); };
    window.addEventListener('mousedown', onOutside, true);
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('keydown', onKey);
    onCleanup(() => {
      window.removeEventListener('mousedown', onOutside, true);
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('keydown', onKey);
    });
  });

  // Collapsible sidebar sections — persisted in localStorage.
  const COLLAPSE_KEY = 'inkmirror.sidebar.collapsed';
  const loadCollapsed = (): Record<string, boolean> => {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch { return {}; }
  };
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>(loadCollapsed());
  const isCollapsed = (key: string) => collapsed()[key] ?? false;
  const toggleCollapse = (key: string) => {
    const next = { ...collapsed(), [key]: !isCollapsed(key) };
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* */ }
  };

  const startRenameChapter = (id: UUID, currentTitle: string) => {
    setEditingChapterId(id);
    setDraft(currentTitle);
  };

  const commitChapterRename = () => {
    const id = editingChapterId();
    if (id) {
      if (!draft().trim()) {
        toast.error(t('toast.chapterTitleEmpty'));
      } else {
        renameChapter(id, draft());
      }
    }
    setEditingChapterId(null);
  };

  const startRenameCharacter = (id: UUID, currentName: string) => {
    setEditingCharacterId(id);
    setDraft(currentName);
  };

  const commitCharacterRename = () => {
    const id = editingCharacterId();
    if (id) {
      if (!draft().trim()) {
        toast.error(t('toast.characterNameEmpty'));
      } else {
        updateCharacter(id, { name: draft() });
      }
    }
    setEditingCharacterId(null);
  };

  const handleNewChapter = (kind: ChapterKind = 'standard') => {
    const result = createChapter(kind);
    setChapterMenuOpen(false);
    if (!result) return;
    if (kind !== 'standard') {
      const key = CHAPTER_KIND_MENU.find((m) => m.kind === kind)?.labelKey;
      const label = key ? t(key) : kind;
      toast.info(`${label} — ${t('common.add').toLowerCase()}`);
    }
  };

  const handleNewCharacter = () => {
    const name = newCharDraft().trim();
    if (!name) {
      toast.error(t('sidebar.characterName'));
      return;
    }
    createCharacter(name);
    setNewCharDraft('');
  };

  return (
    <div class="h-full bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 overflow-auto flex flex-col gap-5">
      {/* --- Chapters --- */}
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <button
            type="button"
            onClick={() => toggleCollapse('chapters')}
            class="text-[10px] font-medium text-stone-400 hover:text-violet-500 transition-colors flex items-center gap-1 inkmirror-smallcaps"
          >
            <span class="text-[8px]">{isCollapsed('chapters') ? '▸' : '▾'}</span>
            {t('sidebar.chapters')}
          </button>
          <div class="relative" ref={chapterMenuEl}>
            <button
              type="button"
              onClick={() => setChapterMenuOpen((v) => !v)}
              title={t('sidebar.newChapter')}
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
                      <span>{t(item.labelKey)}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>

        <Show when={!isCollapsed('chapters')}>
        <div class="flex flex-col gap-0.5">
          <For
            each={store.chapters}
            fallback={<div class="text-stone-500 text-sm">No chapters</div>}
          >
            {(c) => {
              const isActive = () => store.activeChapterId === c.id;
              const isEditing = () => editingChapterId() === c.id;
              const canDelete = () => store.chapters.length > 1;
              const doDelete = async () => {
                if (!canDelete()) {
                  toast.error(t('toast.cannotDeleteLastChapter'));
                  return;
                }
                const blockCount = store.blockOrder.filter(
                  (id) => store.blocks[id]?.chapter_id === c.id,
                ).length;
                const bodyUnit = t(
                  blockCount === 1
                    ? 'toast.chapterDeleteBodyUnitSingular'
                    : 'toast.chapterDeleteBodyUnitPlural',
                );
                const ok = await askConfirm({
                  title: t('sidebar.chapterMenu.deleteTitle', { title: c.title }),
                  message: t('toast.chapterDeleteBody', {
                    n: String(blockCount),
                    unit: bodyUnit,
                  }),
                  confirmLabel: t('sidebar.chapterMenu.deleteConfirm'),
                  danger: true,
                });
                if (!ok) return;
                if (deleteChapter(c.id)) {
                  const toastUnit = t(
                    blockCount === 1
                      ? 'toast.chapterDeletedUnitSingular'
                      : 'toast.chapterDeletedUnitPlural',
                  );
                  toast.success(
                    t('toast.chapterDeleted', {
                      title: c.title,
                      n: String(blockCount),
                      unit: toastUnit,
                    }),
                  );
                }
              };
              const chapterIdx = () => store.chapters.findIndex((ch) => ch.id === c.id);
              const isFirst = () => chapterIdx() === 0;
              const isLast = () => chapterIdx() === store.chapters.length - 1;
              const openMenu = (e: MouseEvent) => {
                e.stopPropagation();
                const trigger = e.currentTarget as HTMLElement;
                const items: ContextMenuItem[] = [
                  {
                    label: t('sidebar.chapterMenu.rename'),
                    onSelect: () => startRenameChapter(c.id, c.title),
                  },
                  { kind: 'divider' },
                  {
                    label: t('sidebar.chapterMenu.moveUp'),
                    disabled: isFirst(),
                    onSelect: () => moveChapter(c.id, 'up'),
                  },
                  {
                    label: t('sidebar.chapterMenu.moveDown'),
                    disabled: isLast(),
                    onSelect: () => moveChapter(c.id, 'down'),
                  },
                  { kind: 'divider' },
                  {
                    label: t('sidebar.chapterMenu.delete'),
                    danger: true,
                    disabled: !canDelete(),
                    onSelect: () => void doDelete(),
                  },
                ];
                openContextMenuAt(trigger, items, { align: 'right' });
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
                  <Show when={!isEditing()}>
                    <button
                      type="button"
                      onClick={openMenu}
                      title={t('misc.chapterActions')}
                      class="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-violet-500 w-5 h-5 flex items-center justify-center rounded transition-opacity ml-1 shrink-0"
                    >
                      <IconDots size={14} />
                    </button>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
        </Show>
      </div>

      {/* --- Characters --- */}
      <div class="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => toggleCollapse('characters')}
          class="text-[10px] font-medium text-stone-400 hover:text-violet-500 transition-colors flex items-center gap-1 inkmirror-smallcaps"
        >
          <span class="text-[8px]">{isCollapsed('characters') ? '▸' : '▾'}</span>
          {t('sidebar.characters')}
        </button>

        <Show when={!isCollapsed('characters')}>
        <div class="flex flex-col gap-0.5">
          <For
            each={store.characters}
            fallback={<div class="text-stone-500 text-xs italic">—</div>}
          >
            {(c) => {
              const isEditing = () => editingCharacterId() === c.id;
              const isPov = () => store.document?.pov_character_id === c.id;
              const doDeleteCharacter = async () => {
                const ok = await askConfirm({
                  title: t('sidebar.characterDelete') + ` — ${c.name}`,
                  message: t('sidebar.characterDeleteBody'),
                  confirmLabel: t('common.delete'),
                  cancelLabel: t('common.cancel'),
                  danger: true,
                });
                if (!ok) return;
                deleteCharacter(c.id);
                toast.info(t('sidebar.characterDeletedToast', { name: c.name }));
              };
              const togglePov = () => setPovCharacter(isPov() ? null : c.id);
              return (
                <div
                  onDblClick={() => startRenameCharacter(c.id, c.name)}
                  class="group relative flex items-center gap-2 py-1 pl-2 pr-1 text-sm text-stone-800 dark:text-stone-200 rounded hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                >
                  <span
                    class="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ 'background-color': c.color }}
                  />
                  <Show when={isEditing()} fallback={
                    <span class="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => openCharacterPage(c.id)}
                        class="text-left hover:text-violet-500 transition-colors truncate"
                      >
                        {c.name}
                      </button>
                    </span>
                  }>
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
                  <Show when={!isEditing()}>
                    <div class="flex items-center gap-0.5 shrink-0">
                      {/* Star: visible + violet when POV, hidden until hover when not POV. One click toggles. */}
                      <button
                        type="button"
                        onClick={togglePov}
                        title={
                          isPov()
                            ? t('sidebar.characterUnpov')
                            : t('sidebar.characterPov')
                        }
                        data-testid="character-pov-toggle"
                        data-pov-active={isPov() ? '1' : undefined}
                        class="w-5 h-5 flex items-center justify-center rounded transition-[opacity,color]"
                        classList={{
                          'text-violet-500 opacity-100 hover:text-violet-600': isPov(),
                          'text-stone-400 opacity-0 group-hover:opacity-100 hover:text-violet-500':
                            !isPov(),
                        }}
                      >
                        <IconStar size={12} />
                      </button>
                      {/* Trash: always hidden, appears on hover, keeps the existing confirm dialog. */}
                      <button
                        type="button"
                        onClick={() => void doDeleteCharacter()}
                        title={t('sidebar.characterDelete')}
                        data-testid="character-delete"
                        class="w-5 h-5 flex items-center justify-center rounded text-stone-400 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-[opacity,color]"
                      >
                        <IconTrash size={12} />
                      </button>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>

        <div class="flex items-center gap-1 pt-1">
          <input
            type="text"
            aria-label={t('aria.newCharacterName')}
            value={newCharDraft()}
            onInput={(e) => setNewCharDraft(e.currentTarget.value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleNewCharacter();
              }
            }}
            placeholder={`+ ${t('sidebar.characterNew')}`}
            class="flex-1 bg-transparent outline-none border-b border-stone-200 dark:border-stone-700 focus:border-violet-500 text-xs text-stone-800 dark:text-stone-200 py-1 placeholder-stone-400"
          />
        </div>
        </Show>
      </div>

      {/* --- Export --- */}
      <div class="flex flex-col gap-1.5 mt-2">
        <button
          type="button"
          onClick={() => toggleCollapse('export')}
          class="text-[10px] font-medium text-stone-400 hover:text-violet-500 transition-colors flex items-center gap-1 inkmirror-smallcaps"
        >
          <span class="text-[8px]">{isCollapsed('export') ? '▸' : '▾'}</span>
          {t('sidebar.export')}
        </button>
        <Show when={!isCollapsed('export')}>
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
                  title={t('misc.downloadAs', { format: exp.label })}
                >
                  {busy() ? '…' : exp.label}
                </button>
              );
            }}
          </For>
        </div>
        </Show>
      </div>

      {/* --- Workspace --- Collapsed to two primary actions + overflow. */}
      <div class="mt-auto pt-3 border-t border-stone-200 dark:border-stone-700 flex items-center gap-1">
        <button
          type="button"
          onClick={toggleFocusMode}
          class="flex-1 px-2 py-1 text-xs text-stone-600 dark:text-stone-300 hover:text-violet-500 hover:bg-stone-100 dark:hover:bg-stone-700 rounded transition-colors text-left"
          title={t('sidebar.focus')}
        >
          {t('sidebar.focus')}
        </button>
        <button
          type="button"
          onClick={toggleCommandPalette}
          class="flex-1 px-2 py-1 text-xs text-stone-500 dark:text-stone-400 hover:text-violet-500 hover:bg-stone-100 dark:hover:bg-stone-700 rounded transition-colors text-left flex items-center justify-between"
          title={t('sidebar.moreTitle')}
        >
          <span>{t('sidebar.more')}</span>
          <span class="font-mono text-[10px] text-stone-400">⌘K</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            const items: ContextMenuItem[] = [
              { label: t('sidebar.documents'), onSelect: returnToPicker },
              { label: t('sidebar.blockTypesHelp'), onSelect: toggleBlockTypesHelp },
              { label: t('sidebar.chapterTypesHelp'), onSelect: toggleChapterTypesHelp },
              { label: t('sidebar.hotkeys'), onSelect: toggleHotkeysModal, hint: 'F1' },
              { label: t('sidebar.settings'), onSelect: toggleSettingsModal },
              { kind: 'divider' },
              { label: t('sidebar.sendFeedback'), onSelect: openFeedback },
            ];
            openContextMenuAt(e.currentTarget as HTMLElement, items, {
              align: 'right',
            });
          }}
          class="w-6 h-6 rounded text-stone-400 hover:text-violet-500 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center justify-center shrink-0"
          title={t('sidebar.overflowTitle')}
          aria-label={t('sidebar.overflowTitle')}
        >
          <IconDots size={14} />
        </button>
      </div>
    </div>
  );
};
