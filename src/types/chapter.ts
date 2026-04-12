import type { UUID, ISODateTime } from './ids';

export interface Chapter {
  id: UUID;
  document_id: UUID;
  title: string;
  order: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
