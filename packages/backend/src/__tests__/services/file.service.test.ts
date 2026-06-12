jest.mock('../../models/document.model');
jest.mock('../../models/file.model');
jest.mock('../../models/task.model');
jest.mock('../../services/file-storage.service');
jest.mock('../../services/ai-retrieval.service');
jest.mock('../../config/database', () => ({
  queryOne: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { Readable } from 'stream';
import { queryOne } from '../../config/database';
import { DocumentModel } from '../../models/document.model';
import { FileModel } from '../../models/file.model';
import { TaskModel } from '../../models/task.model';
import { AIRetrievalService } from '../../services/ai-retrieval.service';
import { FileService } from '../../services/file.service';
import { FileStorageService } from '../../services/file-storage.service';
import { logger } from '../../utils/logger';

const MockDocumentModel = DocumentModel as jest.Mocked<typeof DocumentModel>;
const MockFileModel = FileModel as jest.Mocked<typeof FileModel>;
const MockTaskModel = TaskModel as jest.Mocked<typeof TaskModel>;
const MockFileStorageService = FileStorageService as jest.Mocked<typeof FileStorageService>;
const MockAIRetrievalService = AIRetrievalService as jest.Mocked<typeof AIRetrievalService>;
const MockLogger = logger as jest.Mocked<typeof logger>;
const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;
const PDF_BYTES = Buffer.from('%PDF-1.4');
const PDF_CHECKSUM = 'e16fa5d9b51928755db85b917f0297babaf22c7a47e97d9212adab56e61ba04e';

function makeMulterFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'pdf',
    originalname: 'source.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 10,
    buffer: Buffer.from('%PDF-1.4'),
    stream: Readable.from([]),
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function makeAppFile(overrides: Record<string, unknown> = {}) {
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('FileService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockFileStorageService.supportsSignedUploads.mockReturnValue(true);
    MockFileStorageService.buildObjectKey.mockImplementation((fileId: string, checksum: string) => `files/${fileId}/${checksum}.pdf`);
    MockFileStorageService.createSignedUploadUrl.mockResolvedValue({
      url: 'https://storage.example/upload',
      expiresAt: new Date('2026-05-15T12:30:00.000Z'),
      requiredHeaders: { 'Content-Type': 'application/pdf' },
    });
    MockFileStorageService.createSignedReadUrl.mockResolvedValue({
      url: 'https://storage.example/read',
      expiresAt: new Date('2026-05-15T12:10:00.000Z'),
    });
    MockFileStorageService.getMetadata.mockResolvedValue({
      exists: true,
      contentType: 'application/pdf',
      size: PDF_BYTES.length,
      etag: 'etag-ready',
    });
    MockFileStorageService.getBuffer.mockResolvedValue(PDF_BYTES);
    MockFileStorageService.store.mockResolvedValue({
      storageProvider: 'local',
      storageKey: 'files/file-1/checksum.pdf',
      storageBucket: null,
      storageRegion: null,
      storageEtag: null,
      checksum: 'checksum',
      fileSize: 10,
      uploadStatus: 'ready',
    });
    MockAIRetrievalService.indexFile.mockResolvedValue(undefined);
  });

  it('uploads a document PDF only after verifying document ownership', async () => {
    MockDocumentModel.findByIdAndUserId.mockResolvedValue({ id: 'doc-1', title: 'My Document' } as any);
    MockFileModel.create.mockResolvedValue(makeAppFile() as any);

    const file = await FileService.uploadDocumentFile('doc-1', 'user-1', makeMulterFile(), 'Source PDF');

    expect(MockDocumentModel.findByIdAndUserId).toHaveBeenCalledWith('doc-1', 'user-1');
    expect(MockFileModel.create).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      taskId: null,
      purpose: 'document_source_pdf',
      title: 'Source PDF',
      storageProvider: 'local',
    }));
    expect(MockAIRetrievalService.indexFile).toHaveBeenCalledWith('file-1');
    expect(file.id).toBe('file-1');
  });

  it('initiates a signed document PDF upload with a pending file record', async () => {
    MockDocumentModel.findByIdAndUserId.mockResolvedValue({ id: 'doc-1', title: 'My Document' } as any);
    MockFileModel.create.mockResolvedValue(makeAppFile({
      uploadStatus: 'pending',
      storageProvider: 'gcs',
      storageKey: `files/file-1/${PDF_CHECKSUM}.pdf`,
    }) as any);

    const upload = await FileService.initiateDocumentFileUpload('doc-1', 'user-1', {
      title: 'Source PDF',
      filename: 'source.pdf',
      mimeType: 'application/pdf',
      fileSize: PDF_BYTES.length,
      checksum: PDF_CHECKSUM,
    });

    expect(MockDocumentModel.findByIdAndUserId).toHaveBeenCalledWith('doc-1', 'user-1');
    expect(MockFileStorageService.createSignedUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^files\/[0-9a-f-]+\/[a-f0-9]{64}\.pdf$/),
      'application/pdf'
    );
    expect(MockFileModel.create).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      taskId: null,
      purpose: 'document_source_pdf',
      storageProvider: 'gcs',
      storageKey: expect.stringMatching(/^files\/[0-9a-f-]+\/[a-f0-9]{64}\.pdf$/),
      checksum: PDF_CHECKSUM,
      fileSize: PDF_BYTES.length,
      uploadStatus: 'pending',
    }));
    expect(upload).toEqual(expect.objectContaining({
      uploadUrl: 'https://storage.example/upload',
      requiredHeaders: { 'Content-Type': 'application/pdf' },
      expiresAt: '2026-05-15T12:30:00.000Z',
    }));
  });

  it('falls back to multipart clients when signed uploads are unavailable', async () => {
    MockFileStorageService.supportsSignedUploads.mockReturnValue(false);

    await expect(FileService.initiateDocumentFileUpload('doc-1', 'user-1', {
      filename: 'source.pdf',
      mimeType: 'application/pdf',
      fileSize: PDF_BYTES.length,
      checksum: PDF_CHECKSUM,
    })).rejects.toMatchObject({ statusCode: 409 });

    expect(MockDocumentModel.findByIdAndUserId).not.toHaveBeenCalled();
    expect(MockFileModel.create).not.toHaveBeenCalled();
  });

  it('records GCS object metadata when document PDF upload uses GCS storage', async () => {
    MockDocumentModel.findByIdAndUserId.mockResolvedValue({ id: 'doc-1', title: 'My Document' } as any);
    MockFileStorageService.store.mockResolvedValueOnce({
      storageProvider: 'gcs',
      storageKey: 'files/file-1/checksum.pdf',
      storageBucket: 'humanly-prod-pdfs',
      storageRegion: 'US',
      storageEtag: 'etag-1',
      checksum: 'checksum',
      fileSize: 10,
      uploadStatus: 'ready',
    });
    MockFileModel.create.mockResolvedValue(makeAppFile({
      storageProvider: 'gcs',
      storageBucket: 'humanly-prod-pdfs',
      storageRegion: 'US',
      storageEtag: 'etag-1',
    }) as any);

    await FileService.uploadDocumentFile('doc-1', 'user-1', makeMulterFile(), 'Source PDF');

    expect(MockFileModel.create).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      storageProvider: 'gcs',
      storageKey: 'files/file-1/checksum.pdf',
      storageBucket: 'humanly-prod-pdfs',
      storageRegion: 'US',
      storageEtag: 'etag-1',
      uploadStatus: 'ready',
    }));
  });

  it('rejects empty PDF payloads before storage', async () => {
    MockDocumentModel.findByIdAndUserId.mockResolvedValue({ id: 'doc-1', title: 'My Document' } as any);

    await expect(
      FileService.uploadDocumentFile('doc-1', 'user-1', makeMulterFile({
        size: 0,
        buffer: Buffer.alloc(0),
      }), 'Source PDF')
    ).rejects.toMatchObject({ statusCode: 400, message: 'PDF file is empty' });

    expect(MockFileStorageService.store).not.toHaveBeenCalled();
  });

  it('rejects application/pdf payloads without a PDF signature before storage', async () => {
    MockDocumentModel.findByIdAndUserId.mockResolvedValue({ id: 'doc-1', title: 'My Document' } as any);

    await expect(
      FileService.uploadDocumentFile('doc-1', 'user-1', makeMulterFile({
        size: 15,
        buffer: Buffer.from('not really a pdf'),
      }), 'Source PDF')
    ).rejects.toMatchObject({ statusCode: 400, message: 'Invalid PDF file' });

    expect(MockFileStorageService.store).not.toHaveBeenCalled();
  });

  it('rejects task instruction uploads by non-owners', async () => {
    MockTaskModel.findById.mockResolvedValue({ id: 'task-1', userId: 'owner-1' } as any);

    await expect(
      FileService.uploadTaskInstructionFile('task-1', 'user-1', makeMulterFile(), 'Instructions')
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(MockFileStorageService.store).not.toHaveBeenCalled();
  });

  it('checks read permissions before opening file storage streams', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({ documentId: 'doc-1' }) as any);
    MockDocumentModel.isOwner.mockResolvedValue(false);

    await expect(FileService.streamFile('file-1', 'user-2')).rejects.toMatchObject({ statusCode: 403 });

    expect(MockFileStorageService.getStream).not.toHaveBeenCalled();
  });

  it('allows enrolled users to stream task instruction files', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({
      documentId: null,
      taskId: 'task-1',
      purpose: 'task_instruction_pdf',
    }) as any);
    MockTaskModel.findById.mockResolvedValue({ id: 'task-1', userId: 'owner-1' } as any);
    MockTaskModel.hasEnrollment.mockResolvedValue(true);
    MockFileStorageService.getStream.mockResolvedValue(Readable.from(Buffer.from('%PDF-1.4')) as any);

    await FileService.streamFile('file-1', 'user-1');

    expect(MockTaskModel.hasEnrollment).toHaveBeenCalledWith('task-1', 'user-1');
    expect(MockFileStorageService.getStream).toHaveBeenCalledWith(expect.objectContaining({
      storageKey: 'files/file-1/checksum.pdf',
      storageProvider: 'local',
    }));
  });

  it('completes a signed document PDF upload after verifying the stored object', async () => {
    const pendingFile = makeAppFile({
      storageProvider: 'gcs',
      storageBucket: 'humanly-prod-pdfs',
      storageKey: `files/file-1/${PDF_CHECKSUM}.pdf`,
      storageEtag: null,
      fileSize: PDF_BYTES.length,
      checksum: PDF_CHECKSUM,
      uploadStatus: 'pending',
      createdAt: new Date(),
    });
    const readyFile = makeAppFile({
      ...pendingFile,
      storageEtag: 'etag-ready',
      uploadStatus: 'ready',
    });
    MockFileModel.findById.mockResolvedValue(pendingFile as any);
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockFileModel.markReady.mockResolvedValue(readyFile as any);

    const completed = await FileService.completeFileUpload('file-1', 'user-1');

    expect(MockFileStorageService.getMetadata).toHaveBeenCalledWith(expect.objectContaining({
      id: 'file-1',
      storageProvider: 'gcs',
    }));
    expect(MockFileStorageService.getBuffer).toHaveBeenCalledWith(expect.objectContaining({
      id: 'file-1',
      storageKey: `files/file-1/${PDF_CHECKSUM}.pdf`,
    }));
    expect(MockFileModel.markReady).toHaveBeenCalledWith('file-1', { storageEtag: 'etag-ready' });
    expect(MockAIRetrievalService.indexFile).toHaveBeenCalledWith('file-1');
    expect(completed.uploadStatus).toBe('ready');
  });

  it('marks signed uploads failed when the GCS object is missing on complete', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({
      storageProvider: 'gcs',
      checksum: PDF_CHECKSUM,
      uploadStatus: 'pending',
      createdAt: new Date(),
    }) as any);
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockFileStorageService.getMetadata.mockResolvedValue({ exists: false });
    MockFileModel.markFailed.mockResolvedValue(makeAppFile({ uploadStatus: 'failed' }) as any);

    await expect(FileService.completeFileUpload('file-1', 'user-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Uploaded file object was not found',
    });
    expect(MockFileModel.markFailed).toHaveBeenCalledWith('file-1');
    expect(MockFileStorageService.getBuffer).not.toHaveBeenCalled();
  });

  it('marks signed uploads failed when the completed object checksum differs', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({
      storageProvider: 'gcs',
      checksum: 'f'.repeat(64),
      fileSize: PDF_BYTES.length,
      uploadStatus: 'pending',
      createdAt: new Date(),
    }) as any);
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockFileModel.markFailed.mockResolvedValue(makeAppFile({ uploadStatus: 'failed' }) as any);

    await expect(FileService.completeFileUpload('file-1', 'user-1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Uploaded file checksum does not match the initiated upload',
    });
    expect(MockFileModel.markFailed).toHaveBeenCalledWith('file-1');
  });

  it('expires stale pending signed uploads before touching storage', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({
      storageProvider: 'gcs',
      checksum: PDF_CHECKSUM,
      uploadStatus: 'pending',
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    }) as any);
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockFileModel.markFailed.mockResolvedValue(makeAppFile({ uploadStatus: 'failed' }) as any);

    await expect(FileService.completeFileUpload('file-1', 'user-1')).rejects.toMatchObject({
      statusCode: 410,
      message: 'File upload has expired',
    });
    expect(MockFileModel.markFailed).toHaveBeenCalledWith('file-1');
    expect(MockFileStorageService.getMetadata).not.toHaveBeenCalled();
  });

  it('returns signed read URLs for ready GCS files after permission checks', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({
      storageProvider: 'gcs',
      storageBucket: 'humanly-prod-pdfs',
      uploadStatus: 'ready',
    }) as any);
    MockDocumentModel.isOwner.mockResolvedValue(true);

    const readUrl = await FileService.getFileReadUrl('file-1', 'user-1');

    expect(MockFileStorageService.createSignedReadUrl).toHaveBeenCalledWith(expect.objectContaining({
      id: 'file-1',
      storageProvider: 'gcs',
    }));
    expect(readUrl).toEqual({
      url: 'https://storage.example/read',
      expiresAt: '2026-05-15T12:10:00.000Z',
      fallbackMode: 'signed_url',
    });
  });

  it('returns stream fallback for ready local files', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({ uploadStatus: 'ready' }) as any);
    MockDocumentModel.isOwner.mockResolvedValue(true);

    await expect(FileService.getFileReadUrl('file-1', 'user-1')).resolves.toEqual({
      url: null,
      expiresAt: null,
      fallbackMode: 'stream',
    });
    expect(MockFileStorageService.createSignedReadUrl).not.toHaveBeenCalled();
  });

  it('does not issue signed read URLs for view-only GCS files', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({
      storageProvider: 'gcs',
      storageBucket: 'humanly-prod-pdfs',
      uploadStatus: 'ready',
    }) as any);
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockDocumentModel.findById.mockResolvedValue({
      id: 'doc-1',
      environmentConfig: { resourceAccess: 'view-only' },
    } as any);

    await expect(FileService.getFileReadUrl('file-1', 'user-1')).resolves.toEqual({
      url: null,
      expiresAt: null,
      fallbackMode: 'stream',
    });
    expect(MockFileStorageService.createSignedReadUrl).not.toHaveBeenCalled();
  });

  it('rejects direct streams for view-only task instruction files without a short-lived token', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({
      documentId: null,
      taskId: 'task-1',
      purpose: 'task_instruction_pdf',
    }) as any);
    MockTaskModel.findById.mockResolvedValue({
      id: 'task-1',
      userId: 'owner-1',
      environmentConfig: { resourceAccess: 'view-only' },
    } as any);
    MockTaskModel.hasEnrollment.mockResolvedValue(true);

    await expect(FileService.streamFile('file-1', 'user-1')).rejects.toMatchObject({
      statusCode: 403,
      message: 'View-only file token is required',
    });

    expect(MockFileStorageService.getStream).not.toHaveBeenCalled();
    expect(MockLogger.warn).toHaveBeenCalledWith('Rejected view-only file access', expect.objectContaining({
      fileId: 'file-1',
      userId: 'user-1',
      reason: 'missing_token',
    }));
  });

  it('issues a short-lived token and streams view-only files when the token matches the user and file', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({
      documentId: null,
      taskId: 'task-1',
      purpose: 'task_instruction_pdf',
    }) as any);
    MockTaskModel.findById.mockResolvedValue({
      id: 'task-1',
      userId: 'owner-1',
      environmentConfig: { resourceAccess: 'view-only' },
    } as any);
    MockTaskModel.hasEnrollment.mockResolvedValue(true);
    MockFileStorageService.getStream.mockResolvedValue(Readable.from(Buffer.from('%PDF-1.4')) as any);

    const { token, expiresInSeconds } = await FileService.issueViewOnlyFileToken('file-1', 'user-1');
    await FileService.streamFile('file-1', 'user-1', { viewToken: token });

    expect(expiresInSeconds).toBe(60);
    expect(token).toEqual(expect.any(String));
    expect(MockFileStorageService.getStream).toHaveBeenCalledWith(expect.objectContaining({
      storageKey: 'files/file-1/checksum.pdf',
      storageProvider: 'local',
    }));
  });

  it('rejects invalid or expired view-only tokens before opening file storage streams', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({
      documentId: null,
      taskId: 'task-1',
      purpose: 'task_instruction_pdf',
    }) as any);
    MockTaskModel.findById.mockResolvedValue({
      id: 'task-1',
      userId: 'owner-1',
      environmentConfig: { resourceAccess: 'view-only' },
    } as any);
    MockTaskModel.hasEnrollment.mockResolvedValue(true);

    await expect(
      FileService.streamFile('file-1', 'user-1', { viewToken: 'not-a-valid-token' })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'View-only file token is invalid or expired',
    });

    expect(MockFileStorageService.getStream).not.toHaveBeenCalled();
    expect(MockLogger.warn).toHaveBeenCalledWith('Rejected view-only file access', expect.objectContaining({
      fileId: 'file-1',
      userId: 'user-1',
      reason: 'invalid_or_expired_token',
    }));
  });

  it('does not delete legacy physical storage when removing backfilled file records', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({ legacySourceId: 'legacy-1' }) as any);
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockFileModel.delete.mockResolvedValue(undefined);

    await FileService.deleteFile('file-1', 'user-1');

    expect(MockFileStorageService.delete).not.toHaveBeenCalled();
    expect(MockFileModel.delete).toHaveBeenCalledWith('file-1');
  });

  it('checks document-scoped AI file access through linked documents or enrolled tasks', async () => {
    MockFileModel.findById.mockResolvedValue(makeAppFile({
      documentId: null,
      taskId: 'task-1',
      purpose: 'task_instruction_pdf',
    }) as any);
    mockQueryOne.mockResolvedValue({ id: 'enrollment-1' });

    await expect(FileService.canReadFileForDocument('user-1', 'doc-1', 'file-1')).resolves.toBe(true);
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('task_enrollments'), [
      'task-1',
      'user-1',
      'doc-1',
    ]);
  });
});
