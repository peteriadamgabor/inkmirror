import type { Block, DialogueMetadata, SceneMetadata } from '@/types';
import { visibleChapterBlocks, type Exporter, type ExportInput } from './index';

// Fountain spec: https://fountain.io/syntax
// - Scene headings start with INT. or EXT. (or I/E.) in ALL CAPS
// - Character names are ALL CAPS lines followed immediately by dialogue
// - Action lines are plain paragraphs
// - Title page uses "Key: Value" at the top

function sceneHeading(md: SceneMetadata | null): string {
  const location = md?.location?.trim().toUpperCase() || 'SCENE';
  const time = md?.time?.trim().toUpperCase();
  // Default to INT. since we have no indoor/outdoor metadata yet.
  return time ? `INT. ${location} - ${time}` : `INT. ${location}`;
}

function renderBlock(block: Block): string | null {
  switch (block.type) {
    case 'note':
      return null;
    case 'scene': {
      const md = block.metadata.type === 'scene' ? (block.metadata.data as SceneMetadata) : null;
      const heading = sceneHeading(md);
      return block.content.trim() ? `${heading}\n\n${block.content}` : heading;
    }
    case 'dialogue': {
      const md =
        block.metadata.type === 'dialogue' ? (block.metadata.data as DialogueMetadata) : null;
      const speaker = (md?.speaker_name?.trim() || 'SPEAKER').toUpperCase();
      return `${speaker}\n${block.content}`;
    }
    case 'text':
    default:
      return block.content;
  }
}

export const fountainExporter: Exporter = {
  format: 'fountain',
  label: 'Fountain',
  extension: 'fountain',
  mimeType: 'text/plain',
  run(input: ExportInput): string {
    const parts: string[] = [];
    const doc = input.document;
    // Title page
    parts.push(
      `Title: ${doc.title || 'Untitled'}`,
      `Author: ${doc.author || ''}`,
      '',
    );

    const sortedChapters = input.chapters.slice().sort((a, b) => a.order - b.order);
    for (const chapter of sortedChapters) {
      // Chapter title as a section header (Fountain extension, widely supported)
      parts.push(`# ${chapter.title}`, '');
      const blocks = visibleChapterBlocks(chapter, input.blocks);
      for (const block of blocks) {
        const rendered = renderBlock(block);
        if (rendered !== null && rendered.trim().length > 0) {
          parts.push(rendered, '');
        }
      }
    }

    return parts.join('\n');
  },
};
