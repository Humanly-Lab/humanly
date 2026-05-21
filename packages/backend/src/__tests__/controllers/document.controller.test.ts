/**
 * Unit tests for document.controller.ts
 * DocumentService is fully mocked — no DB or network required.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../services/document.service');
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import {
  createDocument,
  getDocument,
  listDocuments,
  updateDocument,
  deleteDocument,
  trackDocumentEvents,
  getDocumentEvents,
  getDocumentEventTimeline,
  getDocumentStatistics,
} from '../../controllers/document.controller';
import { DocumentService } from '../../services/document.service';
import { AppError } from '../../middleware/error-handler';

const MockDocumentService = DocumentService as jest.Mocked<typeof DocumentService>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { userId: 'user-1' },
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as any;
}

function makeRes(): jest.Mocked<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeDocument(overrides: Partial<any> = {}): any {
  return {
    id: 'doc-1',
    userId: 'user-1',
    title: 'My Doc',
    content: {},
    plainText: 'hello',
    status: 'draft',
    wordCount: 1,
    characterCount: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── createDocument ────────────────────────────────────────────────────────────

describe('createDocument', () => {
  it('returns 201 with created document', async () => {
    const doc = makeDocument();
    MockDocumentService.createDocument.mockResolvedValue(doc);

    const req = makeReq({ body: { title: 'My Doc' } });
    const res = makeRes();

    await createDocument(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { document: doc } })
    );
    expect(MockDocumentService.createDocument).toHaveBeenCalledWith(
      'user-1', 'My Doc', {}, 'draft', null, null
    );
  });

  it('throws 400 when title is missing', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();

    await expect(createDocument(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('passes status when provided', async () => {
    MockDocumentService.createDocument.mockResolvedValue(makeDocument({ status: 'published' }));

    const req = makeReq({ body: { title: 'Doc', status: 'published' } });
    const res = makeRes();

    await createDocument(req, res);

    expect(MockDocumentService.createDocument).toHaveBeenCalledWith(
      'user-1', 'Doc', {}, 'published', null, null
    );
  });
});

// ── getDocument ───────────────────────────────────────────────────────────────

describe('getDocument', () => {
  it('returns document by id', async () => {
    const doc = makeDocument();
    MockDocumentService.getDocument.mockResolvedValue(doc);

    const req = makeReq({ params: { id: 'doc-1' } });
    const res = makeRes();

    await getDocument(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { document: doc } })
    );
    expect(MockDocumentService.getDocument).toHaveBeenCalledWith('doc-1', 'user-1');
  });

  it('throws 400 when id is missing', async () => {
    const req = makeReq({ params: {} });
    const res = makeRes();

    await expect(getDocument(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── listDocuments ─────────────────────────────────────────────────────────────

describe('listDocuments', () => {
  it('returns paginated list', async () => {
    const paginated = {
      data: [makeDocument()],
      pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
    };
    MockDocumentService.listDocuments.mockResolvedValue(paginated as any);

    const req = makeReq({ query: {} });
    const res = makeRes();

    await listDocuments(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: paginated.data })
    );
  });

  it('clamps limit to 100', async () => {
    MockDocumentService.listDocuments.mockResolvedValue({ data: [], pagination: {} } as any);

    const req = makeReq({ query: { limit: '999' } });
    const res = makeRes();

    await listDocuments(req, res);

    expect(MockDocumentService.listDocuments).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ limit: 100 })
    );
  });
});

// ── updateDocument ────────────────────────────────────────────────────────────

describe('updateDocument', () => {
  it('updates document and returns it', async () => {
    const doc = makeDocument({ title: 'Updated' });
    MockDocumentService.updateDocument.mockResolvedValue(doc);

    const req = makeReq({ params: { id: 'doc-1' }, body: { title: 'Updated' } });
    const res = makeRes();

    await updateDocument(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { document: doc } })
    );
    expect(MockDocumentService.updateDocument).toHaveBeenCalledWith(
      'doc-1', 'user-1', { title: 'Updated' }
    );
  });

  it('throws 400 when id is missing', async () => {
    const req = makeReq({ params: {}, body: {} });
    const res = makeRes();

    await expect(updateDocument(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('only includes defined fields in updates', async () => {
    MockDocumentService.updateDocument.mockResolvedValue(makeDocument());

    const req = makeReq({ params: { id: 'doc-1' }, body: { status: 'published' } });
    const res = makeRes();

    await updateDocument(req, res);

    const updates = MockDocumentService.updateDocument.mock.calls[0][2];
    expect(updates).toEqual({ status: 'published' });
    expect(updates).not.toHaveProperty('title');
    expect(updates).not.toHaveProperty('content');
  });
});

// ── deleteDocument ────────────────────────────────────────────────────────────

describe('deleteDocument', () => {
  it('deletes document and returns success', async () => {
    MockDocumentService.deleteDocument.mockResolvedValue(undefined);

    const req = makeReq({ params: { id: 'doc-1' } });
    const res = makeRes();

    await deleteDocument(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(MockDocumentService.deleteDocument).toHaveBeenCalledWith('doc-1', 'user-1');
  });

  it('throws 400 when id is missing', async () => {
    const req = makeReq({ params: {} });
    const res = makeRes();

    await expect(deleteDocument(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── trackDocumentEvents ───────────────────────────────────────────────────────

describe('trackDocumentEvents', () => {
  const events = [
    { eventType: 'keydown', timestamp: new Date().toISOString(), keyChar: 'a' },
  ];

  it('tracks events and returns success', async () => {
    MockDocumentService.trackEvents.mockResolvedValue(undefined);

    const req = makeReq({ params: { id: 'doc-1' }, body: { events } });
    const res = makeRes();

    await trackDocumentEvents(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(MockDocumentService.trackEvents).toHaveBeenCalledWith(
      'doc-1',
      'user-1',
      expect.arrayContaining([expect.objectContaining({ documentId: 'doc-1', userId: 'user-1' })])
    );
  });

  it('throws 400 when id is missing', async () => {
    const req = makeReq({ params: {}, body: { events } });
    const res = makeRes();

    await expect(trackDocumentEvents(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when events array is empty', async () => {
    const req = makeReq({ params: { id: 'doc-1' }, body: { events: [] } });
    const res = makeRes();

    await expect(trackDocumentEvents(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when events is not an array', async () => {
    const req = makeReq({ params: { id: 'doc-1' }, body: { events: 'bad' } });
    const res = makeRes();

    await expect(trackDocumentEvents(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── getDocumentEvents ─────────────────────────────────────────────────────────

describe('getDocumentEvents', () => {
  it('returns events and total', async () => {
    MockDocumentService.getDocumentEvents.mockResolvedValue({
      events: [{ id: 'evt-1' }] as any,
      total: 1,
    });

    const req = makeReq({ params: { id: 'doc-1' }, query: {} });
    const res = makeRes();

    await getDocumentEvents(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, count: 1 })
    );
  });

  it('throws 400 when id is missing', async () => {
    const req = makeReq({ params: {}, query: {} });
    const res = makeRes();

    await expect(getDocumentEvents(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('parses comma-separated eventType query param', async () => {
    MockDocumentService.getDocumentEvents.mockResolvedValue({ events: [], total: 0 });

    const req = makeReq({ params: { id: 'doc-1' }, query: { eventType: 'keydown,keyup' } });
    const res = makeRes();

    await getDocumentEvents(req, res);

    const filters = MockDocumentService.getDocumentEvents.mock.calls[0][2];
    expect(filters.eventType).toEqual(['keydown', 'keyup']);
  });
});

// ── getDocumentEventTimeline ─────────────────────────────────────────────────

describe('getDocumentEventTimeline', () => {
  it('returns derived timeline data', async () => {
    const timeline = {
      items: [{ id: 'typing-1', kind: 'typing_burst' }],
      summary: { rawEventTotal: 3, timelineItemTotal: 1 },
    } as any;
    MockDocumentService.getDocumentEventTimeline.mockResolvedValue(timeline);

    const req = makeReq({ params: { id: 'doc-1' }, query: {} });
    const res = makeRes();

    await getDocumentEventTimeline(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: timeline })
    );
    expect(MockDocumentService.getDocumentEventTimeline).toHaveBeenCalledWith(
      'doc-1',
      'user-1',
      expect.objectContaining({ limit: 10000, offset: 0 })
    );
  });

  it('throws 400 when id is missing', async () => {
    const req = makeReq({ params: {}, query: {} });
    const res = makeRes();

    await expect(getDocumentEventTimeline(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── getDocumentStatistics ─────────────────────────────────────────────────────

describe('getDocumentStatistics', () => {
  it('returns statistics', async () => {
    const stats = { wordCount: 50, characterCount: 250 } as any;
    MockDocumentService.getDocumentStatistics.mockResolvedValue(stats);

    const req = makeReq({ params: { id: 'doc-1' } });
    const res = makeRes();

    await getDocumentStatistics(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { statistics: stats } })
    );
  });

  it('throws 400 when id is missing', async () => {
    const req = makeReq({ params: {} });
    const res = makeRes();

    await expect(getDocumentStatistics(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });
});
