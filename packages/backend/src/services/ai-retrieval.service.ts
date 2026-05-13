import OpenAI from 'openai';
import path from 'path';
import { query, queryOne } from '../config/database';
import { DocumentModel } from '../models/document.model';
import { PaperModel } from '../models/paper.model';
import { PaperStorageService } from './paper-storage.service';
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
      name: 'getDocumentText',
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
      name: 'searchDocument',
      description: 'Grep-style keyword search over the current document. Returns the most relevant excerpts with their character offsets.',
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
      name: 'listLinkedPapers',
      description: 'List PDF papers linked to the current document (use this before calling getPaperContent to discover paper IDs).',
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
      // Single discriminated paper-lookup tool replacing searchPaperText /
      // getPaperPage / getPaperSection. strict:false because exactly one of
      // query / pageNumber / sectionTitle is supplied per mode.
      type: 'function',
      name: 'getPaperContent',
      description:
        'Retrieve content from a linked PDF paper. Choose mode = "search" (keyword search; supply query), "page" (specific page; supply pageNumber), or "section" (named section like "Methods"; supply sectionTitle).',
      strict: false,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          paperId: { type: 'string', description: 'Paper ID returned by listLinkedPapers.' },
          mode: { type: 'string', enum: ['search', 'page', 'section'] },
          query: { type: 'string', description: 'Required when mode="search".' },
          pageNumber: { type: 'integer', description: 'Required when mode="page" (1-indexed).' },
          sectionTitle: { type: 'string', description: 'Required when mode="section" (partial match OK).' },
          limit: { type: 'integer', description: 'Optional result cap for mode="search" (default 10, max 50).' },
        },
        required: ['paperId', 'mode'],
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
      case 'getDocumentText':
        return JSON.stringify(
          await this.getDocumentText(userId, this.requireDocumentScope(scopedDocumentId, args.documentId))
        );
      case 'searchDocument':
        return JSON.stringify(
          await this.searchDocument(
            userId,
            this.requireDocumentScope(scopedDocumentId, args.documentId),
            args.query,
            args.limit
          )
        );
      case 'listLinkedPapers':
        return JSON.stringify(
          await this.listLinkedPapers(userId, this.requireDocumentScope(scopedDocumentId, args.documentId))
        );
      case 'getPaperContent':
        return JSON.stringify(await this.getPaperContent(userId, scopedDocumentId, args));
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }

  private static async getPaperContent(
    userId: string,
    scopedDocumentId: string,
    args: Record<string, any>
  ) {
    const { paperId, mode } = args;
    if (!paperId || typeof paperId !== 'string') {
      throw new AppError(400, 'getPaperContent: paperId is required');
    }
    switch (mode) {
      case 'search':
        if (!args.query) throw new AppError(400, 'getPaperContent: query is required when mode="search"');
        return this.searchPaperText(userId, scopedDocumentId, paperId, args.query, args.limit);
      case 'page':
        if (!args.pageNumber) throw new AppError(400, 'getPaperContent: pageNumber is required when mode="page"');
        return this.getPaperPage(userId, scopedDocumentId, paperId, args.pageNumber);
      case 'section':
        if (!args.sectionTitle) throw new AppError(400, 'getPaperContent: sectionTitle is required when mode="section"');
        return this.getPaperSection(userId, scopedDocumentId, paperId, args.sectionTitle);
      default:
        throw new AppError(400, `getPaperContent: unknown mode "${mode}" (expected "search" | "page" | "section")`);
    }
  }

  static async indexPaper(paperId: string): Promise<void> {
    const paper = await PaperModel.findById(paperId);
    if (!paper) {
      throw new AppError(404, 'Paper not found');
    }

    const existing = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM paper_pages WHERE paper_id = $1',
      [paperId]
    );
    if (parseInt(existing?.count || '0', 10) > 0) {
      return;
    }

    const buffer = await PaperStorageService.getBuffer(paper.pdfStoragePath);

    try {
      const pages = await extractPdfPages(buffer);

      await query('DELETE FROM paper_pages WHERE paper_id = $1', [paperId]);
      await query('DELETE FROM paper_sections WHERE paper_id = $1', [paperId]);
      await query('DELETE FROM paper_text_chunks WHERE paper_id = $1', [paperId]);

      for (const page of pages) {
        await query(
          `INSERT INTO paper_pages (paper_id, page_number, text)
           VALUES ($1, $2, $3)
           ON CONFLICT (paper_id, page_number)
           DO UPDATE SET text = EXCLUDED.text, updated_at = NOW()`,
          [paperId, page.pageNumber, page.text]
        );
      }

      let chunkIndex = 0;
      for (const page of pages) {
        for (const chunk of makeChunks(page.text)) {
          if (chunk.trim()) {
            await query(
              `INSERT INTO paper_text_chunks (paper_id, page_number, chunk_index, text)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (paper_id, chunk_index)
               DO UPDATE SET page_number = EXCLUDED.page_number, text = EXCLUDED.text`,
              [paperId, page.pageNumber, chunkIndex++, chunk]
            );
          }
        }
      }

      for (const section of detectSections(pages)) {
        await query(
          `INSERT INTO paper_sections (paper_id, section_title, start_page, end_page, text)
           VALUES ($1, $2, $3, $4, $5)`,
          [paperId, section.sectionTitle, section.startPage, section.endPage, section.text]
        );
      }
    } catch (error) {
      logger.error('Failed to index paper text', { paperId, error });
      throw new AppError(500, 'Failed to extract paper text');
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

  private static async assertLinkedPaper(userId: string, documentId: string, paperId: string): Promise<void> {
    await this.getOwnedDocument(userId, documentId);
    const paper = await queryOne<{ id: string }>(
      'SELECT id FROM papers WHERE id = $1 AND document_id = $2',
      [paperId, documentId]
    );
    if (!paper) {
      throw new AppError(404, 'Linked paper not found');
    }
  }

  private static async getDocumentText(userId: string, documentId: string) {
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

  private static async searchDocument(userId: string, documentId: string, searchQuery: string, limit?: number) {
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

  private static async listLinkedPapers(userId: string, documentId: string) {
    await this.getOwnedDocument(userId, documentId);
    const papers = await query<any>(
      `SELECT id, title, abstract, keywords, pdf_page_count, status, created_at
       FROM papers
       WHERE document_id = $1
       ORDER BY created_at DESC`,
      [documentId]
    );
    return {
      documentId,
      papers: papers.map(paper => ({
        id: paper.id,
        title: paper.title,
        abstract: paper.abstract,
        keywords: paper.keywords,
        pdfPageCount: paper.pdf_page_count,
        status: paper.status,
        createdAt: paper.created_at,
      })),
    };
  }

  private static async searchPaperText(
    userId: string,
    documentId: string,
    paperId: string,
    searchQuery: string,
    limit?: number
  ) {
    await this.assertLinkedPaper(userId, documentId, paperId);
    await this.indexPaper(paperId);

    const rows = await query<any>(
      `SELECT page_number, section_title, text,
              ts_rank(to_tsvector('english', text), plainto_tsquery('english', $2)) AS rank
       FROM paper_text_chunks
       WHERE paper_id = $1
         AND to_tsvector('english', text) @@ plainto_tsquery('english', $2)
       ORDER BY rank DESC, chunk_index ASC
       LIMIT $3`,
      [paperId, searchQuery, clampLimit(limit)]
    );

    return {
      paperId,
      query: searchQuery,
      results: rows.map(row => ({
        source: 'paper',
        pageNumber: row.page_number,
        sectionTitle: row.section_title,
        text: excerpt(row.text, 2500),
      })),
    };
  }

  private static async getPaperPage(userId: string, documentId: string, paperId: string, pageNumber: number) {
    await this.assertLinkedPaper(userId, documentId, paperId);
    await this.indexPaper(paperId);

    const row = await queryOne<{ text: string }>(
      'SELECT text FROM paper_pages WHERE paper_id = $1 AND page_number = $2',
      [paperId, pageNumber]
    );
    if (!row) {
      throw new AppError(404, 'Paper page not found');
    }
    return { paperId, pageNumber, text: excerpt(row.text) };
  }

  private static async getPaperSection(userId: string, documentId: string, paperId: string, sectionTitle: string) {
    await this.assertLinkedPaper(userId, documentId, paperId);
    await this.indexPaper(paperId);

    const row = await queryOne<any>(
      `SELECT section_title, start_page, end_page, text
       FROM paper_sections
       WHERE paper_id = $1 AND lower(section_title) LIKE lower($2)
       ORDER BY length(section_title) ASC
       LIMIT 1`,
      [paperId, `%${sectionTitle}%`]
    );
    if (!row) {
      throw new AppError(404, 'Paper section not found');
    }
    return {
      paperId,
      sectionTitle: row.section_title,
      startPage: row.start_page,
      endPage: row.end_page,
      text: excerpt(row.text),
    };
  }
}
