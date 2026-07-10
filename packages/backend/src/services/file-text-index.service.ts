import crypto from 'crypto';
import path from 'path';
import type { FileTextIndexStatus } from '@humanly/shared';
import { transaction, query, queryOne } from '../config/database';
import { AppError } from '../middleware/error-handler';
import { FileModel } from '../models/file.model';
import { logger } from '../utils/logger';
import { FileStorageService } from './file-storage.service';

const INDEX_VERSION = 1;
const MAX_INDEX_ATTEMPTS = 3;
const PROCESSING_STALE_AFTER_MS = 10 * 60 * 1000;
const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 200;
const MAX_TEXT = 12000;
const MAX_ERROR_LENGTH = 1000;

export interface FileTextIndexRecord {
  fileId: string;
  status: FileTextIndexStatus;
  generationId: string;
  indexVersion: number;
  attempts: number;
  pageCount: number | null;
  textPageCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtractedTextPage {
  pageNumber: number;
  text: string;
}

interface TextSection {
  sectionTitle: string;
  startPage: number;
  endPage: number;
  text: string;
}

interface TextChunk {
  pageNumber: number;
  chunkIndex: number;
  text: string;
}

export interface FileTextIndexPublicationPlan {
  pages: ExtractedTextPage[];
  sections: TextSection[];
  chunks: TextChunk[];
  status: Extract<FileTextIndexStatus, 'ready' | 'unavailable'>;
  pageCount: number;
  textPageCount: number;
}

export interface FileTextIndexAttemptDecisionInput {
  status: FileTextIndexStatus;
  indexVersion: number;
  attempts: number;
  startedAt?: Date | null;
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

function detectSections(pages: ExtractedTextPage[]): TextSection[] {
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

async function extractPdfPages(buffer: Buffer): Promise<ExtractedTextPage[]> {
  const pdfjs = require('pdfjs-dist/build/pdf.js') as any;
  const packageDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    standardFontDataUrl: path.join(packageDir, 'standard_fonts') + path.sep,
  });
  const pdf = await loadingTask.promise;

  try {
    const pages: ExtractedTextPage[] = [];
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

function toIndexRecord(row: any): FileTextIndexRecord {
  return {
    fileId: row.fileId,
    status: row.status,
    generationId: row.generationId,
    indexVersion: Number(row.indexVersion),
    attempts: Number(row.attempts),
    pageCount: row.pageCount === null || row.pageCount === undefined ? null : Number(row.pageCount),
    textPageCount: Number(row.textPageCount || 0),
    startedAt: row.startedAt || null,
    completedAt: row.completedAt || null,
    lastError: row.lastError || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const fileTextIndexColumns = `
  file_id as "fileId",
  status,
  generation_id as "generationId",
  index_version as "indexVersion",
  attempts,
  page_count as "pageCount",
  text_page_count as "textPageCount",
  started_at as "startedAt",
  completed_at as "completedAt",
  last_error as "lastError",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

export function truncateTextIndexError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'Unknown text indexing error');
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}...` : message;
}

export function buildFileTextIndexPublicationPlan(pages: ExtractedTextPage[]): FileTextIndexPublicationPlan {
  const normalizedPages = pages
    .slice()
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map(page => ({
      pageNumber: page.pageNumber,
      text: page.text || '',
    }));

  const chunks: TextChunk[] = [];
  let chunkIndex = 0;
  for (const page of normalizedPages) {
    for (const chunk of makeChunks(page.text)) {
      if (chunk.trim()) {
        chunks.push({ pageNumber: page.pageNumber, chunkIndex: chunkIndex++, text: chunk });
      }
    }
  }

  const textPageCount = normalizedPages.filter(page => page.text.trim().length > 0).length;
  return {
    pages: normalizedPages,
    sections: detectSections(normalizedPages),
    chunks,
    status: textPageCount > 0 ? 'ready' : 'unavailable',
    pageCount: normalizedPages.length,
    textPageCount,
  };
}

export function shouldStartFileTextIndexAttempt(
  record: FileTextIndexAttemptDecisionInput,
  options: { force?: boolean; now?: number } = {}
): boolean {
  if (options.force) {
    return true;
  }

  const isCurrentVersion = record.indexVersion === INDEX_VERSION;
  if (isCurrentVersion && (record.status === 'ready' || record.status === 'unavailable')) {
    return false;
  }

  if (record.status === 'processing') {
    const startedAt = record.startedAt?.getTime() || 0;
    const isStale = startedAt > 0 &&
      (options.now ?? Date.now()) - startedAt > PROCESSING_STALE_AFTER_MS;
    return isStale;
  }

  if (record.status === 'failed' && record.attempts >= MAX_INDEX_ATTEMPTS) {
    return false;
  }

  return true;
}

export class FileTextIndexService {
  static readonly currentIndexVersion = INDEX_VERSION;

  static async getStatusForFiles(fileIds: string[]): Promise<Map<string, FileTextIndexRecord>> {
    const uniqueFileIds = Array.from(new Set(fileIds.filter(Boolean)));
    if (uniqueFileIds.length === 0) {
      return new Map();
    }

    const rows = await query<any>(
      `SELECT ${fileTextIndexColumns}
       FROM file_text_indexes
       WHERE file_id = ANY($1::uuid[])`,
      [uniqueFileIds]
    );

    return new Map(rows.map(row => [row.fileId, toIndexRecord(row)]));
  }

  static async ensureIndexed(fileId: string, options: { force?: boolean } = {}): Promise<FileTextIndexRecord> {
    const appFile = await FileModel.findById(fileId);
    if (!appFile) {
      throw new AppError(404, 'File not found');
    }

    const attempt = await this.beginIndexAttempt(fileId, options.force === true);
    if (!attempt.shouldRun) {
      return attempt.record;
    }

    const indexingStartedAt = Date.now();
    try {
      const buffer = await FileStorageService.getBuffer(appFile);
      const pages = await extractPdfPages(buffer);
      const plan = buildFileTextIndexPublicationPlan(pages);
      const published = await this.publishIndex(fileId, attempt.generationId, plan);
      const record = published || await this.getOrCreateRecord(fileId);
      logger.info('File text indexing completed', {
        fileId,
        durationMs: Date.now() - indexingStartedAt,
        pageCount: record.pageCount,
        status: record.status,
        textPageCount: record.textPageCount,
      });
      return record;
    } catch (error) {
      logger.error('Failed to index file text', {
        fileId,
        durationMs: Date.now() - indexingStartedAt,
        error,
      });
      const failed = await this.markIndexFailed(fileId, attempt.generationId, error);
      throw new AppError(500, failed?.lastError || 'Failed to extract file text');
    }
  }

  static async reindex(fileId: string): Promise<FileTextIndexRecord> {
    return this.ensureIndexed(fileId, { force: true });
  }

  private static async getOrCreateRecord(fileId: string): Promise<FileTextIndexRecord> {
    await query(
      `INSERT INTO file_text_indexes (file_id, status, generation_id, index_version)
       VALUES ($1, 'pending', $2, $3)
       ON CONFLICT (file_id) DO NOTHING`,
      [fileId, crypto.randomUUID(), INDEX_VERSION]
    );

    const record = await queryOne<any>(
      `SELECT ${fileTextIndexColumns}
       FROM file_text_indexes
       WHERE file_id = $1`,
      [fileId]
    );
    if (!record) {
      throw new AppError(500, 'Failed to load file text index status');
    }
    return toIndexRecord(record);
  }

  private static async beginIndexAttempt(
    fileId: string,
    force: boolean
  ): Promise<{ shouldRun: false; record: FileTextIndexRecord } | { shouldRun: true; generationId: string; record: FileTextIndexRecord }> {
    return transaction(async (client) => {
      await client.query(
        `INSERT INTO file_text_indexes (file_id, status, generation_id, index_version)
         VALUES ($1, 'pending', $2, $3)
         ON CONFLICT (file_id) DO NOTHING`,
        [fileId, crypto.randomUUID(), INDEX_VERSION]
      );

      const currentResult = await client.query(
        `SELECT ${fileTextIndexColumns}
         FROM file_text_indexes
         WHERE file_id = $1
         FOR UPDATE`,
        [fileId]
      );
      const current = toIndexRecord(currentResult.rows[0]);

      if (!shouldStartFileTextIndexAttempt(current, { force })) {
        return { shouldRun: false, record: current };
      }

      const generationId = crypto.randomUUID();
      const updated = await client.query(
        `UPDATE file_text_indexes
         SET status = 'processing',
             generation_id = $2,
             index_version = $3,
             attempts = attempts + 1,
             started_at = NOW(),
             completed_at = NULL,
             last_error = NULL,
             updated_at = NOW()
         WHERE file_id = $1
         RETURNING ${fileTextIndexColumns}`,
        [fileId, generationId, INDEX_VERSION]
      );

      return {
        shouldRun: true,
        generationId,
        record: toIndexRecord(updated.rows[0]),
      };
    });
  }

  private static async publishIndex(
    fileId: string,
    generationId: string,
    plan: FileTextIndexPublicationPlan
  ): Promise<FileTextIndexRecord | null> {
    return transaction(async (client) => {
      const current = await client.query(
        `SELECT generation_id as "generationId"
         FROM file_text_indexes
         WHERE file_id = $1
         FOR UPDATE`,
        [fileId]
      );
      if (!current.rows[0] || current.rows[0].generationId !== generationId) {
        return null;
      }

      await client.query('DELETE FROM file_pages WHERE file_id = $1', [fileId]);
      await client.query('DELETE FROM file_sections WHERE file_id = $1', [fileId]);
      await client.query('DELETE FROM file_text_chunks WHERE file_id = $1', [fileId]);

      for (const page of plan.pages) {
        await client.query(
          `INSERT INTO file_pages (file_id, page_number, text)
           VALUES ($1, $2, $3)`,
          [fileId, page.pageNumber, page.text]
        );
      }

      for (const chunk of plan.chunks) {
        await client.query(
          `INSERT INTO file_text_chunks (file_id, page_number, chunk_index, text)
           VALUES ($1, $2, $3, $4)`,
          [fileId, chunk.pageNumber, chunk.chunkIndex, chunk.text]
        );
      }

      for (const section of plan.sections) {
        await client.query(
          `INSERT INTO file_sections (file_id, section_title, start_page, end_page, text)
           VALUES ($1, $2, $3, $4, $5)`,
          [fileId, section.sectionTitle, section.startPage, section.endPage, section.text]
        );
      }

      const updated = await client.query(
        `UPDATE file_text_indexes
         SET status = $2,
             page_count = $3,
             text_page_count = $4,
             completed_at = NOW(),
             last_error = NULL,
             updated_at = NOW()
         WHERE file_id = $1
         RETURNING ${fileTextIndexColumns}`,
        [fileId, plan.status, plan.pageCount, plan.textPageCount]
      );

      return toIndexRecord(updated.rows[0]);
    });
  }

  private static async markIndexFailed(
    fileId: string,
    generationId: string,
    error: unknown
  ): Promise<FileTextIndexRecord | null> {
    return transaction(async (client) => {
      const current = await client.query(
        `SELECT generation_id as "generationId"
         FROM file_text_indexes
         WHERE file_id = $1
         FOR UPDATE`,
        [fileId]
      );
      if (!current.rows[0] || current.rows[0].generationId !== generationId) {
        return null;
      }

      const updated = await client.query(
        `UPDATE file_text_indexes
         SET status = 'failed',
             completed_at = NOW(),
             last_error = $2,
             updated_at = NOW()
         WHERE file_id = $1
         RETURNING ${fileTextIndexColumns}`,
        [fileId, truncateTextIndexError(error)]
      );
      return toIndexRecord(updated.rows[0]);
    });
  }
}
