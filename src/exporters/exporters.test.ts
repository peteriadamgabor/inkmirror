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
  it('renders dialogue with speaker derived from character lookup', () => {
    expect(out).toContain('> **Alice**');
    expect(out).toContain('> Hello there.');
  });
  it('renders parenthetical as italic blockquote line', () => {
    expect(out).toContain('> *(whispering)*');
  });
  it('renders scene heading from metadata', () => {
    expect(out).toContain('*desert highway — noon — (tense)*');
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

describe('pdfExporter — CONT\'D on consecutive same-speaker dialogue', () => {
  const input = makeInput();
  const { flatten, nextSpeakerId } = pdfInternals;
  const b2 = input.blocks.find((b) => b.id === 'b2')!;
  const b2b = input.blocks.find((b) => b.id === 'b2b')!;
  const b1 = input.blocks.find((b) => b.id === 'b1')!;

  it('first dialogue in a chapter renders as the bare name', () => {
    const parts = flatten(b2, input.characters, null);
    const speaker = parts.find((p) => p.kind === 'speaker');
    expect(speaker?.text).toBe('Alice');
  });

  it('second consecutive dialogue by same speaker gets (CONT\'D)', () => {
    const parts = flatten(b2b, input.characters, nextSpeakerId(b2));
    const speaker = parts.find((p) => p.kind === 'speaker');
    expect(speaker?.text).toBe("Alice (CONT'D)");
  });

  it('a non-dialogue block between two dialogues resets CONT\'D', () => {
    // b2 → b1 (text) → b2b. nextSpeakerId(b1) returns null, so b2b is bare.
    const parts = flatten(b2b, input.characters, nextSpeakerId(b1));
    const speaker = parts.find((p) => p.kind === 'speaker');
    expect(speaker?.text).toBe('Alice');
  });

  it('nextSpeakerId returns null for non-dialogue blocks', () => {
    expect(nextSpeakerId(b1)).toBeNull();
    expect(nextSpeakerId(b2)).toBe('x');
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
    const parts = flatten(huBlock, [], null);
    const text = parts.map((p) => p.text).join('');
    expect(text).toContain('ébresztő');
    expect(text).toContain('gyönyörű');
    expect(text).toContain('Főiskolát');
    expect(text).toContain('Ő');
    expect(text).toContain('Ű');
    expect(text).not.toMatch(/[QqPp](?![a-zü])/); // no stray Q/q/P/p that would indicate truncation
  });
});

