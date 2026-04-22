import type { Block, Character, DialogueMetadata, DialogueStyle } from '@/types';
import {
  contentToRuns,
  resolveDialogueStyle,
  textBlob,
  visibleChapterBlocks,
  type Exporter,
  type ExportInput,
} from './index';

function wrapRun(text: string, bold: boolean, italic: boolean): string {
  if (!text) return '';
  let out = text;
  if (italic) out = `*${out}*`;
  if (bold) out = `**${out}**`;
  return out;
}

function renderInline(block: Block): string {
  return contentToRuns(block.content, block.marks)
    .map((run) => wrapRun(run.text, run.bold, run.italic))
    .join('');
}

function wrapDialogueInline(inline: string, style: DialogueStyle): string {
  const collapsed = inline.replace(/\n+/g, ' ').trim();
  if (!collapsed) return '';
  if (style === 'hu_dash') return `– ${collapsed}`;
  if (style === 'curly') return `“${collapsed}”`;
  return `"${collapsed}"`;
}

function renderBlock(
  block: Block,
  _characters: readonly Character[],
  dialogueStyle: DialogueStyle,
): string | null {
  switch (block.type) {
    case 'note':
      return null;
    case 'scene':
      // Novel-first: render as a centered `* * *` break. Scene
      // metadata is hidden from the visible output (still used by
      // Plot Timeline / speaker scoping in the editor).
      return '* * *';
    case 'dialogue': {
      const data =
        block.metadata.type === 'dialogue' ? (block.metadata.data as DialogueMetadata) : null;
      const parenthetical = data?.parenthetical?.trim();
      const inline = renderInline(block);
      const dialogue = wrapDialogueInline(inline, dialogueStyle);
      if (!dialogue && !parenthetical) return null;
      const parts: string[] = [];
      if (parenthetical) parts.push(`*(${parenthetical})*`);
      if (dialogue) parts.push(dialogue);
      return parts.join(' ');
    }
    case 'text':
    default:
      return renderInline(block);
  }
}

export function renderMarkdown(input: ExportInput): string {
    const parts: string[] = [];
    const doc = input.document;
    parts.push(`# ${doc.title || 'Untitled'}`);
    if (doc.author) parts.push(`*by ${doc.author}*`);
    if (doc.synopsis) parts.push(`\n> ${doc.synopsis}`);

    const sortedChapters = input.chapters.slice().sort((a, b) => a.order - b.order);
    const dialogueStyle = resolveDialogueStyle(doc);
    for (const chapter of sortedChapters) {
      parts.push(`\n## ${chapter.title}`);
      const blocks = visibleChapterBlocks(chapter, input.blocks);
      for (const block of blocks) {
        const rendered = renderBlock(block, input.characters, dialogueStyle);
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
