import { createResource, createSignal, For, Show } from 'solid-js';
import type { UUID } from '@/types';
import { loadBlockRevisions, restoreBlockContent, store } from '@/store/document';

function formatRelative(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Math.max(0, now - t);
  const s = Math.round(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = new Date(t);
  const today = new Date(now);
  const isYesterday =
    d.getDate() === today.getDate() - 1 &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (isYesterday) return `yesterday ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ` ${time}`;
}

function charDelta(current: string, prev: string): string {
  const diff = current.length - prev.length;
  if (diff === 0) return '';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export const BlockHistory = (props: { blockId: UUID }) => {
  const [open, setOpen] = createSignal(false);
  const [version, setVersion] = createSignal(0);

  const [revisions] = createResource(
    () => (open() ? [props.blockId, version()] : null),
    async (k) => {
      if (!k) return [];
      return loadBlockRevisions(props.blockId);
    },
  );

  const onToggle = (e: MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
    if (!open()) setVersion((v) => v + 1);
  };

  const onRestore = (content: string) => {
    restoreBlockContent(props.blockId, content);
    setOpen(false);
  };

  return (
    <div class="relative inline-block">
      <button
        type="button"
        onClick={onToggle}
        title="Block revision history"
        class="text-[10px] text-stone-400 hover:text-violet-500 px-1 leading-none"
      >
        ⟲
      </button>
      <Show when={open()}>
        <div
          class="absolute left-0 top-5 z-20 w-[340px] max-h-[320px] overflow-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-xl p-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between text-[10px] uppercase tracking-wider text-stone-400 px-2 pb-1 pt-1">
            <span>Revisions</span>
            <span class="font-normal normal-case tracking-normal text-stone-400/70">
              {(revisions() ?? []).length} / 20
            </span>
          </div>
          <Show
            when={(revisions() ?? []).length > 0}
            fallback={
              <div class="text-xs text-stone-400 italic px-2 py-3">
                No history yet — keep writing.
              </div>
            }
          >
            {(() => {
              const now = Date.now();
              const liveContent = () => store.blocks[props.blockId]?.content ?? '';
              return (
                <div class="flex flex-col">
                  <For each={revisions()}>
                    {(r, i) => {
                      const isCurrent = () => r.content === liveContent();
                      const prev = () => revisions()?.[i() + 1];
                      const delta = () => {
                        const p = prev();
                        return p ? charDelta(r.content, p.content) : '';
                      };
                      return (
                        <button
                          type="button"
                          onClick={() => onRestore(r.content)}
                          disabled={isCurrent()}
                          class="text-left px-2 py-1.5 rounded-md transition-colors group"
                          classList={{
                            'hover:bg-stone-100 dark:hover:bg-stone-700': !isCurrent(),
                            'bg-violet-50 dark:bg-violet-950/30 cursor-default': isCurrent(),
                          }}
                        >
                          <div class="flex items-baseline justify-between gap-2 mb-0.5">
                            <span
                              class="text-[10px] text-stone-500 dark:text-stone-400"
                              classList={{
                                'group-hover:text-violet-500': !isCurrent(),
                                'text-violet-500 font-medium': isCurrent(),
                              }}
                            >
                              {formatRelative(r.snapshotAt, now)}
                              {isCurrent() && ' · current'}
                            </span>
                            <Show when={delta()}>
                              <span
                                class="text-[10px] font-mono"
                                classList={{
                                  'text-emerald-500': delta().startsWith('+'),
                                  'text-red-400': delta().startsWith('-'),
                                }}
                              >
                                {delta()}
                              </span>
                            </Show>
                          </div>
                          <div class="font-serif text-xs text-stone-700 dark:text-stone-300 line-clamp-2 whitespace-pre-wrap">
                            {r.content}
                          </div>
                        </button>
                      );
                    }}
                  </For>
                </div>
              );
            })()}
          </Show>
        </div>
      </Show>
    </div>
  );
};
