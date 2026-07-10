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
const previewPagePath = path.join(__dirname, '../../app/documents/preview/page.tsx');
const previewPageSource = fs.readFileSync(previewPagePath, 'utf8');
const adminNewTaskPagePath = path.join(__dirname, '../../../../frontend/src/app/tasks/new/page.tsx');
const adminNewTaskPageSource = fs.readFileSync(adminNewTaskPagePath, 'utf8');
const performanceMetricsPath = path.join(__dirname, '../../lib/performance-metrics.ts');
const performanceMetricsSource = fs.readFileSync(performanceMetricsPath, 'utf8');
const useDocumentPath = path.join(__dirname, '../../hooks/use-document.ts');
const useDocumentSource = fs.readFileSync(useDocumentPath, 'utf8');

test('PDFViewer loads PDFs with app-hosted CMap and standard font assets', () => {
  assert.match(viewerSource, /import\('pdfjs-dist'\)/);
  assert.match(viewerSource, /GlobalWorkerOptions\.workerSrc = '\/pdf\.worker\.min\.mjs'/);
  assert.match(viewerSource, /cMapUrl: '\/pdfjs\/cmaps\/'/);
  assert.match(viewerSource, /cMapPacked: true/);
  assert.match(viewerSource, /standardFontDataUrl: '\/pdfjs\/standard_fonts\/'/);
  assert.match(viewerSource, /disableStream: true/);
  assert.match(viewerSource, /disableAutoFetch: true/);
  assert.match(viewerSource, /PDF_RANGE_CHUNK_SIZE = 1024 \* 1024/);
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
  assert.match(fileApiSource, /fallback\?: PdfDocumentSource/);
  assert.match(fileApiSource, /headers\['X-File-View-Token'\] = viewToken/);
  assert.match(fileApiSource, /apiClient\.get\(`\/files\/\$\{fileId\}\/view-url`, \{ headers \}\)/);
  assert.match(fileApiSource, /source\?\.delivery === 'signed-url'/);
  assert.match(fileApiSource, /new URL\(value\)\.protocol === 'https:'/);
  assert.match(fileApiSource, /fallback: proxySource/);
  assert.match(fileApiSource, /withCredentials: true/);
  assert.match(fileApiSource, /downloadPdf/);
  assert.match(fileApiSource, /buildFileDownloadUrl/);
  assert.match(fileApiSource, /getApiUrl\(`\/files\/\$\{fileId\}\/download`\)/);
  assert.match(fileApiSource, /Failed to download PDF: HTTP \$\{response\.status\}/);

  assert.match(viewerSource, /fileApi\.getPdfDocumentSource\(fileId!, \{ viewOnly, documentId \}\)/);
  assert.match(viewerSource, /url: candidate\.url/);
  assert.match(viewerSource, /httpHeaders: candidate\.httpHeaders/);
  assert.match(viewerSource, /withCredentials: candidate\.withCredentials/);
  assert.match(viewerSource, /const loadDocumentSource = async \(candidate: PdfDocumentSource\)/);
  assert.match(viewerSource, /if \(cancelled \|\| !source\.fallback\)/);
  assert.match(viewerSource, /pdf = await loadDocumentSource\(source\.fallback\)/);
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

test('PDFViewer does not eagerly hydrate every page layout on initial load', () => {
  assert.match(viewerSource, /const firstPage = await pdf\.getPage\(1\)/);
  assert.match(viewerSource, /loaded: index === 0/);
  assert.match(viewerSource, /pageLayoutsRef\.current\[pageNum - 1\] = pageLayout/);
  assert.doesNotMatch(viewerSource, /hydratedLayouts/);
  assert.doesNotMatch(viewerSource, /for \(let pageNum = 2; pageNum <= pdf\.numPages; pageNum\+\+\)/);
});

test('PDF workspace performance timings are exposed to browser QA', () => {
  assert.match(performanceMetricsSource, /HUMANLY_PERFORMANCE_METRIC_EVENT = 'humanly:performance-metric'/);
  assert.match(performanceMetricsSource, /window\.performance\.measure/);
  assert.match(performanceMetricsSource, /window\.dispatchEvent/);
  assert.match(viewerSource, /'humanly\.pdf\.document_load'/);
  assert.match(viewerSource, /'humanly\.pdf\.first_page_paint'/);
  assert.match(viewerSource, /firstPagePaintRecordedRef/);
  assert.match(useDocumentSource, /'humanly\.workspace\.hydration'/);
  assert.match(useDocumentSource, /'humanly\.pdf\.text_index_readiness'/);
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

test('workspace preview transfers payload only after a validated ready message and acknowledges receipt', () => {
  assert.match(newDocumentPageSource, /WORKSPACE_SETUP_PREVIEW_MESSAGE_TYPE/);
  assert.match(newDocumentPageSource, /WORKSPACE_SETUP_PREVIEW_READY_MESSAGE_TYPE/);
  assert.match(newDocumentPageSource, /WORKSPACE_SETUP_PREVIEW_ACK_MESSAGE_TYPE/);
  assert.match(newDocumentPageSource, /const payload = getWorkspacePreviewPayload\(\)/);
  assert.match(newDocumentPageSource, /sessionStorage\.setItem\(storageKey, JSON\.stringify\(payload\)\)/);
  assert.match(newDocumentPageSource, /Large PDF data URLs can exceed session storage/);
  assert.match(newDocumentPageSource, /if \(!previewWindow\) \{\s*sessionStorage\.removeItem\(storageKey\)/s);
  assert.match(newDocumentPageSource, /event\.source !== previewWindow \|\| event\.origin !== targetOrigin/);
  assert.match(newDocumentPageSource, /data\.type === WORKSPACE_SETUP_PREVIEW_READY_MESSAGE_TYPE/);
  assert.match(newDocumentPageSource, /previewWindow\.postMessage\(message, targetOrigin\)/);
  assert.match(newDocumentPageSource, /data\.type === WORKSPACE_SETUP_PREVIEW_ACK_MESSAGE_TYPE/);
  assert.match(newDocumentPageSource, /WORKSPACE_SETUP_PREVIEW_TRANSFER_TIMEOUT_MS/);
  assert.doesNotMatch(newDocumentPageSource, /,\s*250\s*\)/);
  assert.doesNotMatch(newDocumentPageSource, /,\s*1000\s*\)/);

  assert.match(adminNewTaskPageSource, /WORKSPACE_SETUP_PREVIEW_READY_MESSAGE_TYPE/);
  assert.match(adminNewTaskPageSource, /WORKSPACE_SETUP_PREVIEW_ACK_MESSAGE_TYPE/);
  assert.match(adminNewTaskPageSource, /event\.source !== previewWindow \|\| event\.origin !== targetOrigin/);
  assert.match(adminNewTaskPageSource, /previewWindow\.postMessage\(message, targetOrigin\)/);
  assert.doesNotMatch(adminNewTaskPageSource, /,\s*250\s*\)/);
  assert.doesNotMatch(adminNewTaskPageSource, /,\s*1000\s*\)/);

  assert.match(previewPageSource, /if \(!openerWindow\)/);
  assert.match(previewPageSource, /openerWindow\.postMessage/);
  assert.match(previewPageSource, /type: WORKSPACE_SETUP_PREVIEW_READY_MESSAGE_TYPE/);
  assert.match(previewPageSource, /event\.source !== openerWindow/);
  assert.match(previewPageSource, /event\.origin !== openerOrigin/);
  assert.match(previewPageSource, /type: WORKSPACE_SETUP_PREVIEW_ACK_MESSAGE_TYPE/);
  assert.doesNotMatch(newDocumentPageSource, /noopener|noreferrer/);
});
