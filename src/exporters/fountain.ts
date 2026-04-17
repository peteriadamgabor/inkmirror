import type { Block, Character, DialogueMetadata, SceneMetadata } from '@/types';
import {
  contentToRuns,
  exportableBlocks,
  speakerNameFor,
  textBlob,
  type Exporter,
  type ExportInput,
} from './index';

function renderInline(block: Block): string {
  return contentToRuns(block.content, block.marks)
    .map((run) => {
      let t = run.text;
      if (run.italic) t = `*${t}*`;
      if (run.bold) t = `**${t}**`;
      return t;
    })
    .join('');
}

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

function speakerCue(
  data: DialogueMetadata,
  characters: readonly Character[],
): string {
  // Fountain cues are ALL CAPS with a 'SPEAKER' fallback when no
  // character is assigned to the block.
  return (speakerNameFor(data, characters) ?? 'SPEAKER').toUpperCase();
}

interface FountainContext {
  characters: readonly Character[];
  /** Speaker id of the previous dialogue block in the same chapter, if any. */
  previousSpeakerId: string | null;
}

function renderBlock(block: Block, ctx: FountainContext): string | null {
  switch (block.type) {
    case 'note':
      // Notes never reach renderBlock once the caller filters with
      // exportableBlocks(); kept defensively so a future refactor
      // doesn't silently leak notes into the .fountain output.
      return null;
    case 'scene': {
      const md = block.metadata.type === 'scene' ? (block.metadata.data as SceneMetadata) : null;
      const heading = sceneHeading(md);
      const body = renderInline(block);
      return body.trim() ? `${heading}\n\n${body}` : heading;
    }
    case 'dialogue': {
      const data =
        block.metadata.type === 'dialogue' ? (block.metadata.data as DialogueMetadata) : null;
      if (!data) return renderInline(block);
      const baseName = speakerCue(data, ctx.characters);
      const isContinuation =
        !!data.speaker_id && data.speaker_id === ctx.previousSpeakerId;
      const cue = isContinuation ? `${baseName} (CONT'D)` : baseName;
      const parenthetical = data.parenthetical?.trim();
      const lines: string[] = [cue];
      if (parenthetical) lines.push(`(${parenthetical})`);
      lines.push(renderInline(block));
      return lines.join('\n');
    }
    case 'text':
    default:
      return renderInline(block);
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
    // Use exportableBlocks() so note blocks are stripped *before* the
    // CONT'D tracker sees them — otherwise a note between two same-
    // speaker dialogue blocks would falsely reset previousSpeakerId
    // and suppress the (CONT'D) marker that should appear.
    const blocks = exportableBlocks(chapter, input.blocks);
    for (const block of blocks) {
      const rendered = renderBlock(block, ctx);
      if (rendered !== null && rendered.trim().length > 0) {
        parts.push(rendered, '');
      }
      // Update the CONT'D tracker. Dialogue blocks set the previous id;
      // any non-dialogue exportable block (scene, text) clears it so
      // a later dialogue line still gets a fresh cue.
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
