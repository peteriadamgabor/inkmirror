import type { Block, Character, SceneMetadata, DialogueMetadata } from '@/types';
import { textBlob, visibleChapterBlocks, type Exporter, type ExportInput } from './index';

function speakerNameFor(
  data: DialogueMetadata,
  characters: readonly Character[],
): string | null {
  if (!data.speaker_id) return null;
  return characters.find((c) => c.id === data.speaker_id)?.name ?? null;
}

function renderBlock(block: Block, characters: readonly Character[]): string | null {
  switch (block.type) {
    case 'note':
      return null;
    case 'scene': {
      const md = block.metadata.type === 'scene' ? (block.metadata.data as SceneMetadata) : null;
      const header: string[] = [];
      if (md?.location) header.push(md.location);
      if (md?.time) header.push(md.time);
      if (md?.mood) header.push(`(${md.mood})`);
      const headline = header.length > 0 ? `*${header.join(' — ')}*` : '*Scene*';
      return `${headline}\n\n${block.content}`.trimEnd();
    }
    case 'dialogue': {
      const data =
        block.metadata.type === 'dialogue' ? (block.metadata.data as DialogueMetadata) : null;
      if (!data) return block.content;
      const speaker = speakerNameFor(data, characters);
      const parenthetical = data.parenthetical?.trim();
      const body = block.content
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      const lines: string[] = [];
      if (speaker) lines.push(`> **${speaker}**`);
      if (parenthetical) lines.push(`> *(${parenthetical})*`);
      lines.push(body);
      return lines.join('\n');
    }
    case 'text':
    default:
      return block.content;
  }
}

export function renderMarkdown(input: ExportInput): string {
    const parts: string[] = [];
    const doc = input.document;
    parts.push(`# ${doc.title || 'Untitled'}`);
    if (doc.author) parts.push(`*by ${doc.author}*`);
    if (doc.synopsis) parts.push(`\n> ${doc.synopsis}`);

    const sortedChapters = input.chapters.slice().sort((a, b) => a.order - b.order);
    for (const chapter of sortedChapters) {
      parts.push(`\n## ${chapter.title}`);
      const blocks = visibleChapterBlocks(chapter, input.blocks);
      for (const block of blocks) {
        const rendered = renderBlock(block, input.characters);
        if (rendered !== null && rendered.trim().length > 0) {
          parts.push(rendered);
        }
      }
    }

    if (input.characters.length > 0) {
      parts.push('\n---\n');
      parts.push('## Characters');
      for (const c of input.characters) {
        const aliases = c.aliases.length > 0 ? ` *(${c.aliases.join(', ')})*` : '';
        parts.push(`- **${c.name}**${aliases}${c.notes ? ` — ${c.notes}` : ''}`);
      }
    }

    return parts.join('\n\n') + '\n';
}

export const markdownExporter: Exporter = {
  format: 'markdown',
  label: 'Markdown',
  extension: 'md',
  mimeType: 'text/markdown',
  async run(input: ExportInput): Promise<Blob> {
    return textBlob(renderMarkdown(input), 'text/markdown');
  },
};
