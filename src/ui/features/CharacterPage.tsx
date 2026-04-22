import { createEffect, createMemo, For, Show, onCleanup } from 'solid-js';
import { store, updateCharacter, setActiveChapter } from '@/store/document';
import { uiState, closeCharacterPage } from '@/store/ui-state';
import { allVisibleBlocks, dialogueBlocksForSpeaker } from '@/store/selectors';
import { t } from '@/i18n';
import type { Block, UUID } from '@/types';

/**
 * Character profile page — minimum viable "doorway" view.
 *
 * Shows the data the app already tracks (mentions, dialogue, chapter
 * range) plus one new writer-authored field (`description`). Opened
 * from the sidebar character row or a mention dot; closed by clicking
 * the backdrop, the × button, or Escape.
 *
 * Deep-link buttons navigate to the referenced block: set its chapter
 * active and smooth-scroll to the block element.
 */

interface ChapterSpan {
  from: number;
  to: number;
  /** Truthy when from === to so callers can render "Ch 4" instead of "Ch 4 – Ch 4". */
  single: boolean;
}

function chapterIndexOf(block: Block | undefined): number | null {
  if (!block) return null;
  const idx = store.chapters.findIndex((c) => c.id === block.chapter_id);
  return idx >= 0 ? idx : null;
}

function chapterSpan(blocks: Block[]): ChapterSpan | null {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const b of blocks) {
    const idx = chapterIndexOf(b);
    if (idx === null) continue;
    if (idx < from) from = idx;
    if (idx > to) to = idx;
  }
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { from: from + 1, to: to + 1, single: from === to };
}

function jumpTo(blockId: UUID): void {
  const block = store.blocks[blockId];
  if (!block) return;
  setActiveChapter(block.chapter_id);
  closeCharacterPage();
  // Wait a frame so the chapter swap has committed before scrolling.
  requestAnimationFrame(() => {
    const scroller = document.querySelector<HTMLElement>('[data-scroll-root="editor"]');
    const target = scroller?.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function blockPreview(block: Block): string {
  const text = block.content.trim();
  if (text.length <= 120) return text;
  return text.slice(0, 117).trimEnd() + '…';
}

export const CharacterPage = () => {
  const character = createMemo(() => {
    const id = uiState.characterPageId;
    if (!id) return null;
    return store.characters.find((c) => c.id === id) ?? null;
  });

  const mentionBlocks = createMemo<Block[]>(() => {
    const c = character();
    if (!c) return [];
    const out: Block[] = [];
    for (const block of allVisibleBlocks()) {
      const ids = store.characterMentions[block.id];
      if (ids?.includes(c.id)) out.push(block);
    }
    return out;
  });

  const dialogueBlocks = createMemo<Block[]>(() => {
    const c = character();
    if (!c) return [];
    return dialogueBlocksForSpeaker(c.id);
  });

  const allAppearances = createMemo<Block[]>(() => {
    const merged = new Map<UUID, Block>();
    for (const b of mentionBlocks()) merged.set(b.id, b);
    for (const b of dialogueBlocks()) merged.set(b.id, b);
    return [...merged.values()];
  });

  const span = createMemo<ChapterSpan | null>(() => chapterSpan(allAppearances()));

  const isPov = createMemo(() => {
    const c = character();
    if (!c) return false;
    return store.document?.pov_character_id === c.id;
  });

  const saveDescription = (value: string) => {
    const c = character();
    if (!c) return;
    updateCharacter(c.id, { description: value });
  };

  // Document-level Escape handler. A key handler on the modal root only
  // fires when the root is focused, which isn't reliable across browsers
  // — contenteditable blocks steal focus behind the backdrop.
  createEffect(() => {
    if (!uiState.characterPageId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCharacterPage();
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  return (
    <Show when={character()}>
      {(c) => (
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm inkmirror-modal-backdrop"
          onClick={closeCharacterPage}
        >
          <div
            class="w-[600px] max-w-[92vw] max-h-[82vh] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden inkmirror-modal-panel"
            onClick={(e) => e.stopPropagation()}
            data-testid="character-page"
            data-character-id={c().id}
          >
            <div class="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-700">
              <div class="flex items-center gap-3 min-w-0">
                <span
                  class="w-4 h-4 rounded-full shrink-0 ring-2 ring-white dark:ring-stone-800"
                  style={{ 'background-color': c().color }}
                />
                <div class="min-w-0">
                  <div class="font-serif text-xl text-stone-800 dark:text-stone-100 truncate">
                    {c().name}
                  </div>
                  <Show when={isPov()}>
                    <div class="text-[10px] inkmirror-smallcaps text-violet-500 mt-0.5">
                      {t('characterPage.povBadge')}
                    </div>
                  </Show>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCharacterPage}
                aria-label={t('characterPage.closeLabel')}
                class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              >
                ×
              </button>
            </div>

            <div class="flex-1 overflow-auto px-5 py-4 flex flex-col gap-5">
              <div class="flex flex-col gap-1">
                <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                  {t('characterPage.descriptionLabel')}
                </label>
                <textarea
                  value={c().description ?? ''}
                  onInput={(e) => saveDescription(e.currentTarget.value)}
                  placeholder={t('characterPage.descriptionPlaceholder')}
                  rows={3}
                  class="bg-transparent outline-none border border-stone-200 dark:border-stone-700 rounded-lg focus:border-violet-500 text-stone-800 dark:text-stone-100 text-sm font-serif px-3 py-2 resize-y"
                  data-testid="character-description"
                />
              </div>

              <div class="flex flex-col gap-2">
                <div class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                  {t('characterPage.statsLabel')}
                </div>
                <div class="flex flex-wrap gap-2 text-xs text-stone-600 dark:text-stone-300">
                  <Show
                    when={allAppearances().length > 0}
                    fallback={
                      <span class="italic text-stone-400">
                        {t('characterPage.statNone')}
                      </span>
                    }
                  >
                    <span class="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-700">
                      {mentionBlocks().length === 1
                        ? t('characterPage.statMentionsSingular')
                        : t('characterPage.statMentions', { n: String(mentionBlocks().length) })}
                    </span>
                    <span class="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-700">
                      {dialogueBlocks().length === 1
                        ? t('characterPage.statDialogueSingular')
                        : t('characterPage.statDialogue', { n: String(dialogueBlocks().length) })}
                    </span>
                    <Show when={span()}>
                      {(s) => (
                        <span class="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-700">
                          {s().single
                            ? t('characterPage.statRangeSingle', { only: String(s().from) })
                            : t('characterPage.statRange', {
                                from: String(s().from),
                                to: String(s().to),
                              })}
                        </span>
                      )}
                    </Show>
                  </Show>
                </div>
              </div>

              <details open class="flex flex-col gap-2 group/section" data-testid="character-mentions-section">
                <summary class="cursor-pointer select-none list-none text-[10px] tracking-wider text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 inkmirror-smallcaps flex items-center gap-1.5 transition-colors">
                  <span class="inline-block transition-transform group-open/section:rotate-90 text-[8px]">▸</span>
                  <span>{t('characterPage.mentionsHeader')}</span>
                  <span class="font-mono tabular-nums normal-case tracking-normal opacity-60">
                    ({mentionBlocks().length})
                  </span>
                </summary>
                <Show
                  when={mentionBlocks().length > 0}
                  fallback={
                    <div class="text-xs italic text-stone-400 mt-1">
                      {t('characterPage.mentionsEmpty')}
                    </div>
                  }
                >
                  <ul class="flex flex-col gap-1 mt-1">
                    <For each={mentionBlocks()}>
                      {(block) => (
                        <li>
                          <button
                            type="button"
                            onClick={() => jumpTo(block.id)}
                            title={t('characterPage.jumpToBlock')}
                            class="w-full text-left px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
                          >
                            <div class="text-[10px] text-stone-400 mb-0.5 font-mono tabular-nums">
                              ch {(chapterIndexOf(block) ?? 0) + 1}
                            </div>
                            <div class="text-sm text-stone-700 dark:text-stone-200 line-clamp-2">
                              {blockPreview(block)}
                            </div>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </details>

              <details open class="flex flex-col gap-2 group/section" data-testid="character-dialogue-section">
                <summary class="cursor-pointer select-none list-none text-[10px] tracking-wider text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 inkmirror-smallcaps flex items-center gap-1.5 transition-colors">
                  <span class="inline-block transition-transform group-open/section:rotate-90 text-[8px]">▸</span>
                  <span>{t('characterPage.dialogueHeader')}</span>
                  <span class="font-mono tabular-nums normal-case tracking-normal opacity-60">
                    ({dialogueBlocks().length})
                  </span>
                </summary>
                <Show
                  when={dialogueBlocks().length > 0}
                  fallback={
                    <div class="text-xs italic text-stone-400 mt-1">
                      {t('characterPage.dialogueEmpty')}
                    </div>
                  }
                >
                  <ul class="flex flex-col gap-1 mt-1">
                    <For each={dialogueBlocks()}>
                      {(block) => (
                        <li>
                          <button
                            type="button"
                            onClick={() => jumpTo(block.id)}
                            title={t('characterPage.jumpToBlock')}
                            class="w-full text-left px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors"
                          >
                            <div class="text-[10px] text-stone-400 mb-0.5 font-mono tabular-nums">
                              ch {(chapterIndexOf(block) ?? 0) + 1}
                            </div>
                            <div class="text-sm italic text-stone-700 dark:text-stone-200 line-clamp-2">
                              “{blockPreview(block)}”
                            </div>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </details>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
};
