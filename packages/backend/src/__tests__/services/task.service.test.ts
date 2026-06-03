jest.mock('../../models/task.model');
jest.mock('../../models/document.model');
jest.mock('../../models/session.model');
jest.mock('../../models/submission.model');
jest.mock('../../models/certificate.model');
jest.mock('../../models/file.model');
jest.mock('../../models/user.model');
jest.mock('../../models/refresh-token.model');
jest.mock('../../services/certificate.service');
jest.mock('../../services/file-storage.service', () => ({
  FileStorageService: { delete: jest.fn() },
}));
jest.mock('../../utils/jwt', () => ({
  generateAccessToken: jest.fn(() => 'access-token-1'),
  generateRefreshToken: jest.fn(() => 'refresh-token-1'),
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
import { UserModel } from '../../models/user.model';
import { RefreshTokenModel } from '../../models/refresh-token.model';
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
const MockUserModel = UserModel as jest.Mocked<typeof UserModel>;
const MockRefreshTokenModel = RefreshTokenModel as jest.Mocked<typeof RefreshTokenModel>;
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
    endDate: new Date(Date.now() + 60_000),
    environmentConfig: null,
    allowGuestSubmissions: true,
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
    characterCount: 'Submission text'.length,
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
  it('rejects task submissions below the configured minimum character count', async () => {
    const task = makeTask({
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      environmentConfig: {
        submission: {
          mode: 'multiple',
          minCharacters: 1000,
        },
      },
    });

    MockTaskModel.findById.mockResolvedValue(task);
    MockTaskModel.hasEnrollment.mockResolvedValue(true);
    MockDocumentModel.findByIdAndUserId.mockResolvedValue(makeDocument({
      plainText: 'Too short',
      characterCount: 9,
    }));

    await expect(
      TaskService.submitTaskDocument('task-1', 'user-1', 'doc-1', 'student@example.com')
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Submission must be at least 1,000 characters. Current length is 9 characters.',
    });

    expect(MockTaskModel.linkSubmissionDocument).not.toHaveBeenCalled();
    expect(MockSubmissionModel.create).not.toHaveBeenCalled();
  });

  it('rejects task submissions above the configured maximum character count', async () => {
    const task = makeTask({
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      environmentConfig: {
        submission: {
          mode: 'multiple',
          maxCharacters: 12,
        },
      },
    });

    MockTaskModel.findById.mockResolvedValue(task);
    MockTaskModel.hasEnrollment.mockResolvedValue(true);
    MockDocumentModel.findByIdAndUserId.mockResolvedValue(makeDocument({
      plainText: 'This is too long',
      characterCount: 16,
    }));

    await expect(
      TaskService.submitTaskDocument('task-1', 'user-1', 'doc-1', 'student@example.com')
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Submission must be at most 12 characters. Current length is 16 characters.',
    });

    expect(MockTaskModel.linkSubmissionDocument).not.toHaveBeenCalled();
    expect(MockSubmissionModel.create).not.toHaveBeenCalled();
  });

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

describe('TaskService.autoSubmitExpiredTimedTaskEnrollments', () => {
  it('claims expired timed enrollments and submits them from the backend', async () => {
    const task = makeTask({
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() - 1_000),
      environmentConfig: {
        submission: {
          mode: 'multiple',
          minCharacters: 1000,
        },
      },
    });
    const shortDocument = makeDocument({
      plainText: 'short',
      characterCount: 5,
    });
    const submission = makeSubmission();
    const certificate = makeCertificate();

    MockTaskModel.claimExpiredTimedEnrollments.mockResolvedValue([{
      enrollmentId: 'enrollment-1',
      taskId: 'task-1',
      userId: 'user-1',
      userEmail: 'student@example.com',
      documentId: 'doc-1',
      writingStartedAt: new Date(Date.now() - 120_000),
      timeLimitSeconds: 60,
    }]);
    MockTaskModel.findById.mockResolvedValue(task);
    MockTaskModel.hasEnrollment.mockResolvedValue(true);
    MockDocumentModel.findByIdAndUserId.mockResolvedValue(shortDocument);
    MockSubmissionModel.findActiveForUserTask.mockResolvedValue(null);
    MockTaskModel.linkSubmissionDocument.mockResolvedValue(true);
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
    MockTaskModel.markTimedEnrollmentAutoSubmitComplete.mockResolvedValue(undefined);

    const result = await TaskService.autoSubmitExpiredTimedTaskEnrollments(10);

    expect(MockTaskModel.claimExpiredTimedEnrollments).toHaveBeenCalledWith(10);
    expect(MockSubmissionModel.create).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      userId: 'user-1',
      documentId: 'doc-1',
    }));
    expect(MockTaskModel.markTimedEnrollmentAutoSubmitComplete).toHaveBeenCalledWith('enrollment-1');
    expect(MockTaskModel.markTimedEnrollmentAutoSubmitFailed).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimed: 1,
      submitted: 1,
      skipped: 0,
      failed: 0,
    });
  });

  it('marks claimed enrollments complete when an active submission already exists', async () => {
    MockTaskModel.claimExpiredTimedEnrollments.mockResolvedValue([{
      enrollmentId: 'enrollment-1',
      taskId: 'task-1',
      userId: 'user-1',
      userEmail: 'student@example.com',
      documentId: 'doc-1',
      writingStartedAt: new Date(Date.now() - 120_000),
      timeLimitSeconds: 60,
    }]);
    MockTaskModel.findById.mockResolvedValue(makeTask({
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() - 1_000),
    }));
    MockTaskModel.hasEnrollment.mockResolvedValue(true);
    MockSubmissionModel.findActiveForUserTask.mockResolvedValue(makeSubmission());
    MockTaskModel.markTimedEnrollmentAutoSubmitComplete.mockResolvedValue(undefined);

    const result = await TaskService.autoSubmitExpiredTimedTaskEnrollments(10);

    expect(MockDocumentModel.findByIdAndUserId).not.toHaveBeenCalled();
    expect(MockSubmissionModel.create).not.toHaveBeenCalled();
    expect(MockTaskModel.markTimedEnrollmentAutoSubmitComplete).toHaveBeenCalledWith('enrollment-1');
    expect(result).toEqual({
      claimed: 1,
      submitted: 0,
      skipped: 1,
      failed: 0,
    });
  });
});

describe('TaskService.startPublicTaskDocument', () => {
  it('uses the signed-in user for public task drafts when auth is present', async () => {
    const task = makeTask({
      taskToken: 'share-token-1',
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      environmentConfig: {
        aiAccess: 'full',
        allowedModels: ['GPT-4o mini'],
      },
    });
    const user = {
      id: 'user-1',
      email: 'writer@example.com',
      role: 'user',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const document = makeDocument({
      id: 'signed-in-doc-1',
      userId: 'user-1',
      title: 'Task Submission - writer@example.com',
      plainText: '',
      wordCount: 0,
      characterCount: 0,
    });

    MockTaskModel.findByToken.mockResolvedValue(task);
    MockUserModel.findById.mockResolvedValue(user);
    MockTaskModel.enrollUser.mockResolvedValue(undefined);
    MockTaskModel.findEnrollmentForUserTask.mockResolvedValue({
      id: 'enrollment-1',
      taskId: 'task-1',
      userId: 'user-1',
      documentId: null,
      joinedAt: new Date(),
    });
    MockDocumentModel.create.mockResolvedValue(document);
    MockTaskModel.linkSubmissionDocument.mockResolvedValue(true);

    const result = await TaskService.startPublicTaskDocument(
      'share-token-1',
      { sessionId: 'browser-session-1' },
      { userId: 'user-1' }
    );

    expect(result.mode).toBe('signed-in');
    expect(result.accessToken).toBeUndefined();
    expect(result.refreshToken).toBeUndefined();
    expect(result.task.environmentConfig).toEqual(task.environmentConfig);
    expect(result.user.id).toBe('user-1');
    expect(result.document.id).toBe('signed-in-doc-1');
    expect(MockUserModel.findByEmail).not.toHaveBeenCalled();
    expect(MockTaskModel.enrollUser).toHaveBeenCalledWith('task-1', 'user-1');
    expect(MockDocumentModel.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      title: 'Task Submission - writer@example.com',
      status: 'draft',
      plainText: '',
      wordCount: 0,
      characterCount: 0,
      environmentConfig: task.environmentConfig,
    }));
    expect(MockTaskModel.linkSubmissionDocument).toHaveBeenCalledWith(
      'task-1',
      'user-1',
      'signed-in-doc-1'
    );
    expect(MockRefreshTokenModel.create).not.toHaveBeenCalled();
    expect(mockCacheDelPattern).toHaveBeenCalledWith('analytics:task-1:*');
  });

  it('creates a guest draft document and returns auth for the normal editor', async () => {
    const task = makeTask({
      taskToken: 'share-token-1',
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      environmentConfig: {
        aiAccess: 'full',
        allowedModels: ['GPT-4o mini'],
      },
    });
    const document = makeDocument({
      id: 'public-doc-1',
      userId: 'guest-user-1',
      title: 'Task Submission - Guest browser-',
      plainText: '',
      wordCount: 0,
      characterCount: 0,
    });

    MockTaskModel.findByToken.mockResolvedValue(task);
    MockUserModel.findByEmail.mockResolvedValue({
      id: 'guest-user-1',
      email: 'public-task-1-browser-session-1@guest.humanly.local',
      role: 'user',
      passwordHash: 'hash',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    MockTaskModel.enrollUser.mockResolvedValue(undefined);
    MockTaskModel.findEnrollmentForUserTask.mockResolvedValue({
      id: 'enrollment-1',
      taskId: 'task-1',
      userId: 'guest-user-1',
      documentId: null,
      joinedAt: new Date(),
    });
    MockDocumentModel.create.mockResolvedValue(document);
    MockTaskModel.linkSubmissionDocument.mockResolvedValue(true);
    MockRefreshTokenModel.create.mockResolvedValue({} as any);
    MockRefreshTokenModel.deleteExpired.mockResolvedValue(undefined);

    const result = await TaskService.startPublicTaskDocument('share-token-1', {
      sessionId: 'browser-session-1',
    });

    expect(result.accessToken).toBe('access-token-1');
    expect(result.refreshToken).toBe('refresh-token-1');
    expect(result.task.environmentConfig).toEqual(task.environmentConfig);
    expect(result.user.id).toBe('guest-user-1');
    expect(result.document.id).toBe('public-doc-1');
    expect(MockTaskModel.findByToken).toHaveBeenCalledWith('share-token-1');
    expect(MockTaskModel.enrollUser).toHaveBeenCalledWith('task-1', 'guest-user-1');
    expect(MockDocumentModel.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'guest-user-1',
      status: 'draft',
      plainText: '',
      wordCount: 0,
      characterCount: 0,
      environmentConfig: task.environmentConfig,
    }));
    expect(MockTaskModel.linkSubmissionDocument).toHaveBeenCalledWith(
      'task-1',
      'guest-user-1',
      'public-doc-1'
    );
    expect(MockRefreshTokenModel.create).toHaveBeenCalledWith(
      'guest-user-1',
      expect.any(String),
      expect.any(Date)
    );
    expect(mockCacheDelPattern).toHaveBeenCalledWith('analytics:task-1:*');
  });

  it('reuses an existing guest task document for the same public session', async () => {
    const task = makeTask({
      taskToken: 'share-token-1',
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
    });
    const document = makeDocument({
      id: 'existing-public-doc-1',
      userId: 'guest-user-1',
    });

    MockTaskModel.findByToken.mockResolvedValue(task);
    MockUserModel.findByEmail.mockResolvedValue({
      id: 'guest-user-1',
      email: 'public-task-1-browser-session-1@guest.humanly.local',
      role: 'user',
      passwordHash: 'hash',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    MockTaskModel.enrollUser.mockResolvedValue(undefined);
    MockTaskModel.findEnrollmentForUserTask.mockResolvedValue({
      id: 'enrollment-1',
      taskId: 'task-1',
      userId: 'guest-user-1',
      documentId: 'existing-public-doc-1',
      joinedAt: new Date(),
    });
    MockDocumentModel.findByIdAndUserId.mockResolvedValue(document);
    MockRefreshTokenModel.create.mockResolvedValue({} as any);
    MockRefreshTokenModel.deleteExpired.mockResolvedValue(undefined);

    const result = await TaskService.startPublicTaskDocument('share-token-1', {
      sessionId: 'browser-session-1',
    });

    expect(result.document.id).toBe('existing-public-doc-1');
    expect(MockDocumentModel.create).not.toHaveBeenCalled();
    expect(MockTaskModel.linkSubmissionDocument).not.toHaveBeenCalled();
  });

  it('rejects guest mode when the task share link requires sign-in', async () => {
    const task = makeTask({
      taskToken: 'share-token-1',
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      allowGuestSubmissions: false,
    });

    MockTaskModel.findByToken.mockResolvedValue(task);

    await expect(TaskService.startPublicTaskDocument('share-token-1', {
      sessionId: 'browser-session-1',
      mode: 'guest',
    })).rejects.toMatchObject({
      statusCode: 403,
      message: 'Guest submissions are not enabled for this task link',
    });

    expect(MockUserModel.findByEmail).not.toHaveBeenCalled();
    expect(MockTaskModel.enrollUser).not.toHaveBeenCalled();
  });

  it('requires authentication for explicit signed-in public task starts', async () => {
    const task = makeTask({
      taskToken: 'share-token-1',
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
    });

    MockTaskModel.findByToken.mockResolvedValue(task);

    await expect(TaskService.startPublicTaskDocument('share-token-1', {
      sessionId: 'browser-session-1',
      mode: 'signed-in',
    })).rejects.toMatchObject({
      statusCode: 401,
      message: 'Sign in is required to start this task link',
    });

    expect(MockUserModel.findByEmail).not.toHaveBeenCalled();
    expect(MockTaskModel.enrollUser).not.toHaveBeenCalled();
  });
});

describe('TaskService.updateTask active state', () => {
  it('archives and restores a task through the existing update payload', async () => {
    const activeTask = makeTask({ isActive: true });
    const archivedTask = makeTask({ isActive: false });
    MockTaskModel.findById.mockResolvedValue(activeTask);
    MockTaskModel.update
      .mockResolvedValueOnce(archivedTask)
      .mockResolvedValueOnce(activeTask);

    const archived = await TaskService.updateTask('task-1', 'admin-1', { isActive: false });
    const restored = await TaskService.updateTask('task-1', 'admin-1', { isActive: true });

    expect(archived.isActive).toBe(false);
    expect(restored.isActive).toBe(true);
    expect(MockTaskModel.update).toHaveBeenNthCalledWith(1, 'task-1', { isActive: false });
    expect(MockTaskModel.update).toHaveBeenNthCalledWith(2, 'task-1', { isActive: true });
  });
});

describe('TaskService task time window validation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-02T12:00:00.000Z'));
    MockTaskModel.create.mockReset();
    MockTaskModel.findById.mockReset();
    MockTaskModel.update.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects create task start dates outside the grace window', async () => {
    await expect(TaskService.createTask('admin-1', {
      name: 'Past task',
      startDate: new Date('2026-06-02T11:57:59.000Z'),
      endDate: new Date('2026-06-03T12:00:00.000Z'),
    })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Task start date cannot be in the past.',
    });

    expect(MockTaskModel.create).not.toHaveBeenCalled();
  });

  it('allows create task start dates inside the two-minute grace window', async () => {
    const startDate = new Date('2026-06-02T11:58:00.000Z');
    const endDate = new Date('2026-06-03T12:00:00.000Z');
    MockTaskModel.create.mockResolvedValue(makeTask({ startDate, endDate }));

    const task = await TaskService.createTask('admin-1', {
      name: 'Immediate task',
      startDate,
      endDate,
    });

    expect(task.startDate).toEqual(startDate);
    expect(MockTaskModel.create).toHaveBeenCalledWith('admin-1', {
      name: 'Immediate task',
      startDate,
      endDate,
    });
  });

  it('allows preserving an existing past start date while saving other task settings', async () => {
    const existingTask = makeTask({
      startDate: new Date('2026-06-02T10:00:30.000Z'),
      endDate: new Date('2026-06-03T12:00:00.000Z'),
    });
    const updatedTask = makeTask({
      ...existingTask,
      name: 'Updated name',
      startDate: new Date('2026-06-02T10:00:00.000Z'),
    });
    const updatePayload = {
      name: 'Updated name',
      startDate: new Date('2026-06-02T10:00:00.000Z'),
      endDate: existingTask.endDate,
    };

    MockTaskModel.findById.mockResolvedValue(existingTask);
    MockTaskModel.update.mockResolvedValue(updatedTask);

    const task = await TaskService.updateTask('task-1', 'admin-1', updatePayload);

    expect(task.name).toBe('Updated name');
    expect(MockTaskModel.update).toHaveBeenCalledWith('task-1', updatePayload);
  });

  it('rejects changing a task start date into the past', async () => {
    MockTaskModel.findById.mockResolvedValue(makeTask({
      startDate: new Date('2026-06-02T10:00:00.000Z'),
      endDate: new Date('2026-06-03T12:00:00.000Z'),
    }));

    await expect(TaskService.updateTask('task-1', 'admin-1', {
      startDate: new Date('2026-06-02T11:00:00.000Z'),
      endDate: new Date('2026-06-03T12:00:00.000Z'),
    })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Task start date cannot be in the past.',
    });

    expect(MockTaskModel.update).not.toHaveBeenCalled();
  });

  it('allows changing a task start date into the future', async () => {
    const existingTask = makeTask({
      startDate: new Date('2026-06-02T10:00:00.000Z'),
      endDate: new Date('2026-06-03T12:00:00.000Z'),
    });
    const updatePayload = {
      startDate: new Date('2026-06-02T13:00:00.000Z'),
      endDate: new Date('2026-06-02T14:00:00.000Z'),
    };
    const updatedTask = makeTask({
      ...existingTask,
      ...updatePayload,
    });

    MockTaskModel.findById.mockResolvedValue(existingTask);
    MockTaskModel.update.mockResolvedValue(updatedTask);

    const task = await TaskService.updateTask('task-1', 'admin-1', updatePayload);

    expect(task.startDate).toEqual(updatePayload.startDate);
    expect(MockTaskModel.update).toHaveBeenCalledWith('task-1', updatePayload);
  });

  it('rejects task updates whose effective end date is not after the start date', async () => {
    MockTaskModel.findById.mockResolvedValue(makeTask({
      startDate: new Date('2026-06-02T13:00:00.000Z'),
      endDate: new Date('2026-06-03T12:00:00.000Z'),
    }));

    await expect(TaskService.updateTask('task-1', 'admin-1', {
      endDate: new Date('2026-06-02T13:00:00.000Z'),
    })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Task end date must be after start date',
    });

    expect(MockTaskModel.update).not.toHaveBeenCalled();
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
