/**
 * Unit tests for DocumentService.
 * All DB models are mocked — no real database required.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../models/document.model');
jest.mock('../../models/document-event.model');
jest.mock('../../models/session.model');
jest.mock('../../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  transaction: jest.fn(),
}));
jest.mock('../../config/redis', () => ({
  cacheDelPattern: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../services/file-storage.service', () => ({
  FileStorageService: { delete: jest.fn() },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { DocumentService } from '../../services/document.service';
import { DocumentModel } from '../../models/document.model';
import { DocumentEventModel } from '../../models/document-event.model';
import { SessionModel } from '../../models/session.model';
import { query, queryOne, transaction } from '../../config/database';
import { cacheDelPattern } from '../../config/redis';
import { FileStorageService } from '../../services/file-storage.service';
import { logger } from '../../utils/logger';

const MockDocumentModel = DocumentModel as jest.Mocked<typeof DocumentModel>;
const MockDocumentEventModel = DocumentEventModel as jest.Mocked<typeof DocumentEventModel>;
const MockSessionModel = SessionModel as jest.Mocked<typeof SessionModel>;
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;
const mockCacheDelPattern = cacheDelPattern as jest.MockedFunction<typeof cacheDelPattern>;
const MockFileStorageService = FileStorageService as jest.Mocked<typeof FileStorageService>;
const mockLogger = logger as jest.Mocked<typeof logger>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDocument(overrides: Partial<any> = {}): any {
  return {
    id: 'doc-1',
    userId: 'user-1',
    title: 'Test Doc',
    content: {},
    plainText: 'hello world',
    status: 'draft',
    wordCount: 2,
    characterCount: 11,
    writingStartedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFile(overrides: Partial<any> = {}): any {
  return {
    id: 'file-1',
    ownerUserId: 'user-1',
    documentId: 'doc-1',
    taskId: null,
    purpose: 'document_source_pdf',
    title: 'source.pdf',
    originalFilename: 'source.pdf',
    mimeType: 'application/pdf',
    storageProvider: 'local',
    storageKey: 'files/file-1/source.pdf',
    storageBucket: null,
    storageRegion: null,
    storageEtag: null,
    fileSize: 100,
    checksum: 'checksum-1',
    pageCount: null,
    uploadStatus: 'ready',
    legacySourceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── extractPlainText ───────────────────────────────────────────────────────────

describe('DocumentService.extractPlainText', () => {
  it('returns empty string for null/undefined input', () => {
    expect(DocumentService.extractPlainText(null as any)).toBe('');
    expect(DocumentService.extractPlainText(undefined as any)).toBe('');
  });

  it('returns empty string when no root.children', () => {
    expect(DocumentService.extractPlainText({})).toBe('');
    expect(DocumentService.extractPlainText({ root: {} })).toBe('');
  });

  it('extracts text from flat text nodes', () => {
    const state = {
      root: {
        children: [{ text: 'Hello' }, { text: ' world' }],
      },
    };
    // nodes joined with newline, then trimmed
    expect(DocumentService.extractPlainText(state)).toBe('Hello\n world');
  });

  it('extracts text recursively from nested children', () => {
    const state = {
      root: {
        children: [
          { children: [{ text: 'foo' }, { text: 'bar' }] },
        ],
      },
    };
    expect(DocumentService.extractPlainText(state)).toBe('foobar');
  });

  it('trims the resulting text', () => {
    const state = { root: { children: [{ text: '  trimmed  ' }] } };
    expect(DocumentService.extractPlainText(state)).toBe('trimmed');
  });
});

// ── calculateWordCount ────────────────────────────────────────────────────────

describe('DocumentService.calculateWordCount', () => {
  it('returns 0 for empty/null input', () => {
    expect(DocumentService.calculateWordCount('')).toBe(0);
    expect(DocumentService.calculateWordCount(null as any)).toBe(0);
  });

  it('counts words correctly', () => {
    expect(DocumentService.calculateWordCount('hello world')).toBe(2);
    expect(DocumentService.calculateWordCount('one two three four')).toBe(4);
  });

  it('handles extra whitespace', () => {
    expect(DocumentService.calculateWordCount('  hello   world  ')).toBe(2);
  });
});

// ── calculateCharacterCount ───────────────────────────────────────────────────

describe('DocumentService.calculateCharacterCount', () => {
  it('returns 0 for empty/null input', () => {
    expect(DocumentService.calculateCharacterCount('')).toBe(0);
    expect(DocumentService.calculateCharacterCount(null as any)).toBe(0);
  });

  it('counts all characters including spaces', () => {
    expect(DocumentService.calculateCharacterCount('hello')).toBe(5);
    expect(DocumentService.calculateCharacterCount('hello world')).toBe(11);
  });
});

// ── createDocument ────────────────────────────────────────────────────────────

describe('DocumentService.createDocument', () => {
  it('creates a document and returns it', async () => {
    const doc = makeDocument();
    MockDocumentModel.create.mockResolvedValue(doc);

    const result = await DocumentService.createDocument('user-1', 'Test Doc', {});

    expect(MockDocumentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', title: 'Test Doc' })
    );
    expect(result).toBe(doc);
  });

  it('defaults to draft status', async () => {
    const doc = makeDocument();
    MockDocumentModel.create.mockResolvedValue(doc);

    await DocumentService.createDocument('user-1', 'Title');

    expect(MockDocumentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' })
    );
  });

  it('propagates errors from the model', async () => {
    MockDocumentModel.create.mockRejectedValue(new Error('DB error'));

    await expect(DocumentService.createDocument('user-1', 'Title')).rejects.toThrow('DB error');
  });
});

// ── getDocument ───────────────────────────────────────────────────────────────

describe('DocumentService.getDocument', () => {
  it('returns document when found', async () => {
    const doc = makeDocument();
    MockDocumentModel.findByIdAndUserId.mockResolvedValue(doc);

    const result = await DocumentService.getDocument('doc-1', 'user-1');

    expect(result).toBe(doc);
    expect(MockDocumentModel.findByIdAndUserId).toHaveBeenCalledWith('doc-1', 'user-1');
  });

  it('throws 404 when document not found', async () => {
    MockDocumentModel.findByIdAndUserId.mockResolvedValue(null);

    await expect(DocumentService.getDocument('doc-missing', 'user-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Document not found',
    });
  });
});

// ── updateDocument ────────────────────────────────────────────────────────────

describe('DocumentService.updateDocument', () => {
  it('updates and returns document', async () => {
    const updated = makeDocument({ title: 'New Title' });
    MockDocumentModel.update.mockResolvedValue(updated);

    const result = await DocumentService.updateDocument('doc-1', 'user-1', { title: 'New Title' });

    expect(result.title).toBe('New Title');
    expect(MockDocumentModel.update).toHaveBeenCalledWith(
      'doc-1',
      'user-1',
      expect.objectContaining({ title: 'New Title' })
    );
  });

  it('recalculates plainText/wordCount/characterCount when content is updated', async () => {
    const lexical = { root: { children: [{ text: 'foo bar baz' }] } };
    MockDocumentModel.update.mockResolvedValue(makeDocument());

    await DocumentService.updateDocument('doc-1', 'user-1', { content: lexical });

    const updates = MockDocumentModel.update.mock.calls[0][2];
    expect(updates.plainText).toBe('foo bar baz');
    expect(updates.wordCount).toBe(3);
    expect(updates.characterCount).toBe(11);
  });

  it('does not recalculate when content is not in updates', async () => {
    MockDocumentModel.update.mockResolvedValue(makeDocument());

    await DocumentService.updateDocument('doc-1', 'user-1', { title: 'Only title' });

    const updates = MockDocumentModel.update.mock.calls[0][2];
    expect(updates.plainText).toBeUndefined();
  });

  it('throws 404 when document not found or unauthorized', async () => {
    MockDocumentModel.update.mockResolvedValue(null);

    await expect(
      DocumentService.updateDocument('doc-1', 'user-1', { title: 'X' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('DocumentService.startWritingSession', () => {
  it('persists and returns the first writing start timestamp', async () => {
    const startedAt = new Date('2026-05-20T12:00:00.000Z');
    const doc = makeDocument({ writingStartedAt: startedAt });
    MockDocumentModel.startWritingSession.mockResolvedValue(doc);

    const result = await DocumentService.startWritingSession('doc-1', 'user-1');

    expect(result.writingStartedAt).toBe(startedAt);
    expect(MockDocumentModel.startWritingSession).toHaveBeenCalledWith('doc-1', 'user-1');
  });

  it('throws 404 when the document is missing or unauthorized', async () => {
    MockDocumentModel.startWritingSession.mockResolvedValue(null);

    await expect(DocumentService.startWritingSession('doc-missing', 'user-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Document not found or unauthorized',
    });
  });
});

// ── deleteDocument ────────────────────────────────────────────────────────────

describe('DocumentService.deleteDocument', () => {
  it('collects document files, deletes the document, and clears task analytics cache', async () => {
    const file = makeFile();
    const queryMock = jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'doc-1' }] })
      .mockResolvedValueOnce({ rows: [{ task_id: 'task-1' }] })
      .mockResolvedValueOnce({ rows: [file] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'doc-1' }] });
    mockTransaction.mockImplementationOnce(async (callback: any) => callback({ query: queryMock }));

    await expect(DocumentService.deleteDocument('doc-1', 'user-1')).resolves.not.toThrow();

    expect(mockTransaction).toHaveBeenCalled();
    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('FROM files'),
      ['doc-1', 'user-1']
    );
    expect(mockCacheDelPattern).toHaveBeenCalledWith('analytics:task-1:*');
    expect(MockFileStorageService.delete).toHaveBeenCalledWith(file);
  });

  it('throws 404 when document not found', async () => {
    mockTransaction.mockResolvedValueOnce({ deleted: false, taskIds: [], files: [] });

    await expect(DocumentService.deleteDocument('doc-1', 'user-1')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(MockFileStorageService.delete).not.toHaveBeenCalled();
  });

  it('deletes storage objects for non-legacy document files after database delete', async () => {
    const localFile = makeFile({ id: 'local-file', storageKey: 'files/local-file/source.pdf' });
    const gcsFile = makeFile({
      id: 'gcs-file',
      storageProvider: 'gcs',
      storageBucket: 'humanly-prod-pdfs',
      storageKey: 'files/gcs-file/source.pdf',
      storageEtag: 'etag-1',
    });
    mockTransaction.mockResolvedValueOnce({
      deleted: true,
      taskIds: [],
      files: [localFile, gcsFile],
    });

    await expect(DocumentService.deleteDocument('doc-1', 'user-1')).resolves.not.toThrow();

    expect(MockFileStorageService.delete).toHaveBeenCalledTimes(2);
    expect(MockFileStorageService.delete).toHaveBeenCalledWith(localFile);
    expect(MockFileStorageService.delete).toHaveBeenCalledWith(gcsFile);
  });

  it('skips legacy file storage objects', async () => {
    const legacyFile = makeFile({ legacySourceId: 'legacy-paper-1' });
    mockTransaction.mockResolvedValueOnce({
      deleted: true,
      taskIds: [],
      files: [legacyFile],
    });

    await DocumentService.deleteDocument('doc-1', 'user-1');

    expect(MockFileStorageService.delete).not.toHaveBeenCalled();
  });

  it('logs storage deletion failures without rolling back document deletion', async () => {
    const file = makeFile();
    const error = new Error('storage delete failed');
    mockTransaction.mockResolvedValueOnce({ deleted: true, taskIds: [], files: [file] });
    MockFileStorageService.delete.mockRejectedValueOnce(error);

    await expect(DocumentService.deleteDocument('doc-1', 'user-1')).resolves.not.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to delete document file storage object',
      expect.objectContaining({
        error,
        documentId: 'doc-1',
        userId: 'user-1',
        fileId: 'file-1',
        storageProvider: 'local',
        storageKey: 'files/file-1/source.pdf',
      })
    );
  });
});

// ── listDocuments ─────────────────────────────────────────────────────────────

describe('DocumentService.listDocuments', () => {
  it('returns paginated results', async () => {
    const paginated = {
      data: [makeDocument()],
      pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
    };
    MockDocumentModel.findByUserId.mockResolvedValue(paginated);

    const result = await DocumentService.listDocuments('user-1', { limit: 20, offset: 0 });

    expect(result).toBe(paginated);
    expect(MockDocumentModel.findByUserId).toHaveBeenCalledWith('user-1', { limit: 20, offset: 0 });
  });
});

// ── trackEvents ───────────────────────────────────────────────────────────────

describe('DocumentService.trackEvents', () => {
  const events: any[] = [
    { documentId: 'doc-1', userId: 'user-1', eventType: 'keydown', timestamp: new Date() },
  ];

  it('tracks events when user is owner', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockDocumentEventModel.batchInsert.mockResolvedValue(undefined);
    mockQuery.mockResolvedValueOnce([]);

    await DocumentService.trackEvents('doc-1', 'user-1', events);

    expect(MockDocumentEventModel.batchInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ documentId: 'doc-1', userId: 'user-1' }),
      ])
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM task_enrollments'),
      ['doc-1']
    );
  });

  it('validates session ownership for session-scoped events', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockSessionModel.findById.mockResolvedValue({
      id: 'session-1',
      taskId: 'task-1',
      externalUserId: 'user@example.com',
    } as any);
    mockQueryOne.mockResolvedValue({ id: 'enrollment-1' } as any);
    mockQuery.mockResolvedValueOnce([]);

    await DocumentService.trackEvents('doc-1', 'user-1', [
      { ...events[0], sessionId: 'session-1' },
    ]);

    expect(MockSessionModel.findById).toHaveBeenCalledWith('session-1');
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('FROM task_enrollments'),
      ['task-1', 'user-1', 'doc-1', 'user@example.com']
    );
    expect(MockDocumentEventModel.batchInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ sessionId: 'session-1' }),
      ])
    );
  });

  it('throws 404 when user is not owner', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(false);

    await expect(
      DocumentService.trackEvents('doc-1', 'user-other', events)
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(MockDocumentEventModel.batchInsert).not.toHaveBeenCalled();
  });
});

// ── getDocumentEvents ─────────────────────────────────────────────────────────

describe('DocumentService.getDocumentEvents', () => {
  it('returns events and total count', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockDocumentEventModel.findByDocumentId.mockResolvedValue([{ id: 'evt-1' }] as any);
    MockDocumentEventModel.countByDocumentIdWithFilters.mockResolvedValue(1);

    const result = await DocumentService.getDocumentEvents('doc-1', 'user-1');

    expect(result.events).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('throws 404 when user is not owner', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(false);

    await expect(
      DocumentService.getDocumentEvents('doc-1', 'user-other')
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── getDocumentEventTimeline ─────────────────────────────────────────────────

describe('DocumentService.getDocumentEventTimeline', () => {
  it('returns grouped timeline data for owned documents', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockDocumentEventModel.findByDocumentId.mockResolvedValue([
      {
        id: 'evt-1',
        documentId: 'doc-1',
        userId: 'user-1',
        eventType: 'keydown',
        timestamp: new Date('2026-05-20T12:00:00.000Z'),
        keyChar: 'H',
        textBefore: '',
        textAfter: 'H',
        cursorPosition: 1,
        createdAt: new Date('2026-05-20T12:00:00.000Z'),
      },
    ] as any);
    MockDocumentEventModel.countByDocumentIdWithFilters.mockResolvedValue(1);

    const result = await DocumentService.getDocumentEventTimeline('doc-1', 'user-1');

    expect(result.summary.rawEventTotal).toBe(1);
    expect(result.items[0]).toMatchObject({ kind: 'typing_burst', text: 'H' });
    expect(MockDocumentEventModel.findByDocumentId).toHaveBeenCalledWith(
      'doc-1',
      expect.objectContaining({ limit: 10000, offset: 0 })
    );
  });

  it('throws 404 when user is not owner', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(false);

    await expect(
      DocumentService.getDocumentEventTimeline('doc-1', 'user-other')
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── getDocumentStatistics ─────────────────────────────────────────────────────

describe('DocumentService.getDocumentStatistics', () => {
  it('returns statistics', async () => {
    const stats = { wordCount: 100, characterCount: 500 } as any;
    MockDocumentModel.getStatistics.mockResolvedValue(stats);

    const result = await DocumentService.getDocumentStatistics('doc-1', 'user-1');

    expect(result).toBe(stats);
    expect(MockDocumentModel.getStatistics).toHaveBeenCalledWith('doc-1', 'user-1');
  });

  it('throws 404 when stats not found', async () => {
    MockDocumentModel.getStatistics.mockResolvedValue(null);

    await expect(
      DocumentService.getDocumentStatistics('doc-1', 'user-1')
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
