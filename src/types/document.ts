import type { UUID, ISODateTime } from './ids';

export interface DocumentSettings {
  font_family: string;
  font_size: number;
  line_height: number;
  editor_width: number;
  theme: 'light' | 'dark' | 'system';
}

export interface Document {
  id: UUID;
  title: string;
  author: string;
  synopsis: string;
  settings: DocumentSettings;
  /**
   * The point-of-view character, if any. Dialogue blocks whose speaker
   * matches this id render right-aligned (iMessage-style) so the reader's
   * eye can track "me" vs "them" at a glance.
   */
  pov_character_id: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
