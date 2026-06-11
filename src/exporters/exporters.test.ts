import { describe, it, expect } from 'vitest';
import { renderJson } from './json';
import { renderMarkdown } from './markdown';
import { renderFountain } from './fountain';
import { __test as pdfInternals } from './pdf';
import type { Block, Chapter, ChapterKind, Character, Document } from '@/types';
import {
  orderChaptersForExport,
  shouldPrintChapterTitle,
  type ExportInput,
} from './index';

function makeInput(): ExportInput {
  const now = '2026-04-15T00:00:00.000Z';
  const doc: Document = {
    id: 'd1',
    title: 'My Novel',
    author: 'Test Author',
    synopsis: 'A short tale.',
    settings: {
      font_family: 'Georgia, serif',
      font_size: 16,
      line_height: 1.8,
      editor_width: 680,
      theme: 'light',
    },
    pov_character_id: null,
    created_at: now,
    updated_at: now,
  };
  const chapters: Chapter[] = [
    { id: 'c1', document_id: 'd1', title: 'Chapter 1', order: 0, kind: 'standard', created_at: now, updated_at: now },
    { id: 'c2', document_id: 'd1', title: 'Chapter 2', order: 1, kind: 'standard', created_at: now, updated_at: now },
  ];
  const blocks: Block[] = [
    {
      id: 'b1', chapter_id: 'c1', type: 'text', content: 'Opening paragraph.', order: 0,
      metadata: { type: 'text' }, deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
    },
    {
      id: 'b2', chapter_id: 'c1', type: 'dialogue',
      content: 'Hello there.', order: 1,
      metadata: {
        type: 'dialogue',
        data: { speaker_id: 'x', parenthetical: 'whispering' },
      },
      deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
    },
    {
      id: 'b2b', chapter_id: 'c1', type: 'dialogue',
      content: 'And again.', order: 2,
      metadata: { type: 'dialogue', data: { speaker_id: 'x' } },
      deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
    },
    {
      id: 'b3', chapter_id: 'c1', type: 'note', content: 'Remember to fix this later', order: 3,
      metadata: { type: 'note', data: {} }, deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
    },
    {
      id: 'b4', chapter_id: 'c2', type: 'scene',
      content: 'A dusty road stretches out.', order: 0,
      metadata: { type: 'scene', data: { location: 'desert highway', time: 'noon', character_ids: [], mood: 'tense' } },
      deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
    },
    {
      id: 'b5', chapter_id: 'c2', type: 'text', content: 'Deleted', order: 1,
      metadata: { type: 'text' }, deleted_at: now, deleted_from: { chapter_id: 'c2', chapter_title: 'Chapter 2', position: 1 },
      created_at: now, updated_at: now,
    },
  ];
  const characters: Character[] = [
    { id: 'x', document_id: 'd1', name: 'Alice', aliases: ['Al'], notes: 'Protagonist', color: '#7F77DD', created_at: now, updated_at: now },
  ];
  return { document: doc, chapters, blocks, characters };
}

describe('jsonExporter', () => {
  const out = JSON.parse(renderJson(makeInput()));
  it('includes document metadata and characters', () => {
    expect(out.document.title).toBe('My Novel');
    expect(out.characters).toHaveLength(1);
    expect(out.characters[0].name).toBe('Alice');
  });
  it('excludes notes and deleted blocks', () => {
    const allBlocks = out.chapters.flatMap((c: { blocks: unknown[] }) => c.blocks) as Array<{ type: string; content: string }>;
    expect(allBlocks.find((b) => b.type === 'note')).toBeUndefined();
    expect(allBlocks.find((b) => b.content === 'Deleted')).toBeUndefined();
  });
  it('preserves chapter order', () => {
    expect(out.chapters.map((c: { title: string }) => c.title)).toEqual(['Chapter 1', 'Chapter 2']);
  });
});

describe('markdownExporter', () => {
  const out = renderMarkdown(makeInput());
  it('renders title and chapter headings', () => {
    expect(out).toContain('# My Novel');
    expect(out).toContain('*by Test Author*');
    expect(out).toContain('## Chapter 1');
    expect(out).toContain('## Chapter 2');
  });
  it('renders dialogue as novel-style wrapped prose (no speaker cue)', () => {
    // Default dialogue_style is 'straight' — ASCII double quotes.
    expect(out).toContain('"Hello there."');
    // No screenplay-style speaker cue.
    expect(out).not.toContain('> **Alice**');
    expect(out).not.toContain('**Alice**\n');
  });
  it('renders parenthetical as an italic prefix inside the dialogue line', () => {
    expect(out).toContain('*(whispering)* "Hello there."');
  });
  it('renders scene blocks as a centered `* * *` break with metadata hidden', () => {
    expect(out).toContain('* * *');
    expect(out).not.toContain('desert highway');
    expect(out).not.toContain('(tense)');
  });
  it('excludes notes and deleted blocks', () => {
    expect(out).not.toContain('Remember to fix this later');
    expect(out).not.toContain('Deleted');
  });
  it('includes character appendix', () => {
    expect(out).toContain('## Characters');
    expect(out).toContain('**Alice**');
    expect(out).toContain('*(Al)*');
  });
});

describe('fountainExporter', () => {
  const out = renderFountain(makeInput());
  it('emits title page', () => {
    expect(out).toContain('Title: My Novel');
    expect(out).toContain('Author: Test Author');
  });
  it('emits scene heading in INT. format', () => {
    expect(out).toContain('INT. DESERT HIGHWAY - NOON');
  });
  it('emits dialogue as UPPERCASE speaker + parenthetical + line', () => {
    expect(out).toContain('ALICE\n(whispering)\nHello there.');
  });
  it("emits (CONT'D) on consecutive same-speaker dialogue", () => {
    expect(out).toContain("ALICE (CONT'D)\nAnd again.");
  });
  it('excludes notes and deleted blocks', () => {
    expect(out).not.toContain('Remember to fix this later');
    expect(out).not.toContain('Deleted');
  });
});

describe('pdfExporter — novel-first flatten', () => {
  const input = makeInput();
  const { flatten, wrapDialogue } = pdfInternals;
  const b2 = input.blocks.find((b) => b.id === 'b2')!;
  const b4 = input.blocks.find((b) => b.id === 'b4')!;
  const b1 = input.blocks.find((b) => b.id === 'b1')!;

  it('dialogue is emitted as a single wrapped prose paragraph — no speaker cue', () => {
    const parts = flatten(b2, input.characters, 'straight');
    // No 'speaker' kind exists in novel-first output.
    expect(parts.every((p) => p.kind !== ('speaker' as string))).toBe(true);
    const dialogue = parts.find((p) => p.kind === 'dialogue');
    expect(dialogue?.text).toBe('"Hello there."');
    expect(dialogue?.parenthetical).toBe('whispering');
  });

  it('dialogue honors the curly-quotes style', () => {
    const parts = flatten(b2, input.characters, 'curly');
    const dialogue = parts.find((p) => p.kind === 'dialogue');
    expect(dialogue?.text).toBe('“Hello there.”');
  });

  it('dialogue honors the Hungarian en-dash style', () => {
    const parts = flatten(b2, input.characters, 'hu_dash');
    const dialogue = parts.find((p) => p.kind === 'dialogue');
    expect(dialogue?.text).toBe('– Hello there.');
  });

  it('scene block emits a scene-break with metadata hidden', () => {
    const parts = flatten(b4, input.characters, 'straight');
    expect(parts[0].kind).toBe('scene-break');
    expect(parts[0].text).toBe('* * *');
    // No part should leak the scene metadata text.
    expect(
      parts.some((p) => typeof p.text === 'string' && p.text.includes('desert highway')),
    ).toBe(false);
  });

  it('text blocks remain one part per paragraph', () => {
    const parts = flatten(b1, input.characters, 'straight');
    expect(parts).toHaveLength(1);
    expect(parts[0].kind).toBe('p');
    expect(parts[0].text).toBe('Opening paragraph.');
  });

  it('wrapDialogue covers empty content defensively', () => {
    expect(wrapDialogue('', 'straight')).toBe('');
    expect(wrapDialogue('   ', 'curly')).toBe('');
  });

  it('preserves Hungarian ő/ű through flatten — no WinAnsi truncation upstream', () => {
    // Regression for the built-in Times font bug where jsPDF truncated
    // U+0151/U+0171 to their low bytes (Q/q) in the rendered PDF.
    // The fix is downstream (custom TTF font), but flatten must pass
    // the characters through verbatim.
    const now = '2026-04-15T00:00:00.000Z';
    const huBlock: Block = {
      id: 'hu', chapter_id: 'c1', type: 'text',
      content: 'Az ébresztő gyönyörű volt. Főiskolát végzett Ő és Ű.',
      order: 99, metadata: { type: 'text' },
      deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
    };
    const parts = flatten(huBlock, [], 'straight');
    const text = parts.map((p) => p.text).join('');
    expect(text).toContain('ébresztő');
    expect(text).toContain('gyönyörű');
    expect(text).toContain('Főiskolát');
    expect(text).toContain('Ő');
    expect(text).toContain('Ű');
    expect(text).not.toMatch(/[QqPp](?![a-zü])/); // no stray Q/q/P/p that would indicate truncation
  });
});

// ---------- chapter kinds: front / back matter ----------

function makeKindedInput(): ExportInput {
  const base = makeInput();
  const now = '2026-04-15T00:00:00.000Z';
  const mk = (id: string, title: string, order: number, kind: ChapterKind): Chapter => ({
    id, document_id: 'd1', title, order, kind, created_at: now, updated_at: now,
  });
  // Sidebar order deliberately scrambles the book-binding order.
  const chapters: Chapter[] = [
    mk('k-epi', 'Epigraph', 0, 'epigraph'),
    mk('k-std1', 'Chapter One', 1, 'standard'),
    mk('k-ack', 'Acknowledgments', 2, 'acknowledgments'),
    mk('k-cov', 'Cover Page', 3, 'cover'),
    mk('k-std2', 'Chapter Two', 4, 'standard'),
    mk('k-ded', 'Dedication', 5, 'dedication'),
    mk('k-aft', 'Afterword', 6, 'afterword'),
  ];
  const textBlock = (id: string, chapterId: string, content: string): Block => ({
    id, chapter_id: chapterId, type: 'text', content, order: 0,
    metadata: { type: 'text' }, deleted_at: null, deleted_from: null,
    created_at: now, updated_at: now,
  });
  const blocks: Block[] = [
    textBlock('kb-epi', 'k-epi', 'All happy families are alike.'),
    textBlock('kb-std1', 'k-std1', 'The story begins.'),
    textBlock('kb-ack', 'k-ack', 'Thanks to everyone.'),
    textBlock('kb-cov', 'k-cov', 'The Long Night'),
    textBlock('kb-std2', 'k-std2', 'The story ends.'),
    textBlock('kb-ded', 'k-ded', 'For my mother.'),
    textBlock('kb-aft', 'k-aft', 'A note on sources.'),
  ];
  return { ...base, chapters, blocks };
}

describe('orderChaptersForExport', () => {
  it('binds front matter, story, back matter — preserving order within a kind', () => {
    const ordered = orderChaptersForExport(makeKindedInput().chapters);
    expect(ordered.map((c) => c.id)).toEqual([
      'k-cov', 'k-ded', 'k-epi', 'k-std1', 'k-std2', 'k-ack', 'k-aft',
    ]);
  });

  it('keeps relative sidebar order between two chapters of the same kind', () => {
    const input = makeKindedInput();
    const extra: Chapter = {
      ...input.chapters[0], id: 'k-epi2', title: 'Second Epigraph', order: 5.5,
    };
    const ordered = orderChaptersForExport([...input.chapters, extra]);
    const epiIds = ordered.filter((c) => c.kind === 'epigraph').map((c) => c.id);
    expect(epiIds).toEqual(['k-epi', 'k-epi2']);
  });
});

describe('jsonExporter — chapter kinds', () => {
  const out = JSON.parse(renderJson(makeKindedInput()));
  it('includes kind in every chapter payload', () => {
    const kinds = out.chapters.map((c: { kind: string }) => c.kind);
    expect(kinds).toEqual([
      'cover', 'dedication', 'epigraph', 'standard', 'standard',
      'acknowledgments', 'afterword',
    ]);
  });
  it('keeps the original order field so the payload stays lossless', () => {
    const cover = out.chapters.find((c: { kind: string }) => c.kind === 'cover');
    expect(cover.order).toBe(3);
  });
});

describe('markdownExporter — chapter kinds', () => {
  const out = renderMarkdown(makeKindedInput());
  it('orders front matter before the story and back matter after', () => {
    const idx = (s: string) => out.indexOf(s);
    expect(idx('The Long Night')).toBeGreaterThan(-1);
    expect(idx('The Long Night')).toBeLessThan(idx('For my mother.'));
    expect(idx('For my mother.')).toBeLessThan(idx('All happy families are alike.'));
    expect(idx('All happy families are alike.')).toBeLessThan(idx('## Chapter One'));
    expect(idx('## Chapter Two')).toBeLessThan(idx('## Acknowledgments'));
    expect(idx('## Acknowledgments')).toBeLessThan(idx('A note on sources.'));
  });
  it('renders cover / dedication / epigraph without a ## chapter heading', () => {
    expect(out).not.toContain('## Cover Page');
    expect(out).not.toContain('## Dedication');
    expect(out).not.toContain('## Epigraph');
  });
  it('keeps the title heading for acknowledgments and afterword', () => {
    expect(out).toContain('## Acknowledgments');
    expect(out).toContain('## Afterword');
  });
});

describe('fountainExporter — chapter kinds', () => {
  const out = renderFountain(makeKindedInput());
  it('puts front matter before the first section heading', () => {
    expect(out.indexOf('For my mother.')).toBeLessThan(out.indexOf('# Chapter One'));
    expect(out.indexOf('All happy families are alike.')).toBeLessThan(out.indexOf('# Chapter One'));
  });
  it('renders front matter without section headings, back matter with them', () => {
    expect(out).not.toContain('# Cover Page');
    expect(out).not.toContain('# Dedication');
    expect(out).not.toContain('# Epigraph');
    expect(out).toContain('# Acknowledgments');
    expect(out).toContain('# Afterword');
    expect(out.indexOf('# Chapter Two')).toBeLessThan(out.indexOf('# Acknowledgments'));
  });
});

// ---------- per-chapter title override ----------

describe('shouldPrintChapterTitle', () => {
  const now = '2026-04-15T00:00:00.000Z';
  const mk = (kind: ChapterKind, exportTitle?: boolean): Chapter => ({
    id: 'x', document_id: 'd1', title: 'T', order: 0, kind,
    export_title: exportTitle, created_at: now, updated_at: now,
  });

  it('defaults follow the kind', () => {
    expect(shouldPrintChapterTitle(mk('standard'))).toBe(true);
    expect(shouldPrintChapterTitle(mk('acknowledgments'))).toBe(true);
    expect(shouldPrintChapterTitle(mk('afterword'))).toBe(true);
    expect(shouldPrintChapterTitle(mk('cover'))).toBe(false);
    expect(shouldPrintChapterTitle(mk('dedication'))).toBe(false);
    expect(shouldPrintChapterTitle(mk('epigraph'))).toBe(false);
  });

  it('the per-chapter override wins in both directions', () => {
    expect(shouldPrintChapterTitle(mk('epigraph', true))).toBe(true);
    expect(shouldPrintChapterTitle(mk('standard', false))).toBe(false);
  });
});

describe('export_title override across formats', () => {
  function makeOverriddenInput(): ExportInput {
    const input = makeKindedInput();
    const chapters = input.chapters.map((c) => {
      if (c.id === 'k-epi') return { ...c, export_title: true };
      if (c.id === 'k-std1') return { ...c, export_title: false };
      return c;
    });
    return { ...input, chapters };
  }

  it('markdown: epigraph gains its heading, suppressed standard loses it', () => {
    const out = renderMarkdown(makeOverriddenInput());
    expect(out).toContain('## Epigraph');
    expect(out).not.toContain('## Chapter One');
    // The chapter body is still there, behind a thematic break.
    expect(out).toContain('The story begins.');
    expect(out).toContain('## Chapter Two');
  });

  it('fountain: same override drives the # section headings', () => {
    const out = renderFountain(makeOverriddenInput());
    expect(out).toContain('# Epigraph');
    expect(out).not.toContain('# Chapter One');
    expect(out).toContain('The story begins.');
  });

  it('json: export_title round-trips, absent stays absent', () => {
    const out = JSON.parse(renderJson(makeOverriddenInput()));
    const epi = out.chapters.find((c: { title: string }) => c.title === 'Epigraph');
    const std1 = out.chapters.find((c: { title: string }) => c.title === 'Chapter One');
    const std2 = out.chapters.find((c: { title: string }) => c.title === 'Chapter Two');
    expect(epi.export_title).toBe(true);
    expect(std1.export_title).toBe(false);
    expect(std2.export_title).toBeUndefined();
  });
});

// ---------- markdown escaping ----------

describe('markdownExporter — metacharacter escaping', () => {
  const now = '2026-04-15T00:00:00.000Z';
  function makeEscapeInput(): ExportInput {
    const base = makeInput();
    const chapters: Chapter[] = [
      {
        id: 'e1', document_id: 'd1', title: '# Not a heading *really*',
        order: 0, kind: 'standard', created_at: now, updated_at: now,
      },
    ];
    const blocks: Block[] = [
      {
        id: 'eb1', chapter_id: 'e1', type: 'text',
        content: 'Stars *not italic* and _underscores_ and [brackets].',
        order: 0, metadata: { type: 'text' },
        deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
      },
      {
        id: 'eb2', chapter_id: 'e1', type: 'text',
        content: '> not a blockquote\n# not a heading',
        order: 1, metadata: { type: 'text' },
        deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
      },
      {
        id: 'eb3', chapter_id: 'e1', type: 'text',
        content: 'emphasis survives',
        order: 2, metadata: { type: 'text' },
        marks: [{ type: 'italic', start: 0, end: 8 }],
        deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
      },
    ];
    return {
      ...base,
      document: { ...base.document, title: 'Stars *and* _Bars_' },
      chapters,
      blocks,
    };
  }
  const out = renderMarkdown(makeEscapeInput());

  it('escapes metacharacters in the document title', () => {
    expect(out).toContain('# Stars \\*and\\* \\_Bars\\_');
  });
  it('escapes metacharacters in chapter titles', () => {
    expect(out).toContain('## \\# Not a heading \\*really\\*');
  });
  it('escapes inline metacharacters in prose', () => {
    expect(out).toContain('Stars \\*not italic\\* and \\_underscores\\_ and \\[brackets\\].');
  });
  it('escapes line-leading > and # in prose', () => {
    expect(out).toContain('\\> not a blockquote');
    expect(out).toContain('\\# not a heading');
  });
  it('does not escape the emphasis markers the exporter emits from marks', () => {
    expect(out).toContain('*emphasis*');
    expect(out).not.toContain('\\*emphasis');
  });
});

