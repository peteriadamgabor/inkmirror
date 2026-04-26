import type { Exporter, ExportFormat, ExportInput } from './index';
import { downloadBlob, sanitizeFilename } from './index';

export interface ExporterDescriptor {
  format: ExportFormat;
  label: string;
  extension: string;
}

/**
 * Static metadata for the export menu — knowing the label/extension
 * doesn't require pulling in the heavy exporter (jspdf, docx, jszip).
 *
 * Markdown / JSON / Fountain are bundled-text formats, but we still
 * lazy-load them through the same path so there is exactly one code
 * path to reason about.
 */
export const EXPORTER_DESCRIPTORS: readonly ExporterDescriptor[] = [
  { format: 'markdown', label: 'Markdown', extension: 'md' },
  { format: 'json',     label: 'JSON',     extension: 'json' },
  { format: 'fountain', label: 'Fountain', extension: 'fountain' },
  { format: 'epub',     label: 'EPUB',     extension: 'epub' },
  { format: 'docx',     label: 'DOCX',     extension: 'docx' },
  { format: 'pdf',      label: 'PDF',      extension: 'pdf' },
];

const cache = new Map<ExportFormat, Promise<Exporter>>();

function importerFor(format: ExportFormat): () => Promise<Exporter> {
  switch (format) {
    case 'markdown': return () => import('./markdown').then((m) => m.markdownExporter);
    case 'json':     return () => import('./json').then((m) => m.jsonExporter);
    case 'fountain': return () => import('./fountain').then((m) => m.fountainExporter);
    case 'epub':     return () => import('./epub').then((m) => m.epubExporter);
    case 'docx':     return () => import('./docx').then((m) => m.docxExporter);
    case 'pdf':      return () => import('./pdf').then((m) => m.pdfExporter);
  }
}

/**
 * Lazy-load and cache an exporter's full module (with its heavy deps).
 * The first call for each format pays the import cost; subsequent calls
 * are instant.
 */
export function loadExporter(format: ExportFormat): Promise<Exporter> {
  let p = cache.get(format);
  if (!p) {
    p = importerFor(format)();
    cache.set(format, p);
  }
  return p;
}

export interface RunExportResult {
  ok: boolean;
  /** Filled when ok=false; the human-readable reason for the toast. */
  error?: string;
  /** Filled when ok=true; the resolved descriptor (for the success toast). */
  descriptor?: ExporterDescriptor;
}

/**
 * Resolve `format` to its module, run the export, and download the blob.
 * Returns success/failure metadata so callers can toast in their own
 * voice (the i18n key differs between Sidebar and CommandPalette).
 */
export async function runExportByFormat(
  format: ExportFormat,
  input: ExportInput,
): Promise<RunExportResult> {
  const descriptor = EXPORTER_DESCRIPTORS.find((d) => d.format === format);
  if (!descriptor) return { ok: false, error: `Unknown format: ${format}` };
  try {
    const exporter = await loadExporter(format);
    const blob = await exporter.run(input);
    const name = sanitizeFilename(input.document.title);
    downloadBlob(blob, `${name}.${exporter.extension}`);
    return { ok: true, descriptor };
  } catch (err) {
    return {
      ok: false,
      descriptor,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
