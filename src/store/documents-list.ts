/**
 * Store-layer facade for the document-library surface the UI is allowed
 * to touch (DocumentPicker, DocumentSettings).
 *
 * Per CLAUDE.md the import rule is `ui/ → store/ → db/`. UI code must
 * not reach directly into `@/db/*` — it goes through this module so the
 * persistence internals can be reshaped without touching every component.
 * Exposes exactly the operations the picker/settings use: listing,
 * title-uniqueness checks, the create-document writes, and full deletion.
 */

export {
  listDocumentRows,
  isTitleTaken,
  saveDocument,
  saveChapter,
  saveBlock,
  deleteDocumentAllRows,
} from '@/db/repository';
export type { DocumentRow } from '@/db/connection';
