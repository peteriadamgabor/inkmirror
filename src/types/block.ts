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

export interface Block {
  id: UUID;
  chapter_id: UUID;
  type: BlockType;
  content: string;
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
