import OpenAI from 'openai';
import path from 'path';
import { query, queryOne } from '../config/database';
import { DocumentModel } from '../models/document.model';
import { FileModel } from '../models/file.model';
import { DocumentEventModel } from '../models/document-event.model';
import { FileStorageService } from './file-storage.service';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

type Tool = OpenAI.Responses.FunctionTool;

interface SearchResult {
  source: string;
  pageNumber?: number;
  sectionTitle?: string;
  startOffset?: number;
  endOffset?: number;
  text: string;
}

const MAX_TEXT = 12000;
const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 200;

function clampLimit(limit?: number, fallback = 10, max = 50): number {
  if (!limit || Number.isNaN(limit)) return fallback;
  return Math.min(Math.max(Math.floor(limit), 1), max);
}

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

function scoreText(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
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
  static readonly tools: Tool[] = [
    {
      type: 'function',
      name: 'getDocumentPlainText',
      description: 'Retrieve the latest plain text for the current document.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          documentId: { type: 'string' },
        },
        required: ['documentId'],
      },
    },
    {
      type: 'function',
      name: 'getDocumentContent',
      description: 'Retrieve the Lexical JSON editor state for the current document when structure is needed.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          documentId: { type: 'string' },
        },
        required: ['documentId'],
      },
    },
    {
      type: 'function',
      name: 'searchDocumentText',
      description: 'Search the current document plain text and return the most relevant excerpts.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          documentId: { type: 'string' },
          query: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['documentId', 'query', 'limit'],
      },
    },
    {
      type: 'function',
      name: 'getDocumentEvents',
      description: 'Retrieve writing/editing activity events for process, revision, paste, cursor, or authorship questions.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          documentId: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          eventType: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['documentId', 'startDate', 'endDate', 'eventType', 'limit'],
      },
    },
    {
      type: 'function',
      name: 'getLinkedFiles',
      description: 'Find uploaded PDF files linked to the current document or its enrolled task.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          documentId: { type: 'string' },
        },
        required: ['documentId'],
      },
    },
    {
      type: 'function',
      name: 'searchFileText',
      description: 'Search extracted text chunks from a linked PDF file.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fileId: { type: 'string' },
          query: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['fileId', 'query', 'limit'],
      },
    },
    {
      type: 'function',
      name: 'getFilePage',
      description: 'Retrieve extracted text for a specific PDF page.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fileId: { type: 'string' },
          pageNumber: { type: 'integer' },
        },
        required: ['fileId', 'pageNumber'],
      },
    },
    {
      type: 'function',
      name: 'getFileSection',
      description: 'Retrieve extracted text for a detected section of a linked PDF file.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fileId: { type: 'string' },
          sectionTitle: { type: 'string' },
        },
        required: ['fileId', 'sectionTitle'],
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
      case 'getDocumentPlainText':
        return JSON.stringify(await this.getDocumentPlainText(userId, this.requireDocumentScope(scopedDocumentId, args.documentId)));
      case 'getDocumentContent':
        return JSON.stringify(await this.getDocumentContent(userId, this.requireDocumentScope(scopedDocumentId, args.documentId)));
      case 'searchDocumentText':
        return JSON.stringify(await this.searchDocumentText(userId, this.requireDocumentScope(scopedDocumentId, args.documentId), args.query, args.limit));
      case 'getDocumentEvents':
        return JSON.stringify(await this.getDocumentEvents(userId, this.requireDocumentScope(scopedDocumentId, args.documentId), {
          startDate: args.startDate || undefined,
          endDate: args.endDate || undefined,
          eventType: args.eventType || undefined,
          limit: args.limit,
        }));
      case 'getLinkedFiles':
        return JSON.stringify(await this.getLinkedFiles(userId, this.requireDocumentScope(scopedDocumentId, args.documentId)));
      case 'searchFileText':
        return JSON.stringify(await this.searchFileText(userId, scopedDocumentId, args.fileId, args.query, args.limit));
      case 'getFilePage':
        return JSON.stringify(await this.getFilePage(userId, scopedDocumentId, args.fileId, args.pageNumber));
      case 'getFileSection':
        return JSON.stringify(await this.getFileSection(userId, scopedDocumentId, args.fileId, args.sectionTitle));
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
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

  private static requireDocumentScope(scopedDocumentId: string, requestedDocumentId: string): string {
    if (requestedDocumentId !== scopedDocumentId) {
      throw new AppError(403, 'Tool call document is outside the current chat scope');
    }
    return scopedDocumentId;
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

  private static async getDocumentPlainText(userId: string, documentId: string) {
    const document = await this.getOwnedDocument(userId, documentId);
    return {
      documentId,
      title: document.title,
      plainText: excerpt(document.plainText),
      wordCount: document.wordCount,
      characterCount: document.characterCount,
      updatedAt: document.updatedAt,
    };
  }

  private static async getDocumentContent(userId: string, documentId: string) {
    const document = await this.getOwnedDocument(userId, documentId);
    return {
      documentId,
      title: document.title,
      content: document.content,
      updatedAt: document.updatedAt,
    };
  }

  private static async searchDocumentText(userId: string, documentId: string, searchQuery: string, limit?: number) {
    const document = await this.getOwnedDocument(userId, documentId);
    const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const chunks = makeChunks(document.plainText);
    const results: SearchResult[] = chunks
      .map((text, index) => ({
        source: 'document',
        startOffset: index * (CHUNK_SIZE - CHUNK_OVERLAP),
        endOffset: index * (CHUNK_SIZE - CHUNK_OVERLAP) + text.length,
        text,
        score: scoreText(text, terms),
      }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, clampLimit(limit))
      .map(({ score: _score, ...result }) => result);

    return { documentId, query: searchQuery, results };
  }

  private static async getDocumentEvents(
    userId: string,
    documentId: string,
    filters: { startDate?: string; endDate?: string; eventType?: string; limit?: number }
  ) {
    await this.getOwnedDocument(userId, documentId);
    const events = await DocumentEventModel.findByDocumentId(documentId, {
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      eventType: filters.eventType || undefined,
      limit: clampLimit(filters.limit, 100, 500),
    } as any);

    return {
      documentId,
      events: events.map(event => ({
        id: event.id,
        eventType: event.eventType,
        timestamp: event.timestamp,
        keyCode: event.keyCode,
        keyChar: event.keyChar,
        cursorPosition: event.cursorPosition,
        selectionStart: event.selectionStart,
        selectionEnd: event.selectionEnd,
        textBefore: event.textBefore ? excerpt(event.textBefore, 500) : undefined,
        textAfter: event.textAfter ? excerpt(event.textAfter, 500) : undefined,
        metadata: event.metadata,
      })),
    };
  }

  private static async getLinkedFiles(userId: string, documentId: string) {
    await this.getOwnedDocument(userId, documentId);
    const files = await query<any>(
      `SELECT DISTINCT files.id,
              files.title,
              files.purpose,
              files.original_filename,
              files.page_count,
              files.file_size,
              files.created_at
       FROM files
       LEFT JOIN task_enrollments te
         ON te.task_id = files.task_id
        AND te.user_id = $2
        AND te.submission_document_id = $1
       WHERE files.document_id = $1
          OR te.id IS NOT NULL
       ORDER BY files.created_at DESC`,
      [documentId, userId]
    );
    return {
      documentId,
      files: files.map(file => ({
        id: file.id,
        title: file.title,
        purpose: file.purpose,
        originalFilename: file.original_filename,
        pageCount: file.page_count,
        fileSize: file.file_size,
        createdAt: file.created_at,
      })),
    };
  }

  private static async searchFileText(
    userId: string,
    documentId: string,
    fileId: string,
    searchQuery: string,
    limit?: number
  ) {
    await this.assertLinkedFile(userId, documentId, fileId);
    await this.indexFile(fileId);

    const rows = await query<any>(
      `SELECT page_number, section_title, text,
              ts_rank(to_tsvector('english', text), plainto_tsquery('english', $2)) AS rank
       FROM file_text_chunks
       WHERE file_id = $1
         AND to_tsvector('english', text) @@ plainto_tsquery('english', $2)
       ORDER BY rank DESC, chunk_index ASC
       LIMIT $3`,
      [fileId, searchQuery, clampLimit(limit)]
    );

    return {
      fileId,
      query: searchQuery,
      results: rows.map(row => ({
        source: 'file',
        pageNumber: row.page_number,
        sectionTitle: row.section_title,
        text: excerpt(row.text, 2500),
      })),
    };
  }

  private static async getFilePage(userId: string, documentId: string, fileId: string, pageNumber: number) {
    await this.assertLinkedFile(userId, documentId, fileId);
    await this.indexFile(fileId);

    const row = await queryOne<{ text: string }>(
      'SELECT text FROM file_pages WHERE file_id = $1 AND page_number = $2',
      [fileId, pageNumber]
    );
    if (!row) {
      throw new AppError(404, 'File page not found');
    }
    return { fileId, pageNumber, text: excerpt(row.text) };
  }

  private static async getFileSection(userId: string, documentId: string, fileId: string, sectionTitle: string) {
    await this.assertLinkedFile(userId, documentId, fileId);
    await this.indexFile(fileId);

    const row = await queryOne<any>(
      `SELECT section_title, start_page, end_page, text
       FROM file_sections
       WHERE file_id = $1 AND lower(section_title) LIKE lower($2)
       ORDER BY length(section_title) ASC
       LIMIT 1`,
      [fileId, `%${sectionTitle}%`]
    );
    if (!row) {
      throw new AppError(404, 'File section not found');
    }
    return {
      fileId,
      sectionTitle: row.section_title,
      startPage: row.start_page,
      endPage: row.end_page,
      text: excerpt(row.text),
    };
  }
}
