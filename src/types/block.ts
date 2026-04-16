import type { UUID, ISODateTime } from './ids';

export type BlockType = 'text' | 'dialogue' | 'scene' | 'note';

export interface DialogueMetadata {
  speaker_id: UUID;
  /**
   * Optional parenthetical aside like "(whispering)" or "(to Peter)".
   * Rendered as italic above the dialogue content and included in
   * every exporter (Fountain puts it on its own line between the
   * speaker cue and the line). Empty string = no aside.
   */
  parenthetical?: string;
}

export interface SceneMetadata {
  location: string;
  time: string;
  character_ids: UUID[];
  mood: string;
}

export interface NoteMetadata {
  color?: string;
}

export type BlockMetadata =
  | { type: 'text' }
  | { type: 'dialogue'; data: DialogueMetadata }
  | { type: 'scene'; data: SceneMetadata }
  | { type: 'note'; data: NoteMetadata };

export type MarkType = 'bold' | 'italic';

/**
 * Inline formatting range. Offsets are character positions into
 * `content`. `end` is exclusive. Marks are kept as a separate array so
 * `content` stays plain text — every downstream consumer (sentiment
 * analysis, character-mention detection, word count, full-text
 * search, export filename sanitizer) works without any awareness of
 * formatting.
 */
export interface Mark {
  type: MarkType;
  start: number;
  end: number;
}

export interface Block {
  id: UUID;
  chapter_id: UUID;
  type: BlockType;
  content: string;
  /** Optional inline formatting. Omitted when empty. */
  marks?: Mark[];
  order: number;
  metadata: BlockMetadata;
  deleted_at: ISODateTime | null;
  deleted_from: {
    chapter_id: UUID;
    chapter_title: string;
    position: number;
  } | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
