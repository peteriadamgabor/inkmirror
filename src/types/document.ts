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

/**
 * Image used as the EPUB cover. Stored inline as a base64 data URL to
 * keep the schema boring (everything lives inside the document row).
 * Omitted → EPUB falls back to the text-only cover page.
 */
export interface CoverImage {
  /** Full `data:image/<mime>;base64,…` URL — self-describing. */
  dataUrl: string;
  /** MIME type of the decoded image, e.g. `image/jpeg` or `image/png`. */
  mimeType: string;
  /** Natural width in pixels, captured at paste time for sanity logs. */
  width: number;
  /** Natural height in pixels, captured at paste time for sanity logs. */
  height: number;
}

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
  /**
   * Optional cover image used when the document is exported as EPUB.
   * Omitted → EPUB uses the text-only title-card fallback.
   */
  cover_image?: CoverImage | null;
}

export const DEFAULT_DIALOGUE_STYLE: DialogueStyle = 'straight';

/**
 * Hard cap on a cover image's decoded byte size. Cover art in retail
 * EPUBs is typically ~500 KB — anything past 2 MB is the writer
 * pasting a raw camera file and should be resized before ingest.
 */
export const COVER_IMAGE_MAX_BYTES = 2_097_152; // 2 MiB

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
