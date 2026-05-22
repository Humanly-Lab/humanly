import OpenAI from 'openai';
import dns from 'dns/promises';
import net from 'net';
import path from 'path';
import { query, queryOne } from '../config/database';
import { DocumentModel } from '../models/document.model';
import { FileModel } from '../models/file.model';
import { FileStorageService } from './file-storage.service';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

type Tool = OpenAI.Responses.FunctionTool;

const MAX_TEXT = 12000;
const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 200;
const COMPACT_CONTEXT_MAX_CHARS = 18000;
const COMPACT_CONTEXT_MAX_FILES = 3;
const WEB_SEARCH_DEFAULT_MAX_RESULTS = 5;
const WEB_SEARCH_HARD_MAX_RESULTS = 10;
const WEB_FETCH_DEFAULT_MAX_CHARS = 20000;
const WEB_FETCH_HARD_MAX_CHARS = 60000;
const WEB_FETCH_DEFAULT_TIMEOUT_MS = 10000;
const WEB_FETCH_HARD_TIMEOUT_MS = 20000;
const WEB_FETCH_MAX_BYTES = 1_500_000;
const WEB_ALLOWLIST_TTL_MS = 30 * 60 * 1000;

type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

function excerpt(text: string, maxLength = MAX_TEXT): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n[truncated]` : text;
}

function makeChunks(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += size - overlap;
  }
  return chunks;
}

function detectSections(pages: Array<{ pageNumber: number; text: string }>): Array<{
  sectionTitle: string;
  startPage: number;
  endPage: number;
  text: string;
}> {
  const headings: Array<{ title: string; pageNumber: number; offset: number }> = [];
  const headingPattern = /^(abstract|introduction|background|related work|methods?|methodology|results?|discussion|conclusion|references|bibliography|appendix|[0-9]+\.?\s+[A-Z][^\n]{2,90})$/i;

  for (const page of pages) {
    const lines = page.text.split('\n');
    let offset = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length <= 120 && headingPattern.test(trimmed)) {
        headings.push({ title: trimmed, pageNumber: page.pageNumber, offset });
      }
      offset += line.length + 1;
    }
  }

  if (headings.length === 0) {
    return [];
  }

  const fullText = pages.map(page => `\n\n[Page ${page.pageNumber}]\n${page.text}`).join('');
  return headings.slice(0, 80).map((heading, index) => {
    const next = headings[index + 1];
    const titleIndex = fullText.toLowerCase().indexOf(heading.title.toLowerCase());
    const nextIndex = next ? fullText.toLowerCase().indexOf(next.title.toLowerCase(), Math.max(titleIndex + heading.title.length, 0)) : -1;
    return {
      sectionTitle: heading.title,
      startPage: heading.pageNumber,
      endPage: next?.pageNumber || pages[pages.length - 1]?.pageNumber || heading.pageNumber,
      text: excerpt(fullText.slice(Math.max(titleIndex, 0), nextIndex > titleIndex ? nextIndex : undefined), MAX_TEXT),
    };
  });
}

function textItemsToString(items: any[]): string {
  let lastY: number | undefined;
  let text = '';
  for (const item of items || []) {
    const y = item.transform?.[5];
    text += lastY === y || lastY === undefined ? item.str : `\n${item.str}`;
    lastY = y;
  }
  return text;
}

function clampInteger(value: any, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function isWebRetrievalEnabled(): boolean {
  return process.env.WEB_RETRIEVAL_ENABLED !== 'false';
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html: string): string | null {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? stripHtml(title) : null;
}

function extractReadableText(html: string): string {
  const withoutNoise = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const main =
    withoutNoise.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || withoutNoise.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || withoutNoise.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    || withoutNoise;
  return stripHtml(
    main
      .replace(/<\/(p|div|section|article|main|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
  ).replace(/\n{3,}/g, '\n\n');
}

function normalizePublicHttpUrl(rawUrl: string): URL {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new AppError(400, 'url is required');
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError(400, 'url must be a valid absolute URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError(400, 'web_fetch only supports http and https URLs');
  }
  if (!parsed.hostname) {
    throw new AppError(400, 'url must include a hostname');
  }
  parsed.hash = '';
  return parsed;
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 0
  );
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  const mappedIPv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIPv4) {
    return isPrivateIPv4(mappedIPv4[1]);
  }

  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function isForbiddenHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized === 'metadata.google.internal'
  );
}

function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return false;
}

function decodeDuckDuckGoUrl(url: string): string {
  try {
    const absolute = url.startsWith('//') ? `https:${url}` : url;
    const parsed = new URL(absolute);
    const uddg = parsed.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : absolute;
  } catch {
    return url;
  }
}

function extractDuckDuckGoResults(html: string, maxResults: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a(?=[^>]*class="[^"]*result__a[^"]*")[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    if (results.length >= maxResults) break;
    const url = decodeDuckDuckGoUrl(decodeHtmlEntities(match[1]));
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue;
    const title = stripHtml(match[2]);
    if (!title || seen.has(url)) continue;
    const tail = html.slice(match.index, match.index + 3500);
    const snippet = stripHtml(
      tail.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1]
      || tail.match(/<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
      || ''
    );
    seen.add(url);
    results.push({ title, url, snippet });
  }

  return results;
}

async function extractPdfPages(buffer: Buffer): Promise<Array<{ pageNumber: number; text: string }>> {
  const pdfjs = require('pdfjs-dist/build/pdf.js') as any;
  const packageDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    standardFontDataUrl: path.join(packageDir, 'standard_fonts') + path.sep,
  });
  const pdf = await loadingTask.promise;

  try {
    const pages: Array<{ pageNumber: number; text: string }> = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });
      pages.push({ pageNumber, text: textItemsToString(textContent.items) });
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}

export class AIRetrievalService {
  // Unix-style primitives for uploaded reference files plus a small web
  // retrieval domain. No tool can reach the user's live editor draft — that
  // boundary is enforced by absence, not prompt politeness.
  // PDFs are surfaced as plain text with inline `[page N]` markers; the agent
  // sees and cites these markers naturally without needing a page-aware mode.
  static readonly tools: Tool[] = [
    {
      type: 'function',
      name: 'ls',
      description:
        'List uploaded reference files attached to the current chat. Returns [{ id, filename }] in upload order. Call first when you need to know what is available; idempotent and cheap.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {},
        required: [],
      },
    },
    {
      type: 'function',
      name: 'grep',
      description:
        'Case-insensitive literal substring search over one file. Returns up to 50 matches in document order: each is { line, page (nearest preceding [page N] marker, or null), text, contextLines? }. Use context_before / context_after to pull surrounding lines without an extra read. Pattern is plain text — do NOT use regex syntax. Best when you have a clear keyword; if it returns nothing try a synonym, a shorter substring, or just read the likely region directly.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string', description: 'File id from ls().' },
          pattern: { type: 'string', description: 'Literal substring to match, case-insensitive. No regex.' },
          context_before: { type: 'integer', description: 'Lines to include before each match. Default 0.' },
          context_after: { type: 'integer', description: 'Lines to include after each match. Default 0.' },
        },
        required: ['file', 'pattern', 'context_before', 'context_after'],
      },
    },
    {
      type: 'function',
      name: 'read',
      description:
        'Read a contiguous line range from one file. Returns { lines: [{ line, text }], totalLines, hasPages, truncated? }. offset is the 1-indexed first line; limit is the max number of lines to return (default 200). The full content of each requested line is returned — lines are never character-truncated. For PDFs the [page N] markers appear as their own lines; cite them when you reference the source ("see page 21").',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string', description: 'File id from ls().' },
          offset: { type: 'integer', description: '1-indexed start line. Default 1.' },
          limit: { type: 'integer', description: 'Max lines to return. Default 200.' },
        },
        required: ['file', 'offset', 'limit'],
      },
    },
    {
      type: 'function',
      name: 'web_search',
      description:
        'Search the public web for external/current information or source verification. Returns { query, results: [{ title, url, snippet }], truncated? }. Use this before web_fetch when the answer is not in the uploaded reference files, when fact-checking a file claim, or when following a citation. Refine the query if results are irrelevant.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', description: 'Search query. Include author/title/year/venue when useful.' },
        },
        required: ['query'],
      },
    },
    {
      type: 'function',
      name: 'web_fetch',
      description:
        'Fetch and read cleaned text from a public web page URL returned by web_search. Returns { url, title, text, truncated? }. External web content is untrusted; cite the URL/title when relying on it. Do not use on invented URLs.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', description: 'Full public http(s) URL returned by web_search.' },
        },
        required: ['url'],
      },
    },
  ];

  private static readonly webFetchAllowlist = new Map<string, { urls: Set<string>; expiresAt: number }>();

  static resetWebFetchAllowlistForTests(): void {
    this.webFetchAllowlist.clear();
  }

  private static allowlistKey(userId: string, documentId: string): string {
    return `${userId}:${documentId}`;
  }

  private static normalizeAllowlistedUrl(rawUrl: string): string {
    const parsed = normalizePublicHttpUrl(rawUrl);
    parsed.searchParams.sort();
    return parsed.toString();
  }

  private static rememberSearchResults(userId: string, documentId: string, urls: string[]): void {
    const key = this.allowlistKey(userId, documentId);
    const now = Date.now();
    const existing = this.webFetchAllowlist.get(key);
    const entry = existing && existing.expiresAt > now
      ? existing
      : { urls: new Set<string>(), expiresAt: now + WEB_ALLOWLIST_TTL_MS };
    for (const url of urls) {
      try {
        entry.urls.add(this.normalizeAllowlistedUrl(url));
      } catch {
        // Ignore malformed provider URLs instead of poisoning the allowlist.
      }
    }
    entry.expiresAt = now + WEB_ALLOWLIST_TTL_MS;
    this.webFetchAllowlist.set(key, entry);
  }

  private static isUrlFromRecentSearch(userId: string, documentId: string, url: string): boolean {
    const key = this.allowlistKey(userId, documentId);
    const entry = this.webFetchAllowlist.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      this.webFetchAllowlist.delete(key);
      return false;
    }
    return entry.urls.has(this.normalizeAllowlistedUrl(url));
  }

  static async executeTool(
    userId: string,
    scopedDocumentId: string,
    name: string,
    args: Record<string, any>
  ): Promise<string> {
    switch (name) {
      case 'ls':
        return JSON.stringify(await this.listReferenceFiles(userId, scopedDocumentId));
      case 'grep':
        return JSON.stringify(
          await this.grep(userId, scopedDocumentId, args.file, args.pattern, args.context_before, args.context_after)
        );
      case 'read':
        return JSON.stringify(
          await this.read(userId, scopedDocumentId, args.file, args.offset, args.limit)
        );
      case 'web_search':
        return JSON.stringify(await this.webSearch(userId, scopedDocumentId, args.query));
      case 'web_fetch':
        return JSON.stringify(await this.webFetch(userId, scopedDocumentId, args.url));
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}. Available tools: ls, grep, read, web_search, web_fetch.` });
    }
  }

  /**
   * Build a deterministic reference snapshot for small-file QA. Tool calling
   * remains available, but short syllabi / prompts should not require the
   * model to discover obvious facts through a fragile multi-turn tool loop.
   */
  static async buildCompactReferenceContext(
    userId: string,
    scopedDocumentId: string,
    maxChars = COMPACT_CONTEXT_MAX_CHARS
  ): Promise<string | null> {
    const listing = await this.listReferenceFiles(userId, scopedDocumentId);
    if (listing.files.length === 0) {
      return null;
    }

    let remaining = Math.max(2000, Math.floor(maxChars));
    const sections: string[] = [];
    for (const file of listing.files.slice(0, COMPACT_CONTEXT_MAX_FILES)) {
      if (remaining <= 0) break;
      try {
        const { lines, hasPages } = await this.loadFileText(userId, scopedDocumentId, file.id);
        const header = [
          `Reference file: ${file.filename}`,
          `File id: ${file.id}`,
          hasPages ? 'Format: page-marked plain text' : 'Format: plain text',
        ].join('\n');
        const bodyBudget = Math.max(0, remaining - header.length - 64);
        if (bodyBudget <= 0) break;
        const body = excerpt(lines.join('\n'), bodyBudget);
        const section = `${header}\n---\n${body}`;
        sections.push(section);
        remaining -= section.length + 16;
      } catch (error) {
        logger.warn('Failed to build compact AI reference context', {
          userId,
          documentId: scopedDocumentId,
          fileId: file.id,
          error,
        });
      }
    }

    if (sections.length === 0) {
      return null;
    }

    return [
      'Uploaded reference snapshot:',
      'Use this snapshot first for straightforward questions about attached references. If it is insufficient or truncated, use ls/grep/read tools for more evidence. Use web_search/web_fetch only for external/current/source-verification questions.',
      '',
      sections.join('\n\n'),
    ].join('\n');
  }

  static async indexFile(fileId: string): Promise<void> {
    const appFile = await FileModel.findById(fileId);
    if (!appFile) {
      throw new AppError(404, 'File not found');
    }

    const existing = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM file_pages WHERE file_id = $1',
      [fileId]
    );
    if (parseInt(existing?.count || '0', 10) > 0) {
      return;
    }

    const buffer = await FileStorageService.getBuffer(appFile);

    try {
      const pages = await extractPdfPages(buffer);

      await query('DELETE FROM file_pages WHERE file_id = $1', [fileId]);
      await query('DELETE FROM file_sections WHERE file_id = $1', [fileId]);
      await query('DELETE FROM file_text_chunks WHERE file_id = $1', [fileId]);

      for (const page of pages) {
        await query(
          `INSERT INTO file_pages (file_id, page_number, text)
           VALUES ($1, $2, $3)
           ON CONFLICT (file_id, page_number)
           DO UPDATE SET text = EXCLUDED.text, updated_at = NOW()`,
          [fileId, page.pageNumber, page.text]
        );
      }

      let chunkIndex = 0;
      for (const page of pages) {
        for (const chunk of makeChunks(page.text)) {
          if (chunk.trim()) {
            await query(
              `INSERT INTO file_text_chunks (file_id, page_number, chunk_index, text)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (file_id, chunk_index)
               DO UPDATE SET page_number = EXCLUDED.page_number, text = EXCLUDED.text`,
              [fileId, page.pageNumber, chunkIndex++, chunk]
            );
          }
        }
      }

      for (const section of detectSections(pages)) {
        await query(
          `INSERT INTO file_sections (file_id, section_title, start_page, end_page, text)
           VALUES ($1, $2, $3, $4, $5)`,
          [fileId, section.sectionTitle, section.startPage, section.endPage, section.text]
        );
      }
    } catch (error) {
      logger.error('Failed to index file text', { fileId, error });
      throw new AppError(500, 'Failed to extract file text');
    }
  }

  private static async getOwnedDocument(userId: string, documentId: string) {
    const document = await DocumentModel.findByIdAndUserId(documentId, userId);
    if (!document) {
      throw new AppError(404, 'Document not found');
    }
    return document;
  }

  private static async assertLinkedFile(userId: string, documentId: string, fileId: string): Promise<void> {
    await this.getOwnedDocument(userId, documentId);
    const appFile = await queryOne<{ id: string }>(
      `SELECT files.id
       FROM files
       LEFT JOIN task_enrollments te
         ON te.task_id = files.task_id
        AND te.user_id = $3
        AND te.submission_document_id = $2
       WHERE files.id = $1
         AND (files.document_id = $2 OR te.id IS NOT NULL)`,
      [fileId, documentId, userId]
    );
    if (!appFile) {
      throw new AppError(404, 'Linked file not found');
    }
  }

  // ── ls / grep / read implementation ────────────────────────────────────

  /** List uploaded references attached to the current document. */
  static async listReferenceFiles(userId: string, documentId: string): Promise<{
    files: Array<{ id: string; filename: string }>;
  }> {
    await this.getOwnedDocument(userId, documentId);
    const files = await query<any>(
      `SELECT DISTINCT files.id,
              files.title,
              files.original_filename,
              files.created_at
       FROM files
       LEFT JOIN task_enrollments te
         ON te.task_id = files.task_id
        AND te.user_id = $2
        AND te.submission_document_id = $1
       WHERE files.document_id = $1
          OR te.id IS NOT NULL
       ORDER BY files.created_at ASC`,
      [documentId, userId]
    );
    return {
      files: files.map((file) => ({
        id: file.id,
        filename: file.title || file.original_filename || 'untitled',
      })),
    };
  }

  /**
   * Build the unified plain-text view of a reference: every page, in order,
   * separated by `[page N]` markers on their own lines. Lines are 1-indexed
   * across the whole file (the marker counts as one line).
   *
   * For non-PDF formats added later (DOCX / PPTX / TXT), the upload-time
   * extractor populates `file_pages` the same way (one logical "page" per
   * heading / slide / etc., or a single page row for plain text); this loader
   * stays format-agnostic.
   */
  private static async loadFileText(
    userId: string,
    documentId: string,
    fileId: string
  ): Promise<{ lines: string[]; pageStartLines: Map<number, number>; hasPages: boolean }> {
    if (!fileId || typeof fileId !== 'string') {
      throw new AppError(400, 'file is required');
    }
    await this.assertLinkedFile(userId, documentId, fileId);
    await this.indexFile(fileId);

    const rows = await query<{ page_number: number; text: string }>(
      'SELECT page_number, text FROM file_pages WHERE file_id = $1 ORDER BY page_number ASC',
      [fileId]
    );
    const allLines: string[] = [];
    const pageStartLines = new Map<number, number>();
    const hasPages = rows.length > 0 && (rows.length > 1 || rows[0].page_number === 1);
    for (const row of rows) {
      // Marker line first, then the page's content lines. Even single-page
      // files get a marker so [page 1] citations work uniformly.
      const markerLine = `[page ${row.page_number}]`;
      pageStartLines.set(row.page_number, allLines.length + 1); // 1-indexed
      allLines.push(markerLine);
      const pageLines = (row.text || '').split('\n');
      for (const line of pageLines) {
        allLines.push(line);
      }
    }
    return { lines: allLines, pageStartLines, hasPages };
  }

  /** Find nearest preceding page marker line index (1-indexed) for a given line. */
  private static nearestPrecedingPage(
    pageStartLines: Map<number, number>,
    targetLine: number
  ): number | null {
    let best: number | null = null;
    for (const [pageNumber, startLine] of pageStartLines) {
      if (startLine <= targetLine && (best === null || startLine > pageStartLines.get(best)!)) {
        best = pageNumber;
      }
    }
    return best;
  }

  private static async grep(
    userId: string,
    documentId: string,
    fileId: string,
    pattern: string,
    contextBefore?: number,
    contextAfter?: number
  ) {
    if (!pattern || typeof pattern !== 'string') {
      throw new AppError(400, 'pattern is required');
    }
    const before = Math.max(0, Math.min(20, Math.floor(contextBefore ?? 0)));
    const after = Math.max(0, Math.min(20, Math.floor(contextAfter ?? 0)));

    const { lines, pageStartLines } = await this.loadFileText(userId, documentId, fileId);
    const needle = pattern.toLowerCase();
    const matchCap = 50;

    const matches: Array<{
      line: number;
      page: number | null;
      text: string;
      contextLines?: Array<{ line: number; text: string; isMatch: boolean }>;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= matchCap) break;
      if (!lines[i].toLowerCase().includes(needle)) continue;
      const line1 = i + 1;
      const ctxStart = Math.max(0, i - before);
      const ctxEnd = Math.min(lines.length, i + after + 1);
      const contextLines = (before > 0 || after > 0)
        ? Array.from({ length: ctxEnd - ctxStart }, (_, k) => ({
            line: ctxStart + k + 1,
            text: lines[ctxStart + k],
            isMatch: ctxStart + k === i,
          }))
        : undefined;
      matches.push({
        line: line1,
        page: this.nearestPrecedingPage(pageStartLines, line1),
        text: lines[i],
        ...(contextLines ? { contextLines } : {}),
      });
    }

    return {
      file: fileId,
      pattern,
      truncated: matches.length === matchCap,
      matchCount: matches.length,
      matches,
    };
  }

  private static async read(
    userId: string,
    documentId: string,
    fileId: string,
    offset?: number,
    limit?: number
  ) {
    const { lines, pageStartLines, hasPages } = await this.loadFileText(userId, documentId, fileId);
    const offsetN = Math.max(1, Math.floor(offset ?? 1));
    // Hard cap at 800 lines per call so a single read does not blow the
    // model's context window; the agent can call again with a higher
    // offset to continue.
    const HARD_LIMIT = 800;
    const limitN = Math.max(1, Math.min(HARD_LIMIT, Math.floor(limit ?? 200)));

    const startIdx = offsetN - 1;
    const endIdx = Math.min(lines.length, startIdx + limitN);
    const slice = lines.slice(startIdx, endIdx);
    const startPage = hasPages ? this.nearestPrecedingPage(pageStartLines, offsetN) : null;
    const endPage = hasPages && endIdx > 0 ? this.nearestPrecedingPage(pageStartLines, endIdx) : null;

    return {
      file: fileId,
      offset: offsetN,
      limit: limitN,
      totalLines: lines.length,
      hasPages,
      pageRange: hasPages ? { start: startPage, end: endPage } : null,
      truncated: endIdx < lines.length,
      lines: slice.map((text, i) => ({ line: startIdx + i + 1, text })),
    };
  }

  // ── web_search / web_fetch implementation ──────────────────────────────

  private static async assertPublicFetchTarget(url: URL): Promise<void> {
    if (isForbiddenHostname(url.hostname)) {
      throw new AppError(400, 'web_fetch cannot access local or internal hostnames');
    }

    if (isPrivateAddress(url.hostname)) {
      throw new AppError(400, 'web_fetch cannot access private or loopback addresses');
    }

    let records: Array<{ address: string; family: number }>;
    try {
      records = await dns.lookup(url.hostname, { all: true });
    } catch {
      throw new AppError(400, 'web_fetch could not resolve the URL hostname');
    }

    if (records.length === 0 || records.some(record => isPrivateAddress(record.address))) {
      throw new AppError(400, 'web_fetch cannot access private or loopback addresses');
    }
  }

  private static async fetchTextWithLimit(url: string, timeoutMs: number, redirectDepth = 0): Promise<{
    status: number;
    ok: boolean;
    contentType: string;
    text: string;
    finalUrl: string;
  }> {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.8,*/*;q=0.2',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      if (redirectDepth >= 5) {
        throw new AppError(400, 'web_fetch followed too many redirects');
      }
      const location = response.headers.get('location');
      if (!location) {
        throw new AppError(400, 'web_fetch redirect response did not include a location');
      }
      const redirected = normalizePublicHttpUrl(new URL(location, url).toString());
      await this.assertPublicFetchTarget(redirected);
      return this.fetchTextWithLimit(redirected.toString(), timeoutMs, redirectDepth + 1);
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > WEB_FETCH_MAX_BYTES) {
      throw new AppError(413, 'web_fetch response is too large');
    }

    const body = response.body as any;
    if (!body?.getReader) {
      const text = await response.text();
      return {
        status: response.status,
        ok: response.ok,
        contentType,
        text: text.slice(0, WEB_FETCH_MAX_BYTES),
        finalUrl: response.url || url,
      };
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let text = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > WEB_FETCH_MAX_BYTES) {
        await reader.cancel();
        throw new AppError(413, 'web_fetch response is too large');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();

    return {
      status: response.status,
      ok: response.ok,
      contentType,
      text,
      finalUrl: response.url || url,
    };
  }

  private static async webSearch(userId: string, documentId: string, queryText: string) {
    await this.getOwnedDocument(userId, documentId);
    if (!isWebRetrievalEnabled()) {
      return { error: 'Web retrieval is disabled on this server.' };
    }
    if (!queryText || typeof queryText !== 'string' || !queryText.trim()) {
      throw new AppError(400, 'query is required');
    }

    const queryValue = queryText.trim().slice(0, 500);
    const maxResults = clampInteger(
      process.env.WEB_SEARCH_MAX_RESULTS,
      WEB_SEARCH_DEFAULT_MAX_RESULTS,
      1,
      WEB_SEARCH_HARD_MAX_RESULTS
    );
    const timeoutMs = clampInteger(
      process.env.WEB_SEARCH_TIMEOUT_MS,
      WEB_FETCH_DEFAULT_TIMEOUT_MS,
      1000,
      WEB_FETCH_HARD_TIMEOUT_MS
    );
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(queryValue)}`;

    try {
      const fetched = await this.fetchTextWithLimit(searchUrl, timeoutMs);
      if (!fetched.ok) {
        return {
          query: queryValue,
          results: [],
          error: `web_search provider returned HTTP ${fetched.status}`,
        };
      }

      const results = extractDuckDuckGoResults(fetched.text, maxResults);
      this.rememberSearchResults(userId, documentId, results.map(result => result.url));
      return {
        query: queryValue,
        provider: 'duckduckgo',
        results,
        truncated: results.length === maxResults,
      };
    } catch (error) {
      logger.warn('web_search failed', { userId, documentId, query: queryValue, error });
      return {
        query: queryValue,
        results: [],
        error: error instanceof Error ? error.message : 'web_search failed',
      };
    }
  }

  private static async webFetch(userId: string, documentId: string, rawUrl: string) {
    await this.getOwnedDocument(userId, documentId);
    if (!isWebRetrievalEnabled()) {
      return { error: 'Web retrieval is disabled on this server.' };
    }

    const parsed = normalizePublicHttpUrl(rawUrl);
    await this.assertPublicFetchTarget(parsed);

    if (!this.isUrlFromRecentSearch(userId, documentId, parsed.toString())) {
      return {
        url: parsed.toString(),
        error: 'web_fetch only accepts URLs returned by web_search during this agent turn. Run web_search first and choose one of its result URLs.',
      };
    }

    const timeoutMs = clampInteger(
      process.env.WEB_FETCH_TIMEOUT_MS,
      WEB_FETCH_DEFAULT_TIMEOUT_MS,
      1000,
      WEB_FETCH_HARD_TIMEOUT_MS
    );
    const maxChars = clampInteger(
      process.env.WEB_FETCH_MAX_CHARS,
      WEB_FETCH_DEFAULT_MAX_CHARS,
      1000,
      WEB_FETCH_HARD_MAX_CHARS
    );

    try {
      const fetched = await this.fetchTextWithLimit(parsed.toString(), timeoutMs);
      if (!fetched.ok) {
        return {
          url: parsed.toString(),
          finalUrl: fetched.finalUrl,
          error: `web_fetch returned HTTP ${fetched.status}`,
        };
      }

      if (
        fetched.contentType
        && !/(text\/html|application\/xhtml\+xml|text\/plain|application\/json)/i.test(fetched.contentType)
      ) {
        return {
          url: parsed.toString(),
          finalUrl: fetched.finalUrl,
          contentType: fetched.contentType,
          error: 'web_fetch only supports public text, HTML, XHTML, or JSON responses.',
        };
      }

      const title = extractTitle(fetched.text);
      const text = extractReadableText(fetched.text);
      const truncated = text.length > maxChars;
      return {
        url: parsed.toString(),
        finalUrl: fetched.finalUrl,
        title,
        text: truncated ? `${text.slice(0, maxChars)}\n[truncated]` : text,
        truncated,
      };
    } catch (error) {
      logger.warn('web_fetch failed', { userId, documentId, url: parsed.toString(), error });
      return {
        url: parsed.toString(),
        error: error instanceof Error ? error.message : 'web_fetch failed',
      };
    }
  }
}
