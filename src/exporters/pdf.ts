import type { Block, Character, DialogueMetadata, SceneMetadata } from '@/types';
import { exportableBlocks, type Exporter, type ExportInput } from './index';

// Rough A4-manuscript layout. jsPDF uses points (1/72 inch) when unit: 'pt'.
const PAGE_W = 595.28; // A4 width pt
const PAGE_H = 841.89; // A4 height pt
const MARGIN = 72; // 1 inch
const LINE_H = 18;
const BODY_FONT_SIZE = 12;
const CONTENT_W = PAGE_W - MARGIN * 2;

function speakerNameFor(
  data: DialogueMetadata,
  characters: readonly Character[],
): string | null {
  if (!data.speaker_id) return null;
  return characters.find((c) => c.id === data.speaker_id)?.name ?? null;
}

function flatten(
  block: Block,
  characters: readonly Character[],
): Array<{ kind: 'h' | 'scene' | 'speaker' | 'parenthetical' | 'p'; text: string }> {
  switch (block.type) {
    case 'scene': {
      const md = block.metadata.type === 'scene' ? (block.metadata.data as SceneMetadata) : null;
      const parts: Array<{ kind: 'scene' | 'p'; text: string }> = [];
      if (md) {
        const header = [md.location, md.time, md.mood ? `(${md.mood})` : '']
          .filter(Boolean)
          .join(' — ');
        if (header) parts.push({ kind: 'scene', text: header });
      }
      for (const p of block.content.split(/\n{2,}/)) {
        const t = p.trim();
        if (t) parts.push({ kind: 'p', text: t });
      }
      return parts;
    }
    case 'dialogue': {
      const data =
        block.metadata.type === 'dialogue' ? (block.metadata.data as DialogueMetadata) : null;
      const parts: Array<{ kind: 'speaker' | 'parenthetical' | 'p'; text: string }> = [];
      if (data) {
        const speaker = speakerNameFor(data, characters);
        if (speaker) parts.push({ kind: 'speaker', text: speaker });
        if (data.parenthetical?.trim()) {
          parts.push({ kind: 'parenthetical', text: `(${data.parenthetical.trim()})` });
        }
      }
      for (const p of block.content.split(/\n{2,}/)) {
        const t = p.trim();
        if (t) parts.push({ kind: 'p', text: t });
      }
      return parts;
    }
    case 'text':
    default: {
      return block.content
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((text) => ({ kind: 'p' as const, text }));
    }
  }
}

export const pdfExporter: Exporter = {
  format: 'pdf',
  label: 'PDF',
  extension: 'pdf',
  mimeType: 'application/pdf',
  async run(input: ExportInput): Promise<Blob> {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    pdf.setFont('times', 'normal');

    let y = MARGIN;
    const newPage = () => {
      pdf.addPage();
      y = MARGIN;
    };
    const ensureSpace = (needed: number) => {
      if (y + needed > PAGE_H - MARGIN) newPage();
    };
    const writeLines = (
      text: string,
      opts: { size: number; style?: 'normal' | 'italic' | 'bold'; align?: 'left' | 'center' },
    ) => {
      pdf.setFontSize(opts.size);
      pdf.setFont('times', opts.style ?? 'normal');
      const lines = pdf.splitTextToSize(text, CONTENT_W) as string[];
      for (const line of lines) {
        ensureSpace(opts.size * 1.4);
        const x = opts.align === 'center' ? PAGE_W / 2 : MARGIN;
        pdf.text(line, x, y, { align: opts.align ?? 'left' });
        y += opts.size * 1.4;
      }
    };

    // Title page
    y = PAGE_H / 3;
    writeLines(input.document.title || 'Untitled', { size: 28, align: 'center' });
    y += LINE_H;
    if (input.document.author) {
      writeLines(input.document.author, { size: 14, style: 'italic', align: 'center' });
    }
    newPage();

    const sortedChapters = input.chapters.slice().sort((a, b) => a.order - b.order);
    for (const chapter of sortedChapters) {
      newPage();
      y = PAGE_H / 4;
      writeLines(chapter.title, { size: 22, style: 'bold', align: 'center' });
      y += LINE_H * 2;
      for (const block of exportableBlocks(chapter, input.blocks)) {
        for (const part of flatten(block, input.characters)) {
          if (part.kind === 'scene') {
            y += LINE_H * 0.5;
            writeLines(part.text, { size: BODY_FONT_SIZE, style: 'italic', align: 'center' });
            y += LINE_H * 0.5;
          } else if (part.kind === 'speaker') {
            y += LINE_H * 0.5;
            writeLines(part.text.toUpperCase(), { size: BODY_FONT_SIZE, style: 'bold' });
          } else if (part.kind === 'parenthetical') {
            writeLines(part.text, { size: BODY_FONT_SIZE - 1, style: 'italic' });
          } else {
            writeLines(part.text, { size: BODY_FONT_SIZE });
            y += LINE_H * 0.3;
          }
        }
      }
    }

    return pdf.output('blob');
  },
};
