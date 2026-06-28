import assert from 'node:assert/strict';
import type { Document, Task, User } from '@humanly/shared';
import {
  serializePublicTaskPreview,
  serializePublicTaskStartResult,
} from '../controllers/public-task-response';
import { AppError } from '../middleware/error-handler';
import { DocumentModel } from '../models/document.model';
import { TaskModel } from '../models/task.model';
import { UserModel } from '../models/user.model';
import { TaskService } from './task.service';

type MockState = {
  task: Task | null;
  findPublicTokens: string[];
  enrollCalls: Array<{ taskId: string; userId: string }>;
  createDocumentCalls: Array<{ userId: string; title: string }>;
  deleteDocumentCalls: Array<{ documentId: string; userId: string }>;
  linkCalls: Array<{ taskId: string; userId: string; documentId: string }>;
  userCreates: string[];
  documents: Map<string, Document>;
  enrollments: Map<string, { taskId: string; userId: string; documentId: string | null }>;
  guestUsersByEmail: Map<string, User>;
  linkConflictDocumentId: string | null;
};

const now = new Date('2026-06-28T12:00:00.000Z');
const taskId = 'task-public-contract';
const signedInUserId = 'signed-in-user';

const originals = {
  findPublicAccessByToken: TaskModel.findPublicAccessByToken,
  enrollUser: TaskModel.enrollUser,
  findEnrollmentForUserTask: TaskModel.findEnrollmentForUserTask,
  linkSubmissionDocument: TaskModel.linkSubmissionDocument,
  findDocumentByIdAndUserId: DocumentModel.findByIdAndUserId,
  createDocument: DocumentModel.create,
  deleteDocument: DocumentModel.delete,
  findUserById: UserModel.findById,
  findUserByEmail: UserModel.findByEmail,
  createUser: UserModel.create,
  issuePublicGuestTokens: (TaskService as any).issuePublicGuestTokens,
  invalidateAnalytics: (TaskService as any).invalidateAnalytics,
};

function restoreOriginals() {
  TaskModel.findPublicAccessByToken = originals.findPublicAccessByToken;
  TaskModel.enrollUser = originals.enrollUser;
  TaskModel.findEnrollmentForUserTask = originals.findEnrollmentForUserTask;
  TaskModel.linkSubmissionDocument = originals.linkSubmissionDocument;
  DocumentModel.findByIdAndUserId = originals.findDocumentByIdAndUserId;
  DocumentModel.create = originals.createDocument;
  DocumentModel.delete = originals.deleteDocument;
  UserModel.findById = originals.findUserById;
  UserModel.findByEmail = originals.findUserByEmail;
  UserModel.create = originals.createUser;
  (TaskService as any).issuePublicGuestTokens = originals.issuePublicGuestTokens;
  (TaskService as any).invalidateAnalytics = originals.invalidateAnalytics;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: taskId,
    userId: 'admin-user',
    name: 'Public Task',
    description: 'A public writing task',
    taskToken: 'secret-task-token',
    userIdKey: 'student-id',
    externalServiceType: 'custom',
    externalServiceUrl: 'https://external.example.test',
    allowedLlmModels: ['provider/model'],
    aiUsageLimit: 100,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2126-01-01T00:00:00.000Z'),
    environmentConfig: {
      ai: {
        enabled: true,
        mode: 'chat',
        provider: 'custom',
        model: 'provider/model',
        baseUrl: 'https://ai.example.test/v1',
      },
    } as any,
    allowGuestSubmissions: true,
    isActive: true,
    lifecycleStatus: 'active',
    launchedAt: now,
    pausedAt: null,
    endedAt: null,
    deletedAt: null,
    enrolledUserCount: 44,
    documentCount: 22,
    eventCount: 9876,
    submissionCount: 11,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeUser(id: string, overrides: Partial<User> = {}): User {
  return {
    id,
    email: `${id}@example.test`,
    name: null,
    firstName: null,
    lastName: null,
    profileCompleted: false,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeDocument(id: string, userId: string, title = 'Public Task'): Document {
  return {
    id,
    userId,
    title,
    description: null,
    content: { root: { children: [] } },
    plainText: '',
    status: 'draft',
    version: 1,
    wordCount: 0,
    characterCount: 0,
    environmentConfig: null,
    writingStartedAt: null,
    createdAt: now,
    updatedAt: now,
    lastEditedAt: now,
  };
}

function enrollmentKey(taskIdValue: string, userIdValue: string) {
  return `${taskIdValue}:${userIdValue}`;
}

function installMocks(task: Task | null = makeTask()): MockState {
  const state: MockState = {
    task,
    findPublicTokens: [],
    enrollCalls: [],
    createDocumentCalls: [],
    deleteDocumentCalls: [],
    linkCalls: [],
    userCreates: [],
    documents: new Map(),
    enrollments: new Map(),
    guestUsersByEmail: new Map(),
    linkConflictDocumentId: null,
  };

  TaskModel.findPublicAccessByToken = async (taskToken: string) => {
    state.findPublicTokens.push(taskToken);
    return state.task;
  };

  TaskModel.enrollUser = async (taskIdValue: string, userIdValue: string) => {
    state.enrollCalls.push({ taskId: taskIdValue, userId: userIdValue });
    const key = enrollmentKey(taskIdValue, userIdValue);
    if (!state.enrollments.has(key)) {
      state.enrollments.set(key, { taskId: taskIdValue, userId: userIdValue, documentId: null });
    }
  };

  TaskModel.findEnrollmentForUserTask = async (taskIdValue: string, userIdValue: string) => {
    const enrollment = state.enrollments.get(enrollmentKey(taskIdValue, userIdValue));
    if (!enrollment) return null;

    return {
      id: `enrollment-${userIdValue}`,
      taskId: enrollment.taskId,
      userId: enrollment.userId,
      documentId: enrollment.documentId,
      currentAttemptId: enrollment.documentId ? `attempt-${enrollment.documentId}` : null,
      currentAttemptNumber: enrollment.documentId ? 1 : null,
      attemptCount: enrollment.documentId ? 1 : 0,
      joinedAt: now,
      dashboardHiddenAt: null,
      dashboardRestoredAt: null,
    } as any;
  };

  TaskModel.linkSubmissionDocument = async (taskIdValue: string, userIdValue: string, documentId: string) => {
    state.linkCalls.push({ taskId: taskIdValue, userId: userIdValue, documentId });
    const enrollment = state.enrollments.get(enrollmentKey(taskIdValue, userIdValue));
    if (!enrollment) return null;

    if (state.linkConflictDocumentId) {
      enrollment.documentId = state.linkConflictDocumentId;
      state.linkConflictDocumentId = null;
      return null;
    }

    if (enrollment.documentId && enrollment.documentId !== documentId) {
      return null;
    }

    enrollment.documentId = documentId;
    return {
      id: `attempt-${documentId}`,
      taskId: taskIdValue,
      userId: userIdValue,
      documentId,
      attemptNumber: 1,
      status: 'active',
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    } as any;
  };

  DocumentModel.findByIdAndUserId = async (documentId: string, userIdValue: string) => {
    const document = state.documents.get(documentId);
    return document?.userId === userIdValue ? document : null;
  };

  DocumentModel.create = async (data: any) => {
    const documentId = `document-${state.createDocumentCalls.length + 1}`;
    state.createDocumentCalls.push({ userId: data.userId, title: data.title });
    const document = makeDocument(documentId, data.userId, data.title);
    state.documents.set(document.id, document);
    return document;
  };

  DocumentModel.delete = async (documentId: string, userIdValue: string) => {
    state.deleteDocumentCalls.push({ documentId, userId: userIdValue });
    const document = state.documents.get(documentId);
    if (document?.userId !== userIdValue) return false;
    state.documents.delete(documentId);
    return true;
  };

  UserModel.findById = async (userId: string) => {
    return userId === signedInUserId ? makeUser(signedInUserId, { email: 'writer@example.test' }) as any : null;
  };

  UserModel.findByEmail = async (email: string) => {
    return state.guestUsersByEmail.get(email) as any || null;
  };

  UserModel.create = async (input: any) => {
    state.userCreates.push(input.email);
    const user = makeUser(`guest-${state.userCreates.length}`, {
      email: input.email,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
    });
    state.guestUsersByEmail.set(user.email, user);
    return user;
  };

  (TaskService as any).issuePublicGuestTokens = async (user: User) => ({
    accessToken: `access-${user.id}`,
    refreshToken: `refresh-${user.id}`,
  });
  (TaskService as any).invalidateAnalytics = async () => undefined;

  return state;
}

async function expectAppError(label: string, expectedStatusCode: number, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof AppError, `${label}: expected AppError`);
    assert.equal(error.statusCode, expectedStatusCode, `${label}: status code`);
    return error;
  }

  assert.fail(`${label}: expected request to fail`);
}

function assertNoSensitivePublicKeys(label: string, value: Record<string, unknown>) {
  for (const key of [
    'taskToken',
    'userIdKey',
    'externalServiceUrl',
    'allowedLlmModels',
    'aiUsageLimit',
    'passwordHash',
    'refreshToken',
    'emailVerificationToken',
    'emailVerificationExpires',
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(value, key), false, `${label}: must not expose ${key}`);
  }
}

async function run() {
  try {
    assert.match(
      TaskModel.linkSubmissionDocument.toString(),
      /FOR UPDATE/,
      'submission document linking must lock the enrollment row for concurrent public starts',
    );

    {
      const preview = serializePublicTaskPreview(makeTask());
      assert.deepEqual(Object.keys(preview).sort(), [
        'allowGuestSubmissions',
        'availabilityStatus',
        'description',
        'endDate',
        'name',
        'startDate',
      ].sort(), 'public preview exposes only the preview contract');
      assert.equal(preview.availabilityStatus, 'open');
      assertNoSensitivePublicKeys('preview task', preview as Record<string, unknown>);

      const startPayload = serializePublicTaskStartResult({
        user: {
          ...makeUser('guest-1', { email: 'guest@example.test' }),
          passwordHash: 'secret-password-hash',
          emailVerificationToken: 'secret-token',
        } as any,
        accessToken: 'access-token',
        task: makeTask(),
        document: {
          ...makeDocument('document-1', 'guest-1'),
          plainText: 'private draft text',
        },
        publicSessionId: 'browser-session',
        mode: 'guest',
      });

      assert.equal(startPayload.accessToken, 'access-token');
      assert.equal((startPayload.task.environmentConfig as any)?.ai?.enabled, true);
      assertNoSensitivePublicKeys('started task', startPayload.task as Record<string, unknown>);
      assertNoSensitivePublicKeys('started user', startPayload.user as Record<string, unknown>);
      assertNoSensitivePublicKeys('started root', startPayload as Record<string, unknown>);
      assert.deepEqual(Object.keys(startPayload.document).sort(), ['id', 'title'].sort());
    }

    {
      installMocks(null);
      await expectAppError('unknown or inactive public task', 404, async () => {
        await TaskService.getPublicTask(' missing-token ');
      });
    }

    {
      const state = installMocks(makeTask({ allowGuestSubmissions: false }));
      await expectAppError('guest-disabled public start', 403, async () => {
        await TaskService.startPublicTaskDocument('token', { mode: 'guest', sessionId: 'browser' });
      });
      assert.equal(state.enrollCalls.length, 0, 'guest-disabled task must not enroll a writer');
      assert.equal(state.createDocumentCalls.length, 0, 'guest-disabled task must not create a document');
    }

    {
      const state = installMocks(makeTask({ allowGuestSubmissions: false }));
      const result = await TaskService.startPublicTaskDocument(
        'token',
        { mode: 'signed-in' },
        { userId: signedInUserId },
      );

      assert.equal(result.mode, 'signed-in');
      assert.equal(result.user.id, signedInUserId);
      assert.equal(result.accessToken, undefined, 'signed-in public start must not issue a guest access token');
      assert.equal(result.document.id, 'document-1');
      assert.equal(state.createDocumentCalls.length, 1);
      assert.equal(state.enrollCalls.length, 1);
    }

    {
      const state = installMocks();
      const first = await TaskService.startPublicTaskDocument('token', {
        mode: 'guest',
        sessionId: 'Same_Browser',
      });
      const second = await TaskService.startPublicTaskDocument('token', {
        mode: 'guest',
        sessionId: 'same_browser',
      });

      assert.equal(first.mode, 'guest');
      assert.equal(second.mode, 'guest');
      assert.equal(first.user.id, second.user.id, 'same public session must reuse the guest user');
      assert.equal(first.document.id, second.document.id, 'same public session must reuse the task document');
      assert.equal(state.userCreates.length, 1, 'same public session must not create duplicate guest users');
      assert.equal(state.createDocumentCalls.length, 1, 'same public session must not create duplicate documents');
      assert.equal(state.linkCalls.length, 1, 'second start should reuse the linked enrollment document');
    }

    {
      const state = installMocks();
      const canonicalDocument = makeDocument('canonical-document', 'guest-1');
      state.documents.set(canonicalDocument.id, canonicalDocument);
      state.linkConflictDocumentId = canonicalDocument.id;

      const result = await TaskService.startPublicTaskDocument('token', {
        mode: 'guest',
        sessionId: 'race-session',
      });

      assert.equal(result.document.id, canonicalDocument.id, 'link conflict must return the canonical enrollment document');
      assert.equal(state.createDocumentCalls.length, 1, 'conflicting request creates one losing document');
      assert.deepEqual(
        state.deleteDocumentCalls.map((call) => call.documentId),
        ['document-1'],
        'losing public start document should be cleaned up',
      );
      assert.equal(state.documents.has('document-1'), false, 'orphan public start document should not remain in storage');
    }
  } finally {
    restoreOriginals();
  }
}

void run().catch((error) => {
  restoreOriginals();
  console.error(error);
  process.exitCode = 1;
});
