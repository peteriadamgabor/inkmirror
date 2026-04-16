import { textBlob, type Exporter, type ExportInput } from './index';

interface JsonExport {
  format_version: 1;
  exported_at: string;
  document: {
    id: string;
    title: string;
    author: string;
    synopsis: string;
  };
  chapters: Array<{
    id: string;
    title: string;
    order: number;
    blocks: Array<{
      id: string;
      type: string;
      content: string;
      order: number;
      metadata: unknown;
    }>;
  }>;
  characters: Array<{
    id: string;
    name: string;
    aliases: string[];
    notes: string;
    color: string;
  }>;
}

export const jsonExporter: Exporter = {
  format: 'json',
  label: 'JSON',
  extension: 'json',
  mimeType: 'application/json',
  async run(input: ExportInput): Promise<Blob> {
    return textBlob(renderJson(input), 'application/json');
  },
};

export function renderJson(input: ExportInput): string {
    const payload: JsonExport = {
      format_version: 1,
      exported_at: new Date().toISOString(),
      document: {
        id: input.document.id,
        title: input.document.title,
        author: input.document.author,
        synopsis: input.document.synopsis,
      },
      chapters: input.chapters
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          order: chapter.order,
          blocks: input.blocks
            .filter((b) => b.chapter_id === chapter.id && b.type !== 'note' && b.deleted_at === null)
            .sort((a, b) => a.order - b.order)
            .map((b) => ({
              id: b.id,
              type: b.type,
              content: b.content,
              order: b.order,
              metadata: b.metadata,
              ...(b.marks && b.marks.length > 0 ? { marks: b.marks } : {}),
            })),
        })),
      characters: input.characters.map((c) => ({
        id: c.id,
        name: c.name,
        aliases: c.aliases,
        notes: c.notes,
        color: c.color,
      })),
    };
    return JSON.stringify(payload, null, 2);
}
