jest.mock('../../services/document.service');
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import request from 'supertest';
import { createApp } from '../../app';
import { generateAccessToken } from '../../utils/jwt';
import { DocumentService } from '../../services/document.service';

const MockDocumentService = DocumentService as jest.Mocked<typeof DocumentService>;

function makeAuthHeader(overrides: Partial<{ userId: string; email: string }> = {}) {
  const token = generateAccessToken({
    userId: overrides.userId || 'user-1',
    email: overrides.email || 'alice@example.com',
  });
  return `Bearer ${token}`;
}

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    userId: 'user-1',
    title: 'Research Notes',
    content: {},
    plainText: 'Research Notes',
    status: 'draft',
    wordCount: 2,
    characterCount: 14,
    createdAt: new Date('2026-03-14T12:00:00.000Z'),
    updatedAt: new Date('2026-03-14T12:00:00.000Z'),
    ...overrides,
  };
}

describe('documents routes integration', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated document list requests', async () => {
    const response = await request(app).get('/api/v1/documents');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      error: 'Authentication required',
      message: 'Authentication required',
    });
    expect(MockDocumentService.listDocuments).not.toHaveBeenCalled();
  });

  it('lists documents for an authenticated user and clamps pagination params', async () => {
    MockDocumentService.listDocuments.mockResolvedValue({
      data: [makeDocument()],
      pagination: { total: 1, limit: 100, offset: 5, hasMore: false },
    } as any);

    const response = await request(app)
      .get('/api/v1/documents?limit=999&offset=5&sortBy=title&sortOrder=asc')
      .set('Authorization', makeAuthHeader());

    expect(response.status).toBe(200);
    expect(MockDocumentService.listDocuments).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        limit: 100,
        offset: 5,
        sortBy: 'title',
        sortOrder: 'asc',
      })
    );
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.any(Array),
        pagination: expect.objectContaining({ total: 1 }),
      })
    );
  });

  it('creates a document for an authenticated user', async () => {
    const document = makeDocument();
    MockDocumentService.createDocument.mockResolvedValue(document as any);

    const response = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', makeAuthHeader())
      .send({ title: 'Research Notes', content: { root: { children: [] } } });

    expect(response.status).toBe(201);
    expect(MockDocumentService.createDocument).toHaveBeenCalledWith(
      'user-1',
      'Research Notes',
      { root: { children: [] } },
      'draft',
      null,
      null
    );
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        data: {
          document: expect.objectContaining({
            id: 'doc-1',
            title: 'Research Notes',
            status: 'draft',
            createdAt: '2026-03-14T12:00:00.000Z',
            updatedAt: '2026-03-14T12:00:00.000Z',
          }),
        },
        message: 'Document created successfully',
      })
    );
  });

  it('rejects empty event batches before hitting the service layer', async () => {
    const response = await request(app)
      .post('/api/v1/documents/doc-1/events')
      .set('Authorization', makeAuthHeader())
      .send({ events: [] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'Events array is required and must not be empty',
      message: 'Events array is required and must not be empty',
    });
    expect(MockDocumentService.trackEvents).not.toHaveBeenCalled();
  });

  it('passes validated events to the document service', async () => {
    MockDocumentService.trackEvents.mockResolvedValue(undefined);

    const response = await request(app)
      .post('/api/v1/documents/doc-1/events')
      .set('Authorization', makeAuthHeader())
      .send({
        events: [
          {
            eventType: 'keydown',
            timestamp: '2026-03-14T15:30:00.000Z',
            keyChar: 'a',
            cursorPosition: 3,
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(MockDocumentService.trackEvents).toHaveBeenCalledWith(
      'doc-1',
      'user-1',
      [
        expect.objectContaining({
          documentId: 'doc-1',
          userId: 'user-1',
          eventType: 'keydown',
          keyChar: 'a',
          cursorPosition: 3,
          timestamp: new Date('2026-03-14T15:30:00.000Z'),
        }),
      ]
    );
    expect(response.body).toEqual({
      success: true,
      message: '1 events tracked successfully',
    });
  });
});
