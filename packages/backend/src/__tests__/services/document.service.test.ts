/**
 * Unit tests for DocumentService.
 * All DB models are mocked — no real database required.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../models/document.model');
jest.mock('../../models/document-event.model');
jest.mock('../../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));
jest.mock('../../config/redis', () => ({
  cacheDelPattern: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { DocumentService } from '../../services/document.service';
import { DocumentModel } from '../../models/document.model';
import { DocumentEventModel } from '../../models/document-event.model';
import { query } from '../../config/database';

const MockDocumentModel = DocumentModel as jest.Mocked<typeof DocumentModel>;
const MockDocumentEventModel = DocumentEventModel as jest.Mocked<typeof DocumentEventModel>;
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  mockQuery.mockResolvedValue([]);
});

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

// ── deleteDocument ────────────────────────────────────────────────────────────

describe('DocumentService.deleteDocument', () => {
  it('deletes document successfully', async () => {
    MockDocumentModel.delete.mockResolvedValue(true);

    await expect(DocumentService.deleteDocument('doc-1', 'user-1')).resolves.not.toThrow();
    expect(MockDocumentModel.delete).toHaveBeenCalledWith('doc-1', 'user-1');
  });

  it('throws 404 when document not found', async () => {
    MockDocumentModel.delete.mockResolvedValue(false);

    await expect(DocumentService.deleteDocument('doc-1', 'user-1')).rejects.toMatchObject({
      statusCode: 404,
    });
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

    await DocumentService.trackEvents('doc-1', 'user-1', events);

    expect(MockDocumentEventModel.batchInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ documentId: 'doc-1', userId: 'user-1' }),
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
