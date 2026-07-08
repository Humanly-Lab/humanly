const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { extractCompatiblePDFTextContent } = require('./pdf-text-content');

const viewerPath = path.join(__dirname, 'PDFViewer.tsx');
const viewerSource = fs.readFileSync(viewerPath, 'utf8');
const fileApiPath = path.join(__dirname, '../../lib/file-api.ts');
const fileApiSource = fs.readFileSync(fileApiPath, 'utf8');
const newDocumentPagePath = path.join(__dirname, '../../app/documents/new/page.tsx');
const newDocumentPageSource = fs.readFileSync(newDocumentPagePath, 'utf8');

test('PDFViewer loads PDFs with app-hosted CMap and standard font assets', () => {
  assert.match(viewerSource, /import\('pdfjs-dist'\)/);
  assert.match(viewerSource, /GlobalWorkerOptions\.workerSrc = '\/pdf\.worker\.min\.mjs'/);
  assert.match(viewerSource, /cMapUrl: '\/pdfjs\/cmaps\/'/);
  assert.match(viewerSource, /cMapPacked: true/);
  assert.match(viewerSource, /standardFontDataUrl: '\/pdfjs\/standard_fonts\/'/);
  assert.match(viewerSource, /disableStream: true/);
  assert.match(viewerSource, /disableAutoFetch: true/);
  assert.match(viewerSource, /rangeChunkSize: PDF_RANGE_CHUNK_SIZE/);
  assert.match(viewerSource, /\.\.\.PDFJS_DOCUMENT_RESOURCE_OPTIONS/);
  assert.match(viewerSource, /pdfjsLib\.getDocument\(\{/);
  assert.doesNotMatch(viewerSource, /window\.pdfjsLib|cdnjs/);
});

test('PDFViewer gives PDF.js an authenticated document source instead of a preloaded blob URL', () => {
  assert.match(fileApiSource, /interface PdfDocumentSource \{/);
  assert.match(fileApiSource, /getPdfDocumentSource/);
  assert.match(fileApiSource, /httpHeaders\?: Record<string, string>/);
  assert.match(fileApiSource, /withCredentials\?: boolean/);
  assert.match(fileApiSource, /headers\['X-File-View-Token'\] = viewToken/);
  assert.match(fileApiSource, /withCredentials: true/);
  assert.match(fileApiSource, /downloadPdf/);
  assert.match(fileApiSource, /buildFileDownloadUrl/);
  assert.match(fileApiSource, /getApiUrl\(`\/files\/\$\{fileId\}\/download`\)/);
  assert.match(fileApiSource, /Failed to download PDF: HTTP \$\{response\.status\}/);

  assert.match(viewerSource, /fileApi\.getPdfDocumentSource\(fileId!, \{ viewOnly, documentId \}\)/);
  assert.match(viewerSource, /url: source\.url/);
  assert.match(viewerSource, /httpHeaders: source\.httpHeaders/);
  assert.match(viewerSource, /withCredentials: source\.withCredentials/);
  assert.match(viewerSource, /fileApi\.downloadPdf\(fileId, \{ documentId \}\)/);
  assert.match(viewerSource, /function getSafePreviewDownloadUrl\(previewUrl: string\): string \| null/);
  assert.match(viewerSource, /parsed\.origin !== window\.location\.origin/);
  assert.match(viewerSource, /parsed\.protocol === 'http:' \|\| parsed\.protocol === 'https:' \|\| parsed\.protocol === 'blob:'/);
  assert.match(viewerSource, /throw new Error\('Invalid preview download URL'\)/);
  assert.match(viewerSource, /loadingTask\?\.destroy\?\.\(\)/);
  assert.doesNotMatch(viewerSource, /downloadUrl = previewUrl/);
  assert.doesNotMatch(viewerSource, /getPdfBlob/);
  assert.doesNotMatch(fileApiSource, /getPdfBlob/);
  assert.doesNotMatch(fileApiSource, /fetch\(buildFileContentUrl\(fileId\)/);
});

test('PDFViewer does not automatically extract every PDF page for AI retrieval', () => {
  assert.doesNotMatch(viewerSource, /usePDFTextStore/);
  assert.doesNotMatch(viewerSource, /extractPDFTextInBackground/);
  assert.doesNotMatch(viewerSource, /setPDFText/);
  assert.doesNotMatch(viewerSource, /PDF text extraction failed/);
  assert.match(viewerSource, /const getPageTextContent = useCallback/);
  assert.match(viewerSource, /extractCompatiblePDFTextContent\(page\)/);
});

test('PDFViewer uses a bounded visible-page render queue instead of rendering every page eagerly', () => {
  assert.match(viewerSource, /MAX_CONCURRENT_PAGE_RENDERS = 2/);
  assert.match(viewerSource, /PDFPageView owns page DOM\/text\/annotation layers/);
  assert.match(viewerSource, /PRE_RENDER_RADIUS = 1/);
  assert.match(viewerSource, /RETAINED_PAGE_RADIUS = 4/);
  assert.match(viewerSource, /MAX_CANVAS_PIXELS = 16_000_000/);
  assert.match(viewerSource, /function getBoundedOutputScale/);
  assert.match(viewerSource, /const \[pageLayouts, setPageLayouts\] = useState<PageLayout\[\]>\(\[\]\)/);
  assert.match(viewerSource, /const visiblePagesRef = useRef<Set<number>>\(new Set\(\)\)/);
  assert.match(viewerSource, /const numPagesRef = useRef<number>\(0\)/);
  assert.match(viewerSource, /const currentPageRef = useRef<number>\(1\)/);
  assert.match(viewerSource, /const renderQueueRef = useRef<number\[\]>\(\[\]\)/);
  assert.match(viewerSource, /const pumpRenderQueue = useCallback/);
  assert.match(viewerSource, /const schedulePagesForRendering = useCallback/);
  assert.match(viewerSource, /const scheduleVisiblePagesForRendering = useCallback/);
  assert.match(viewerSource, /data-rendered=\{isRendered \? 'true' : 'false'\}/);
  assert.match(viewerSource, /style=\{\{ width, height \}\}/);
  assert.match(viewerSource, /schedulePagesForRendering\(\[page, page \+ 1, page - 1\], true\)/);
  assert.match(viewerSource, /if \(Math\.abs\(scaleRef\.current - nextScale\) < 0\.001\) \{\s*return\s*\}/s);
  assert.doesNotMatch(viewerSource, /renderAllPages/);
});

test('PDFViewer includes CJK CMap and standard font assets required by PDF.js', () => {
  const publicDir = path.join(__dirname, '../../../public/pdfjs');

  assert.equal(fs.existsSync(path.join(__dirname, '../../../public/pdf.worker.min.mjs')), true);
  assert.equal(fs.existsSync(path.join(publicDir, 'cmaps/Adobe-GB1-UCS2.bcmap')), true);
  assert.equal(fs.existsSync(path.join(publicDir, 'cmaps/UniGB-UTF16-H.bcmap')), true);
  assert.equal(fs.existsSync(path.join(publicDir, 'standard_fonts/LiberationSans-Regular.ttf')), true);
});

test('PDF text extraction falls back to a reader when PDF.js stream async iteration is unavailable', async () => {
  let streamTextContentCalled = false;
  let readerReleased = false;
  const chunks = [
    {
      lang: 'en',
      styles: {
        f1: { fontFamily: 'Helvetica' },
      },
      items: [{ str: 'Hello' }],
    },
    {
      styles: {},
      items: [{ str: 'world' }],
    },
  ];
  const page = {
    async getTextContent() {
      throw new TypeError("undefined is not a function (near '... value of readableStream...')");
    },
    streamTextContent() {
      streamTextContentCalled = true;
      return {
        getReader() {
          return {
            async read() {
              const value = chunks.shift();
              return value ? { done: false, value } : { done: true };
            },
            releaseLock() {
              readerReleased = true;
            },
          };
        },
      };
    },
  };

  const textContent = await extractCompatiblePDFTextContent(page);

  assert.equal(streamTextContentCalled, true);
  assert.equal(readerReleased, true);
  assert.equal(textContent.lang, 'en');
  assert.deepEqual(textContent.items.map((item) => item.str), ['Hello', 'world']);
  assert.equal(textContent.styles.f1.fontFamily, 'Helvetica');
});

test('PDF text extraction uses direct getTextContent when available', async () => {
  const expected = {
    items: [{ str: 'direct text' }],
    styles: {},
    lang: null,
  };
  const page = {
    async getTextContent() {
      return expected;
    },
    streamTextContent() {
      throw new Error('stream fallback should not run');
    },
  };

  assert.equal(await extractCompatiblePDFTextContent(page), expected);
});

test('personal document workspace preview sends its payload to the opened preview window', () => {
  assert.match(newDocumentPageSource, /WORKSPACE_SETUP_PREVIEW_MESSAGE_TYPE/);
  assert.match(newDocumentPageSource, /const payload = getWorkspacePreviewPayload\(\)/);
  assert.match(newDocumentPageSource, /sessionStorage\.setItem\(storageKey, JSON\.stringify\(payload\)\)/);
  assert.match(
    newDocumentPageSource,
    /const previewWindow = window\.open\(\s*`\/documents\/preview\$\{buildWorkspaceSetupPreviewStorageHash\(storageKey\)\}`,\s*'_blank'\s*\)/s
  );
  assert.match(
    newDocumentPageSource,
    /const message = \{\s*type: WORKSPACE_SETUP_PREVIEW_MESSAGE_TYPE,\s*storageKey,\s*payload,\s*\}/s
  );
  assert.match(newDocumentPageSource, /previewWindow\.postMessage\(message, window\.location\.origin\)/);
  assert.match(
    newDocumentPageSource,
    /window\.setTimeout\(\s*\(\) => previewWindow\.postMessage\(message, window\.location\.origin\),\s*250\s*\)/s
  );
  assert.match(
    newDocumentPageSource,
    /window\.setTimeout\(\s*\(\) => previewWindow\.postMessage\(message, window\.location\.origin\),\s*1000\s*\)/s
  );
  assert.doesNotMatch(newDocumentPageSource, /noopener|noreferrer/);
});
