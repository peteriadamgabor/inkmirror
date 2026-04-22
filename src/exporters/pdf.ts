import type { Block, Character, DialogueMetadata, DialogueStyle } from '@/types';
import type { jsPDF } from 'jspdf';
import {
  contentToRuns,
  exportableBlocks,
  resolveDialogueStyle,
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

// Custom font name registered with jsPDF. The built-in 'times' uses
// WinAnsi encoding and can't render Hungarian ő/ű/Ő/Ű — jsPDF
// truncates the codepoint and writes the low byte as a fallback
// glyph (ő → Q, ű → q), which also corrupts width measurement and
// produces letter-spaced line wrapping. A bundled Unicode TTF fixes
// both symptoms at once.
const PDF_FONT = 'NotoSerif';
const FONT_VARIANTS: ReadonlyArray<{
  url: string;
  file: string;
  style: 'normal' | 'italic' | 'bold' | 'bolditalic';
}> = [
  { url: '/fonts/NotoSerif-Regular.ttf',    file: 'NotoSerif-Regular.ttf',    style: 'normal' },
  { url: '/fonts/NotoSerif-Italic.ttf',     file: 'NotoSerif-Italic.ttf',     style: 'italic' },
  { url: '/fonts/NotoSerif-Bold.ttf',       file: 'NotoSerif-Bold.ttf',       style: 'bold' },
  { url: '/fonts/NotoSerif-BoldItalic.ttf', file: 'NotoSerif-BoldItalic.ttf', style: 'bolditalic' },
];

let cachedFonts: Promise<ReadonlyArray<{ file: string; base64: string; style: string }>> | null = null;

function bytesToBase64(bytes: Uint8Array): string {
  // btoa takes a "binary string". Chunk to avoid "argument too long"
  // on large TTFs (~800 KB) where spreading the Uint8Array into
  // String.fromCharCode blows the call-stack in some runtimes.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function loadFonts(): Promise<ReadonlyArray<{ file: string; base64: string; style: string }>> {
  if (cachedFonts) return cachedFonts;
  cachedFonts = (async () => {
    const results = await Promise.all(
      FONT_VARIANTS.map(async (v) => {
        const res = await fetch(v.url);
        if (!res.ok) throw new Error(`Failed to fetch ${v.url}: ${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        return { file: v.file, base64: bytesToBase64(buf), style: v.style };
      }),
    );
    return results;
  })();
  try {
    return await cachedFonts;
  } catch (err) {
    cachedFonts = null; // don't cache failures — next export retries
    throw err;
  }
}

function registerFonts(
  pdf: jsPDF,
  fonts: ReadonlyArray<{ file: string; base64: string; style: string }>,
): void {
  for (const f of fonts) {
    pdf.addFileToVFS(f.file, f.base64);
    pdf.addFont(f.file, PDF_FONT, f.style);
  }
}

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

/**
 * Flattened, layout-ready piece for the PDF renderer. Novel-first shape:
 *
 * - `scene-break`    — centered `* * *` separator (scene metadata hidden)
 * - `dialogue`       — a single paragraph wrapped in the document's
 *                      chosen dialogue delimiters, with an optional
 *                      italic parenthetical prefix
 * - `p`              — plain prose paragraph (text blocks)
 */
interface FlatPart {
  kind: 'scene-break' | 'dialogue' | 'p';
  text: string;
  /** Parenthetical aside rendered in italics before the dialogue text. */
  parenthetical?: string;
}

function wrapDialogue(content: string, style: DialogueStyle): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  if (style === 'hu_dash') return `– ${trimmed}`;
  if (style === 'curly') return `“${trimmed}”`;
  return `"${trimmed}"`;
}

function flatten(
  block: Block,
  _characters: readonly Character[],
  dialogueStyle: DialogueStyle,
): FlatPart[] {
  switch (block.type) {
    case 'scene': {
      // Novel-first: ignore scene metadata in the visible output. The
      // scene block becomes a single scene-break mark; any prose the
      // writer typed into the scene block itself still renders as
      // paragraphs below the break.
      const parts: FlatPart[] = [{ kind: 'scene-break', text: '* * *' }];
      for (const p of clampBlockContent(block.content).split(/\n{2,}/)) {
        const t = p.trim();
        if (t) parts.push({ kind: 'p', text: t });
      }
      return parts;
    }
    case 'dialogue': {
      const data =
        block.metadata.type === 'dialogue' ? (block.metadata.data as DialogueMetadata) : null;
      const parenthetical = data?.parenthetical?.trim() || undefined;
      // Collapse soft newlines into spaces so the quote stays a single
      // paragraph in prose. Writers who want multi-paragraph dialogue
      // can just use two dialogue blocks.
      const collapsed = clampBlockContent(block.content)
        .replace(/\n+/g, ' ')
        .trim();
      if (!collapsed && !parenthetical) return [];
      return [
        {
          kind: 'dialogue',
          text: wrapDialogue(collapsed, dialogueStyle),
          parenthetical,
        },
      ];
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

/** Test-only export. Runtime callers go through `pdfExporter.run`. */
export const __test = { flatten, wrapDialogue };

export const pdfExporter: Exporter = {
  format: 'pdf',
  label: 'PDF',
  extension: 'pdf',
  mimeType: 'application/pdf',
  async run(input: ExportInput): Promise<Blob> {
    const [{ jsPDF }, fonts] = await Promise.all([import('jspdf'), loadFonts()]);
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    registerFonts(pdf, fonts);
    pdf.setFont(PDF_FONT, 'normal');

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
      pdf.setFont(PDF_FONT, opts.style ?? 'normal');
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
            pdf.setFont(PDF_FONT, fontStyle);
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
    const dialogueStyle = resolveDialogueStyle(input.document);
    for (const chapter of sortedChapters) {
      newPage();
      y = PAGE_H / 4;
      writeLines(chapter.title, { size: 22, style: 'bold', align: 'center' });
      y += LINE_H * 2;
      for (const block of exportableBlocks(chapter, input.blocks)) {
        const parts = flatten(block, input.characters, dialogueStyle);
        if (parts.length === 0) continue;
        for (const part of parts) {
          if (part.kind === 'scene-break') {
            y += LINE_H * 0.75;
            writeLines(part.text, {
              size: BODY_FONT_SIZE,
              align: 'center',
            });
            y += LINE_H * 0.75;
          } else if (part.kind === 'dialogue') {
            if (part.parenthetical) {
              writeLines(`(${part.parenthetical})`, {
                size: BODY_FONT_SIZE - 1,
                style: 'italic',
              });
            }
            // Dialogue rendered as a plain prose paragraph with quote
            // marks / dash prefix already included in part.text. No
            // bold/italic marks inside — those are handled by
            // writeRichBlock on text blocks; dialogue wrap dominates.
            writeLines(part.text, { size: BODY_FONT_SIZE });
            y += LINE_H * 0.3;
          } else {
            // Plain text paragraph — use the rich renderer so bold /
            // italic marks survive. writeRichBlock walks the whole
            // block's marks + content and ignores `part.text`, so we
            // only call it once per block, even if the block has
            // multiple paragraphs.
            writeRichBlock(block, BODY_FONT_SIZE);
            y += LINE_H * 0.3;
            break;
          }
        }
      }
    }

    return pdf.output('blob');
  },
};
