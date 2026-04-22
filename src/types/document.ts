import type { UUID, ISODateTime } from './ids';

/**
 * How dialogue blocks are wrapped when exported as prose (PDF / DOCX /
 * EPUB). Fountain is screenplay and ignores this.
 *
 * - `straight` — ASCII double quotes. Default, locale-agnostic.
 * - `curly`    — Typographic English quotes. `"…"`
 * - `hu_dash`  — Hungarian convention. En-dash prefix, no quotes.
 *                `– Nem maradhatok.`
 */
export type DialogueStyle = 'straight' | 'curly' | 'hu_dash';

export interface DocumentSettings {
  font_family: string;
  font_size: number;
  line_height: number;
  editor_width: number;
  theme: 'light' | 'dark' | 'system';
  /**
   * Per-document dialogue styling for prose exports. Optional on the
   * type so older documents stored before this field existed stay
   * valid without a schema migration; readers default to `'straight'`.
   */
  dialogue_style?: DialogueStyle;
}

export const DEFAULT_DIALOGUE_STYLE: DialogueStyle = 'straight';

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
