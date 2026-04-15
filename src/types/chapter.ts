import type { UUID, ISODateTime } from './ids';

export type ChapterKind =
  | 'standard'
  | 'cover'
  | 'dedication'
  | 'epigraph'
  | 'acknowledgments'
  | 'afterword';

export interface Chapter {
  id: UUID;
  document_id: UUID;
  title: string;
  order: number;
  kind: ChapterKind;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
