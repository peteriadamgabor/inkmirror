import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import {
  store,
  createChapter,
  deleteChapter,
  moveChapter,
  renameChapter,
  setActiveChapter,
} from '@/store/document';
import { askConfirm } from '@/ui/shared/confirm';
import { toast } from '@/ui/shared/toast';
import { openContextMenuAt, type ContextMenuItem } from '@/ui/shared/contextMenu';
import { IconDots } from '@/ui/shared/icons';
import { t } from '@/i18n';
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

interface Props {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export const SidebarChapterList = (props: Props) => {
  const [editingChapterId, setEditingChapterId] = createSignal<UUID | null>(null);
  const [draft, setDraft] = createSignal('');
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

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <button
          type="button"
          onClick={props.onToggleCollapsed}
          class="text-[10px] font-medium text-stone-400 hover:text-violet-500 transition-colors flex items-center gap-1 inkmirror-smallcaps"
        >
          <span class="text-[8px]">{props.collapsed ? '▸' : '▾'}</span>
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

      <Show when={!props.collapsed}>
        <div class="flex flex-col inkmirror-chapter-rules">
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
                  aria-current={isActive() ? 'true' : undefined}
                  class="group relative py-1.5 pl-3 pr-2 text-sm rounded cursor-pointer transition-colors flex items-center gap-2"
                  classList={{
                    'bg-violet-500/10 dark:bg-violet-400/10 text-violet-700 dark:text-violet-200 font-medium':
                      isActive(),
                    'text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700':
                      !isActive(),
                  }}
                >
                  <span
                    class="w-1 h-1 rounded-full shrink-0 transition-colors"
                    classList={{
                      'bg-violet-500 dark:bg-violet-400': isActive(),
                      'bg-transparent': !isActive(),
                    }}
                    aria-hidden="true"
                  />
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
  );
};
