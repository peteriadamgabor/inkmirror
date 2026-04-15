import type { Block, Character, DialogueMetadata, SceneMetadata } from '@/types';
import { textBlob, visibleChapterBlocks, type Exporter, type ExportInput } from './index';

// Fountain spec: https://fountain.io/syntax
// - Scene headings start with INT. or EXT. (or I/E.) in ALL CAPS
// - Character names are ALL CAPS lines followed immediately by dialogue
// - Parentheticals go on their own line between speaker and dialogue
// - Consecutive same-speaker lines get (CONT'D) on the second cue
// - Action lines are plain paragraphs
// - Title page uses "Key: Value" at the top

function sceneHeading(md: SceneMetadata | null): string {
  const location = md?.location?.trim().toUpperCase() || 'SCENE';
  const time = md?.time?.trim().toUpperCase();
  return time ? `INT. ${location} - ${time}` : `INT. ${location}`;
}

function speakerNameFor(
  data: DialogueMetadata,
  characters: readonly Character[],
): string {
  if (!data.speaker_id) return 'SPEAKER';
  const c = characters.find((x) => x.id === data.speaker_id);
  return (c?.name ?? 'SPEAKER').toUpperCase();
}

interface FountainContext {
  characters: readonly Character[];
  /** Speaker id of the previous dialogue block in the same chapter, if any. */
  previousSpeakerId: string | null;
}

function renderBlock(block: Block, ctx: FountainContext): string | null {
  switch (block.type) {
    case 'note':
      return null;
    case 'scene': {
      const md = block.metadata.type === 'scene' ? (block.metadata.data as SceneMetadata) : null;
      const heading = sceneHeading(md);
      return block.content.trim() ? `${heading}\n\n${block.content}` : heading;
    }
    case 'dialogue': {
      const data =
        block.metadata.type === 'dialogue' ? (block.metadata.data as DialogueMetadata) : null;
      if (!data) return block.content;
      const baseName = speakerNameFor(data, ctx.characters);
      const isContinuation =
        !!data.speaker_id && data.speaker_id === ctx.previousSpeakerId;
      const cue = isContinuation ? `${baseName} (CONT'D)` : baseName;
      const parenthetical = data.parenthetical?.trim();
      const lines: string[] = [cue];
      if (parenthetical) lines.push(`(${parenthetical})`);
      lines.push(block.content);
      return lines.join('\n');
    }
    case 'text':
    default:
      return block.content;
  }
}

export function renderFountain(input: ExportInput): string {
  const parts: string[] = [];
  const doc = input.document;
  parts.push(
    `Title: ${doc.title || 'Untitled'}`,
    `Author: ${doc.author || ''}`,
    '',
  );

  const sortedChapters = input.chapters.slice().sort((a, b) => a.order - b.order);
  for (const chapter of sortedChapters) {
    parts.push(`# ${chapter.title}`, '');
    // CONT'D tracking resets at every chapter boundary.
    const ctx: FountainContext = {
      characters: input.characters,
      previousSpeakerId: null,
    };
    const blocks = visibleChapterBlocks(chapter, input.blocks);
    for (const block of blocks) {
      const rendered = renderBlock(block, ctx);
      if (rendered !== null && rendered.trim().length > 0) {
        parts.push(rendered, '');
      }
      // Update the CONT'D tracker. Dialogue blocks set the previous id;
      // any non-dialogue block clears it so a later dialogue line under
      // the same speaker still gets a fresh cue.
      if (block.type === 'dialogue' && block.metadata.type === 'dialogue') {
        ctx.previousSpeakerId = block.metadata.data.speaker_id || null;
      } else {
        ctx.previousSpeakerId = null;
      }
    }
  }

  return parts.join('\n');
}

export const fountainExporter: Exporter = {
  format: 'fountain',
  label: 'Fountain',
  extension: 'fountain',
  mimeType: 'text/plain',
  async run(input: ExportInput): Promise<Blob> {
    return textBlob(renderFountain(input), 'text/plain');
  },
};
