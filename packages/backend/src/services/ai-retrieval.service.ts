import OpenAI from 'openai';
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
  // Three unix-style primitives for reading uploaded reference files.
  // The agent NEVER has tools that can reach the user's editor draft — that
  // boundary is enforced by absence (no tool exists), not by prompt politeness.
  // PDFs are surfaced as plain text with inline `[page N]` markers; the agent
  // sees and cites these markers naturally without needing a page-aware mode.
  static readonly tools: Tool[] = [
    {
      type: 'function',
      name: 'ls',
      description:
        'List uploaded reference files attached to the current chat. Takes no arguments: use {}. Returns { files: [{ id, filename, lineCount, pageCount, hasPages, sizeHint }] } in upload order. lineCount/pageCount may be null if extraction metadata is not ready. Use sizeHint to choose read-all vs grep-first; do not pass documentId.',
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
        'Case-insensitive literal substring search over one uploaded reference file. Use a file id from ls. Returns up to 50 matches in document order: each is { line, page (nearest preceding [page N] marker, or null), text, contextLines? }. Pattern is plain text, not regex. Always include context_before and context_after integers. If it returns nothing, try a synonym, shorter substring, numbered heading, or targeted read.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string', description: 'File id returned by ls({}).' },
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
        'Read a contiguous line range from one uploaded reference file. Use a file id from ls. Returns { lines: [{ line, text }], totalLines, hasPages, pageRange, truncated }. offset is the 1-indexed first line and limit is max lines returned; always include both. The full content of requested lines is returned. For PDFs, [page N] markers appear as their own lines; cite them when answering.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string', description: 'File id returned by ls({}).' },
          offset: { type: 'integer', description: '1-indexed start line. Default 1.' },
          limit: { type: 'integer', description: 'Max lines to return. Default 200.' },
        },
        required: ['file', 'offset', 'limit'],
      },
    },
  ];

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
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}. Available tools: ls, grep, read.` });
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
      'Fallback uploaded-reference snapshot:',
      'Use this snapshot only for direct answer synthesis when the agent tool loop is unavailable or has timed out. If it is insufficient or truncated, say what evidence is missing instead of inventing details.',
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
    files: Array<{
      id: string;
      filename: string;
      lineCount?: number | null;
      pageCount?: number | null;
      hasPages?: boolean;
      sizeHint?: 'unknown' | 'small' | 'medium' | 'large';
    }>;
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
    const fileIds = files.map((file) => file.id);
    const metadataByFileId = new Map<
      string,
      { lineCount: number; pageCount: number; hasPages: boolean; sizeHint: 'small' | 'medium' | 'large' }
    >();

    if (fileIds.length > 0) {
      const pageRows = await query<{ file_id: string; page_number: number; text: string }>(
        `SELECT file_id, page_number, text
         FROM file_pages
         WHERE file_id = ANY($1::uuid[])
         ORDER BY file_id ASC, page_number ASC`,
        [fileIds]
      );
      const grouped = new Map<string, { pageCount: number; lineCount: number }>();
      for (const row of pageRows) {
        const current = grouped.get(row.file_id) || { pageCount: 0, lineCount: 0 };
        current.pageCount += 1;
        // loadFileText adds one `[page N]` marker line per page before
        // the page text, so expose the same logical line count in ls.
        current.lineCount += 1 + (row.text || '').split('\n').length;
        grouped.set(row.file_id, current);
      }
      for (const [fileId, metadata] of grouped) {
        metadataByFileId.set(fileId, {
          ...metadata,
          hasPages: metadata.pageCount > 0,
          sizeHint:
            metadata.lineCount <= 200
              ? 'small'
              : metadata.lineCount <= 1000
                ? 'medium'
                : 'large',
        });
      }
    }

    return {
      files: files.map((file) => {
        const metadata = metadataByFileId.get(file.id);
        return {
          id: file.id,
          filename: file.title || file.original_filename || 'untitled',
          lineCount: metadata?.lineCount ?? null,
          pageCount: metadata?.pageCount ?? null,
          hasPages: metadata?.hasPages ?? false,
          sizeHint: metadata?.sizeHint ?? 'unknown',
        };
      }),
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
}
