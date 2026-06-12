jest.mock('../../services/file.service');
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { Readable } from 'stream';
import request from 'supertest';
import { createApp } from '../../app';
import { FileService } from '../../services/file.service';
import { generateAccessToken } from '../../utils/jwt';

const MockFileService = FileService as jest.Mocked<typeof FileService>;

function authHeader(userId = 'user-1') {
  const token = generateAccessToken({
    userId,
    email: `${userId}@example.com`,
  });
  return `Bearer ${token}`;
}

function makeFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    ownerUserId: 'user-1',
    documentId: 'doc-1',
    taskId: null,
    purpose: 'document_source_pdf',
    title: 'Source PDF',
    originalFilename: 'source.pdf',
    mimeType: 'application/pdf',
    storageProvider: 'local',
    storageKey: 'files/file-1/checksum.pdf',
    storageBucket: null,
    storageRegion: null,
    storageEtag: null,
    fileSize: 10,
    checksum: 'checksum',
    pageCount: null,
    uploadStatus: 'ready',
    legacySourceId: null,
    createdAt: new Date('2026-05-15T12:00:00.000Z'),
    updatedAt: new Date('2026-05-15T12:00:00.000Z'),
    ...overrides,
  };
}

describe('file routes integration', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads a document PDF through the unified file API', async () => {
    MockFileService.uploadDocumentFile.mockResolvedValue(makeFile() as any);

    const response = await request(app)
      .post('/api/v1/documents/doc-1/files')
      .set('Authorization', authHeader())
      .field('title', 'Source PDF')
      .attach('pdf', Buffer.from('%PDF-1.4'), {
        filename: 'source.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(201);
    expect(MockFileService.uploadDocumentFile).toHaveBeenCalledWith(
      'doc-1',
      'user-1',
      expect.objectContaining({ originalname: 'source.pdf', mimetype: 'application/pdf' }),
      'Source PDF'
    );
    expect(response.body.data).toEqual(expect.objectContaining({
      id: 'file-1',
      purpose: 'document_source_pdf',
      createdAt: '2026-05-15T12:00:00.000Z',
    }));
  });

  it('rejects non-PDF uploads before the service layer', async () => {
    const response = await request(app)
      .post('/api/v1/documents/doc-1/files')
      .set('Authorization', authHeader())
      .attach('pdf', Buffer.from('not a pdf'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(400);
    expect(MockFileService.uploadDocumentFile).not.toHaveBeenCalled();
  });

  it('lists accessible task instruction files for enrolled users', async () => {
    MockFileService.listAccessibleTaskInstructionFiles.mockResolvedValue([
      makeFile({
        id: 'file-task-1',
        documentId: null,
        taskId: 'task-1',
        purpose: 'task_instruction_pdf',
        title: 'Instructions',
      }),
    ] as any);

    const response = await request(app)
      .get('/api/v1/tasks/enrollments/task-1/instruction-files')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(MockFileService.listAccessibleTaskInstructionFiles).toHaveBeenCalledWith('task-1', 'user-1');
    expect(response.body.data.file).toEqual(expect.objectContaining({
      id: 'file-task-1',
      purpose: 'task_instruction_pdf',
    }));
  });

  it('streams file content with inline PDF headers', async () => {
    MockFileService.streamFile.mockResolvedValue(Readable.from(Buffer.from('%PDF-1.4')) as any);

    const response = await request(app)
      .get('/api/v1/files/file-1/content')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe('inline');
    expect(MockFileService.streamFile).toHaveBeenCalledWith('file-1', 'user-1', { viewToken: undefined });
  });

  it('issues a view-only file token for authenticated readers', async () => {
    MockFileService.issueViewOnlyFileToken.mockResolvedValue({
      token: 'view-token-1',
      expiresAt: '2026-05-15T12:01:00.000Z',
      expiresInSeconds: 60,
    });

    const response = await request(app)
      .get('/api/v1/files/file-1/view-token')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(MockFileService.issueViewOnlyFileToken).toHaveBeenCalledWith('file-1', 'user-1');
    expect(response.body.data).toEqual({
      token: 'view-token-1',
      expiresAt: '2026-05-15T12:01:00.000Z',
      expiresInSeconds: 60,
    });
  });

  it('passes a view-only token into file streaming', async () => {
    MockFileService.streamFile.mockResolvedValue(Readable.from(Buffer.from('%PDF-1.4')) as any);

    const response = await request(app)
      .get('/api/v1/files/file-1/content?viewToken=view-token-1')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(MockFileService.streamFile).toHaveBeenCalledWith('file-1', 'user-1', { viewToken: 'view-token-1' });
  });

  it('requires authentication before streaming file content', async () => {
    const response = await request(app)
      .get('/api/v1/files/file-1/content');

    expect(response.status).toBe(401);
    expect(MockFileService.streamFile).not.toHaveBeenCalled();
  });
});
