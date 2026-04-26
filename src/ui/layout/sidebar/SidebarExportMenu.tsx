import { createSignal, For, Show } from 'solid-js';
import { store } from '@/store/document';
import {
  EXPORTER_DESCRIPTORS,
  runExportByFormat,
  type ExporterDescriptor,
} from '@/exporters/registry';
import type { ExportInput } from '@/exporters';
import { toast } from '@/ui/shared/toast';
import { t } from '@/i18n';

interface Props {
  collapsed: boolean;
  onToggleCollapsed: () => void;
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

export const SidebarExportMenu = (props: Props) => {
  const [exportingFormat, setExportingFormat] = createSignal<string | null>(null);

  async function runExport(exp: ExporterDescriptor): Promise<void> {
    const input = currentExportInput();
    if (!input) return;
    setExportingFormat(exp.format);
    try {
      const result = await runExportByFormat(exp.format, input);
      if (result.ok) {
        toast.success(t('toast.exportSuccess', { n: 1, unit: exp.label }));
      } else {
        toast.error(t('toast.exportFailed', { error: `${exp.label}: ${result.error}` }));
      }
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <div class="flex flex-col gap-1.5 mt-2">
      <button
        type="button"
        onClick={props.onToggleCollapsed}
        class="text-[10px] font-medium text-stone-400 hover:text-violet-500 transition-colors flex items-center gap-1 inkmirror-smallcaps"
      >
        <span class="text-[8px]">{props.collapsed ? '▸' : '▾'}</span>
        {t('sidebar.export')}
      </button>
      <Show when={!props.collapsed}>
        <div class="flex flex-wrap gap-1">
          <For each={EXPORTER_DESCRIPTORS}>
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
  );
};
