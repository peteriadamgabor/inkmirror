import type { UUID, ISODateTime } from './ids';

export interface Character {
  id: UUID;
  document_id: UUID;
  name: string;
  aliases: string[];
  notes: string;
  color: string; // hex, user-chosen tag color
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
