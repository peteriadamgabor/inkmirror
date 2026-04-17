import { createMemo, For, Show } from 'solid-js';
import { store, setInconsistencyFlagStatus } from '@/store/document';
import { runConsistencyScan } from '@/ai/inconsistency';
import { getStoredProfile } from '@/ai/profile';
import { t } from '@/i18n';
import type { InconsistencyFlag, UUID } from '@/types';

interface GroupedFlags {
  character: { id: UUID; name: string; color: string } | null;
  flags: InconsistencyFlag[];
}

function groupByCharacter(
  flags: InconsistencyFlag[],
  characters: { id: UUID; name: string; color: string }[],
): GroupedFlags[] {
  const byChar = new Map<UUID, InconsistencyFlag[]>();
  for (const f of flags) {
    const arr = byChar.get(f.character_id) ?? [];
    arr.push(f);
    byChar.set(f.character_id, arr);
  }
  const out: GroupedFlags[] = [];
  for (const ch of characters) {
    const arr = byChar.get(ch.id);
    if (!arr || arr.length === 0) continue;
    out.push({ character: ch, flags: arr });
  }
  // Orphan flags (character deleted mid-scan) — collect under null.
  const orphans: InconsistencyFlag[] = [];
  for (const [id, arr] of byChar.entries()) {
    if (!characters.find((c) => c.id === id)) orphans.push(...arr);
  }
  if (orphans.length) out.push({ character: null, flags: orphans });
  return out;
}

function scrollToBlock(blockId: UUID) {
  const scroller = document.querySelector<HTMLElement>('[data-scroll-root="editor"]');
  if (!scroller) return;
  const target = scroller.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export const ConsistencyPanel = () => {
  // Only renders when profile=deep. The guard inside the Solid memo lets
  // the RightPanel mount us unconditionally; we render nothing on light.
  const visible = createMemo(() => getStoredProfile() === 'deep');

  const activeFlags = createMemo(() =>
    Object.values(store.inconsistencyFlags).filter((f) => f.status === 'active'),
  );
  const dismissedFlags = createMemo(() =>
    Object.values(store.inconsistencyFlags).filter((f) => f.status === 'dismissed'),
  );
  const grouped = createMemo(() => groupByCharacter(activeFlags(), store.characters));

  const scan = () => store.consistencyScan;
  const isScanning = () => scan()?.running === true;

  async function onRun() {
    await runConsistencyScan();
  }

  return (
    <Show when={visible()}>
      <div class="flex flex-col gap-2" data-testid="consistency-panel">
        <div class="flex items-center justify-between">
          <div class="text-[10px] font-medium text-stone-400 inkmirror-smallcaps">
            {t('consistency.title')}
          </div>
          <button
            type="button"
            disabled={isScanning() || store.characters.length === 0}
            onClick={onRun}
            class="text-[10px] font-medium text-violet-500 hover:text-violet-600 disabled:text-stone-400 disabled:cursor-not-allowed inkmirror-smallcaps"
          >
            {t('consistency.runNow')}
          </button>
        </div>

        <Show when={isScanning() && scan()}>
          {(s) => (
            <div
              class="rounded-lg border border-stone-200 dark:border-stone-700 px-3 py-2 text-xs text-stone-600 dark:text-stone-400 font-mono"
              data-testid="consistency-progress"
            >
              {t('consistency.running', {
                processed: String(s().processed),
                total: String(s().total),
              })}
            </div>
          )}
        </Show>

        <Show
          when={activeFlags().length > 0}
          fallback={
            <div class="rounded-lg border border-stone-200 dark:border-stone-700 px-3 py-2 text-xs text-stone-500 dark:text-stone-400 italic">
              <Show
                when={store.characters.length === 0}
                fallback={
                  <Show
                    when={Object.keys(store.inconsistencyFlags).length === 0 && !isScanning()}
                    fallback={t('consistency.empty.noFlags')}
                  >
                    {t('consistency.empty.notYetRun')}
                  </Show>
                }
              >
                {t('consistency.empty.noCharacters')}
              </Show>
            </div>
          }
        >
          <div class="flex flex-col gap-2">
            <For each={grouped()}>
              {(group) => (
                <FlagGroup group={group} />
              )}
            </For>
          </div>
        </Show>

        <Show when={dismissedFlags().length > 0}>
          <DismissedList flags={dismissedFlags()} />
        </Show>
      </div>
    </Show>
  );
};

function FlagGroup(props: { group: GroupedFlags }) {
  return (
    <div class="rounded-lg border border-stone-200 dark:border-stone-700 overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-1.5 bg-stone-50 dark:bg-stone-900/40 border-b border-stone-200 dark:border-stone-700">
        <Show when={props.group.character} fallback={<span class="w-2 h-2 rounded-full bg-stone-400" />}>
          {(ch) => (
            <span
              class="w-2 h-2 rounded-full shrink-0"
              style={{ 'background-color': ch().color }}
            />
          )}
        </Show>
        <div class="text-xs font-semibold text-stone-800 dark:text-stone-100 truncate">
          {props.group.character?.name ?? '—'}
        </div>
        <div class="ml-auto text-[10px] text-stone-400 font-mono">
          {props.group.flags.length}
        </div>
      </div>
      <div class="flex flex-col">
        <For each={props.group.flags}>
          {(flag) => <FlagRow flag={flag} />}
        </For>
      </div>
    </div>
  );
}

function FlagRow(props: { flag: InconsistencyFlag }) {
  const cats = () =>
    props.flag.trigger_categories
      .map((c) => t(`consistency.flag.category.${c}`))
      .join(' · ');

  return (
    <div class="px-3 py-2 text-xs border-b border-stone-100 dark:border-stone-700/50 last:border-b-0">
      <div class="flex items-center justify-between gap-2 mb-1">
        <span class="inkmirror-smallcaps text-[9px] text-stone-500">{cats()}</span>
        <div class="flex items-center gap-2">
          <span class="font-mono text-[10px] text-stone-400">
            {t('consistency.flag.score', {
              score: props.flag.contradiction_score.toFixed(2),
            })}
          </span>
          <button
            type="button"
            class="text-[10px] text-stone-400 hover:text-red-500"
            onClick={() => setInconsistencyFlagStatus(props.flag.id, 'dismissed')}
          >
            {t('consistency.flag.dismiss')}
          </button>
        </div>
      </div>
      <button
        type="button"
        class="text-left text-stone-700 dark:text-stone-200 italic hover:text-violet-500 w-full"
        onClick={() => scrollToBlock(props.flag.block_a_id)}
      >
        “{props.flag.block_a_sentence}”
      </button>
      <div class="h-2" />
      <button
        type="button"
        class="text-left text-stone-700 dark:text-stone-200 italic hover:text-violet-500 w-full"
        onClick={() => scrollToBlock(props.flag.block_b_id)}
      >
        “{props.flag.block_b_sentence}”
      </button>
    </div>
  );
}

function DismissedList(props: { flags: InconsistencyFlag[] }) {
  return (
    <details class="text-xs">
      <summary class="cursor-pointer text-[10px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 inkmirror-smallcaps">
        {t('consistency.dismissed.header', { n: String(props.flags.length) })}
      </summary>
      <div class="mt-1 flex flex-col gap-1">
        <For each={props.flags}>
          {(f) => (
            <div class="px-3 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg flex items-center justify-between gap-2">
              <span class="truncate text-stone-500 dark:text-stone-400">
                {f.block_a_sentence}
              </span>
              <button
                type="button"
                class="text-[10px] text-violet-500 hover:text-violet-600 shrink-0"
                onClick={() => setInconsistencyFlagStatus(f.id, 'active')}
              >
                {t('consistency.dismissed.reactivate')}
              </button>
            </div>
          )}
        </For>
      </div>
    </details>
  );
}
