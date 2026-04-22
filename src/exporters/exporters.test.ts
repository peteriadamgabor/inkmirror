import { describe, it, expect } from 'vitest';
import { renderJson } from './json';
import { renderMarkdown } from './markdown';
import { renderFountain } from './fountain';
import { __test as pdfInternals } from './pdf';
import type { Block, Chapter, Character, Document } from '@/types';
import type { ExportInput } from './index';

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

