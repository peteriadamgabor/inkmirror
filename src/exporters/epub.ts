import type { Block, Chapter, ChapterKind, Character, DialogueMetadata, DialogueStyle } from '@/types';
import { lang, t } from '@/i18n';
import {
  chapterKindOf,
  contentToRuns,
  exportableBlocks,
  orderChaptersForExport,
  resolveDialogueStyle,
  type Exporter,
  type ExportInput,
} from './index';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n      ');
}

function paragraphsWithMarks(block: Block): string {
  const runs = contentToRuns(block.content, block.marks);
  if (runs.length === 1 && !runs[0].bold && !runs[0].italic) {
    return paragraphs(block.content);
  }
  // Build inline HTML from runs, then split into <p> tags on double-newlines.
  let inline = '';
  for (const run of runs) {
    let t = esc(run.text).replace(/\n/g, '<br/>');
    if (run.italic) t = `<i>${t}</i>`;
    if (run.bold) t = `<b>${t}</b>`;
    inline += t;
  }
  return inline
    .split(/<br\/><br\/>/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${p}</p>`)
    .join('\n      ');
}

function renderBlockXhtml(
  block: Block,
  _characters: readonly Character[],
  dialogueStyle: DialogueStyle,
): string {
  switch (block.type) {
    case 'scene': {
      // Novel-first: hide metadata from the visible output. Location /
      // time / mood / cast still live in the editor and feed Plot
      // Timeline, but the reader only sees a centered scene break.
      return '<hr class="scene-break"/>';
    }
    case 'dialogue': {
      const data =
        block.metadata.type === 'dialogue' ? (block.metadata.data as DialogueMetadata) : null;
      const parenthetical = data?.parenthetical?.trim();
      // Empty dialogue renders nothing — same gate formatDialogueProse
      // used to apply before the mark-aware path replaced it.
      if (!block.content.trim()) return '';
      // Wrap the full content as a single styled paragraph so the quote
      // marks live inside the paragraph, not around each soft line.
      // Inline bold/italic marks survive because the mark-aware HTML is
      // spliced between the dialogue wrapper's prefix and suffix.
      const inline = inlineWithMarks(block);
      const dialogueInner =
        dialogueStyle === 'hu_dash'
          ? `– ${inline}`
          : dialogueStyle === 'curly'
            ? `“${inline}”`
            : `"${inline}"`;
      const parentheticalPrefix = parenthetical
        ? `<em>(${esc(parenthetical)})</em> `
        : '';
      return `<p class="dialogue">${parentheticalPrefix}${dialogueInner}</p>`;
    }
    case 'text':
    default:
      return paragraphsWithMarks(block);
  }
}

/**
 * Inline HTML for a block's content — single paragraph, no wrapping
 * `<p>` tags. Used when the block content has to be embedded inside a
 * surrounding wrapper (dialogue's quote marks or dash). Mark-aware;
 * soft line breaks become `<br/>`, double newlines become ` / ` so
 * the visible flow stays inside one paragraph.
 */
function inlineWithMarks(block: Block): string {
  const runs = contentToRuns(block.content, block.marks);
  let out = '';
  for (const run of runs) {
    let t = esc(run.text).replace(/\n{2,}/g, ' / ').replace(/\n/g, '<br/>');
    if (run.italic) t = `<i>${t}</i>`;
    if (run.bold) t = `<b>${t}</b>`;
    out += t;
  }
  return out;
}

function chapterXhtml(
  title: string,
  bodyInner: string,
  language: string,
  kind: ChapterKind,
): string {
  // Mirror the editor's treatment of non-standard kinds: block chrome
  // (here: the <h1> chapter heading) hidden, text centered. The title
  // survives for acknowledgments / afterword — readers expect the
  // back-matter label — while dedication / epigraph render just their
  // text. epub:type gives reading systems the landmark semantics.
  const showTitle =
    kind === 'standard' || kind === 'acknowledgments' || kind === 'afterword';
  const bodyClass = kind === 'standard' ? '' : ` class="matter ${kind}"`;
  const epubType = kind === 'standard' ? 'chapter' : kind;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(language)}">
  <head>
    <title>${esc(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
  </head>
  <body epub:type="${epubType}"${bodyClass}>
    ${showTitle ? `<h1>${esc(title)}</h1>\n    ` : ''}${bodyInner}
  </body>
</html>`;
}

const STYLES_CSS = `@namespace epub "http://www.idpf.org/2007/ops";
body { font-family: Georgia, serif; line-height: 1.6; padding: 0 1em; }
h1 { font-size: 1.6em; margin: 2em 0 1em; text-align: center; }
p { text-indent: 1.5em; margin: 0 0 0.5em; }
p:first-of-type, h1 + p, hr.scene-break + p { text-indent: 0; }
hr.scene-break { border: none; text-align: center; margin: 1.5em 0; }
hr.scene-break::before { content: "* * *"; letter-spacing: 0.5em; }
p.dialogue { text-indent: 1.5em; }
p.dialogue + p.dialogue { text-indent: 1.5em; }
body.matter { text-align: center; }
body.matter p { text-indent: 0; }
body.dedication, body.epigraph { padding-top: 25vh; font-style: italic; }
body.cover { padding-top: 20vh; font-size: 1.4em; }
`;

interface CoverAsset {
  /** Path inside the zip, relative to OEBPS, e.g. `cover.jpg`. */
  href: string;
  /** e.g. `image/jpeg` or `image/png`. */
  mimeType: string;
}

function contentOpf(
  title: string,
  author: string,
  synopsis: string,
  bookId: string,
  chapterFiles: string[],
  modified: string,
  coverAsset: CoverAsset | null,
  language: string,
): string {
  const manifestItems = chapterFiles
    .map(
      (f, i) =>
        `    <item id="chap${i + 1}" href="${f}" media-type="application/xhtml+xml"/>`,
    )
    .join('\n');
  const coverManifest = coverAsset
    ? `\n    <item id="cover-image" href="${esc(coverAsset.href)}" media-type="${esc(coverAsset.mimeType)}" properties="cover-image"/>`
    : '';
  const coverMeta = coverAsset
    ? '\n    <meta name="cover" content="cover-image"/>'
    : '';
  const spineItems = chapterFiles
    .map((_, i) => `    <itemref idref="chap${i + 1}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${esc(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:${esc(bookId)}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    <dc:creator>${esc(author || t('exporters.unknownAuthor'))}</dc:creator>
    <dc:language>${esc(language)}</dc:language>
    <dc:date>${modified.slice(0, 10)}</dc:date>${synopsis ? `\n    <dc:description>${esc(synopsis)}</dc:description>` : ''}
    <dc:rights>All rights reserved</dc:rights>
    <meta property="dcterms:modified">${modified}</meta>
    <meta property="rendition:layout">reflowable</meta>${coverMeta}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles.css" media-type="text/css"/>${coverManifest}
${manifestItems}
  </manifest>
  <spine>
    <itemref idref="nav" linear="no"/>
${spineItems}
  </spine>
</package>`;
}

function extensionForImageMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  return 'jpg'; // default to jpg for image/jpeg and anything unexpected
}

/**
 * Decode a `data:` URL's base64 payload into a Uint8Array suitable for
 * JSZip. Strips the MIME prefix; relies on the caller passing us a
 * well-formed data URL (the picker validates this on ingest).
 */
function decodeDataUrl(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return new Uint8Array();
  const base64 = dataUrl.slice(commaIdx + 1);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function navXhtml(
  title: string,
  chapters: Array<{ file: string; title: string }>,
  language: string,
): string {
  const items = chapters
    .map((c) => `        <li><a href="${c.file}">${esc(c.title)}</a></li>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(language)}">
  <head>
    <title>${esc(title)}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>${esc(t('exporters.contents'))}</h1>
      <ol>
${items}
      </ol>
    </nav>
  </body>
</html>`;
}

type JSZipInstance = import('jszip');

/**
 * Builds the JSZip instance for an EPUB. Exposed so tests can inspect
 * structure (mimetype, container, manifest/spine integrity) without
 * roundtripping through a Blob, which jsdom serializes unreliably.
 */
export async function buildEpubZip(input: ExportInput): Promise<JSZipInstance> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  // mimetype must be the first entry, uncompressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  zip.file('OEBPS/styles.css', STYLES_CSS);

  // Cover: if the writer picked a cover image, embed the binary and
  // render a cover.xhtml that just shows it. Otherwise fall back to the
  // text-only title card we've always shipped.
  const rawCover = input.document.settings.cover_image ?? null;
  let coverAsset: CoverAsset | null = null;
  if (rawCover) {
    const href = `cover.${extensionForImageMime(rawCover.mimeType)}`;
    const bytes = decodeDataUrl(rawCover.dataUrl);
    if (bytes.byteLength > 0) {
      zip.file(`OEBPS/${href}`, bytes);
      coverAsset = { href, mimeType: rawCover.mimeType };
    }
  }

  const language = lang();
  const dialogueStyle = resolveDialogueStyle(input.document);
  const sortedChapters = orderChaptersForExport(input.chapters);
  const coverTitle = t('exporters.cover');

  // A cover-*kind* chapter feeds the cover page instead of being
  // emitted as a separate spine entry next to the synthetic
  // cover.xhtml (which used to duplicate it). A picked cover *image*
  // still wins the cover page; the cover chapter is suppressed either
  // way — its text is the title/author the image already carries.
  const coverChapter =
    sortedChapters.find((c) => chapterKindOf(c) === 'cover') ?? null;
  const contentChapters = sortedChapters.filter((c) => c !== coverChapter);

  const coverChapterInner = coverChapter
    ? exportableBlocks(coverChapter, input.blocks)
        .map((b) => renderBlockXhtml(b, input.characters, dialogueStyle))
        .filter((x) => x.trim().length > 0)
        .join('\n      ')
    : '';

  const coverHtml = coverAsset
    ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(language)}">
  <head><title>${esc(coverTitle)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
  <body epub:type="cover" style="margin:0;padding:0;display:flex;align-items:center;justify-content:center;min-height:100vh;">
    <img src="${esc(coverAsset.href)}" alt="" style="max-width:100%;max-height:100vh;display:block;"/>
  </body>
</html>`
    : coverChapterInner
      ? chapterXhtml(coverChapter?.title || coverTitle, coverChapterInner, language, 'cover')
      : `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(language)}">
  <head><title>${esc(coverTitle)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
  <body epub:type="cover" style="display:flex;align-items:center;justify-content:center;min-height:90vh;text-align:center;">
    <div>
      <h1 style="font-size:2.4em;margin-bottom:0.5em;">${esc(input.document.title || t('common.untitled'))}</h1>
      ${input.document.author ? `<p style="font-size:1.2em;font-style:italic;">${esc(input.document.author)}</p>` : ''}
    </div>
  </body>
</html>`;
  zip.file('OEBPS/cover.xhtml', coverHtml);

  const chapterFiles: Array<{ file: string; title: string }> = [
    { file: 'cover.xhtml', title: coverTitle },
  ];

  // Standard chapters keep the historical chapter-N.xhtml numbering;
  // front/back matter files are named after their kind so the spine
  // reads like a book's binding order.
  let standardCount = 0;
  const kindCounts: Partial<Record<ChapterKind, number>> = {};
  const filenameFor = (chapter: Chapter): string => {
    const kind = chapterKindOf(chapter);
    if (kind === 'standard') {
      standardCount += 1;
      return `chapter-${standardCount}.xhtml`;
    }
    const n = (kindCounts[kind] ?? 0) + 1;
    kindCounts[kind] = n;
    return `${kind}-${n}.xhtml`;
  };

  for (const chapter of contentChapters) {
    const filename = filenameFor(chapter);
    const bodyInner = exportableBlocks(chapter, input.blocks)
      .map((b) => renderBlockXhtml(b, input.characters, dialogueStyle))
      .filter((x) => x.trim().length > 0)
      .join('\n      ');
    zip.file(
      `OEBPS/${filename}`,
      chapterXhtml(chapter.title, bodyInner, language, chapterKindOf(chapter)),
    );
    chapterFiles.push({ file: filename, title: chapter.title });
  }

  zip.file(
    'OEBPS/nav.xhtml',
    navXhtml(input.document.title || t('common.untitled'), chapterFiles, language),
  );

  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  zip.file(
    'OEBPS/content.opf',
    contentOpf(
      input.document.title || t('common.untitled'),
      input.document.author || '',
      input.document.synopsis || '',
      crypto.randomUUID(),
      chapterFiles.map((c) => c.file),
      modified,
      coverAsset,
      language,
    ),
  );

  return zip;
}

export const epubExporter: Exporter = {
  format: 'epub',
  label: 'EPUB',
  extension: 'epub',
  mimeType: 'application/epub+zip',
  async run(input: ExportInput): Promise<Blob> {
    const zip = await buildEpubZip(input);
    return zip.generateAsync({
      type: 'blob',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  },
};
