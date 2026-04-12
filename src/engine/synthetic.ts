import type { Block, BlockType, BlockMetadata, Chapter, Document } from '@/types';

export interface SyntheticDocOptions {
  chapterCount: number;
  blocksPerChapter: number;
  wordsPerBlock: number;
  typeDistribution: {
    text: number;
    dialogue: number;
    scene: number;
    note: number;
  };
  seed: number;
}

export interface SyntheticDoc {
  document: Document;
  chapters: Chapter[];
  blocks: Block[];
}

/** Mulberry32 — small, fast, well-distributed seeded PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  'the', 'and', 'of', 'to', 'in', 'a', 'was', 'he', 'her', 'she', 'they',
  'said', 'whispered', 'looked', 'saw', 'felt', 'knew', 'remembered',
  'evening', 'morning', 'shadow', 'light', 'door', 'window', 'hand', 'voice',
  'silence', 'rain', 'forest', 'road', 'letter', 'name', 'story', 'memory',
];

function makeWord(rand: () => number): string {
  return WORDS[Math.floor(rand() * WORDS.length)];
}

function makeSentence(rand: () => number, targetWords: number): string {
  const words: string[] = [];
  for (let i = 0; i < targetWords; i++) words.push(makeWord(rand));
  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return words.join(' ') + '.';
}

function makeParagraph(rand: () => number, totalWords: number): string {
  const sentences: string[] = [];
  let remaining = totalWords;
  while (remaining > 0) {
    const sentenceLen = Math.min(remaining, 5 + Math.floor(rand() * 15));
    sentences.push(makeSentence(rand, sentenceLen));
    remaining -= sentenceLen;
  }
  return sentences.join(' ');
}

function pickType(
  rand: () => number,
  dist: SyntheticDocOptions['typeDistribution'],
): BlockType {
  const r = rand();
  if (r < dist.text) return 'text';
  if (r < dist.text + dist.dialogue) return 'dialogue';
  if (r < dist.text + dist.dialogue + dist.scene) return 'scene';
  return 'note';
}

function makeId(rand: () => number): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(rand() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function metadataFor(type: BlockType): BlockMetadata {
  switch (type) {
    case 'text':
      return { type: 'text' };
    case 'dialogue':
      return {
        type: 'dialogue',
        data: { speaker_id: 'synthetic', speaker_name: 'Speaker' },
      };
    case 'scene':
      return {
        type: 'scene',
        data: {
          location: 'Somewhere',
          time: 'Evening',
          character_ids: [],
          mood: 'neutral',
        },
      };
    case 'note':
      return { type: 'note', data: {} };
  }
}

export function generateSyntheticDoc(opts: SyntheticDocOptions): SyntheticDoc {
  const rand = mulberry32(opts.seed);
  const now = new Date().toISOString();

  const document: Document = {
    id: makeId(rand),
    title: 'Synthetic Test Document',
    author: 'Test',
    synopsis: '',
    settings: {
      font_family: 'Georgia, serif',
      font_size: 16,
      line_height: 1.8,
      editor_width: 680,
      theme: 'light',
    },
    created_at: now,
    updated_at: now,
  };

  const chapters: Chapter[] = [];
  const blocks: Block[] = [];

  for (let c = 0; c < opts.chapterCount; c++) {
    const chapter: Chapter = {
      id: makeId(rand),
      document_id: document.id,
      title: `Chapter ${c + 1}`,
      order: c,
      created_at: now,
      updated_at: now,
    };
    chapters.push(chapter);

    for (let b = 0; b < opts.blocksPerChapter; b++) {
      const type = pickType(rand, opts.typeDistribution);
      const content = makeParagraph(rand, opts.wordsPerBlock);
      blocks.push({
        id: makeId(rand),
        chapter_id: chapter.id,
        type,
        content,
        order: b,
        metadata: metadataFor(type),
        deleted_at: null,
        deleted_from: null,
        created_at: now,
        updated_at: now,
      });
    }
  }

  return { document, chapters, blocks };
}
