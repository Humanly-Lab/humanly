import {
  TaskModel,
  CreateTaskData,
  UpdateTaskData,
  PaginationParams,
  TaskListResult,
} from '../models/task.model';
import { DocumentModel } from '../models/document.model';
import { SessionModel } from '../models/session.model';
import { SubmissionModel } from '../models/submission.model';
import { CertificateModel } from '../models/certificate.model';
import { DocumentEventModel } from '../models/document-event.model';
import { AIModel } from '../models/ai.model';
import { FileModel } from '../models/file.model';
import { UserModel } from '../models/user.model';
import { RefreshTokenModel } from '../models/refresh-token.model';
import { CertificateService } from './certificate.service';
import type { AppFile, Document, Task, TaskLifecycleStatus, TaskWithSnippets, User } from '@humanly/shared';
import {
  BRAND,
  TASK_INSTRUCTION_PDF_MAX_FILES,
  TASK_START_DATE_PAST_ERROR_MESSAGE,
  getIframeComment,
  getMaxWritingAttempts,
  getTrackerComment,
  isWritingRestartAllowed,
  isTaskStartDateTooFarInPast,
} from '@humanly/shared';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { cacheDel, cacheDelPattern } from '../config/redis';
import { FileStorageService } from './file-storage.service';
import { FileService } from './file.service';
import { buildDocumentEventTimeline } from './document-event-timeline.service';
import { generateToken, hashPassword, hashToken } from '../utils/crypto';
import { generateAccessToken, generateRefreshToken, TokenPayload } from '../utils/jwt';

const TASK_END_DATE_ERROR_MESSAGE = 'Task end date must be after start date';
const TASK_SETTINGS_LOCK_MESSAGE = 'Task settings are read-only after task launch';
const TASK_INSTRUCTION_PDF_LIMIT_MESSAGE = `Tasks can include at most ${TASK_INSTRUCTION_PDF_MAX_FILES} instruction PDFs`;

const getDateMs = (value: Date | string | number): number => new Date(value).getTime();

const assertTaskStartDateNotInPast = (startDate: Date | string | number): void => {
  if (isTaskStartDateTooFarInPast(startDate)) {
    throw new AppError(400, TASK_START_DATE_PAST_ERROR_MESSAGE);
  }
};

const assertTaskEndDateAfterStartDate = (
  startDate: Date | string | number,
  endDate: Date | string | number
): void => {
  const startMs = getDateMs(startDate);
  const endMs = getDateMs(endDate);

  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs <= startMs) {
    throw new AppError(400, TASK_END_DATE_ERROR_MESSAGE);
  }
};

const getMinimumSubmissionCharacters = (task: Task): number | null => {
  const configuredMinimum = (task.environmentConfig?.submission as { minCharacters?: number } | undefined)?.minCharacters;
  if (!Number.isFinite(configuredMinimum) || !configuredMinimum) return null;

  return Math.max(1, Math.floor(configuredMinimum));
};

const getMaximumSubmissionCharacters = (task: Task): number | null => {
  const configuredMaximum = (task.environmentConfig?.submission as { maxCharacters?: number } | undefined)?.maxCharacters;
  if (!Number.isFinite(configuredMaximum) || !configuredMaximum) return null;

  return Math.max(1, Math.floor(configuredMaximum));
};

const getDocumentCharacterCount = (document: Document): number => {
  if (Number.isFinite(document.characterCount) && document.characterCount >= 0) {
    return document.characterCount;
  }

  return (document.plainText || '').length;
};

const assertSubmissionCharacterBounds = (task: Task, actualCharacters: number): void => {
  const minimumCharacters = getMinimumSubmissionCharacters(task);
  if (minimumCharacters && actualCharacters < minimumCharacters) {
    throw new AppError(
      400,
      `Submission must be at least ${minimumCharacters.toLocaleString()} characters. Current length is ${actualCharacters.toLocaleString()} characters.`
    );
  }

  const maximumCharacters = getMaximumSubmissionCharacters(task);
  if (maximumCharacters && actualCharacters > maximumCharacters) {
    throw new AppError(
      400,
      `Submission must be at most ${maximumCharacters.toLocaleString()} characters. Current length is ${actualCharacters.toLocaleString()} characters.`
    );
  }
};

const normalizePublicSessionId = (value?: string): string => {
  const normalized = (value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return normalized.slice(0, 64) || generateToken(16);
};

const createLexicalContentFromPlainText = (plainText: string) => {
  const paragraphs = plainText
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const paragraphNodes = (paragraphs.length ? paragraphs : ['']).map((paragraph) => ({
    children: [
      {
        detail: 0,
        format: 0,
        mode: 'normal',
        style: '',
        text: paragraph,
        type: 'text',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'paragraph',
    version: 1,
  }));

  return {
    root: {
      children: paragraphNodes,
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  };
};

const createTaskAttemptDocumentTitle = (taskName: string): string => taskName;

export interface PublicTaskStartData {
  sessionId?: string;
  mode?: 'guest' | 'signed-in';
}

export interface PublicTaskAuthenticatedUser {
  userId: string;
}

export interface SubmitTaskDocumentOptions {
  allowAfterDeadline?: boolean;
  bypassCharacterBounds?: boolean;
  skipIfAlreadySubmitted?: boolean;
  source?: 'manual' | 'time_limit_auto';
}

export interface CreateTaskOptions {
  instructionFiles?: Express.Multer.File[];
}

const withInstructionPdfFlag = (data: CreateTaskData): CreateTaskData => {
  if (!data.environmentConfig) {
    return data;
  }

  return {
    ...data,
    environmentConfig: {
      ...data.environmentConfig,
      instructions: {
        ...data.environmentConfig.instructions,
        hasInstructionPdf: true,
      },
    },
  };
};

export class TaskService {
  private static async invalidateAnalytics(taskId: string): Promise<void> {
    await cacheDelPattern(`analytics:${taskId}:*`);
  }

  private static async invalidateTaskTokenCache(task: Pick<Task, 'taskToken'>): Promise<void> {
    await cacheDel(`task:token:${task.taskToken}`);
  }

  private static assertTaskAcceptsPublicWriters(task: Task): void {
    this.assertTaskAcceptsWriters(task);

    const now = new Date();
    const startDate = new Date(task.startDate);
    const endDate = new Date(task.endDate);

    if (now < startDate) {
      throw new AppError(400, 'This task is not open for submissions yet');
    }
    if (now > endDate) {
      throw new AppError(400, 'The submission deadline has passed');
    }
  }

  private static assertTaskAcceptsWriters(task: Task): void {
    if (!task.isActive) {
      throw new AppError(404, 'Task link not found or inactive');
    }

    if ((task.lifecycleStatus || 'active') === 'active') return;

    if (task.lifecycleStatus === 'draft') {
      throw new AppError(409, 'This task has not been launched yet');
    }
    if (task.lifecycleStatus === 'paused') {
      throw new AppError(409, 'This task is paused');
    }
    if (task.lifecycleStatus === 'ended') {
      throw new AppError(409, 'This task has ended');
    }
  }

  private static toPublicUser(user: User | (User & { passwordHash?: string })): User {
    return {
      id: user.id,
      email: user.email,
      name: user.name || null,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      profileCompleted: user.profileCompleted,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private static async getOrCreatePublicGuestUser(task: Task, publicSessionId: string): Promise<User> {
    const guestEmail = `public-${task.id.slice(0, 8)}-${publicSessionId}@guest.humanly.local`;
    const existingGuest = await UserModel.findByEmail(guestEmail);

    if (existingGuest) {
      return this.toPublicUser(existingGuest);
    }

    return UserModel.create({
      email: guestEmail,
      passwordHash: await hashPassword(generateToken(32)),
      firstName: 'guest',
      lastName: 'user',
      emailVerificationToken: generateToken(16),
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }

  private static async issuePublicGuestTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await RefreshTokenModel.create(user.id, hashToken(refreshToken), expiresAt);
    await RefreshTokenModel.deleteExpired();

    return { accessToken, refreshToken };
  }

  /**
   * Create a new task
   */
  static async createTask(
    userId: string,
    data: CreateTaskData,
    options: CreateTaskOptions = {}
  ): Promise<TaskWithSnippets> {
    try {
      logger.info('Creating task', { userId, taskName: data.name });

      const instructionFiles = options.instructionFiles || [];
      if (instructionFiles.length > TASK_INSTRUCTION_PDF_MAX_FILES) {
        throw new AppError(400, TASK_INSTRUCTION_PDF_LIMIT_MESSAGE);
      }
      instructionFiles.forEach((file) => FileService.assertValidPdfUploadFile(file));

      assertTaskStartDateNotInPast(data.startDate);
      assertTaskEndDateAfterStartDate(data.startDate, data.endDate);

      const task = await TaskModel.create(
        userId,
        instructionFiles.length ? withInstructionPdfFlag(data) : data
      );

      for (const file of instructionFiles) {
        await FileService.attachTaskInstructionFileAtCreation(task.id, userId, file);
      }

      // Generate tracking snippets
      const trackingSnippet = this.generateTrackingSnippet(
        task.taskToken,
        env.corsOrigin
      );
      const iframeSnippet = this.generateIframeSnippet(
        task.taskToken,
        env.corsOrigin
      );

      logger.info('Task created successfully', {
        taskId: task.id,
        userId,
      });

      return {
        ...task,
        trackingSnippet,
        iframeSnippet,
      };
    } catch (error) {
      logger.error('Error creating task', { error, userId });
      throw error;
    }
  }

  /**
   * Get task by ID (verify ownership)
   */
  static async getTask(
    taskId: string,
    userId: string
  ): Promise<TaskWithSnippets> {
    const task = await TaskModel.findById(taskId);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    if (task.userId !== userId) {
      throw new AppError(403, 'Access denied to this task');
    }

    // Generate tracking snippets
    const trackingSnippet = this.generateTrackingSnippet(
      task.taskToken,
      env.corsOrigin
    );
    const iframeSnippet = this.generateIframeSnippet(
      task.taskToken,
      env.corsOrigin
    );

    return {
      ...task,
      trackingSnippet,
      iframeSnippet,
    };
  }

  /**
   * Get a public task by full share token without requiring an account.
   */
  static async getPublicTask(taskToken: string): Promise<Task> {
    const token = taskToken.trim();
    const task = await TaskModel.findByToken(token);

    if (!task) {
      throw new AppError(404, 'Task link not found or inactive');
    }

    this.assertTaskAcceptsWriters(task);

    return task;
  }

  /**
   * List user's tasks with pagination and search
   */
  static async listTasks(
    userId: string,
    pagination: PaginationParams,
    search?: string
  ): Promise<TaskListResult> {
    try {
      logger.debug('Listing tasks', { userId, pagination, search });

      const result = await TaskModel.findByUserId(userId, pagination, search);

      return result;
    } catch (error) {
      logger.error('Error listing tasks', { error, userId });
      throw error;
    }
  }

  /**
   * List enrolled users for an admin-owned task.
   */
  static async listTaskEnrollments(taskId: string, userId: string) {
    const task = await TaskModel.findById(taskId);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    if (task.userId !== userId) {
      throw new AppError(403, 'Access denied to this task');
    }

    return TaskModel.listEnrollments(taskId);
  }

  /**
   * List task enrollments for the current user portal account.
   */
  static async listCurrentUserTaskEnrollments(userId: string) {
    return TaskModel.listCurrentUserEnrollments(userId);
  }

  /**
   * Join task lookup for user portal invite-code enrollment.
   */
  static async joinTaskByInviteCode(
    inviteCode: string,
    userId: string
  ): Promise<{ task: Task; enrollment: Awaited<ReturnType<typeof TaskModel.findEnrollmentForUserTask>> }> {
    const normalizedCode = inviteCode.trim().toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
      throw new AppError(400, 'Invite code must be 6 letters or numbers');
    }

    const task = await TaskModel.findByInviteCode(normalizedCode);

    if (!task) {
      throw new AppError(404, 'Task invite code not found');
    }

    this.assertTaskAcceptsWriters(task);

    await TaskModel.enrollUser(task.id, userId);
    await this.invalidateAnalytics(task.id);

    const enrolledTask = await TaskModel.findById(task.id);
    const enrollment = await TaskModel.findEnrollmentForUserTask(task.id, userId);
    return {
      task: enrolledTask || task,
      enrollment,
    };
  }

  /**
   * Hide a user portal enrollment from the dashboard while preserving the
   * server-side task attempt and its linked evidence.
   */
  static async leaveTask(taskIdOrInviteCode: string, userId: string): Promise<void> {
    const normalizedIdentifier = taskIdOrInviteCode.trim();
    const task = /^[A-Z0-9]{6}$/i.test(normalizedIdentifier)
      ? await TaskModel.findByInviteCode(normalizedIdentifier.toUpperCase())
      : await TaskModel.findById(normalizedIdentifier);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    const hidden = await TaskModel.hideEnrollmentFromDashboard(task.id, userId);
    if (!hidden) {
      throw new AppError(404, 'Task enrollment not found');
    }

    await this.invalidateAnalytics(task.id);
  }

  /**
   * Link the current user's enrollment to a submission document.
   */
  static async linkSubmissionDocument(
    taskIdOrInviteCode: string,
    userId: string,
    documentId: string
  ): Promise<void> {
    const normalizedIdentifier = taskIdOrInviteCode.trim();
    const task = /^[A-Z0-9]{6}$/i.test(normalizedIdentifier)
      ? await TaskModel.findByInviteCode(normalizedIdentifier.toUpperCase())
      : await TaskModel.findById(normalizedIdentifier);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    this.assertTaskAcceptsWriters(task);

    const isOwner = await DocumentModel.isOwner(documentId, userId);
    if (!isOwner) {
      throw new AppError(404, 'Document not found or unauthorized');
    }

    const linked = await TaskModel.linkSubmissionDocument(task.id, userId, documentId);
    if (!linked) {
      throw new AppError(404, 'Task enrollment not found');
    }

    await this.invalidateAnalytics(task.id);
  }

  /**
   * Create a new blank task attempt when the task owner explicitly allows restarts.
   */
  static async startNewTaskAttempt(
    taskIdOrInviteCode: string,
    userId: string
  ): Promise<{
    task: Task;
    document: Document;
    enrollment: {
      id: string;
      taskId: string;
      userId: string;
      documentId: string | null;
      currentAttemptId?: string | null;
      currentAttemptNumber?: number | null;
      attemptCount?: number;
      joinedAt: Date;
      dashboardHiddenAt?: Date | null;
      dashboardRestoredAt?: Date | null;
    };
    attempt: {
      id: string;
      taskId: string;
      userId: string;
      documentId: string;
      attemptNumber: number;
      status: 'active' | 'historical';
      startedAt: Date;
      endedAt?: Date | null;
      createdAt: Date;
      updatedAt: Date;
    };
  }> {
    const normalizedIdentifier = taskIdOrInviteCode.trim();
    const task = /^[A-Z0-9]{6}$/i.test(normalizedIdentifier)
      ? await TaskModel.findByInviteCode(normalizedIdentifier.toUpperCase())
      : await TaskModel.findById(normalizedIdentifier);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    this.assertTaskAcceptsWriters(task);

    const hasEnrollment = await TaskModel.hasEnrollment(task.id, userId);
    if (!hasEnrollment) {
      throw new AppError(403, 'Access denied to this task');
    }

    if (!isWritingRestartAllowed(task.environmentConfig)) {
      throw new AppError(409, 'This task does not allow new attempts');
    }

    const attemptCount = await TaskModel.countAttemptsForUserTask(task.id, userId);
    const maxAttempts = getMaxWritingAttempts(task.environmentConfig);
    if (attemptCount >= maxAttempts) {
      throw new AppError(409, `This task allows at most ${maxAttempts} attempts`);
    }

    const nextAttemptNumber = attemptCount + 1;
    const blankContent = createLexicalContentFromPlainText('');
    const document = await DocumentModel.create({
      userId,
      title: createTaskAttemptDocumentTitle(task.name),
      description: 'Assigned task restart attempt.',
      content: blankContent,
      plainText: '',
      status: 'draft',
      wordCount: 0,
      characterCount: 0,
      environmentConfig: task.environmentConfig || null,
    });

    const attempt = await TaskModel.createRestartAttempt(task.id, userId, document.id);
    if (!attempt) {
      throw new AppError(404, 'Task enrollment not found');
    }

    const enrollment = await TaskModel.findEnrollmentForUserTask(task.id, userId);
    if (!enrollment) {
      throw new AppError(404, 'Task enrollment not found');
    }

    await this.invalidateAnalytics(task.id);

    return {
      task,
      document,
      enrollment,
      attempt,
    };
  }

  /**
   * Start a real analytics session for a user portal submission document.
   */
  static async startSubmissionSession(
    taskIdOrInviteCode: string,
    userId: string,
    userEmail: string,
    documentId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ sessionId: string; taskId: string }> {
    const normalizedIdentifier = taskIdOrInviteCode.trim();
    const task = /^[A-Z0-9]{6}$/i.test(normalizedIdentifier)
      ? await TaskModel.findByInviteCode(normalizedIdentifier.toUpperCase())
      : await TaskModel.findById(normalizedIdentifier);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    this.assertTaskAcceptsWriters(task);

    const isOwner = await DocumentModel.isOwner(documentId, userId);
    if (!isOwner) {
      throw new AppError(404, 'Document not found or unauthorized');
    }

    const linked = await TaskModel.linkSubmissionDocument(task.id, userId, documentId);
    if (!linked) {
      throw new AppError(404, 'Task enrollment not found');
    }

    const session = await SessionModel.create({
      taskId: task.id,
      externalUserId: userEmail,
      ipAddress,
      userAgent,
    });

    await this.invalidateAnalytics(task.id);

    return {
      sessionId: session.id,
      taskId: task.id,
    };
  }

  /**
   * End a real analytics session for a user portal submission document.
   */
  static async endSubmissionSession(
    taskIdOrInviteCode: string,
    userId: string,
    userEmail: string,
    sessionId: string
  ): Promise<void> {
    const normalizedIdentifier = taskIdOrInviteCode.trim();
    const task = /^[A-Z0-9]{6}$/i.test(normalizedIdentifier)
      ? await TaskModel.findByInviteCode(normalizedIdentifier.toUpperCase())
      : await TaskModel.findById(normalizedIdentifier);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    const session = await SessionModel.findById(sessionId);
    if (!session || session.taskId !== task.id || session.externalUserId !== userEmail) {
      throw new AppError(404, 'Session not found');
    }

    const hasEnrollment = await TaskModel.hasEnrollment(task.id, userId);
    if (!hasEnrollment) {
      throw new AppError(403, 'Access denied to this task');
    }

    await SessionModel.endSession(sessionId);
    await this.invalidateAnalytics(task.id);
  }

  /**
   * Create an immutable submission and certificate for an enrolled user's task document.
   */
  static async submitTaskDocument(
    taskIdOrInviteCode: string,
    userId: string,
    documentId: string,
    userEmail?: string,
    options: SubmitTaskDocumentOptions = {}
  ) {
    const normalizedIdentifier = taskIdOrInviteCode.trim();
    const task = /^[A-Z0-9]{6}$/i.test(normalizedIdentifier)
      ? await TaskModel.findByInviteCode(normalizedIdentifier.toUpperCase())
      : await TaskModel.findById(normalizedIdentifier);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    this.assertTaskAcceptsWriters(task);

    const now = new Date();
    const startDate = new Date(task.startDate);
    const endDate = new Date(task.endDate);
    if (now < startDate) {
      throw new AppError(400, 'This task is not open for submissions yet');
    }
    if (now > endDate && !options.allowAfterDeadline) {
      throw new AppError(400, 'The submission deadline has passed');
    }

    const hasEnrollment = await TaskModel.hasEnrollment(task.id, userId);
    if (!hasEnrollment) {
      throw new AppError(403, 'Access denied to this task');
    }

    const document = await DocumentModel.findByIdAndUserId(documentId, userId);
    if (!document) {
      throw new AppError(404, 'Document not found or unauthorized');
    }

    if (!options.bypassCharacterBounds) {
      assertSubmissionCharacterBounds(task, getDocumentCharacterCount(document));
    }

    const attempt = await TaskModel.linkSubmissionDocument(task.id, userId, documentId);
    if (!attempt) {
      throw new AppError(404, 'Task enrollment not found');
    }

    const activeAttemptSubmission = await SubmissionModel.findActiveForTaskAttempt(attempt.id);
    if (activeAttemptSubmission) {
      if (options.skipIfAlreadySubmitted) {
        return {
          submission: activeAttemptSubmission,
          certificate: null,
          skipped: true as const,
          reason: 'already_submitted',
        };
      }

      throw new AppError(409, 'This task attempt has already been submitted');
    }

    const latestSubmission = await SubmissionModel.findLatestForUserTask(task.id, userId);
    await SubmissionModel.markHistoricalForUserTask(task.id, userId);
    await CertificateModel.markSupersededForDocument(documentId, userId);

    const submission = await SubmissionModel.create({
      taskId: task.id,
      userId,
      documentId,
      taskAttemptId: attempt.id,
      payloadSnapshot: document.content,
      plainTextSnapshot: document.plainText,
      supersedesSubmissionId: latestSubmission?.id || null,
      status: 'active',
    });

    const certificate = await CertificateService.generateCertificate(documentId, userId, {
      submissionId: submission.id,
      certificateType: 'full_authorship',
      includeFullText: true,
      includeEditHistory: true,
    });

    const submissionWithCertificate = await SubmissionModel.attachCertificate(submission.id, certificate.id);

    if (userEmail) {
      await SessionModel.markLatestSubmittedForTaskUser(task.id, userEmail);
    }

    await this.invalidateAnalytics(task.id);

    return {
      submission: submissionWithCertificate || submission,
      certificate,
      skipped: false as const,
    };
  }

  /**
   * Server-side timed task auto-submission.
   *
   * This is the durable GCP path: timers are derived from persisted
   * documents.writing_started_at and task environment_config, so browser exit
   * or refresh cannot reset or cancel the countdown.
   */
  static async autoSubmitExpiredTimedTaskEnrollments(limit = 25) {
    const claimedEnrollments = await TaskModel.claimExpiredTimedEnrollments(limit);
    let submitted = 0;
    let skipped = 0;
    let failed = 0;

    for (const enrollment of claimedEnrollments) {
      try {
        const result = await this.submitTaskDocument(
          enrollment.taskId,
          enrollment.userId,
          enrollment.documentId,
          enrollment.userEmail,
          {
            allowAfterDeadline: true,
            bypassCharacterBounds: true,
            skipIfAlreadySubmitted: true,
            source: 'time_limit_auto',
          }
        );

        await TaskModel.markTimedEnrollmentAutoSubmitComplete(enrollment.enrollmentId);

        if (result.skipped) {
          skipped += 1;
        } else {
          submitted += 1;
        }
      } catch (error: any) {
        failed += 1;
        const message = error?.message || 'Failed to auto-submit timed task';
        await TaskModel.markTimedEnrollmentAutoSubmitFailed(enrollment.enrollmentId, message);
        logger.warn('Timed task auto-submit failed', {
          enrollmentId: enrollment.enrollmentId,
          taskId: enrollment.taskId,
          userId: enrollment.userId,
          documentId: enrollment.documentId,
          error: message,
        });
      }
    }

    return {
      claimed: claimedEnrollments.length,
      submitted,
      skipped,
      failed,
    };
  }

  /**
   * Start a public share-link writing session in the normal Humanly editor.
   *
   * Signed-in users are enrolled directly so their normal certificate route
   * keeps working. Anonymous browser sessions still map to synthetic guest users
   * and receive standard auth tokens so the existing editor flow can run
   * unchanged.
   */
  static async startPublicTaskDocument(
    taskToken: string,
    data: PublicTaskStartData = {},
    authenticatedUser?: PublicTaskAuthenticatedUser
  ) {
    const task = await this.getPublicTask(taskToken);
    this.assertTaskAcceptsPublicWriters(task);

    const publicSessionId = normalizePublicSessionId(data.sessionId);
    const requestedMode = data.mode || (authenticatedUser ? 'signed-in' : 'guest');
    const signedInUser = requestedMode === 'signed-in' && authenticatedUser
      ? await UserModel.findById(authenticatedUser.userId)
      : null;

    if (requestedMode === 'signed-in' && !authenticatedUser) {
      throw new AppError(401, 'Sign in is required to start this task link');
    }

    if (requestedMode === 'signed-in' && authenticatedUser && !signedInUser) {
      throw new AppError(401, 'Authentication required');
    }

    const isGuestMode = requestedMode === 'guest';
    if (isGuestMode && task.allowGuestSubmissions === false) {
      throw new AppError(403, 'Guest submissions are not enabled for this task link');
    }

    const participantUser = signedInUser || (await this.getOrCreatePublicGuestUser(task, publicSessionId));

    await TaskModel.enrollUser(task.id, participantUser.id);

    const enrollment = await TaskModel.findEnrollmentForUserTask(task.id, participantUser.id);
    if (!enrollment) {
      throw new AppError(500, 'Failed to create task enrollment');
    }

    let document = enrollment.documentId
      ? await DocumentModel.findByIdAndUserId(enrollment.documentId, participantUser.id)
      : null;

    if (!document) {
      const content = createLexicalContentFromPlainText('');

      document = await DocumentModel.create({
        userId: participantUser.id,
        title: task.name,
        description: isGuestMode
          ? 'Public task share-link document.'
          : 'Public task share-link document opened by a signed-in user.',
        content,
        plainText: '',
        status: 'draft',
        wordCount: 0,
        characterCount: 0,
        environmentConfig: task.environmentConfig || null,
      });

      await TaskModel.linkSubmissionDocument(task.id, participantUser.id, document.id);
    }

    const tokens = isGuestMode
      ? await this.issuePublicGuestTokens(participantUser)
      : null;
    await this.invalidateAnalytics(task.id);

    return {
      user: participantUser,
      mode: isGuestMode ? 'guest' as const : 'signed-in' as const,
      accessToken: tokens?.accessToken,
      refreshToken: tokens?.refreshToken,
      task: {
        id: task.id,
        name: task.name,
        description: task.description,
        startDate: task.startDate,
        endDate: task.endDate,
        environmentConfig: task.environmentConfig,
      },
      document: {
        id: document.id,
        title: document.title,
      },
      publicSessionId,
    };
  }

  static async listTaskSubmissions(taskId: string, adminUserId: string, enrolledUserId?: string) {
    const task = await TaskModel.findById(taskId);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    if (task.userId !== adminUserId) {
      throw new AppError(403, 'Access denied to this task');
    }

    if (enrolledUserId) {
      return SubmissionModel.listForUserTask(task.id, enrolledUserId);
    }

    return SubmissionModel.listForTask(task.id);
  }

  static async getTaskSubmissionEvents(taskId: string, submissionId: string, adminUserId: string) {
    const task = await TaskModel.findById(taskId);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    if (task.userId !== adminUserId) {
      throw new AppError(403, 'Access denied to this task');
    }

    const submission = await SubmissionModel.findById(submissionId);
    if (!submission || submission.taskId !== task.id) {
      throw new AppError(404, 'Submission not found');
    }

    const eventFilters = {
      endDate: new Date(submission.submittedAt),
      limit: 5000,
      offset: 0,
    };

    const [events, totalEvents, aiLogsResult] = await Promise.all([
      DocumentEventModel.findByDocumentId(submission.documentId, eventFilters),
      DocumentEventModel.countByDocumentIdWithFilters(submission.documentId, eventFilters),
      AIModel.getLogs({
        documentId: submission.documentId,
        userId: submission.userId,
        endDate: new Date(submission.submittedAt),
        limit: 50,
        offset: 0,
      }),
    ]);

    const timeline = buildDocumentEventTimeline(events, totalEvents);

    return {
      submission,
      events: events.reverse(),
      totalEvents,
      timeline,
      aiLogs: aiLogsResult.logs,
    };
  }

  /**
   * Update task (verify ownership)
   */
  static async updateTask(
    taskId: string,
    userId: string,
    data: UpdateTaskData
  ): Promise<Task> {
    const task = await TaskModel.findById(taskId);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    if (task.userId !== userId) {
      throw new AppError(403, 'Access denied to this task');
    }

    const providedFields = Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    const isArchiveOnlyUpdate = providedFields.length === 1 && providedFields[0] === 'isActive';

    if (!isArchiveOnlyUpdate && task.lifecycleStatus !== 'draft') {
      throw new AppError(409, TASK_SETTINGS_LOCK_MESSAGE);
    }

    if (data.startDate || data.endDate) {
      assertTaskEndDateAfterStartDate(data.startDate || task.startDate, data.endDate || task.endDate);
    }

    logger.info('Updating task', { taskId, userId });

    const updatedTask = await TaskModel.update(taskId, data);

    if (!updatedTask) {
      throw new AppError(500, 'Failed to update task');
    }

    await this.invalidateTaskTokenCache(updatedTask);

    logger.info('Task updated successfully', { taskId, userId });

    return updatedTask;
  }

  static async updateTaskLifecycle(
    taskId: string,
    userId: string,
    nextStatus: TaskLifecycleStatus
  ): Promise<Task> {
    const task = await TaskModel.findById(taskId);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    if (task.userId !== userId) {
      throw new AppError(403, 'Access denied to this task');
    }

    const currentStatus = task.lifecycleStatus || 'active';
    const allowedTransitions: Record<TaskLifecycleStatus, TaskLifecycleStatus[]> = {
      draft: ['active', 'ended'],
      active: ['paused', 'ended'],
      paused: ['active', 'ended'],
      ended: [],
    };

    if (currentStatus === nextStatus) {
      return task;
    }

    if (!allowedTransitions[currentStatus].includes(nextStatus)) {
      throw new AppError(409, `Cannot change task from ${currentStatus} to ${nextStatus}`);
    }

    if (nextStatus === 'active' && currentStatus === 'draft') {
      assertTaskEndDateAfterStartDate(task.startDate, task.endDate);
    }

    const updatedTask = await TaskModel.updateLifecycle(taskId, nextStatus);

    if (!updatedTask) {
      throw new AppError(500, 'Failed to update task status');
    }

    await this.invalidateAnalytics(taskId);
    await this.invalidateTaskTokenCache(updatedTask);
    logger.info('Task lifecycle updated', { taskId, userId, currentStatus, nextStatus });

    return updatedTask;
  }

  static async duplicateTask(taskId: string, userId: string): Promise<Task> {
    const task = await TaskModel.findById(taskId);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    if (task.userId !== userId) {
      throw new AppError(403, 'Access denied to this task');
    }

    const duplicatedTask = await TaskModel.duplicate(taskId, userId);

    if (!duplicatedTask) {
      throw new AppError(500, 'Failed to duplicate task');
    }

    try {
      await this.materializeDuplicatedTaskInstructionFiles(duplicatedTask.id, userId);
    } catch (error) {
      const copiedFiles = await FileModel.findByTask(duplicatedTask.id).catch(() => []);
      await TaskModel.delete(duplicatedTask.id).catch((deleteError) => {
        logger.error('Failed to delete task after duplicate file materialization failure', {
          error: deleteError,
          taskId,
          duplicatedTaskId: duplicatedTask.id,
          userId,
        });
      });
      await this.deleteTaskFileStorage(duplicatedTask.id, userId, copiedFiles).catch((deleteError) => {
        logger.error('Failed to clean up copied task file storage after duplicate failure', {
          error: deleteError,
          taskId,
          duplicatedTaskId: duplicatedTask.id,
          userId,
        });
      });
      throw error;
    }

    logger.info('Task duplicated', { taskId, duplicatedTaskId: duplicatedTask.id, userId });
    return duplicatedTask;
  }

  private static async materializeDuplicatedTaskInstructionFiles(
    duplicatedTaskId: string,
    userId: string
  ): Promise<void> {
    const duplicatedFiles = await FileModel.findByTask(duplicatedTaskId);

    await Promise.all(
      duplicatedFiles
        .filter((file) => file.legacySourceId)
        .map(async (file) => {
          const sourceFile = await FileModel.findById(file.legacySourceId!);
          if (!sourceFile) {
            throw new AppError(500, 'Failed to duplicate task file');
          }

          const sourceBuffer = await FileStorageService.getBuffer(sourceFile);
          const copiedStorage = await FileStorageService.store(sourceBuffer, file.id);

          try {
            const updatedFile = await FileModel.updateStorageMetadata(file.id, {
              ...copiedStorage,
              legacySourceId: null,
            });

            if (!updatedFile) {
              throw new AppError(500, 'Failed to update duplicated task file storage');
            }

            logger.info('Duplicated task file storage object', {
              duplicatedTaskId,
              userId,
              fileId: file.id,
              sourceFileId: sourceFile.id,
              storageProvider: copiedStorage.storageProvider,
              storageBucket: copiedStorage.storageBucket,
              storageKey: copiedStorage.storageKey,
            });
          } catch (error) {
            await FileStorageService.delete(copiedStorage).catch((deleteError) => {
              logger.error('Failed to clean up copied task file storage object', {
                error: deleteError,
                duplicatedTaskId,
                userId,
                fileId: file.id,
                sourceFileId: sourceFile.id,
                storageProvider: copiedStorage.storageProvider,
                storageBucket: copiedStorage.storageBucket,
                storageKey: copiedStorage.storageKey,
              });
            });
            throw error;
          }
        })
    );
  }

  /**
   * Delete task (verify ownership)
   */
  static async deleteTask(taskId: string, userId: string): Promise<void> {
    const task = await TaskModel.findById(taskId);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    if (task.userId !== userId) {
      throw new AppError(403, 'Access denied to this task');
    }

    logger.info('Deleting task', { taskId, userId });

    await this.invalidateAnalytics(taskId);
    await TaskModel.delete(taskId);

    logger.info('Task deleted successfully', { taskId, userId });
  }

  private static async deleteTaskFileStorage(
    taskId: string,
    userId: string,
    files: AppFile[]
  ): Promise<void> {
    await Promise.all(
      files
        .filter((file) => !file.legacySourceId)
        .map(async (file) => {
          try {
            const remainingReferenceCount = await FileModel.countStorageReferences(file);
            if (remainingReferenceCount > 0) {
              logger.info('Skipping task file storage delete because object is still referenced', {
                taskId,
                userId,
                fileId: file.id,
                storageProvider: file.storageProvider,
                storageBucket: file.storageBucket,
                storageKey: file.storageKey,
                remainingReferenceCount,
              });
              return;
            }
            await FileStorageService.delete(file);
          } catch (error) {
            logger.error('Failed to delete task file storage object', {
              error,
              taskId,
              userId,
              fileId: file.id,
              storageProvider: file.storageProvider,
              storageBucket: file.storageBucket,
              storageKey: file.storageKey,
            });
          }
        })
    );
  }

  /**
   * Regenerate task token (verify ownership)
   */
  static async regenerateTaskToken(
    taskId: string,
    userId: string
  ): Promise<TaskWithSnippets> {
    const task = await TaskModel.findById(taskId);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    if (task.userId !== userId) {
      throw new AppError(403, 'Access denied to this task');
    }

    logger.info('Regenerating task token', { taskId, userId });

    const updatedTask = await TaskModel.regenerateToken(taskId);

    if (!updatedTask) {
      throw new AppError(500, 'Failed to regenerate token');
    }

    // Generate new tracking snippets with new token
    const trackingSnippet = this.generateTrackingSnippet(
      updatedTask.taskToken,
      env.corsOrigin
    );
    const iframeSnippet = this.generateIframeSnippet(
      updatedTask.taskToken,
      env.corsOrigin
    );

    logger.info('Task token regenerated successfully', { taskId, userId });

    return {
      ...updatedTask,
      trackingSnippet,
      iframeSnippet,
    };
  }

  /**
   * Generate tracking snippet (JavaScript)
   */
  static generateTrackingSnippet(taskToken: string, apiUrl: string): string {
    // Ensure apiUrl doesn't have trailing slash
    const baseUrl = apiUrl.replace(/\/$/, '');

    return `${getTrackerComment()}
<script>
(function() {
  var ${BRAND.tracker.globalVar} = {
    taskToken: '${taskToken}',
    apiUrl: '${baseUrl}',
    sessionId: null,
    eventQueue: [],

    init: function(externalUserId, options) {
      this.externalUserId = externalUserId;
      this.options = options || {};
      this.initSession();
    },

    initSession: function() {
      var self = this;
      fetch(this.apiUrl + '/api/v1/track/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Task-Token': this.taskToken
        },
        body: JSON.stringify({
          externalUserId: this.externalUserId,
          userAgent: navigator.userAgent,
          metadata: this.options.metadata || {}
        })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        self.sessionId = data.data.sessionId;
        self.attachListeners();
      })
      .catch(function(err) {
        console.error('${BRAND.tracker.consolePrefix} Failed to initialize session', err);
      });
    },

    attachListeners: function() {
      var self = this;
      var targetElements = this.options.targetElements || 'textarea, input[type="text"], [contenteditable="true"]';
      var elements = document.querySelectorAll(targetElements);

      elements.forEach(function(el) {
        ['keydown', 'keyup', 'paste', 'copy', 'cut', 'focus', 'blur', 'input'].forEach(function(eventType) {
          el.addEventListener(eventType, function(e) {
            self.trackEvent(e, el);
          });
        });
      });
    },

    trackEvent: function(event, element) {
      var eventData = {
        eventType: event.type,
        timestamp: new Date().toISOString(),
        targetElement: element.id || element.name || element.tagName,
        keyCode: event.keyCode ? String(event.keyCode) : undefined,
        keyChar: event.key || undefined,
        textBefore: element.value || element.textContent,
        cursorPosition: element.selectionStart || undefined,
        selectionStart: element.selectionStart || undefined,
        selectionEnd: element.selectionEnd || undefined
      };

      this.eventQueue.push(eventData);

      if (this.eventQueue.length >= 10) {
        this.flush();
      }
    },

    flush: function() {
      if (this.eventQueue.length === 0) return;

      var events = this.eventQueue.splice(0, 100);

      fetch(this.apiUrl + '/api/v1/track/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Task-Token': this.taskToken,
          'X-Session-Id': this.sessionId
        },
        body: JSON.stringify({ events: events })
      })
      .catch(function(err) {
        console.error('${BRAND.tracker.consolePrefix} Failed to send events', err);
      });
    }
  };

  window.${BRAND.tracker.namespace} = ${BRAND.tracker.globalVar};

  // Auto-flush on page unload
  window.addEventListener('beforeunload', function() {
    ${BRAND.tracker.globalVar}.flush();
  });
})();
</script>`;
  }

  /**
   * Generate iframe snippet
   */
  static generateIframeSnippet(taskToken: string, apiUrl: string): string {
    // Ensure apiUrl doesn't have trailing slash
    const baseUrl = apiUrl.replace(/\/$/, '');

    return `${getIframeComment()}
<iframe
  src="${baseUrl}/embed/${taskToken}"
  width="100%"
  height="400"
  frameborder="0"
  style="border: none;"
  allow="clipboard-read; clipboard-write"
  sandbox="allow-scripts allow-same-origin allow-forms"
></iframe>

<!-- Initialize tracking for iframe content -->
<script>
  var iframe = document.querySelector('iframe[src*="${baseUrl}"]');

  window.addEventListener('message', function(event) {
    if (event.origin !== '${baseUrl}') return;

    // Handle messages from iframe
    if (event.data.type === '${BRAND.tracker.eventType}') {
      console.log('${BRAND.tracker.consolePrefix} event:', event.data.payload);
    }
  });
</script>`;
  }

  /**
   * Validate task token
   */
  static async validateTaskToken(token: string): Promise<Task | null> {
    try {
      const task = await TaskModel.findByToken(token);

      if (!task) {
        logger.warn('Invalid task token used', { token: token.substring(0, 8) + '...' });
        return null;
      }

      if (!task.isActive) {
        logger.warn('Inactive task token used', { taskId: task.id });
        return null;
      }

      return task;
    } catch (error) {
      logger.error('Error validating task token', { error });
      return null;
    }
  }
}
