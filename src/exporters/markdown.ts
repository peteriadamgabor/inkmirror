import type { Block, Chapter, Character, DialogueMetadata, DialogueStyle } from '@/types';
import { t } from '@/i18n';
import {
  contentToRuns,
  orderChaptersForExport,
  resolveDialogueStyle,
  shouldPrintChapterTitle,
  textBlob,
  visibleChapterBlocks,
  type Exporter,
  type ExportInput,
} from './index';

/**
 * Escape Markdown metacharacters in user-authored text so a chapter
 * titled `# Notes` or prose containing `*stars*` round-trips as
 * literal text instead of re-rendering as formatting. Inline-level
 * specials are escaped everywhere; `#` and `>` only matter at the
 * start of a line, so they're escaped line-anchored to keep prose
 * like "issue #5" readable. The exporter's *own* emphasis markers
 * (from block marks) are added *after* this runs, so they survive.
 */
function escapeMarkdown(text: string): string {
  return text
    .replace(/[\\`*_[\]]/g, '\\$&')
    .replace(/^([#>])/gm, '\\$1');
}

function wrapRun(text: string, bold: boolean, italic: boolean): string {
  if (!text) return '';
  let out = text;
  if (italic) out = `*${out}*`;
  if (bold) out = `**${out}**`;
  return out;
}

function renderInline(block: Block): string {
  return contentToRuns(block.content, block.marks)
    .map((run) => wrapRun(escapeMarkdown(run.text), run.bold, run.italic))
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
      if (parenthetical) parts.push(`*(${escapeMarkdown(parenthetical)})*`);
      if (dialogue) parts.push(dialogue);
      return parts.join(' ');
    }
    case 'text':
    default:
      return renderInline(block);
  }
}

function renderChapter(
  chapter: Chapter,
  input: ExportInput,
  dialogueStyle: DialogueStyle,
  parts: string[],
): void {
  // Title visibility is per chapter (kind default + user override);
  // chapters without a printed title get a thematic break instead so
  // the boundary survives in the output.
  if (shouldPrintChapterTitle(chapter)) {
    parts.push(`\n## ${escapeMarkdown(chapter.title)}`);
  } else {
    parts.push('\n---\n');
  }
  const blocks = visibleChapterBlocks(chapter, input.blocks);
  for (const block of blocks) {
    const rendered = renderBlock(block, input.characters, dialogueStyle);
    if (rendered !== null && rendered.trim().length > 0) {
      parts.push(rendered);
    }
  }
}

export function renderMarkdown(input: ExportInput): string {
    const parts: string[] = [];
    const doc = input.document;
    parts.push(`# ${escapeMarkdown(doc.title || t('common.untitled'))}`);
    if (doc.author) parts.push(`*${t('exporters.by', { author: escapeMarkdown(doc.author) })}*`);
    if (doc.synopsis) parts.push(`\n> ${escapeMarkdown(doc.synopsis)}`);

    const sortedChapters = orderChaptersForExport(input.chapters);
    const dialogueStyle = resolveDialogueStyle(doc);
    for (const chapter of sortedChapters) {
      renderChapter(chapter, input, dialogueStyle, parts);
    }

    if (input.characters.length > 0) {
      parts.push('\n---\n');
      parts.push(`## ${t('exporters.characters')}`);
      for (const c of input.characters) {
        const aliases =
          c.aliases.length > 0 ? ` *(${escapeMarkdown(c.aliases.join(', '))})*` : '';
        parts.push(
          `- **${escapeMarkdown(c.name)}**${aliases}${c.notes ? ` — ${escapeMarkdown(c.notes)}` : ''}`,
        );
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
