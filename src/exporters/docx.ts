import type { Block, DialogueMetadata, SceneMetadata } from '@/types';
import { exportableBlocks, type Exporter, type ExportInput } from './index';

// Narrow structural types — avoid importing docx types at module load time
// so the library stays in a dynamic chunk.
type DocxMods = typeof import('docx');

function sceneHeaderText(md: SceneMetadata | null): string {
  if (!md) return '';
  const parts: string[] = [];
  if (md.location) parts.push(md.location);
  if (md.time) parts.push(md.time);
  if (md.mood) parts.push(`(${md.mood})`);
  return parts.join(' — ');
}

function blockParagraphs(
  docx: DocxMods,
  block: Block,
): InstanceType<DocxMods['Paragraph']>[] {
  const { Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
  const out: InstanceType<DocxMods['Paragraph']>[] = [];
  const splitLines = (s: string) => s.split(/\n/).filter((l) => l.length > 0);

  switch (block.type) {
    case 'scene': {
      const md = block.metadata.type === 'scene' ? (block.metadata.data as SceneMetadata) : null;
      const header = sceneHeaderText(md);
      if (header) {
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 120 },
            children: [new TextRun({ text: header, italics: true })],
          }),
        );
      }
      for (const line of splitLines(block.content)) {
        out.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun(line)],
          }),
        );
      }
      break;
    }
    case 'dialogue': {
      const md =
        block.metadata.type === 'dialogue' ? (block.metadata.data as DialogueMetadata) : null;
      const speaker = md?.speaker_name?.trim();
      if (speaker) {
        out.push(
          new Paragraph({
            spacing: { before: 120 },
            children: [new TextRun({ text: speaker, bold: true, smallCaps: true })],
          }),
        );
      }
      for (const line of splitLines(block.content)) {
        out.push(
          new Paragraph({
            indent: { left: 720 },
            spacing: { after: 120 },
            children: [new TextRun(line)],
          }),
        );
      }
      break;
    }
    case 'text':
    default: {
      for (const line of splitLines(block.content)) {
        out.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun(line)],
          }),
        );
      }
      break;
    }
  }

  // Suppress unused imports warning from strict TS.
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
        children: [new TextRun(input.document.title || 'Untitled')],
      }),
    );
    if (input.document.author) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 480 },
          children: [new TextRun({ text: input.document.author, italics: true })],
        }),
      );
    }

    const sortedChapters = input.chapters.slice().sort((a, b) => a.order - b.order);
    for (const chapter of sortedChapters) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: true,
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 240 },
          children: [new TextRun(chapter.title)],
        }),
      );
      for (const block of exportableBlocks(chapter, input.blocks)) {
        if (block.content.trim().length === 0 && block.type !== 'scene') continue;
        children.push(...blockParagraphs(docx, block));
      }
    }

    const doc = new Document({
      creator: input.document.author || 'StoryForge',
      title: input.document.title || 'Untitled',
      description: input.document.synopsis || '',
      styles: {
        default: {
          document: {
            run: { font: 'Georgia', size: 24 },
            paragraph: { spacing: { line: 360 } },
          },
        },
      },
      sections: [{ children }],
    });

    return Packer.toBlob(doc);
  },
};
