import { For, Show } from 'solid-js';
import { diffWords, countSegments, type WordDiffSegment } from '@/utils/word-diff';
import { t } from '@/i18n';
import type { BlockRevision } from '@/db/repository-revisions';

const MAJOR_REWRITE_THRESHOLD = 10;

function formatRelative(iso: string, now: number): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const diff = Math.max(0, now - ms);
  const s = Math.round(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Elide equal segments to "…" except for ~3 words of context around any
 * non-equal change. Returns a possibly-reduced segment list for rendering.
 */
function elideEqualSegments(segs: WordDiffSegment[]): WordDiffSegment[] {
  const CONTEXT_TOKENS = 3;
  const out: WordDiffSegment[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.kind !== 'equal') {
      out.push(seg);
      continue;
    }
    const prevIsChange = i > 0 && segs[i - 1].kind !== 'equal';
    const nextIsChange = i < segs.length - 1 && segs[i + 1].kind !== 'equal';
    if (!prevIsChange && !nextIsChange) {
      if (i === 0 || i === segs.length - 1) out.push(seg);
      else out.push({ kind: 'equal', text: ' … ' });
      continue;
    }
    const tokens = seg.text.split(/(\s+)/);
    const wordIdxs = tokens
      .map((tok, idx) => (/\S/.test(tok) ? idx : -1))
      .filter((idx) => idx >= 0);
    if (wordIdxs.length <= CONTEXT_TOKENS * 2) {
      out.push(seg);
      continue;
    }
    if (prevIsChange && nextIsChange) {
      const left = tokens.slice(0, wordIdxs[CONTEXT_TOKENS - 1] + 1).join('');
      const right = tokens.slice(wordIdxs[wordIdxs.length - CONTEXT_TOKENS]).join('');
      out.push({ kind: 'equal', text: left + ' … ' + right });
    } else if (prevIsChange) {
      const left = tokens.slice(0, wordIdxs[CONTEXT_TOKENS - 1] + 1).join('');
      out.push({ kind: 'equal', text: left + ' … ' });
    } else {
      const right = tokens.slice(wordIdxs[wordIdxs.length - CONTEXT_TOKENS]).join('');
      out.push({ kind: 'equal', text: ' … ' + right });
    }
  }
  return out;
}

function countWordsByKind(segs: WordDiffSegment[], kind: 'add' | 'remove'): number {
  return segs
    .filter((s) => s.kind === kind)
    .reduce((sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length, 0);
}

interface Props {
  rev: BlockRevision;
  prev: BlockRevision | undefined;
  liveContent: string;
  isPreviewing: boolean;
  onSelect: (rev: BlockRevision) => void;
}

export function BlockHistoryRow(props: Props) {
  const segments = () => (props.prev ? diffWords(props.prev.content, props.rev.content) : []);
  const segCount = () => countSegments(segments());
  const isMajorRewrite = () => segCount() > MAJOR_REWRITE_THRESHOLD;
  const isLive = () => props.rev.content === props.liveContent;
  const now = Date.now();

  return (
    <button
      type="button"
      onClick={() => props.onSelect(props.rev)}
      disabled={isLive()}
      class="text-left px-2 py-1.5 rounded-md transition-colors group"
      classList={{
        'hover:bg-stone-100 dark:hover:bg-stone-700': !isLive() && !props.isPreviewing,
        'bg-violet-50 dark:bg-violet-950/30 cursor-default': isLive(),
        'border-l-2 border-violet-500 bg-violet-50/50 dark:bg-violet-950/20': props.isPreviewing && !isLive(),
      }}
    >
      <div class="flex items-baseline justify-between gap-2 mb-0.5">
        <span
          class="text-[10px] text-stone-500 dark:text-stone-400"
          classList={{ 'text-violet-500 font-medium': isLive() || props.isPreviewing }}
        >
          {formatRelative(props.rev.snapshotAt, now)}
          {isLive() && ' · current'}
        </span>
        <Show when={!isLive() && props.prev}>
          <span class="text-[10px] font-mono text-stone-400">
            {t('block.historyDelta', {
              removed: countWordsByKind(segments(), 'remove').toString(),
              added: countWordsByKind(segments(), 'add').toString(),
            })}
          </span>
        </Show>
      </div>
      <Show
        when={!props.prev}
        fallback={
          <Show
            when={!isMajorRewrite()}
            fallback={
              <div class="font-serif text-xs text-stone-500 dark:text-stone-400 italic">
                {t('block.historyMajorRewrite')} ·{' '}
                <span class="font-mono not-italic">
                  −{countWordsByKind(segments(), 'remove')} +{countWordsByKind(segments(), 'add')}
                </span>
              </div>
            }
          >
            <div class="font-serif text-xs text-stone-700 dark:text-stone-300 truncate whitespace-pre-wrap">
              <For each={elideEqualSegments(segments())}>
                {(seg) => (
                  <span
                    classList={{
                      'line-through text-red-400/60': seg.kind === 'remove',
                      'text-emerald-500': seg.kind === 'add',
                    }}
                  >
                    {seg.text}
                  </span>
                )}
              </For>
            </div>
          </Show>
        }
      >
        <div class="font-serif text-xs text-stone-500 dark:text-stone-400 italic truncate">
          {t('block.historyInitialSnapshot')}{' '}
          <span class="not-italic text-stone-700 dark:text-stone-300">
            {props.rev.content.split(/\s+/).slice(0, 6).join(' ')}…
          </span>
        </div>
      </Show>
    </button>
  );
}
