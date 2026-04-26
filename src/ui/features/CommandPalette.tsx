import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { uiState, setCommandPaletteOpen } from '@/store/ui-state';
import { BINDING_META, hotkeys, type AppAction } from '@/store/hotkeys';
import { runAction } from '@/ui/shared/globalHotkeys';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import { t } from '@/i18n';
import type { ExportInput } from '@/exporters';
import {
  EXPORTER_DESCRIPTORS,
  runExportByFormat,
  type ExporterDescriptor,
} from '@/exporters/registry';
import { store } from '@/store/document';
import { toast } from '@/ui/shared/toast';

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

function currentExportInput(): ExportInput | null {
  if (!store.document) return null;
  return {
    document: store.document,
    chapters: store.chapters,
    blocks: store.blockOrder.map((id) => store.blocks[id]).filter(Boolean),
    characters: store.characters,
  };
}

async function runExport(format: ExporterDescriptor): Promise<void> {
  const input = currentExportInput();
  if (!input) return;
  const result = await runExportByFormat(format.format, input);
  if (result.ok) {
    toast.success(`${format.label} exported`);
  } else {
    toast.error(`${format.label} export failed: ${result.error}`);
  }
}

function buildCommands(): Command[] {
  const cmds: Command[] = [];
  for (const meta of BINDING_META) {
    cmds.push({
      id: `action:${meta.action}`,
      label: t(meta.labelKey as Parameters<typeof t>[0]),
      hint: hotkeys[meta.action],
      run: () => runAction(meta.action as AppAction),
    });
  }
  for (const exp of EXPORTER_DESCRIPTORS) {
    cmds.push({
      id: `export:${exp.format}`,
      label: t('misc.exportAs', { format: exp.label }),
      hint: exp.extension,
      run: () => void runExport(exp),
    });
  }
  return cmds;
}

function scoreMatch(query: string, label: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (l === q) return 100;
  if (l.startsWith(q)) return 50;
  if (l.includes(q)) return 25;
  // Subsequence match — lets "nfm" match "New chapter mode" style.
  let i = 0;
  for (const ch of l) {
    if (ch === q[i]) i++;
    if (i === q.length) return 10;
  }
  return 0;
}

export const CommandPalette = () => {
  const [query, setQuery] = createSignal('');
  const [cursor, setCursor] = createSignal(0);
  let inputEl: HTMLInputElement | undefined;

  const allCommands = createMemo(() => buildCommands());

  const filtered = createMemo(() => {
    const q = query();
    const scored = allCommands()
      .map((cmd) => ({ cmd, score: scoreMatch(q, cmd.label) }))
      .filter((x) => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.cmd);
  });

  // Reset the cursor + focus the input whenever the palette opens.
  createEffect(() => {
    if (uiState.commandPaletteOpen) {
      setQuery('');
      setCursor(0);
      queueMicrotask(() => inputEl?.focus());
    }
  });

  const execute = (cmd: Command) => {
    setCommandPaletteOpen(false);
    cmd.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const list = filtered();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = list[cursor()];
      if (cmd) execute(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setCommandPaletteOpen(false);
    }
  };

  // Keep cursor in range as the filter narrows.
  createEffect(() => {
    const max = filtered().length - 1;
    if (cursor() > max) setCursor(Math.max(0, max));
  });

  // Close on outside click is handled by the backdrop.
  onCleanup(() => {
    delete document.body.dataset.hotkeyCapture;
  });

  return (
    <Show when={uiState.commandPaletteOpen}>
      <ModalBackdrop
        z={50}
        align="start"
        class="pt-[18vh]"
        onClick={() => setCommandPaletteOpen(false)}
      >
        <div
          class="w-[520px] max-w-[92vw] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl overflow-hidden flex flex-col inkmirror-modal-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputEl}
            type="text"
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('commandPalette.placeholder')}
            class="w-full px-4 py-3 bg-transparent outline-none border-b border-stone-200 dark:border-stone-700 text-sm text-stone-800 dark:text-stone-100 placeholder-stone-400"
            aria-label={t('aria.commandPaletteInput')}
          />
          <div class="max-h-[50vh] overflow-auto p-1">
            <Show
              when={filtered().length > 0}
              fallback={
                <div class="text-xs text-stone-400 italic px-3 py-4 text-center">
                  {t('commandPalette.empty')}
                </div>
              }
            >
              <For each={filtered()}>
                {(cmd, i) => (
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i())}
                    onClick={() => execute(cmd)}
                    class="w-full flex items-center justify-between gap-3 px-3 py-1.5 rounded-md text-left transition-colors text-xs"
                    classList={{
                      'bg-stone-100 dark:bg-stone-700': i() === cursor(),
                      'text-stone-700 dark:text-stone-200': true,
                    }}
                  >
                    <span class="truncate">{cmd.label}</span>
                    <Show when={cmd.hint}>
                      <span class="font-mono text-[10px] text-stone-400 shrink-0">
                        {cmd.hint}
                      </span>
                    </Show>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </div>
      </ModalBackdrop>
    </Show>
  );
};
