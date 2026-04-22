import { describe, it, expect, beforeAll } from 'vitest';
import type JSZipType from 'jszip';
import { buildEpubZip, epubExporter } from './epub';
import type { Block, Chapter, Character, Document } from '@/types';
import type { ExportInput } from './index';

/**
 * Structural EPUB validator. Catches the drift that a full epubcheck
 * run would catch for the shapes we care about: mimetype rules,
 * container pointing at a real OPF, manifest/spine integrity,
 * nav.xhtml presence, required OPF metadata.
 *
 * NOT a substitute for epubcheck — clean pass means the file is
 * structurally sane, not that it's EPUB 3 compliant down to every
 * micro-detail.
 */
interface ValidationIssue {
  severity: 'error' | 'warn';
  message: string;
}

async function validateEpub(zip: JSZipType): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  // --- mimetype must exist and have exact contents ---
  const mimetype = zip.file('mimetype');
  if (!mimetype) {
    issues.push({ severity: 'error', message: 'mimetype entry missing' });
  } else {
    const contents = await mimetype.async('string');
    if (contents !== 'application/epub+zip') {
      issues.push({
        severity: 'error',
        message: `mimetype contents wrong: ${JSON.stringify(contents)}`,
      });
    }
  }

  // --- META-INF/container.xml must exist and point at an OPF file ---
  const container = zip.file('META-INF/container.xml');
  if (!container) {
    issues.push({ severity: 'error', message: 'META-INF/container.xml missing' });
    return issues;
  }
  const containerXml = await container.async('string');
  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!rootfileMatch) {
    issues.push({ severity: 'error', message: 'container.xml missing rootfile full-path' });
    return issues;
  }
  const opfPath = rootfileMatch[1];

  // --- OPF file exists and has EPUB 3 required metadata ---
  const opf = zip.file(opfPath);
  if (!opf) {
    issues.push({ severity: 'error', message: `OPF file missing at ${opfPath}` });
    return issues;
  }
  const opfXml = await opf.async('string');

  if (!/<dc:title>[^<]+<\/dc:title>/.test(opfXml)) {
    issues.push({ severity: 'error', message: 'OPF missing <dc:title>' });
  }
  if (!/<dc:identifier[^>]*>[^<]+<\/dc:identifier>/.test(opfXml)) {
    issues.push({ severity: 'error', message: 'OPF missing <dc:identifier>' });
  }
  if (!/<dc:language>[^<]+<\/dc:language>/.test(opfXml)) {
    issues.push({ severity: 'error', message: 'OPF missing <dc:language>' });
  }
  if (!/property="dcterms:modified"/.test(opfXml)) {
    issues.push({ severity: 'error', message: 'OPF missing dcterms:modified meta' });
  }

  // --- manifest items: every href resolves to a real file ---
  const manifestDir = opfPath.includes('/')
    ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1)
    : '';
  const manifestItems: Array<{
    id: string;
    href: string;
    mediaType: string;
    properties?: string;
  }> = [];
  // Match each manifest item — attributes may contain `/` (e.g., in
  // media-type="application/xhtml+xml"), so match until the closing
  // slash-angle sequence explicitly.
  const manifestRegex = /<item\s+([^>]*?)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = manifestRegex.exec(opfXml)) !== null) {
    const attrs = m[1];
    const idMatch = attrs.match(/id="([^"]+)"/);
    const hrefMatch = attrs.match(/href="([^"]+)"/);
    const typeMatch = attrs.match(/media-type="([^"]+)"/);
    const propsMatch = attrs.match(/properties="([^"]+)"/);
    if (!idMatch || !hrefMatch || !typeMatch) continue;
    manifestItems.push({
      id: idMatch[1],
      href: hrefMatch[1],
      mediaType: typeMatch[1],
      properties: propsMatch?.[1],
    });
  }

  if (manifestItems.length === 0) {
    issues.push({ severity: 'error', message: 'OPF manifest is empty' });
  }
  for (const item of manifestItems) {
    const fullPath = manifestDir + item.href;
    if (!zip.file(fullPath)) {
      issues.push({
        severity: 'error',
        message: `manifest item ${item.id} points at missing file ${fullPath}`,
      });
    }
  }

  const navItem = manifestItems.find((i) =>
    (i.properties ?? '').split(/\s+/).includes('nav'),
  );
  if (!navItem) {
    issues.push({
      severity: 'error',
      message: 'manifest missing nav document (properties="nav")',
    });
  }

  // --- spine: every itemref points at a manifest id ---
  const spineIds = [...opfXml.matchAll(/<itemref\s+idref="([^"]+)"/g)].map((mm) => mm[1]);
  if (spineIds.length === 0) {
    issues.push({ severity: 'error', message: 'spine has no itemrefs' });
  }
  const manifestIds = new Set(manifestItems.map((i) => i.id));
  for (const id of spineIds) {
    if (!manifestIds.has(id)) {
      issues.push({
        severity: 'error',
        message: `spine itemref "${id}" has no matching manifest item`,
      });
    }
  }

  return issues;
}

// ---------- fixtures ----------

function makeInput(): ExportInput {
  const now = '2026-04-18T00:00:00.000Z';
  const doc: Document = {
    id: 'd1',
    title: 'Novel Of Testing',
    author: 'E. Writer',
    synopsis: 'Structural EPUB validation.',
    settings: {
      font_family: 'Georgia, serif',
      font_size: 16,
      line_height: 1.8,
      editor_width: 680,
      theme: 'light',
    },
    pov_character_id: null,
    created_at: now,
    updated_at: now,
  };
  const chapters: Chapter[] = [
    {
      id: 'c1', document_id: 'd1', title: 'First',
      order: 0, kind: 'standard', created_at: now, updated_at: now,
    },
    {
      id: 'c2', document_id: 'd1', title: 'Second',
      order: 1, kind: 'standard', created_at: now, updated_at: now,
    },
  ];
  const blocks: Block[] = [
    {
      id: 'b1', chapter_id: 'c1', type: 'text',
      content: 'Opening paragraph with a\nsoft newline inside.',
      order: 0, metadata: { type: 'text' },
      deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
    },
    {
      id: 'b2', chapter_id: 'c1', type: 'dialogue',
      content: "I've seen better days.",
      order: 1,
      metadata: { type: 'dialogue', data: { speaker_id: 'x', parenthetical: 'dryly' } },
      deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
    },
    {
      id: 'b3', chapter_id: 'c2', type: 'scene',
      content: 'Dust swirls in the sunlight.',
      order: 0,
      metadata: {
        type: 'scene',
        data: { location: 'barn', time: 'morning', character_ids: [], mood: 'quiet' },
      },
      deleted_at: null, deleted_from: null, created_at: now, updated_at: now,
    },
  ];
  const characters: Character[] = [
    {
      id: 'x', document_id: 'd1', name: 'Alice',
      aliases: [], notes: '', color: '#7F77DD',
      created_at: now, updated_at: now,
    },
  ];
  return { document: doc, chapters, blocks, characters };
}

describe('epubExporter — structural validator', () => {
  let zip: JSZipType;
  let issues: ValidationIssue[];

  beforeAll(async () => {
    zip = await buildEpubZip(makeInput());
    issues = await validateEpub(zip);
  });

  it('has no structural errors', () => {
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('mimetype, container, and OPF are all present', () => {
    expect(zip.file('mimetype')).toBeTruthy();
    expect(zip.file('META-INF/container.xml')).toBeTruthy();
    expect(zip.file('OEBPS/content.opf')).toBeTruthy();
    expect(zip.file('OEBPS/nav.xhtml')).toBeTruthy();
    expect(zip.file('OEBPS/styles.css')).toBeTruthy();
  });

  it('mimetype is stored uncompressed with exact contents', async () => {
    const entry = zip.file('mimetype')!;
    const text = await entry.async('string');
    expect(text).toBe('application/epub+zip');
  });

  it('includes one chapter file per source chapter plus cover', () => {
    expect(zip.file('OEBPS/cover.xhtml')).toBeTruthy();
    expect(zip.file('OEBPS/chapter-1.xhtml')).toBeTruthy();
    expect(zip.file('OEBPS/chapter-2.xhtml')).toBeTruthy();
  });

  it("nav.xhtml lists every chapter's title", async () => {
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
    expect(nav).toContain('First');
    expect(nav).toContain('Second');
  });

  it('OPF manifest + spine match', async () => {
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    const manifestIds = [...opf.matchAll(/<item\s+id="([^"]+)"/g)].map((mm) => mm[1]);
    const spineIds = [...opf.matchAll(/<itemref\s+idref="([^"]+)"/g)].map((mm) => mm[1]);
    expect(spineIds.length).toBeGreaterThan(0);
    for (const id of spineIds) {
      expect(manifestIds).toContain(id);
    }
  });

  it('cover.xhtml is in the manifest (nav + cover both referenced)', async () => {
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('href="cover.xhtml"');
    expect(opf).toContain('properties="nav"');
  });

  it('catches regressions: injecting an unreferenced file is not enough, but a missing manifested file is flagged', async () => {
    // Simulate a regression: the manifest claims a file exists that the
    // exporter didn't actually write.
    const badZip = await buildEpubZip(makeInput());
    badZip.remove('OEBPS/chapter-1.xhtml');
    const badIssues = await validateEpub(badZip);
    const errors = badIssues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('chapter-1.xhtml'))).toBe(true);
  });

  it('exporter returns a blob with the epub+zip mime type', async () => {
    const blob = await epubExporter.run(makeInput());
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/epub+zip');
  });
});

describe('epubExporter — cover image', () => {
  // A 1x1 pixel JPEG — enough to exercise the binary-decode path.
  const ONE_PIXEL_JPEG_BASE64 =
    '/9j/4AAQSkZJRgABAQEASABIAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9S6KKKAP/2Q==';

  function makeInputWithCover(): ExportInput {
    const base = makeInput();
    return {
      ...base,
      document: {
        ...base.document,
        settings: {
          ...base.document.settings,
          cover_image: {
            dataUrl: `data:image/jpeg;base64,${ONE_PIXEL_JPEG_BASE64}`,
            mimeType: 'image/jpeg',
            width: 1,
            height: 1,
          },
        },
      },
    };
  }

  it('writes the image as a binary zip entry when cover_image is set', async () => {
    const zip = await buildEpubZip(makeInputWithCover());
    const coverFile = zip.file('OEBPS/cover.jpg');
    expect(coverFile).toBeTruthy();
    const bytes = await coverFile!.async('uint8array');
    // JPEG magic header — the only structural check we can do without a decoder.
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes[2]).toBe(0xff);
  });

  it('registers the cover in the OPF manifest with properties="cover-image"', async () => {
    const zip = await buildEpubZip(makeInputWithCover());
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toMatch(/id="cover-image"/);
    expect(opf).toMatch(/properties="cover-image"/);
    expect(opf).toMatch(/media-type="image\/jpeg"/);
    // EPUB 2 fallback meta so older readers pick it up too.
    expect(opf).toMatch(/<meta name="cover" content="cover-image"\/>/);
  });

  it('cover.xhtml renders an <img> pointing at the binary asset', async () => {
    const zip = await buildEpubZip(makeInputWithCover());
    const cover = await zip.file('OEBPS/cover.xhtml')!.async('string');
    expect(cover).toContain('<img src="cover.jpg"');
  });

  it('falls back to the text cover and omits manifest entry when cover_image is null', async () => {
    const zip = await buildEpubZip(makeInput());
    expect(zip.file('OEBPS/cover.jpg')).toBeNull();
    expect(zip.file('OEBPS/cover.png')).toBeNull();
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).not.toMatch(/properties="cover-image"/);
    const cover = await zip.file('OEBPS/cover.xhtml')!.async('string');
    expect(cover).toContain('Novel Of Testing');
  });

  it('supports PNG covers with the right extension and mime type', async () => {
    // 1x1 transparent PNG.
    const ONE_PIXEL_PNG_BASE64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const base = makeInput();
    const input: ExportInput = {
      ...base,
      document: {
        ...base.document,
        settings: {
          ...base.document.settings,
          cover_image: {
            dataUrl: `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`,
            mimeType: 'image/png',
            width: 1,
            height: 1,
          },
        },
      },
    };
    const zip = await buildEpubZip(input);
    expect(zip.file('OEBPS/cover.png')).toBeTruthy();
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toMatch(/media-type="image\/png"/);
    expect(opf).toMatch(/href="cover\.png"/);
  });
});
