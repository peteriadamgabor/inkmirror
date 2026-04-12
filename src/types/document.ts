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
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
