import type { Block, Character, DialogueMetadata, DialogueStyle } from '@/types';
import {
  contentToRuns,
  exportableBlocks,
  formatDialogueProse,
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
      // Wrap the full content as a single styled paragraph so the quote
      // marks live inside the paragraph, not around each soft line.
      const wrapped = formatDialogueProse(block.content, dialogueStyle);
      if (!wrapped) return '';
      // Preserve inline bold/italic marks inside the wrapped text by
      // splicing the mark-aware HTML between the wrapper's prefix and
      // suffix. For dash-style there's no suffix; for quote styles we
      // peel one char off each end.
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
      void wrapped;
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

function chapterXhtml(title: string, bodyInner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <title>${esc(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
  </head>
  <body>
    <h1>${esc(title)}</h1>
    ${bodyInner}
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
`;

function contentOpf(
  title: string,
  author: string,
  synopsis: string,
  bookId: string,
  chapterFiles: string[],
  modified: string,
): string {
  const manifestItems = chapterFiles
    .map(
      (f, i) =>
        `    <item id="chap${i + 1}" href="${f}" media-type="application/xhtml+xml"/>`,
    )
    .join('\n');
  const spineItems = chapterFiles
    .map((_, i) => `    <itemref idref="chap${i + 1}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:${esc(bookId)}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    <dc:creator>${esc(author || 'Unknown')}</dc:creator>
    <dc:language>en</dc:language>
    <dc:date>${modified.slice(0, 10)}</dc:date>${synopsis ? `\n    <dc:description>${esc(synopsis)}</dc:description>` : ''}
    <dc:rights>All rights reserved</dc:rights>
    <meta property="dcterms:modified">${modified}</meta>
    <meta property="rendition:layout">reflowable</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles.css" media-type="text/css"/>
${manifestItems}
  </manifest>
  <spine>
    <itemref idref="nav" linear="no"/>
${spineItems}
  </spine>
</package>`;
}

function navXhtml(title: string, chapters: Array<{ file: string; title: string }>): string {
  const items = chapters
    .map((c) => `        <li><a href="${c.file}">${esc(c.title)}</a></li>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
  <head>
    <title>${esc(title)}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
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

  // Generate a text-based cover page from the document title + author.
  const coverHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head><title>Cover</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
  <body style="display:flex;align-items:center;justify-content:center;min-height:90vh;text-align:center;">
    <div>
      <h1 style="font-size:2.4em;margin-bottom:0.5em;">${esc(input.document.title || 'Untitled')}</h1>
      ${input.document.author ? `<p style="font-size:1.2em;font-style:italic;">${esc(input.document.author)}</p>` : ''}
    </div>
  </body>
</html>`;
  zip.file('OEBPS/cover.xhtml', coverHtml);

  const sortedChapters = input.chapters.slice().sort((a, b) => a.order - b.order);
  const chapterFiles: Array<{ file: string; title: string }> = [
    { file: 'cover.xhtml', title: 'Cover' },
  ];

  const dialogueStyle = resolveDialogueStyle(input.document);
  sortedChapters.forEach((chapter, i) => {
    const filename = `chapter-${i + 1}.xhtml`;
    const bodyInner = exportableBlocks(chapter, input.blocks)
      .map((b) => renderBlockXhtml(b, input.characters, dialogueStyle))
      .filter((x) => x.trim().length > 0)
      .join('\n      ');
    zip.file(`OEBPS/${filename}`, chapterXhtml(chapter.title, bodyInner));
    chapterFiles.push({ file: filename, title: chapter.title });
  });

  zip.file(
    'OEBPS/nav.xhtml',
    navXhtml(input.document.title || 'Untitled', chapterFiles),
  );

  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  zip.file(
    'OEBPS/content.opf',
    contentOpf(
      input.document.title || 'Untitled',
      input.document.author || '',
      input.document.synopsis || '',
      crypto.randomUUID(),
      chapterFiles.map((c) => c.file),
      modified,
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
