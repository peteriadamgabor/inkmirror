import type { Block, Character, DialogueMetadata, SceneMetadata } from '@/types';
import {
  contentToRuns,
  exportableBlocks,
  speakerNameFor,
  type Exporter,
  type ExportInput,
} from './index';

// Rough A4-manuscript layout. jsPDF uses points (1/72 inch) when unit: 'pt'.
const PAGE_W = 595.28; // A4 width pt
const PAGE_H = 841.89; // A4 height pt
const MARGIN = 72; // 1 inch
const LINE_H = 18;
const BODY_FONT_SIZE = 12;
const CONTENT_W = PAGE_W - MARGIN * 2;

/**
 * Hard cap on a single block's content during PDF rendering. jsPDF's
 * splitTextToSize is O(n) per call but a malicious bundle with one
 * pathologically long block (a minified blob, a fuzz payload, etc.)
 * can pin the main thread for many seconds since the PDF exporter
 * runs on the UI thread. 200 KB per block is ~30k words — well above
 * any realistic chapter-as-block.
 */
const MAX_BLOCK_CHARS = 200_000;
const TRUNCATION_NOTE = '\n\n[…truncated for export…]';

function clampBlockContent(text: string): string {
  if (text.length <= MAX_BLOCK_CHARS) return text;
  return text.slice(0, MAX_BLOCK_CHARS) + TRUNCATION_NOTE;
}

interface FlatPart {
  kind: 'h' | 'scene' | 'speaker' | 'parenthetical' | 'p';
  text: string;
}

function flatten(
  block: Block,
  characters: readonly Character[],
  previousSpeakerId: string | null,
): FlatPart[] {
  switch (block.type) {
    case 'scene': {
      const md = block.metadata.type === 'scene' ? (block.metadata.data as SceneMetadata) : null;
      const parts: FlatPart[] = [];
      if (md) {
        const header = [md.location, md.time, md.mood ? `(${md.mood})` : '']
          .filter(Boolean)
          .join(' — ');
        if (header) parts.push({ kind: 'scene', text: header });
      }
      for (const p of clampBlockContent(block.content).split(/\n{2,}/)) {
        const t = p.trim();
        if (t) parts.push({ kind: 'p', text: t });
      }
      return parts;
    }
    case 'dialogue': {
      const data =
        block.metadata.type === 'dialogue' ? (block.metadata.data as DialogueMetadata) : null;
      const parts: FlatPart[] = [];
      if (data) {
        const speaker = speakerNameFor(data, characters);
        if (speaker) {
          // Fountain-style CONT'D: when two consecutive dialogue blocks
          // share a speaker, the second cue gets "(CONT'D)" appended.
          // Resets on scene/text blocks or a new chapter via the caller.
          const isContinuation =
            !!data.speaker_id && data.speaker_id === previousSpeakerId;
          const cue = isContinuation ? `${speaker} (CONT'D)` : speaker;
          parts.push({ kind: 'speaker', text: cue });
        }
        if (data.parenthetical?.trim()) {
          parts.push({ kind: 'parenthetical', text: `(${data.parenthetical.trim()})` });
        }
      }
      for (const p of clampBlockContent(block.content).split(/\n{2,}/)) {
        const t = p.trim();
        if (t) parts.push({ kind: 'p', text: t });
      }
      return parts;
    }
    case 'text':
    default: {
      return clampBlockContent(block.content)
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((text) => ({ kind: 'p' as const, text }));
    }
  }
}

function nextSpeakerId(block: Block): string | null {
  if (block.type !== 'dialogue') return null;
  if (block.metadata.type !== 'dialogue') return null;
  return block.metadata.data.speaker_id || null;
}

/** Test-only export. Runtime callers go through `pdfExporter.run`. */
export const __test = { flatten, nextSpeakerId };

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

    // Render a block's content with per-run bold/italic font switching.
    // jsPDF has no inline rich-text API, so we render each run at an
    // advancing X position and wrap manually when the line exceeds
    // CONTENT_W. Falls back to plain writeLines for blocks with no marks.
    const writeRichBlock = (block: Block, size: number) => {
      const safeContent = clampBlockContent(block.content);
      const runs = contentToRuns(safeContent, block.marks);
      const hasMarks = runs.some((r) => r.bold || r.italic);
      if (!hasMarks) {
        writeLines(safeContent, { size });
        return;
      }

      // Split content on newlines first, render each visual paragraph.
      const paragraphs = safeContent.split(/\n/);
      let charOffset = 0;
      for (const para of paragraphs) {
        if (!para.trim()) { charOffset += para.length + 1; continue; }
        const paraStart = charOffset;
        const paraEnd = charOffset + para.length;
        let currentX = MARGIN;
        ensureSpace(size * 1.4);
        let runCharPos = 0;
        for (const run of runs) {
          const runEnd = runCharPos + run.text.length;
          // Check if this run overlaps with the current paragraph.
          const overlapStart = Math.max(runCharPos, paraStart);
          const overlapEnd = Math.min(runEnd, paraEnd);
          if (overlapStart < overlapEnd) {
            const text = safeContent.slice(overlapStart, overlapEnd);
            const fontStyle = run.bold && run.italic
              ? 'bolditalic'
              : run.bold ? 'bold' : run.italic ? 'italic' : 'normal';
            pdf.setFontSize(size);
            pdf.setFont('times', fontStyle);
            // Word-wrap within the remaining line width.
            const availW = CONTENT_W - (currentX - MARGIN);
            const wrapped = pdf.splitTextToSize(text, availW) as string[];
            for (let li = 0; li < wrapped.length; li++) {
              if (li > 0) {
                // Wrap to next line.
                y += size * 1.4;
                ensureSpace(size * 1.4);
                currentX = MARGIN;
              }
              pdf.text(wrapped[li], currentX, y);
              currentX += pdf.getStringUnitWidth(wrapped[li]) * size;
            }
          }
          runCharPos = runEnd;
        }
        y += size * 1.4;
        charOffset = paraEnd + 1; // +1 for the \n
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
      // CONT'D tracking is scoped to a chapter — a new chapter always
      // starts with a fresh speaker cue, even if the prior chapter
      // ended on the same character's dialogue.
      let previousSpeakerId: string | null = null;
      for (const block of exportableBlocks(chapter, input.blocks)) {
        for (const part of flatten(block, input.characters, previousSpeakerId)) {
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
            writeRichBlock(block, BODY_FONT_SIZE);
            y += LINE_H * 0.3;
            break; // writeRichBlock handles the full block content; skip remaining flat parts.
          }
        }
        previousSpeakerId = nextSpeakerId(block);
      }
    }

    return pdf.output('blob');
  },
};
