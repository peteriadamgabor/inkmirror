/**
 * Demo manuscript — the "Try the demo" feature.
 *
 * Ships as a `DocumentBundleV1` so the existing import path handles
 * every concern (validation, collision handling, ID remapping, FK
 * rewrites). No new persistence code.
 *
 * The structure (block IDs, ordering, metadata, characters) is
 * language-independent and lives here. The prose itself — the block
 * `content` strings and a few user-visible labels — is pulled from
 * `prose-en.ts` / `prose-hu.ts` at bundle-build time.
 *
 * Source text: Anton Chekhov, "Rothschild's Fiddle" (1894), public
 * domain. Translated for InkMirror. The HU translation is a first
 * pass that wants a native-speaker polish — note-to-self in the
 * project README.
 */

import type { Block, Chapter, Character, Document, UUID } from '@/types';
import type { DocumentBundleV1 } from './format';
import type { SentimentEntry } from '@/db/repository';
import { demoProseEn, demoChapterTitlesEn, demoMetaEn } from './demo-prose-en';
import { demoProseHu, demoChapterTitlesHu, demoMetaHu } from './demo-prose-hu';

/** Fixed ID. Bumping to `-v2` ships a content update without clobbering user edits on v1. */
export const DEMO_DOC_ID = 'inkmirror-demo-rothschild-v1';

const CH1: UUID = 'demo-ch-1';
const CH2: UUID = 'demo-ch-2';
const CH3: UUID = 'demo-ch-3';

const CHAR_YAKOV: UUID = 'demo-char-yakov';
const CHAR_ROTHSCHILD: UUID = 'demo-char-rothschild';

const FIXED_TIMESTAMP = '2026-04-17T12:00:00.000Z';

/**
 * Same stable string hash as `src/ai/analyze.ts:contentHash()`. Duplicated
 * here (not imported) because this module is content — pulled into the
 * JS bundle at build time — and we don't want an unnecessary edge in the
 * dependency graph for a 3-line function.
 */
function h(s: string): string {
  let acc = 5381;
  for (let i = 0; i < s.length; i++) acc = ((acc << 5) + acc + s.charCodeAt(i)) | 0;
  return acc.toString(36);
}

type Sent = 'positive' | 'neutral' | 'negative';

/**
 * A single demo block, authored as a literate entry: its ID, chapter,
 * type (+ discriminated metadata), and hand-authored sentiment. The
 * `content` string is looked up from the prose dictionary at build
 * time so EN and HU share the same authoring shape.
 */
interface BlockEntry {
  id: UUID;
  chapterId: UUID;
  type: Block['type'];
  /** Block-type metadata. Discriminated by `type` — matches BlockMetadata. */
  metadata: Block['metadata'];
  /** Hand-authored sentiment. Overwritten naturally if the user edits the block. */
  sentiment?: { label: Sent; score: number };
  /** Soft-deleted blocks (graveyard). Non-null → block goes into graveyard, invisible in main editor. */
  deletedFrom?: { chapter_id: UUID; chapter_title: string; position: number };
}

/**
 * The authoring script. Order matters: `order_idx` is the array index
 * within each chapter's subset. Adding/removing blocks is a matter of
 * editing this array and the matching content keys in the prose files.
 */
const BLOCKS: BlockEntry[] = [
  // ---------- Chapter 1: losses ----------
  {
    id: 'demo-blk-01',
    chapterId: CH1,
    type: 'note',
    metadata: { type: 'note', data: {} },
  },
  {
    id: 'demo-blk-02',
    chapterId: CH1,
    type: 'scene',
    metadata: {
      type: 'scene',
      data: {
        location: '__scene1.location',
        time: '__scene1.time',
        mood: '__scene1.mood',
        character_ids: [CHAR_YAKOV],
      },
    },
    sentiment: { label: 'neutral', score: 0.6 },
  },
  { id: 'demo-blk-03', chapterId: CH1, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'neutral', score: 0.55 } },
  { id: 'demo-blk-04', chapterId: CH1, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.6 } },
  { id: 'demo-blk-05', chapterId: CH1, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.55 } },
  { id: 'demo-blk-06', chapterId: CH1, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'neutral', score: 0.5 } },
  {
    id: 'demo-blk-07',
    chapterId: CH1,
    type: 'dialogue',
    metadata: { type: 'dialogue', data: { speaker_id: CHAR_YAKOV } },
    sentiment: { label: 'negative', score: 0.7 },
  },
  { id: 'demo-blk-08', chapterId: CH1, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.65 } },
  {
    id: 'demo-blk-09',
    chapterId: CH1,
    type: 'dialogue',
    metadata: { type: 'dialogue', data: { speaker_id: CHAR_YAKOV } },
    sentiment: { label: 'neutral', score: 0.5 },
  },
  {
    id: 'demo-blk-10',
    chapterId: CH1,
    type: 'dialogue',
    metadata: {
      type: 'dialogue',
      data: { speaker_id: CHAR_YAKOV, parenthetical: '__parens.barelyLooking' },
    },
    sentiment: { label: 'negative', score: 0.6 },
  },
  { id: 'demo-blk-11', chapterId: CH1, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.7 } },
  {
    id: 'demo-blk-12',
    chapterId: CH1,
    type: 'dialogue',
    metadata: { type: 'dialogue', data: { speaker_id: CHAR_YAKOV } },
    sentiment: { label: 'neutral', score: 0.5 },
  },
  { id: 'demo-blk-13', chapterId: CH1, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.7 } },
  {
    id: 'demo-blk-14',
    chapterId: CH1,
    type: 'dialogue',
    metadata: {
      type: 'dialogue',
      data: { speaker_id: CHAR_YAKOV, parenthetical: '__parens.withoutOpeningEyes' },
    },
    sentiment: { label: 'neutral', score: 0.55 },
  },
  {
    id: 'demo-blk-15',
    chapterId: CH1,
    type: 'dialogue',
    metadata: { type: 'dialogue', data: { speaker_id: CHAR_YAKOV } },
    sentiment: { label: 'neutral', score: 0.5 },
  },
  { id: 'demo-blk-16', chapterId: CH1, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'positive', score: 0.55 } },
  {
    id: 'demo-blk-17',
    chapterId: CH1,
    type: 'dialogue',
    metadata: { type: 'dialogue', data: { speaker_id: CHAR_YAKOV } },
    sentiment: { label: 'negative', score: 0.55 },
  },
  { id: 'demo-blk-18', chapterId: CH1, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.75 } },

  // ---------- Chapter 2: the river bank ----------
  {
    id: 'demo-blk-19',
    chapterId: CH2,
    type: 'scene',
    metadata: {
      type: 'scene',
      data: {
        location: '__scene2.location',
        time: '__scene2.time',
        mood: '__scene2.mood',
        character_ids: [CHAR_YAKOV],
      },
    },
    sentiment: { label: 'neutral', score: 0.6 },
  },
  { id: 'demo-blk-20', chapterId: CH2, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'positive', score: 0.55 } },
  { id: 'demo-blk-21', chapterId: CH2, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'positive', score: 0.6 } },
  { id: 'demo-blk-22', chapterId: CH2, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.55 } },
  {
    id: 'demo-blk-23',
    chapterId: CH2,
    type: 'dialogue',
    metadata: {
      type: 'dialogue',
      data: { speaker_id: CHAR_YAKOV, parenthetical: '__parens.aloudNoOne' },
    },
    sentiment: { label: 'negative', score: 0.7 },
  },
  { id: 'demo-blk-24', chapterId: CH2, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.6 } },
  { id: 'demo-blk-25', chapterId: CH2, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'neutral', score: 0.55 } },
  { id: 'demo-blk-26', chapterId: CH2, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'neutral', score: 0.5 } },
  {
    id: 'demo-blk-27',
    chapterId: CH2,
    type: 'dialogue',
    metadata: {
      type: 'dialogue',
      data: { speaker_id: CHAR_ROTHSCHILD, parenthetical: '__parens.outOfBreath' },
    },
    sentiment: { label: 'neutral', score: 0.5 },
  },
  {
    id: 'demo-blk-28',
    chapterId: CH2,
    type: 'dialogue',
    metadata: { type: 'dialogue', data: { speaker_id: CHAR_YAKOV } },
    sentiment: { label: 'negative', score: 0.75 },
  },
  { id: 'demo-blk-29', chapterId: CH2, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.6 } },
  {
    // graveyard entry from Ch2.
    id: 'demo-blk-gr1',
    chapterId: CH2,
    type: 'text',
    metadata: { type: 'text' },
    deletedFrom: { chapter_id: CH2, chapter_title: '__graveyard.fromCh2', position: 10 },
  },

  // ---------- Chapter 3: the fiddle ----------
  {
    id: 'demo-blk-30',
    chapterId: CH3,
    type: 'scene',
    metadata: {
      type: 'scene',
      data: {
        location: '__scene3.location',
        time: '__scene3.time',
        mood: '__scene3.mood',
        character_ids: [CHAR_YAKOV],
      },
    },
    sentiment: { label: 'neutral', score: 0.55 },
  },
  { id: 'demo-blk-31', chapterId: CH3, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.7 } },
  { id: 'demo-blk-32', chapterId: CH3, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'neutral', score: 0.55 } },
  { id: 'demo-blk-33', chapterId: CH3, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.5 } },
  { id: 'demo-blk-34', chapterId: CH3, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.55 } },
  {
    id: 'demo-blk-35',
    chapterId: CH3,
    type: 'dialogue',
    metadata: {
      type: 'dialogue',
      data: { speaker_id: CHAR_ROTHSCHILD, parenthetical: '__parens.atWindow' },
    },
    sentiment: { label: 'neutral', score: 0.5 },
  },
  {
    id: 'demo-blk-36',
    chapterId: CH3,
    type: 'dialogue',
    metadata: { type: 'dialogue', data: { speaker_id: CHAR_YAKOV } },
    sentiment: { label: 'neutral', score: 0.6 },
  },
  { id: 'demo-blk-37', chapterId: CH3, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'neutral', score: 0.5 } },
  {
    id: 'demo-blk-38',
    chapterId: CH3,
    type: 'dialogue',
    metadata: { type: 'dialogue', data: { speaker_id: CHAR_YAKOV } },
    sentiment: { label: 'neutral', score: 0.5 },
  },
  {
    id: 'demo-blk-39',
    chapterId: CH3,
    type: 'dialogue',
    metadata: { type: 'dialogue', data: { speaker_id: CHAR_ROTHSCHILD } },
    sentiment: { label: 'neutral', score: 0.5 },
  },
  {
    id: 'demo-blk-40',
    chapterId: CH3,
    type: 'dialogue',
    metadata: { type: 'dialogue', data: { speaker_id: CHAR_YAKOV } },
    sentiment: { label: 'negative', score: 0.55 },
  },
  { id: 'demo-blk-41', chapterId: CH3, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'neutral', score: 0.5 } },
  {
    id: 'demo-blk-42',
    chapterId: CH3,
    type: 'dialogue',
    metadata: {
      type: 'dialogue',
      data: { speaker_id: CHAR_YAKOV, parenthetical: '__parens.quietly' },
    },
    sentiment: { label: 'positive', score: 0.55 },
  },
  {
    id: 'demo-blk-43',
    chapterId: CH3,
    type: 'dialogue',
    metadata: { type: 'dialogue', data: { speaker_id: CHAR_ROTHSCHILD } },
    sentiment: { label: 'positive', score: 0.6 },
  },
  { id: 'demo-blk-44', chapterId: CH3, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'negative', score: 0.5 } },
  { id: 'demo-blk-45', chapterId: CH3, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'positive', score: 0.7 } },
  { id: 'demo-blk-46', chapterId: CH3, type: 'text', metadata: { type: 'text' }, sentiment: { label: 'positive', score: 0.8 } },
  {
    // graveyard entry from Ch3.
    id: 'demo-blk-gr2',
    chapterId: CH3,
    type: 'text',
    metadata: { type: 'text' },
    deletedFrom: { chapter_id: CH3, chapter_title: '__graveyard.fromCh3', position: 5 },
  },
];

type Prose = Record<string, string>;
type SceneMeta = {
  'scene1.location': string;
  'scene1.time': string;
  'scene1.mood': string;
  'scene2.location': string;
  'scene2.time': string;
  'scene2.mood': string;
  'scene3.location': string;
  'scene3.time': string;
  'scene3.mood': string;
  'parens.barelyLooking': string;
  'parens.withoutOpeningEyes': string;
  'parens.aloudNoOne': string;
  'parens.outOfBreath': string;
  'parens.atWindow': string;
  'parens.quietly': string;
  'graveyard.fromCh2': string;
  'graveyard.fromCh3': string;
  'character.yakov.name': string;
  'character.yakov.aliases': readonly string[];
  'character.rothschild.name': string;
  'character.rothschild.aliases': readonly string[];
  'author': string;
  'synopsis': string;
  'title': string;
};

function resolveSceneMeta(
  metadata: Block['metadata'],
  meta: SceneMeta,
): Block['metadata'] {
  if (metadata.type === 'scene') {
    return {
      type: 'scene',
      data: {
        ...metadata.data,
        location: meta[metadata.data.location.replace(/^__/, '') as keyof SceneMeta] as string,
        time: meta[metadata.data.time.replace(/^__/, '') as keyof SceneMeta] as string,
        mood: meta[metadata.data.mood.replace(/^__/, '') as keyof SceneMeta] as string,
      },
    };
  }
  if (metadata.type === 'dialogue' && metadata.data.parenthetical) {
    return {
      type: 'dialogue',
      data: {
        ...metadata.data,
        parenthetical: meta[
          metadata.data.parenthetical.replace(/^__/, '') as keyof SceneMeta
        ] as string,
      },
    };
  }
  return metadata;
}

function resolveDeletedFrom(
  entry: BlockEntry,
  meta: SceneMeta,
): Block['deleted_from'] {
  if (!entry.deletedFrom) return null;
  return {
    ...entry.deletedFrom,
    chapter_title: meta[
      entry.deletedFrom.chapter_title.replace(/^__/, '') as keyof SceneMeta
    ] as string,
  };
}

/**
 * Build a complete `DocumentBundleV1` for a given language. The structure
 * comes from `BLOCKS` above; prose comes from the language's content map.
 */
function build(
  lang: 'en' | 'hu',
  prose: Prose,
  chapterTitles: { ch1: string; ch2: string; ch3: string },
  meta: SceneMeta,
): DocumentBundleV1 {
  const document: Document = {
    id: DEMO_DOC_ID,
    title: meta.title,
    author: meta.author,
    synopsis: meta.synopsis,
    settings: {
      font_family: 'Georgia, serif',
      font_size: 16,
      line_height: 1.8,
      editor_width: 680,
      theme: 'light',
    },
    pov_character_id: CHAR_YAKOV,
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP,
  };

  const chapters: Chapter[] = [
    { id: CH1, document_id: DEMO_DOC_ID, title: chapterTitles.ch1, order: 0, kind: 'standard', created_at: FIXED_TIMESTAMP, updated_at: FIXED_TIMESTAMP },
    { id: CH2, document_id: DEMO_DOC_ID, title: chapterTitles.ch2, order: 1, kind: 'standard', created_at: FIXED_TIMESTAMP, updated_at: FIXED_TIMESTAMP },
    { id: CH3, document_id: DEMO_DOC_ID, title: chapterTitles.ch3, order: 2, kind: 'standard', created_at: FIXED_TIMESTAMP, updated_at: FIXED_TIMESTAMP },
  ];

  const characters: Character[] = [
    {
      id: CHAR_YAKOV,
      document_id: DEMO_DOC_ID,
      name: meta['character.yakov.name'],
      aliases: [...meta['character.yakov.aliases']],
      notes: '',
      color: '#7F77DD',
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    },
    {
      id: CHAR_ROTHSCHILD,
      document_id: DEMO_DOC_ID,
      name: meta['character.rothschild.name'],
      aliases: [...meta['character.rothschild.aliases']],
      notes: '',
      color: '#0D9488',
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    },
  ];

  // Assign order_idx per chapter in the order blocks appear in BLOCKS.
  // Soft-deleted (graveyard) blocks still get their original order so
  // restore lands them in-place.
  const orderPerChapter = new Map<UUID, number>();
  const blocks: Block[] = BLOCKS.map((entry) => {
    const ord = orderPerChapter.get(entry.chapterId) ?? 0;
    orderPerChapter.set(entry.chapterId, ord + 1);
    const content = prose[entry.id] ?? '';
    const block: Block = {
      id: entry.id,
      chapter_id: entry.chapterId,
      type: entry.type,
      content,
      order: ord,
      metadata: resolveSceneMeta(entry.metadata, meta),
      deleted_at: entry.deletedFrom ? FIXED_TIMESTAMP : null,
      deleted_from: resolveDeletedFrom(entry, meta),
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    };
    return block;
  });

  const sentiments: SentimentEntry[] = BLOCKS.filter((e) => e.sentiment).map(
    (entry) => ({
      blockId: entry.id,
      label: entry.sentiment!.label,
      score: entry.sentiment!.score,
      contentHash: h(prose[entry.id] ?? ''),
      analyzedAt: FIXED_TIMESTAMP,
    }),
  );

  void lang; // the function is language-agnostic past the prose tables
  return {
    kind: 'inkmirror.document',
    version: 1,
    exported_at: FIXED_TIMESTAMP,
    app_version: '0.1.0-demo',
    document,
    chapters,
    blocks,
    characters,
    sentiments,
  };
}

export function getDemoBundle(lang: string): DocumentBundleV1 {
  if (lang === 'hu') {
    return build('hu', demoProseHu, demoChapterTitlesHu, demoMetaHu);
  }
  return build('en', demoProseEn, demoChapterTitlesEn, demoMetaEn);
}
