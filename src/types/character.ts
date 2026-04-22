import type { UUID, ISODateTime } from './ids';

export interface Character {
  id: UUID;
  document_id: UUID;
  name: string;
  aliases: string[];
  notes: string;
  color: string; // hex, user-chosen tag color
  /**
   * Free-text description — who this character is in a sentence or two.
   * Surfaces on the Character profile page. Optional to keep older
   * documents (pre-2026-04-22) valid without a schema migration;
   * readers treat `undefined` as an empty string.
   */
  description?: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
