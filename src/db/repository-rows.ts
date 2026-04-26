/**
 * Pure converters between domain types (`Block`, `Chapter`, `Character`,
 * `Document`) and their on-disk row shapes. No I/O — these are reused
 * by every repository module and tested implicitly through the CRUD
 * functions that call them.
 */

import type { Block, Chapter, Character, Document, UUID } from '@/types';
import type {
  BlockRow,
  ChapterRow,
  CharacterRow,
  DocumentRow,
} from './connection';

export function blockToRow(b: Block, documentId: UUID): BlockRow {
  return {
    id: b.id,
    document_id: documentId,
    chapter_id: b.chapter_id,
    type: b.type,
    content: b.content,
    marks: b.marks,
    order_idx: b.order,
    metadata: b.metadata,
    deleted_at: b.deleted_at,
    deleted_from: b.deleted_from,
    created_at: b.created_at,
    updated_at: b.updated_at,
  };
}

export function rowToBlock(row: BlockRow): Block {
  const marks = Array.isArray(row.marks) ? (row.marks as Block['marks']) : undefined;
  const block: Block = {
    id: row.id,
    chapter_id: row.chapter_id,
    type: row.type as Block['type'],
    content: row.content,
    order: row.order_idx,
    metadata: row.metadata as Block['metadata'],
    deleted_at: row.deleted_at,
    deleted_from: row.deleted_from as Block['deleted_from'],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (marks && marks.length > 0) block.marks = marks;
  return block;
}

export function chapterToRow(c: Chapter): ChapterRow {
  return {
    id: c.id,
    document_id: c.document_id,
    title: c.title,
    order_idx: c.order,
    kind: c.kind,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

export function rowToChapter(r: ChapterRow): Chapter {
  return {
    id: r.id,
    document_id: r.document_id,
    title: r.title,
    order: r.order_idx,
    // Legacy rows (written before ChapterKind existed) default to standard.
    kind: (r.kind as Chapter['kind'] | undefined) ?? 'standard',
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function characterToRow(c: Character): CharacterRow {
  return {
    id: c.id,
    document_id: c.document_id,
    name: c.name,
    aliases: c.aliases,
    notes: c.notes,
    color: c.color,
    description: c.description,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

export function rowToCharacter(r: CharacterRow): Character {
  return {
    id: r.id,
    document_id: r.document_id,
    name: r.name,
    aliases: r.aliases,
    notes: r.notes,
    color: r.color,
    description: r.description,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function documentToRow(d: Document): DocumentRow {
  return {
    id: d.id,
    title: d.title,
    author: d.author,
    synopsis: d.synopsis,
    settings: d.settings,
    pov_character_id: d.pov_character_id,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

export function rowToDocument(r: DocumentRow): Document {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    synopsis: r.synopsis,
    settings: r.settings as Document['settings'],
    // Legacy rows (written before POV existed) read as null.
    pov_character_id: r.pov_character_id ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
