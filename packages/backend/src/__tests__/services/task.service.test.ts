jest.mock('../../models/task.model');
jest.mock('../../models/document.model');
jest.mock('../../models/session.model');
jest.mock('../../models/submission.model');
jest.mock('../../models/certificate.model');
jest.mock('../../models/file.model');
jest.mock('../../services/certificate.service');
jest.mock('../../services/file-storage.service', () => ({
  FileStorageService: { delete: jest.fn() },
}));
jest.mock('../../config/redis', () => ({
  cacheDelPattern: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { TaskService } from '../../services/task.service';
import { TaskModel } from '../../models/task.model';
import { DocumentModel } from '../../models/document.model';
import { SessionModel } from '../../models/session.model';
import { SubmissionModel } from '../../models/submission.model';
import { CertificateModel } from '../../models/certificate.model';
import { FileModel } from '../../models/file.model';
import { CertificateService } from '../../services/certificate.service';
import { FileStorageService } from '../../services/file-storage.service';
import { cacheDelPattern } from '../../config/redis';
import { logger } from '../../utils/logger';

const MockTaskModel = TaskModel as jest.Mocked<typeof TaskModel>;
const MockDocumentModel = DocumentModel as jest.Mocked<typeof DocumentModel>;
const MockSessionModel = SessionModel as jest.Mocked<typeof SessionModel>;
const MockSubmissionModel = SubmissionModel as jest.Mocked<typeof SubmissionModel>;
const MockCertificateModel = CertificateModel as jest.Mocked<typeof CertificateModel>;
const MockFileModel = FileModel as jest.Mocked<typeof FileModel>;
const MockCertificateService = CertificateService as jest.Mocked<typeof CertificateService>;
const MockFileStorageService = FileStorageService as jest.Mocked<typeof FileStorageService>;
const mockCacheDelPattern = cacheDelPattern as jest.MockedFunction<typeof cacheDelPattern>;
const mockLogger = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  jest.clearAllMocks();
});

function makeTask(overrides: Partial<any> = {}): any {
  return {
    id: 'task-1',
    userId: 'admin-1',
    name: 'Task',
    description: null,
    taskToken: 'ABCDEF123456',
    userIdKey: 'userId',
    externalServiceType: null,
    externalServiceUrl: null,
    allowedLlmModels: ['GPT-4o mini'],
    aiUsageLimit: 100,
    startDate: new Date(),
    endDate: new Date(),
    environmentConfig: null,
    isActive: true,
    enrolledUserCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFile(overrides: Partial<any> = {}): any {
  return {
    id: 'file-1',
    ownerUserId: 'admin-1',
    documentId: null,
    taskId: 'task-1',
    purpose: 'task_instruction_pdf',
    title: 'instructions.pdf',
    originalFilename: 'instructions.pdf',
    mimeType: 'application/pdf',
    storageProvider: 'local',
    storageKey: 'files/file-1/instructions.pdf',
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

function makeDocument(overrides: Partial<any> = {}): any {
  return {
    id: 'doc-1',
    userId: 'user-1',
    title: 'Submission',
    content: { root: { children: [] } },
    plainText: 'Submission text',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSubmission(overrides: Partial<any> = {}): any {
  return {
    id: 'submission-1',
    taskId: 'task-1',
    userId: 'user-1',
    documentId: 'doc-1',
    certificateId: null,
    submittedAt: new Date(),
    payloadSnapshot: { root: { children: [] } },
    plainTextSnapshot: 'Submission text',
    supersedesSubmissionId: null,
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeCertificate(overrides: Partial<any> = {}): any {
  return {
    id: 'certificate-1',
    submissionId: 'submission-1',
    documentId: 'doc-1',
    userId: 'user-1',
    certificateType: 'full_authorship',
    status: 'active',
    verificationToken: 'verification-token-1',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('TaskService.submitTaskDocument', () => {
  it('marks the latest user submission session as submitted', async () => {
    const task = makeTask({
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
    });
    const submission = makeSubmission();
    const certificate = makeCertificate();

    MockTaskModel.findById.mockResolvedValue(task);
    MockTaskModel.hasEnrollment.mockResolvedValue(true);
    MockTaskModel.linkSubmissionDocument.mockResolvedValue(true);
    MockDocumentModel.findByIdAndUserId.mockResolvedValue(makeDocument());
    MockSubmissionModel.findLatestForUserTask.mockResolvedValue(null);
    MockSubmissionModel.markHistoricalForUserTask.mockResolvedValue(undefined);
    MockSubmissionModel.create.mockResolvedValue(submission);
    MockSubmissionModel.attachCertificate.mockResolvedValue({
      ...submission,
      certificateId: certificate.id,
    });
    MockCertificateModel.markSupersededForDocument.mockResolvedValue(undefined);
    MockCertificateService.generateCertificate.mockResolvedValue(certificate);
    MockSessionModel.markLatestSubmittedForTaskUser.mockResolvedValue(undefined);

    await TaskService.submitTaskDocument('task-1', 'user-1', 'doc-1', 'student@example.com');

    expect(MockSessionModel.markLatestSubmittedForTaskUser).toHaveBeenCalledWith(
      'task-1',
      'student@example.com'
    );
    expect(mockCacheDelPattern).toHaveBeenCalledWith('analytics:task-1:*');
  });
});

describe('TaskService.deleteTask', () => {
  it('deletes task instruction storage after deleting the task', async () => {
    const localFile = makeFile({ id: 'local-file', storageKey: 'files/local-file/source.pdf' });
    const gcsFile = makeFile({
      id: 'gcs-file',
      storageProvider: 'gcs',
      storageBucket: 'humanly-prod-pdfs',
      storageKey: 'files/gcs-file/source.pdf',
      storageEtag: 'etag-1',
    });

    MockTaskModel.findById.mockResolvedValue(makeTask());
    MockFileModel.findByTask.mockResolvedValue([localFile, gcsFile]);
    MockTaskModel.delete.mockResolvedValue(undefined);

    await expect(TaskService.deleteTask('task-1', 'admin-1')).resolves.not.toThrow();

    expect(MockFileModel.findByTask).toHaveBeenCalledWith('task-1');
    expect(mockCacheDelPattern).toHaveBeenCalledWith('analytics:task-1:*');
    expect(MockTaskModel.delete).toHaveBeenCalledWith('task-1');
    expect(MockFileStorageService.delete).toHaveBeenCalledTimes(2);
    expect(MockFileStorageService.delete).toHaveBeenCalledWith(localFile);
    expect(MockFileStorageService.delete).toHaveBeenCalledWith(gcsFile);
    expect(MockTaskModel.delete.mock.invocationCallOrder[0]).toBeLessThan(
      MockFileStorageService.delete.mock.invocationCallOrder[0]
    );
  });

  it('skips legacy task instruction storage objects', async () => {
    MockTaskModel.findById.mockResolvedValue(makeTask());
    MockFileModel.findByTask.mockResolvedValue([makeFile({ legacySourceId: 'legacy-paper-1' })]);
    MockTaskModel.delete.mockResolvedValue(undefined);

    await TaskService.deleteTask('task-1', 'admin-1');

    expect(MockFileStorageService.delete).not.toHaveBeenCalled();
    expect(MockTaskModel.delete).toHaveBeenCalledWith('task-1');
  });

  it('logs storage deletion failures without rolling back task deletion', async () => {
    const file = makeFile();
    const error = new Error('storage delete failed');
    MockTaskModel.findById.mockResolvedValue(makeTask());
    MockFileModel.findByTask.mockResolvedValue([file]);
    MockTaskModel.delete.mockResolvedValue(undefined);
    MockFileStorageService.delete.mockRejectedValueOnce(error);

    await expect(TaskService.deleteTask('task-1', 'admin-1')).resolves.not.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to delete task file storage object',
      expect.objectContaining({
        error,
        taskId: 'task-1',
        userId: 'admin-1',
        fileId: 'file-1',
        storageProvider: 'local',
        storageKey: 'files/file-1/instructions.pdf',
      })
    );
  });

  it('throws 404 when the task does not exist', async () => {
    MockTaskModel.findById.mockResolvedValue(null);

    await expect(TaskService.deleteTask('task-1', 'admin-1')).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(MockFileModel.findByTask).not.toHaveBeenCalled();
    expect(MockTaskModel.delete).not.toHaveBeenCalled();
    expect(MockFileStorageService.delete).not.toHaveBeenCalled();
  });

  it('throws 403 when the user does not own the task', async () => {
    MockTaskModel.findById.mockResolvedValue(makeTask({ userId: 'other-admin' }));

    await expect(TaskService.deleteTask('task-1', 'admin-1')).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(MockFileModel.findByTask).not.toHaveBeenCalled();
    expect(MockTaskModel.delete).not.toHaveBeenCalled();
    expect(MockFileStorageService.delete).not.toHaveBeenCalled();
  });
});
