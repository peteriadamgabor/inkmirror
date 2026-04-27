import { createResource, createSignal, For, Show } from 'solid-js';
import { circleStatus, syncNow, destroyCircle } from '@/sync';
import { connectDB } from '@/db/connection';
import { loadKeys } from '@/sync/keystore';
import * as repo from '@/db/repository';
import type { DocumentRow } from '@/db/connection';
import { askConfirm } from '@/ui/shared/confirm';
import { toast } from '@/ui/shared/toast';
import { Checkbox } from '@/ui/shared/Checkbox';
import { PairingSetupModal } from './sync/PairingSetupModal';
import { PairRedeemModal } from './sync/PairRedeemModal';
import { formatEditedTimestamp } from '@/utils/block-timestamp';
import { docStatusFor } from '@/sync';
import type { DocSyncStatus } from '@/sync';
import { t } from '@/i18n';

export function SettingsSyncTab() {
  const [setupOpen, setSetupOpen] = createSignal(false);
  const [redeemOpen, setRedeemOpen] = createSignal(false);

  async function handleDisable() {
    const ok = await askConfirm({
      title: t('sync.title'),
      message: t('sync.disableConfirm'),
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      const db = await connectDB();
      const keys = await loadKeys(db);
      db.close();
      if (!keys) return;
      await destroyCircle({ db: await connectDB(), baseUrl: '', syncId: keys.syncId, K_auth: keys.K_auth });
      toast.success(t('sync.off'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <Show when={circleStatus().kind === 'unconfigured'}>
        <div>
          <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
            {t('sync.title')}
          </h2>
          <p class="text-sm text-stone-600 dark:text-stone-400 mb-4">
            {t('sync.description')}
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              class="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {t('sync.setUp')}
            </button>
            <button
              type="button"
              onClick={() => setRedeemOpen(true)}
              class="px-4 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-violet-300 dark:hover:border-violet-700 transition-colors"
            >
              {t('sync.connect.title')}
            </button>
          </div>
        </div>
      </Show>

      <Show when={circleStatus().kind === 'active'}>
        <ActiveSyncPanel
          onAddDevice={() => setSetupOpen(true)}
          onDisable={handleDisable}
        />
      </Show>

      <Show when={circleStatus().kind === 'orphaned'}>
        <OrphanedSyncPanel />
      </Show>

      <Show when={setupOpen()}>
        <PairingSetupModal onClose={() => setSetupOpen(false)} />
      </Show>
      <Show when={redeemOpen()}>
        <PairRedeemModal onClose={() => setRedeemOpen(false)} />
      </Show>
    </div>
  );
}

function OrphanedSyncPanel() {
  async function handleReset() {
    const ok = await askConfirm({
      title: t('sync.orphan.title'),
      message: t('sync.orphan.resetConfirm'),
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      const db = await connectDB();
      const keys = await loadKeys(db);
      db.close();
      // No keys = nothing to wipe; defensively reset the status anyway.
      if (!keys) return;
      // destroyCircle best-effort-deletes server side and unconditionally wipes
      // local keystore + sets circleStatus back to 'unconfigured'. Perfect for
      // the orphan case where the server side is already gone.
      await destroyCircle({ db: await connectDB(), baseUrl: '', syncId: keys.syncId, K_auth: keys.K_auth });
      toast.success(t('sync.orphan.resetDone'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
        {t('sync.title')}
      </h2>
      <p class="text-sm font-medium text-orange-600 dark:text-orange-400 mb-2">
        {t('sync.orphan.title')}
      </p>
      <p class="text-sm text-stone-600 dark:text-stone-400 mb-4">
        {t('sync.orphan.explanation')}
      </p>
      <button
        type="button"
        onClick={handleReset}
        class="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        {t('sync.orphan.reset')}
      </button>
    </div>
  );
}

function ActiveSyncPanel(props: { onAddDevice: () => void; onDisable: () => void }) {
  return (
    <div>
      <h2 class="text-sm font-semibold mb-1 inkmirror-smallcaps text-stone-500 dark:text-stone-400">
        {t('sync.title')}
      </h2>
      <p class="text-sm text-emerald-600 dark:text-emerald-400 mb-4">
        {t('sync.on')}
      </p>
      <div class="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={props.onAddDevice}
          class="px-4 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-violet-300 dark:hover:border-violet-700 transition-colors"
        >
          {t('sync.addDevice')}
        </button>
        <button
          type="button"
          onClick={() => void syncNow()}
          class="px-4 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-violet-300 dark:hover:border-violet-700 transition-colors"
        >
          {t('sync.syncNow')}
        </button>
      </div>

      <DocumentSyncList />

      <button
        type="button"
        onClick={props.onDisable}
        class="mt-6 text-sm text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors"
      >
        {t('sync.disableGlobally')}
      </button>
    </div>
  );
}

function DocumentSyncList() {
  const [rows, { refetch }] = createResource(() => repo.listDocumentRows());

  async function toggleSync(docId: string, enabled: boolean) {
    try {
      await repo.setSyncEnabled(docId, enabled);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <div class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps mb-2">
        {t('sync.documentsHeader')}
      </div>
      <Show
        when={(rows() ?? []).length > 0}
        fallback={
          <p class="text-sm text-stone-400 dark:text-stone-500">
            {t('common.loading')}
          </p>
        }
      >
        <div class="flex flex-col gap-2">
          <For each={rows() ?? []}>
            {(row: DocumentRow) => (
              <DocSyncRow row={row} onToggle={toggleSync} />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function DocSyncRow(props: {
  row: DocumentRow;
  onToggle: (docId: string, enabled: boolean) => Promise<void>;
}) {
  const status = () => docStatusFor(props.row.id);

  return (
    <div class="flex items-start gap-3 py-2 px-3 rounded-lg border border-stone-100 dark:border-stone-700 hover:border-violet-200 dark:hover:border-violet-800 transition-colors">
      <Checkbox
        checked={props.row.sync_enabled}
        onChange={(checked) => void props.onToggle(props.row.id, checked)}
        ariaLabel={t('sync.doc.toggle')}
        label={
          <div class="flex-1 min-w-0">
            <div class="text-sm text-stone-800 dark:text-stone-100 truncate">
              {props.row.title || t('common.untitled')}
            </div>
            <Show when={props.row.sync_enabled}>
              <DocRowStatus status={status()} lastSyncedAt={props.row.last_synced_at} />
            </Show>
          </div>
        }
        class="w-full"
      />
    </div>
  );
}

function DocRowStatus(props: { status: DocSyncStatus; lastSyncedAt: number | null }) {
  const s = () => props.status;

  return (
    <Show
      when={s().kind !== 'off'}
      fallback={
        <Show when={props.lastSyncedAt !== null}>
          <span class="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums">
            {t('sync.status.idle', {
              ago: formatEditedTimestamp(new Date(props.lastSyncedAt!).toISOString()),
            })}
          </span>
        </Show>
      }
    >
      {(() => {
        const status = s();
        if (status.kind === 'idle') {
          return (
            <span class="text-[11px] text-emerald-600 dark:text-emerald-400 tabular-nums">
              ✓ {t('sync.status.idle', {
                ago: formatEditedTimestamp(new Date(status.lastSyncedAt).toISOString()),
              })}
            </span>
          );
        }
        if (status.kind === 'syncing') {
          return (
            <span class="text-[11px] text-violet-500">
              {t('sync.status.syncing')}
            </span>
          );
        }
        if (status.kind === 'pending') {
          return (
            <span class="text-[11px] text-stone-400 dark:text-stone-500">
              {t('sync.status.pending')}
            </span>
          );
        }
        if (status.kind === 'conflict') {
          return (
            <span class="text-[11px] text-orange-600">
              {t('sync.status.conflict')}
            </span>
          );
        }
        if (status.kind === 'error') {
          return (
            <span class="text-[11px] text-red-500">
              {t('sync.status.error')}
            </span>
          );
        }
        return null;
      })()}
    </Show>
  );
}
