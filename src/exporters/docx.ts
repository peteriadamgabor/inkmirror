import type { Block, Character, DialogueMetadata, DialogueStyle } from '@/types';
import {
  contentToRuns,
  exportableBlocks,
  resolveDialogueStyle,
  type Exporter,
  type ExportInput,
} from './index';

// Narrow structural types — avoid importing docx types at module load time
// so the library stays in a dynamic chunk.
type DocxMods = typeof import('docx');

/**
 * Strip XML control chars (NUL, vertical tabs, etc.) that break some
 * OOXML readers and would never appear in legitimate prose. Defense-in-
 * depth — the docx library escapes structural markup itself, but it
 * does not strip code points that are illegal inside an XML 1.0 doc.
 */
function sanitizeXmlText(text: string): string {
  // Allowed: \t (\x09), \n (\x0A), \r (\x0D), and printable >= 0x20.
  // Strip everything else (including \x00–\x08, \x0B, \x0C, \x0E–\x1F).
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/**
 * Walk content+marks and return an array of "lines", where each line
 * is an array of TextRun instances with bold/italics set per run.
 * Splits runs on `\n` so soft line breaks within a block become
 * separate paragraphs in the DOCX output.
 */
function contentLinesAsRuns(
  docx: DocxMods,
  block: Block,
): InstanceType<DocxMods['TextRun']>[][] {
  const { TextRun } = docx;
  const runs = contentToRuns(block.content, block.marks);
  const lines: InstanceType<DocxMods['TextRun']>[][] = [[]];
  for (const run of runs) {
    const parts = run.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      const sanitized = sanitizeXmlText(part);
      if (sanitized.length > 0) {
        lines[lines.length - 1].push(
          new TextRun({ text: sanitized, bold: run.bold, italics: run.italic }),
        );
      }
    });
  }
  return lines.filter((l) => l.length > 0);
}

function blockParagraphs(
  docx: DocxMods,
  block: Block,
  _characters: readonly Character[],
  dialogueStyle: DialogueStyle,
): InstanceType<DocxMods['Paragraph']>[] {
  const { Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
  const out: InstanceType<DocxMods['Paragraph']>[] = [];

  switch (block.type) {
    case 'scene': {
      // Novel-first: render a centered `* * *` break. Metadata hidden.
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 240 },
          children: [new TextRun('* * *')],
        }),
      );
      break;
    }
    case 'dialogue': {
      const data =
        block.metadata.type === 'dialogue' ? (block.metadata.data as DialogueMetadata) : null;
      const parenthetical = data?.parenthetical?.trim();
      // Single paragraph: optional italic parenthetical prefix, then
      // the block's marked content wrapped in the chosen dialogue
      // delimiters. Soft line breaks inside the block are preserved
      // inside the same paragraph (the docx library converts \n in a
      // TextRun into a proper break).
      const wrapperPrefix =
        dialogueStyle === 'hu_dash' ? '– ' : dialogueStyle === 'curly' ? '“' : '"';
      const wrapperSuffix =
        dialogueStyle === 'hu_dash' ? '' : dialogueStyle === 'curly' ? '”' : '"';
      const children: InstanceType<DocxMods['TextRun']>[] = [];
      if (parenthetical) {
        children.push(
          new TextRun({
            text: `(${sanitizeXmlText(parenthetical)}) `,
            italics: true,
          }),
        );
      }
      children.push(new TextRun({ text: wrapperPrefix }));
      const runs = contentToRuns(block.content, block.marks);
      for (const r of runs) {
        const sanitized = sanitizeXmlText(r.text);
        if (!sanitized) continue;
        children.push(
          new TextRun({ text: sanitized, bold: r.bold, italics: r.italic }),
        );
      }
      children.push(new TextRun({ text: wrapperSuffix }));
      out.push(new Paragraph({ spacing: { after: 120 }, children }));
      break;
    }
    case 'text':
    default: {
      for (const runs of contentLinesAsRuns(docx, block)) {
        out.push(new Paragraph({ spacing: { after: 120 }, children: runs }));
      }
      break;
    }
  }

  void HeadingLevel;
  return out;
}

export const docxExporter: Exporter = {
  format: 'docx',
  label: 'DOCX',
  extension: 'docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  async run(input: ExportInput): Promise<Blob> {
    const docx = await import('docx');
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;

    const children: InstanceType<DocxMods['Paragraph']>[] = [];

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.TITLE,
        spacing: { before: 480, after: 120 },
        children: [new TextRun(sanitizeXmlText(input.document.title || 'Untitled'))],
      }),
    );
    if (input.document.author) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 480 },
          children: [
            new TextRun({
              text: sanitizeXmlText(input.document.author),
              italics: true,
            }),
          ],
        }),
      );
    }

    const sortedChapters = input.chapters.slice().sort((a, b) => a.order - b.order);
    const dialogueStyle = resolveDialogueStyle(input.document);
    for (const chapter of sortedChapters) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: true,
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 240 },
          children: [new TextRun(sanitizeXmlText(chapter.title))],
        }),
      );
      for (const block of exportableBlocks(chapter, input.blocks)) {
        if (block.content.trim().length === 0 && block.type !== 'scene') continue;
        children.push(
          ...blockParagraphs(docx, block, input.characters, dialogueStyle),
        );
      }
    }

    const doc = new Document({
      creator: input.document.author || 'InkMirror',
      title: input.document.title || 'Untitled',
      description: input.document.synopsis || '',
      styles: {
        default: {
          document: {
            run: { font: 'Georgia', size: 24 },
            paragraph: { spacing: { line: 360 } },
          },
          heading1: {
            run: { font: 'Georgia', size: 36, bold: true },
            paragraph: {
              spacing: { before: 240, after: 240 },
              alignment: AlignmentType.CENTER,
            },
          },
          heading2: {
            run: { font: 'Georgia', size: 28, bold: true },
            paragraph: { spacing: { before: 200, after: 120 } },
          },
          title: {
            run: { font: 'Georgia', size: 52, bold: true },
            paragraph: {
              spacing: { before: 480, after: 120 },
              alignment: AlignmentType.CENTER,
            },
          },
        },
        paragraphStyles: [
          {
            id: 'SceneHeading',
            name: 'Scene Heading',
            basedOn: 'Normal',
            next: 'Normal',
            run: { italics: true },
            paragraph: {
              spacing: { before: 240, after: 120 },
              alignment: AlignmentType.CENTER,
            },
          },
          {
            id: 'DialogueSpeaker',
            name: 'Dialogue Speaker',
            basedOn: 'Normal',
            next: 'Normal',
            run: { bold: true, smallCaps: true },
            paragraph: { spacing: { before: 120, after: 60 } },
          },
          {
            id: 'DialogueBody',
            name: 'Dialogue Body',
            basedOn: 'Normal',
            next: 'Normal',
            paragraph: {
              indent: { left: 720 },
              spacing: { after: 120 },
            },
          },
          {
            id: 'Parenthetical',
            name: 'Parenthetical',
            basedOn: 'Normal',
            next: 'Normal',
            run: { italics: true },
            paragraph: {
              indent: { left: 720 },
              spacing: { after: 60 },
            },
          },
        ],
      },
      sections: [{ children }],
    });

    return Packer.toBlob(doc);
  },
};
