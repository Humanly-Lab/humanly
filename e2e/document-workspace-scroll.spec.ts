import { expect, test, type Page, type Route } from '@playwright/test';

const DOCUMENT_ID = 'demo-doc-workspace-scroll-e2e';
const DOCUMENT_TITLE = 'Workspace scroll regression';
const DOCUMENT_STORAGE_KEY = `humanly:demo-workspace:document:${DOCUMENT_ID}`;
const RULES_DISMISSAL_KEY = `humanly:writing-rules-dismissed:personal:${DOCUMENT_ID}`;
const PDF_PATH = '/__e2e__/workspace-scroll.pdf';

const DESKTOP_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
] as const;

function buildBlankPdf(pageCount: number): Buffer {
  const objects: string[] = [];
  const pageReferences: string[] = [];

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  for (let index = 0; index < pageCount; index += 1) {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    pageReferences.push(`${pageObject} 0 R`);
    objects[pageObject] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = '<< /Length 4 >>\nstream\nq\nQ\nendstream';
  }
  objects[2] =
    `<< /Type /Pages /Kids [${pageReferences.join(' ')}] ` +
    `/Count ${pageCount} >>`;

  let source = '%PDF-1.4\n% Humanly workspace regression fixture\n';
  const offsets = new Array<number>(objects.length).fill(0);
  for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
    offsets[objectNumber] = Buffer.byteLength(source, 'ascii');
    source += `${objectNumber} 0 obj\n${objects[objectNumber]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(source, 'ascii');
  source += `xref\n0 ${objects.length}\n`;
  source += '0000000000 65535 f \n';
  for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
    source += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`;
  }
  source +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(source, 'ascii');
}

function buildLexicalContent(paragraphCount: number) {
  const paragraphs = Array.from({ length: paragraphCount }, (_, index) => ({
    children: [
      {
        detail: 0,
        format: 0,
        mode: 'normal',
        style: '',
        text:
          `Paragraph ${index + 1}. This browser-local fixture is deliberately ` +
          'long enough to require internal editor scrolling.',
        type: 'text',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'paragraph',
    version: 1,
  }));

  return {
    root: {
      children: paragraphs,
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  };
}

function buildDemoRecord(pdfUrl: string) {
  const now = new Date().toISOString();
  const content = buildLexicalContent(90);
  const plainText = content.root.children
    .map((paragraph) => paragraph.children[0].text)
    .join('\n');

  return {
    document: {
      id: DOCUMENT_ID,
      userId: 'demo-user-local',
      title: DOCUMENT_TITLE,
      description: null,
      content,
      plainText,
      status: 'draft',
      version: 1,
      wordCount: plainText.trim().split(/\s+/).length,
      characterCount: plainText.length,
      finalTextCharacterCount: plainText.length,
      environmentConfig: {
        preset: 'default_writing',
        taskType: 'personal',
        instructions: {
          hasInstructionPdf: true,
          taskInstruction: '',
          editableAfterSubmission: true,
        },
        aiAccess: 'off',
        allowedModels: [],
        customModels: [],
        aiTokenBudget: { shortcutMaxTokens: 1024, chatMaxTokens: 4096 },
        aiPolicy: { mode: 'off' },
        aiUsageLimit: { mode: 'unlimited' },
        time: { lateSubmission: 'allowed' },
        submission: { mode: 'multiple', attemptPolicy: { mode: 'single' } },
        traceability: {
          trackAiUsage: false,
          trackTyping: true,
          trackCopyPaste: false,
          trackFocusBlur: true,
        },
        detectors: {
          anomalyPattern: { enabled: true },
          humanTyping: { enabled: true },
        },
        resourceAccess: 'view-only',
        copyPastePolicy: 'allowed',
      },
      writingStartedAt: null,
      createdAt: now,
      updatedAt: now,
      lastEditedAt: now,
    },
    linkedFile: {
      id: 'demo-pdf-workspace-scroll-e2e',
      ownerUserId: 'demo-user-local',
      documentId: DOCUMENT_ID,
      purpose: 'document_source_pdf',
      title: 'workspace-scroll.pdf',
      originalFilename: 'workspace-scroll.pdf',
      mimeType: 'application/pdf',
      storageProvider: 'browser-local',
      storageKey: pdfUrl,
      storageBucket: null,
      storageRegion: null,
      storageEtag: null,
      fileSize: 0,
      checksum: 'e2e-browser-local',
      pageCount: 8,
      uploadStatus: 'ready',
      textIndexStatus: 'unavailable',
      legacySourceId: null,
      createdAt: now,
      updatedAt: now,
    },
    events: [],
    certificateIds: [],
  };
}

async function fulfillPdfRange(route: Route, pdf: Buffer) {
  const rangeHeader = route.request().headers().range;
  const match = rangeHeader?.match(/^bytes=(\d+)-(\d*)$/);

  if (!match) {
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(pdf.length),
      },
      body: pdf,
    });
    return;
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : pdf.length - 1;
  const end = Math.min(requestedEnd, pdf.length - 1);
  const body = pdf.subarray(start, end + 1);

  await route.fulfill({
    status: 206,
    contentType: 'application/pdf',
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(body.length),
      'Content-Range': `bytes ${start}-${end}/${pdf.length}`,
    },
    body,
  });
}

async function seedBrowserLocalWorkspace(page: Page, baseURL: string) {
  const pdf = buildBlankPdf(8);
  await page.route(`**${PDF_PATH}`, (route) => fulfillPdfRange(route, pdf));
  await page.route('https://www.googletagmanager.com/**', (route) =>
    route.abort()
  );

  await page.goto('/documents/new?demo=1', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ documentStorageKey, dismissalKey, record }) => {
      window.sessionStorage.setItem(documentStorageKey, JSON.stringify(record));
      window.localStorage.setItem(dismissalKey, 'dismissed');
    },
    {
      documentStorageKey: DOCUMENT_STORAGE_KEY,
      dismissalKey: RULES_DISMISSAL_KEY,
      record: buildDemoRecord(`${baseURL}${PDF_PATH}`),
    }
  );
}

for (const viewport of DESKTOP_VIEWPORTS) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('keeps workspace chrome fixed and content scrolling internally', async ({
      page,
      baseURL,
    }) => {
      if (!baseURL) {
        throw new Error('Playwright baseURL is required');
      }

      await seedBrowserLocalWorkspace(page, baseURL);
      await page.goto(`/documents/${DOCUMENT_ID}?demo=1`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(
        page.getByRole('heading', { name: DOCUMENT_TITLE, exact: true })
      ).toBeVisible();
      const navbar = page.locator('nav');
      const editorToolbar = page.locator('.editor-toolbar');
      const editorContent = page.locator('.editor-content-editable');
      const pdfCanvas = page.locator('[data-page] canvas').first();
      const zoomInButton = page.getByRole('button', {
        name: 'Zoom in',
        exact: true,
      });

      await expect(navbar).toBeVisible();
      await expect(editorToolbar).toBeVisible();
      await expect(editorContent).toBeVisible();
      await expect(zoomInButton).toBeVisible();
      await expect(pdfCanvas).toBeVisible();

      const before = await page.evaluate(() => {
        const html = document.documentElement;
        const body = document.body;
        const nav = document.querySelector('nav');
        const toolbar = document.querySelector('.editor-toolbar');
        const editable = document.querySelector('.editor-content-editable');
        const editorScroller = editable?.parentElement;
        const canvas = document.querySelector('[data-page] canvas');
        let pdfScroller = canvas?.parentElement || null;

        while (pdfScroller && pdfScroller !== body) {
          const overflowY = window.getComputedStyle(pdfScroller).overflowY;
          if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            pdfScroller.scrollHeight > pdfScroller.clientHeight + 1
          ) {
            break;
          }
          pdfScroller = pdfScroller.parentElement;
        }

        const top = (element: Element | null) =>
          element ? Math.round(element.getBoundingClientRect().top) : null;

        return {
          htmlClientHeight: html.clientHeight,
          htmlScrollHeight: html.scrollHeight,
          bodyClientHeight: body.clientHeight,
          bodyScrollHeight: body.scrollHeight,
          windowScrollY: window.scrollY,
          navbarTop: top(nav),
          editorToolbarTop: top(toolbar),
          editorOverflowY: editorScroller
            ? window.getComputedStyle(editorScroller).overflowY
            : null,
          editorClientHeight: editorScroller?.clientHeight || 0,
          editorScrollHeight: editorScroller?.scrollHeight || 0,
          pdfClientHeight: pdfScroller?.clientHeight || 0,
          pdfScrollHeight: pdfScroller?.scrollHeight || 0,
        };
      });

      expect(before.htmlScrollHeight).toBeLessThanOrEqual(
        before.htmlClientHeight + 1
      );
      expect(before.bodyScrollHeight).toBeLessThanOrEqual(
        before.bodyClientHeight + 1
      );
      expect(before.windowScrollY).toBe(0);
      expect(before.navbarTop).toBe(0);
      expect(before.editorOverflowY).toBe('auto');
      expect(before.editorScrollHeight).toBeGreaterThan(
        before.editorClientHeight
      );
      expect(before.pdfScrollHeight).toBeGreaterThan(before.pdfClientHeight);

      const scrolled = await page.evaluate(() => {
        const editable = document.querySelector('.editor-content-editable');
        const editorScroller = editable?.parentElement;
        const canvas = document.querySelector('[data-page] canvas');
        let pdfScroller = canvas?.parentElement || null;

        while (pdfScroller && pdfScroller !== document.body) {
          const overflowY = window.getComputedStyle(pdfScroller).overflowY;
          if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            pdfScroller.scrollHeight > pdfScroller.clientHeight + 1
          ) {
            break;
          }
          pdfScroller = pdfScroller.parentElement;
        }

        if (editorScroller)
          editorScroller.scrollTop = editorScroller.scrollHeight;
        if (pdfScroller) pdfScroller.scrollTop = pdfScroller.scrollHeight;

        return new Promise<{
          editorScrollTop: number;
          pdfScrollTop: number;
          windowScrollY: number;
          editorToolbarTop: number | null;
          navbarTop: number | null;
        }>((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              const toolbar = document.querySelector('.editor-toolbar');
              const navbar = document.querySelector('nav');
              resolve({
                editorScrollTop: editorScroller?.scrollTop || 0,
                pdfScrollTop: pdfScroller?.scrollTop || 0,
                windowScrollY: window.scrollY,
                editorToolbarTop: toolbar
                  ? Math.round(toolbar.getBoundingClientRect().top)
                  : null,
                navbarTop: navbar
                  ? Math.round(navbar.getBoundingClientRect().top)
                  : null,
              });
            });
          });
        });
      });

      expect(scrolled.editorScrollTop).toBeGreaterThan(0);
      expect(scrolled.pdfScrollTop).toBeGreaterThan(0);
      expect(scrolled.windowScrollY).toBe(0);
      expect(scrolled.navbarTop).toBe(before.navbarTop);
      expect(scrolled.editorToolbarTop).toBe(before.editorToolbarTop);
      await expect(navbar).toBeVisible();
      await expect(editorToolbar).toBeVisible();
      await expect(zoomInButton).toBeVisible();
    });
  });
}
