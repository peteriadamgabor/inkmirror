import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { uiState, setCommandPaletteOpen } from '@/store/ui-state';
import { BINDING_META, hotkeys, type AppAction } from '@/store/hotkeys';
import { runAction } from '@/ui/shared/globalHotkeys';
import { t } from '@/i18n';
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
import { store } from '@/store/document';
import { toast } from '@/ui/shared/toast';

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

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

async function runExport(exporter: Exporter): Promise<void> {
  const input = currentExportInput();
  if (!input) return;
  try {
    const blob = await exporter.run(input);
    const name = sanitizeFilename(input.document.title);
    downloadBlob(blob, `${name}.${exporter.extension}`);
    toast.success(`${exporter.label} exported`);
  } catch (err) {
    toast.error(
      `${exporter.label} export failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function buildCommands(): Command[] {
  const cmds: Command[] = [];
  for (const meta of BINDING_META) {
    cmds.push({
      id: `action:${meta.action}`,
      label: meta.label,
      hint: hotkeys[meta.action],
      run: () => runAction(meta.action as AppAction),
    });
  }
  for (const exp of EXPORTERS) {
    cmds.push({
      id: `export:${exp.format}`,
      label: `Export as ${exp.label}`,
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
      <div
        class="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] bg-stone-900/40 backdrop-blur-sm"
        onClick={() => setCommandPaletteOpen(false)}
      >
        <div
          class="w-[520px] max-w-[92vw] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl overflow-hidden flex flex-col"
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
            aria-label="Command palette input"
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
      </div>
    </Show>
  );
};
