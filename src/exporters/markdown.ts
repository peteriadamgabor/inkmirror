import type { Block, SceneMetadata, DialogueMetadata } from '@/types';
import { visibleChapterBlocks, type Exporter, type ExportInput } from './index';

function renderBlock(block: Block): string | null {
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
      const md =
        block.metadata.type === 'dialogue' ? (block.metadata.data as DialogueMetadata) : null;
      const speaker = md?.speaker_name?.trim();
      const body = block.content
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      return speaker ? `> **${speaker}**\n${body}` : body;
    }
    case 'text':
    default:
      return block.content;
  }
}

export const markdownExporter: Exporter = {
  format: 'markdown',
  label: 'Markdown',
  extension: 'md',
  mimeType: 'text/markdown',
  run(input: ExportInput): string {
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
        const rendered = renderBlock(block);
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
  },
};
