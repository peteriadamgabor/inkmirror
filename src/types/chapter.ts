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
  /**
   * Whether exporters print this chapter's title. Unset means "follow
   * the kind's default": standard / acknowledgments / afterword print,
   * cover / dedication / epigraph don't.
   */
  export_title?: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
