import { createSignal, For, Show } from 'solid-js';
import { uiState, setDocumentSettingsOpen } from '@/store/ui-state';
import {
  store,
  updateDocumentMeta,
  updateDocumentSettings,
} from '@/store/document';
import { DEFAULT_STACK, FONT_STACKS } from '@/ui/fonts';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import { LANGUAGES, lang, setLang, t } from '@/i18n';
import {
  COVER_IMAGE_MAX_BYTES,
  DEFAULT_DIALOGUE_STYLE,
  type CoverImage,
  type DialogueStyle,
} from '@/types';
import { toast } from '@/ui/shared/toast';
import { Checkbox } from '@/ui/shared/Checkbox';
import { circleStatus, syncNow, docStatusFor } from '@/sync';
import type { DocSyncStatus } from '@/sync';
import * as repo from '@/db/repository';
import { formatEditedTimestamp } from '@/utils/block-timestamp';

const DIALOGUE_STYLE_ORDER: DialogueStyle[] = ['straight', 'curly', 'hu_dash'];
const COVER_IMAGE_ALLOWED_MIME = ['image/jpeg', 'image/png'];

function dialogueSample(style: DialogueStyle, exampleKey: string): string {
  const text = exampleKey;
  if (style === 'hu_dash') return `– ${text}`;
  if (style === 'curly') return `“${text}”`;
  return `"${text}"`;
}

/**
 * Read a File into a CoverImage, resolving the natural dimensions via
 * an offscreen Image. Rejects on oversize or unsupported MIME types so
 * the caller can surface a localized toast. We enforce the MIME match
 * on both the File and the decoded blob because Safari strips File.type
 * on some clipboard paths.
 */
async function fileToCoverImage(file: File): Promise<CoverImage> {
  if (!COVER_IMAGE_ALLOWED_MIME.includes(file.type)) {
    throw new Error('bad-type');
  }
  if (file.size > COVER_IMAGE_MAX_BYTES) {
    throw new Error('too-large');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read-failed'));
    reader.readAsDataURL(file);
  });
  const { width, height } = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('decode-failed'));
      img.src = dataUrl;
    },
  );
  return { dataUrl, mimeType: file.type, width, height };
}

export const DocumentSettings = () => {
  const doc = () => store.document;

  // Title rename guard: keep a local draft separate from the persisted doc
  // so the user can type freely. We only commit to the store when the title
  // is unique; on blur we revert the input to the persisted value if it's
  // still colliding.
  const [titleDraft, setTitleDraft] = createSignal<string | null>(null);
  const [titleError, setTitleError] = createSignal<string | null>(null);
  const liveTitle = () => titleDraft() ?? (doc()?.title ?? '');

  async function onTitleInput(value: string) {
    setTitleDraft(value);
    const trimmed = value.trim();
    const currentId = doc()?.id;
    if (!currentId) return;
    if (trimmed && (await repo.isTitleTaken(trimmed, currentId))) {
      setTitleError(t('docSettings.titleTaken'));
      return;
    }
    setTitleError(null);
    // Safe to persist — title is either unique or unchanged from current.
    updateDocumentMeta({ title: value });
  }

  function onTitleBlur() {
    if (titleError()) {
      // Discard the bad draft and snap back to the persisted title.
      setTitleDraft(null);
      setTitleError(null);
      toast.error(t('docSettings.titleTakenReverted'));
      return;
    }
    setTitleDraft(null);
  }
  const currentFontFamily = () =>
    doc()?.settings.font_family ?? DEFAULT_STACK.stack;
  const currentDialogueStyle = (): DialogueStyle =>
    doc()?.settings.dialogue_style ?? DEFAULT_DIALOGUE_STYLE;
  const currentCoverImage = (): CoverImage | null =>
    doc()?.settings.cover_image ?? null;
  const [coverDragActive, setCoverDragActive] = createSignal(false);

  const handleCoverFile = async (file: File | null) => {
    if (!file) return;
    try {
      const cover = await fileToCoverImage(file);
      updateDocumentSettings({ cover_image: cover });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'load-failed';
      if (code === 'too-large') {
        toast.error(
          t('docSettings.coverImageTooLarge', {
            size: (file.size / (1024 * 1024)).toFixed(1),
          }),
        );
      } else if (code === 'bad-type') {
        toast.error(t('docSettings.coverImageBadType'));
      } else {
        toast.error(t('docSettings.coverImageLoadFailed'));
      }
    }
  };

  const removeCover = () => {
    updateDocumentSettings({ cover_image: null });
  };

  return (
    <Show when={uiState.documentSettingsOpen && doc()}>
      <ModalBackdrop onClick={() => setDocumentSettingsOpen(false)}>
        <div
          class="w-[560px] max-w-[92vw] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden inkmirror-modal-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
            <div>
              <div class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                {t('docSettings.metadata')}
              </div>
              <div class="font-serif text-lg text-stone-800 dark:text-stone-100">
                {t('docSettings.document')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDocumentSettingsOpen(false)}
              class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              aria-label={t('aria.closeDialog')}
            >
              ×
            </button>
          </div>

          <div class="flex-1 overflow-auto px-5 py-4 flex flex-col gap-5">
            <div class="flex flex-col gap-1">
              <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                {t('docSettings.title')}
              </label>
              <input
                type="text"
                value={liveTitle()}
                onInput={(e) => void onTitleInput(e.currentTarget.value)}
                onBlur={onTitleBlur}
                placeholder={t('common.untitled')}
                class="bg-transparent outline-none border-b border-stone-200 dark:border-stone-700 focus:border-violet-500 text-stone-800 dark:text-stone-100 font-serif text-lg py-1"
                classList={{ 'border-red-400 focus:border-red-500': !!titleError() }}
              />
              <Show
                when={titleError()}
                fallback={
                  <div class="text-[10px] text-stone-400 mt-0.5">
                    {t('docSettings.titleHelp')}
                  </div>
                }
              >
                <div class="text-[11px] text-red-500 dark:text-red-400 mt-0.5">
                  {titleError()}
                </div>
              </Show>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                {t('docSettings.author')}
              </label>
              <input
                type="text"
                value={doc()?.author ?? ''}
                onInput={(e) =>
                  updateDocumentMeta({ author: e.currentTarget.value })
                }
                placeholder="—"
                class="bg-transparent outline-none border-b border-stone-200 dark:border-stone-700 focus:border-violet-500 text-stone-800 dark:text-stone-100 font-serif py-1"
              />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                {t('docSettings.synopsis')}
              </label>
              <textarea
                value={doc()?.synopsis ?? ''}
                onInput={(e) =>
                  updateDocumentMeta({ synopsis: e.currentTarget.value })
                }
                placeholder={t('docSettings.synopsisPlaceholder')}
                rows={4}
                class="bg-transparent outline-none border border-stone-200 dark:border-stone-700 rounded-lg focus:border-violet-500 text-stone-800 dark:text-stone-100 text-sm font-serif px-3 py-2 resize-y"
              />
              <div class="text-[10px] text-stone-400 mt-0.5">
                {t('docSettings.synopsisHelp')}
              </div>
            </div>

            <div class="flex flex-col gap-2 pt-3 border-t border-stone-200 dark:border-stone-700">
              <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                {t('language.label')}
              </label>
              <div class="flex items-center gap-2 flex-wrap">
                <For each={LANGUAGES}>
                  {(l) => {
                    const active = () => lang() === l.code;
                    return (
                      <button
                        type="button"
                        onClick={() => setLang(l.code)}
                        class="px-3 py-1 text-xs rounded-lg border transition-colors"
                        classList={{
                          'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-200':
                            active(),
                          'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-violet-300 dark:hover:border-violet-700':
                            !active(),
                        }}
                      >
                        {l.label}
                      </button>
                    );
                  }}
                </For>
              </div>
              <div class="text-[10px] text-stone-400 mt-1">
                {t('language.help')}
              </div>
            </div>

            <div class="flex flex-col gap-2 pt-3 border-t border-stone-200 dark:border-stone-700">
              <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                {t('docSettings.typeface')}
              </label>
              <div class="grid grid-cols-2 gap-2">
                <For each={FONT_STACKS}>
                  {(stack) => {
                    const active = () => currentFontFamily() === stack.stack;
                    return (
                      <button
                        type="button"
                        onClick={() =>
                          updateDocumentSettings({ font_family: stack.stack })
                        }
                        class="text-left rounded-lg border px-3 py-2 transition-colors group"
                        classList={{
                          'border-violet-500 bg-violet-50 dark:bg-violet-900/20':
                            active(),
                          'border-stone-200 dark:border-stone-700 hover:border-violet-300 dark:hover:border-violet-700':
                            !active(),
                        }}
                      >
                        <div
                          class="text-base text-stone-900 dark:text-stone-100 leading-tight"
                          style={{ 'font-family': stack.stack }}
                        >
                          {stack.label}
                        </div>
                        <div class="text-[10px] text-stone-400 mt-1 leading-snug">
                          {stack.description}
                        </div>
                        <div
                          class="text-[11px] text-stone-500 dark:text-stone-400 mt-1.5 italic leading-snug"
                          style={{ 'font-family': stack.stack }}
                        >
                          {t('docSettings.typefaceSample')}
                        </div>
                      </button>
                    );
                  }}
                </For>
              </div>
              <div class="text-[10px] text-stone-400 mt-1">
                {t('docSettings.typefaceHelp')}
              </div>
            </div>

            <div class="flex flex-col gap-2 pt-3 border-t border-stone-200 dark:border-stone-700">
              <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                {t('docSettings.dialogueStyle')}
              </label>
              <div class="grid grid-cols-3 gap-2">
                <For each={DIALOGUE_STYLE_ORDER}>
                  {(style) => {
                    const active = () => currentDialogueStyle() === style;
                    const example = () =>
                      dialogueSample(style, t('docSettings.dialogueStyleExample'));
                    return (
                      <button
                        type="button"
                        onClick={() =>
                          updateDocumentSettings({ dialogue_style: style })
                        }
                        data-dialogue-style={style}
                        class="text-left rounded-lg border px-3 py-2 transition-colors"
                        classList={{
                          'border-violet-500 bg-violet-50 dark:bg-violet-900/20':
                            active(),
                          'border-stone-200 dark:border-stone-700 hover:border-violet-300 dark:hover:border-violet-700':
                            !active(),
                        }}
                      >
                        <div class="text-[11px] font-medium text-stone-800 dark:text-stone-100 inkmirror-smallcaps">
                          {t(`docSettings.dialogueStyles.${style}` as const)}
                        </div>
                        <div class="text-[12px] text-stone-500 dark:text-stone-400 mt-1 italic font-serif">
                          {example()}
                        </div>
                      </button>
                    );
                  }}
                </For>
              </div>
              <div class="text-[10px] text-stone-400 mt-1">
                {t('docSettings.dialogueStyleHelp')}
              </div>
            </div>

            <div class="flex flex-col gap-2 pt-3 border-t border-stone-200 dark:border-stone-700">
              <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
                {t('docSettings.coverImage')}
              </label>
              <Show
                when={currentCoverImage()}
                fallback={
                  <label
                    data-testid="cover-image-dropzone"
                    class="flex flex-col items-center justify-center gap-1 px-4 py-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors"
                    classList={{
                      'border-violet-500 bg-violet-50 dark:bg-violet-950/30':
                        coverDragActive(),
                      'border-stone-200 dark:border-stone-700 hover:border-violet-300 dark:hover:border-violet-700':
                        !coverDragActive(),
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setCoverDragActive(true);
                    }}
                    onDragLeave={() => setCoverDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setCoverDragActive(false);
                      const file = e.dataTransfer?.files[0];
                      if (file) void handleCoverFile(file);
                    }}
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      class="hidden"
                      data-testid="cover-image-input"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0] ?? null;
                        void handleCoverFile(file);
                        e.currentTarget.value = '';
                      }}
                    />
                    <span class="text-xs text-stone-500 dark:text-stone-400">
                      {t('docSettings.coverImageDrop')}
                    </span>
                    <span class="text-[11px] text-violet-500 font-medium">
                      {t('docSettings.coverImagePick')}
                    </span>
                  </label>
                }
              >
                {(cover) => (
                  <div class="flex items-start gap-3">
                    <img
                      src={cover().dataUrl}
                      alt=""
                      class="w-20 h-28 object-cover rounded border border-stone-200 dark:border-stone-700"
                      data-testid="cover-image-preview"
                    />
                    <div class="flex flex-col gap-2 min-w-0 flex-1">
                      <span class="text-[11px] text-stone-500 dark:text-stone-400 font-mono tabular-nums">
                        {t('docSettings.coverImageSize', {
                          w: String(cover().width),
                          h: String(cover().height),
                          kb: String(Math.round(cover().dataUrl.length * 0.75 / 1024)),
                        })}
                      </span>
                      <div class="flex items-center gap-2">
                        <label class="text-[11px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 hover:border-violet-400 hover:text-violet-500 cursor-pointer transition-colors">
                          <input
                            type="file"
                            accept="image/jpeg,image/png"
                            class="hidden"
                            data-testid="cover-image-input"
                            onChange={(e) => {
                              const file = e.currentTarget.files?.[0] ?? null;
                              void handleCoverFile(file);
                              e.currentTarget.value = '';
                            }}
                          />
                          {t('docSettings.coverImageReplace')}
                        </label>
                        <button
                          type="button"
                          onClick={removeCover}
                          class="text-[11px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 text-stone-500 hover:border-red-400 hover:text-red-500 transition-colors"
                          data-testid="cover-image-remove"
                        >
                          {t('docSettings.coverImageRemove')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </Show>
              <div class="text-[10px] text-stone-400 mt-1">
                {t('docSettings.coverImageHelp')}
              </div>
            </div>

            <Show when={circleStatus().kind === 'active'}>
              <DocSyncSection docId={doc()!.id} />
            </Show>

            <div class="pt-2 border-t border-stone-200 dark:border-stone-700 flex items-center justify-between text-[10px] text-stone-400">
              <span>{t('docSettings.autosaveNote')}</span>
              <span class="font-mono tabular-nums">
                id: {doc()?.id.slice(0, 8)}…
              </span>
            </div>
          </div>
        </div>
      </ModalBackdrop>
    </Show>
  );
};

// ---------- per-document sync section ----------

interface DocSyncSectionProps {
  docId: string;
}

function DocSyncSection(props: DocSyncSectionProps) {
  const [syncEnabled, setSyncEnabled] = createSignal<boolean | null>(null);

  // Load the current sync_enabled value from the row once when the section mounts.
  // We can't read it from store.document because the domain Document type doesn't
  // carry sync_enabled — it lives only in the DocumentRow.
  const loadEnabled = async () => {
    const rows = await repo.listDocumentRows();
    const row = rows.find((r) => r.id === props.docId);
    if (row !== undefined) setSyncEnabled(row.sync_enabled);
  };
  void loadEnabled();

  async function handleToggle(enabled: boolean) {
    try {
      await repo.setSyncEnabled(props.docId, enabled);
      setSyncEnabled(enabled);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div class="flex flex-col gap-2 pt-3 border-t border-stone-200 dark:border-stone-700">
      <label class="text-[10px] tracking-wider text-stone-400 inkmirror-smallcaps">
        {t('sync.doc.sectionTitle')}
      </label>
      <Show when={syncEnabled() !== null}>
        <Checkbox
          checked={syncEnabled() ?? false}
          onChange={(checked) => void handleToggle(checked)}
          label={
            <span class="text-sm text-stone-700 dark:text-stone-200">
              {t('sync.doc.toggle')}
            </span>
          }
        />
      </Show>
      <Show when={syncEnabled()}>
        <DocSyncStatusLine docId={props.docId} />
      </Show>
    </div>
  );
}

function DocSyncStatusLine(props: { docId: string }) {
  const status = () => docStatusFor(props.docId);

  return (
    <div class="flex items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400">
      <Show when={status().kind === 'idle'}>
        {(() => {
          const s = status() as Extract<DocSyncStatus, { kind: 'idle' }>;
          return (
            <span class="tabular-nums">
              {t('sync.doc.syncedAgo', {
                ago: formatEditedTimestamp(new Date(s.lastSyncedAt).toISOString()),
                rev: String(s.revision),
              })}
            </span>
          );
        })()}
      </Show>
      <Show when={status().kind === 'syncing'}>
        <span>{t('sync.status.syncing')}</span>
      </Show>
      <Show when={status().kind === 'pending'}>
        <span>{t('sync.status.pending')}</span>
      </Show>
      <Show when={status().kind === 'conflict'}>
        <span class="text-orange-600">{t('sync.status.conflict')}</span>
      </Show>
      <Show when={status().kind === 'error'}>
        <span class="text-red-500">{t('sync.status.error')}</span>
      </Show>
      <button
        type="button"
        class="underline hover:text-violet-500 transition-colors"
        onClick={() => void syncNow()}
      >
        {t('sync.syncNow')}
      </button>
    </div>
  );
}
