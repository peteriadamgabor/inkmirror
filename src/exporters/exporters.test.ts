import { describe, it, expect } from 'vitest';
import { renderJson } from './json';
import { renderMarkdown } from './markdown';
import { renderFountain } from './fountain';
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
      metadata: { type: 'dialogue', data: { speaker_id: 'x', speaker_name: 'Alice' } },
      deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
    },
    {
      id: 'b3', chapter_id: 'c1', type: 'note', content: 'Remember to fix this later', order: 2,
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
  it('renders dialogue with speaker as blockquote', () => {
    expect(out).toContain('> **Alice**');
    expect(out).toContain('> Hello there.');
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
  it('emits dialogue as UPPERCASE speaker + line', () => {
    expect(out).toContain('ALICE\nHello there.');
  });
  it('excludes notes and deleted blocks', () => {
    expect(out).not.toContain('Remember to fix this later');
    expect(out).not.toContain('Deleted');
  });
});

