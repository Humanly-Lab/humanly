import { Request, Response } from 'express';
import { z } from 'zod';
import { TaskService } from '../services/task.service';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import {
  createTaskSchema,
  updateTaskSchema,
  validate,
} from '@humanly/shared';
import type { Task } from '@humanly/shared';

const publicTaskStartSchema = z.object({
  sessionId: z.string().max(128).optional().or(z.literal('')),
  mode: z.enum(['guest', 'signed-in']).optional(),
});

type PublicTaskAvailabilityStatus = 'scheduled' | 'open' | 'ended';

function getPublicTaskAvailabilityStatus(task: Task): PublicTaskAvailabilityStatus {
  const now = Date.now();
  const startMs = new Date(task.startDate).getTime();
  const endMs = new Date(task.endDate).getTime();

  if (Number.isFinite(startMs) && now < startMs) return 'scheduled';
  if (Number.isFinite(endMs) && now > endMs) return 'ended';
  return 'open';
}

function serializePublicTaskPreview(task: Task) {
  return {
    name: task.name,
    description: task.description,
    startDate: task.startDate,
    endDate: task.endDate,
    allowGuestSubmissions: task.allowGuestSubmissions,
    availabilityStatus: getPublicTaskAvailabilityStatus(task),
  };
}

/**
 * Create a new task
 */
export async function createTask(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const isMultipart = req.is('multipart/form-data');
  let body = req.body;

  if (isMultipart) {
    if (typeof req.body?.payload !== 'string') {
      throw new AppError(400, 'Task payload is required');
    }

    try {
      body = JSON.parse(req.body.payload);
    } catch {
      throw new AppError(400, 'Task payload must be valid JSON');
    }
  }

  // Validate request body
  const data = validate(createTaskSchema, body);
  const instructionFiles = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : [];

  const task = await TaskService.createTask(userId, data, { instructionFiles });

  res.status(201).json({
    success: true,
    data: task,
    message: 'Task created successfully',
  });
}

/**
 * Get task by ID
 */
export async function getTask(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.id;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  const task = await TaskService.getTask(taskId, userId);

  res.json({
    success: true,
    data: task,
  });
}

/**
 * Get a task by public share token without requiring registration.
 */
export async function getPublicTask(req: Request, res: Response): Promise<void> {
  const taskToken = req.params.token;

  if (!taskToken) {
    throw new AppError(400, 'Task token is required');
  }

  const task = await TaskService.getPublicTask(taskToken);

  res.json({
    success: true,
    data: {
      task: serializePublicTaskPreview(task),
    },
  });
}

/**
 * Start a public task document in the normal authenticated editor flow.
 */
export async function startPublicTaskDocument(req: Request, res: Response): Promise<void> {
  const taskToken = req.params.token;

  if (!taskToken) {
    throw new AppError(400, 'Task token is required');
  }

  const data = validate(publicTaskStartSchema, req.body || {});
  const result = await TaskService.startPublicTaskDocument(
    taskToken,
    data,
    req.user ? { userId: req.user.userId } : undefined
  );

  const shouldSetAuthCookies = result.mode === 'guest' && !req.user;

  if (shouldSetAuthCookies && result.refreshToken) {
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  if (shouldSetAuthCookies && result.accessToken) {
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      ...(result.accessToken ? { accessToken: result.accessToken } : {}),
      task: result.task,
      document: result.document,
      publicSessionId: result.publicSessionId,
      mode: result.mode,
    },
    message: 'Task document started successfully',
  });
}

/**
 * Direct public submissions are disabled; public writers must start a document first.
 */
export async function submitPublicTaskDocument(req: Request, res: Response): Promise<void> {
  const taskToken = req.params.token;

  if (!taskToken) {
    throw new AppError(400, 'Task token is required');
  }

  res.status(410).json({
    success: false,
    error: 'Direct public submissions are no longer supported. Start the task document first.',
    message: 'Direct public submissions are no longer supported. Start the task document first.',
  });
}

/**
 * List user's tasks
 */
export async function listTasks(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  // Parse pagination parameters
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const search = req.query.search as string | undefined;

  const result = await TaskService.listTasks(
    userId,
    { page, limit },
    search
  );

  res.json({
    success: true,
    data: result.tasks,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
}

/**
 * List enrolled users for a task owned by the current admin.
 */
export async function listTaskEnrollments(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.id;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  const enrollments = await TaskService.listTaskEnrollments(taskId, userId);

  res.json({
    success: true,
    data: {
      enrollments,
    },
  });
}

/**
 * List task enrollments for the current user portal account.
 */
export async function listMyTaskEnrollments(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const enrollments = await TaskService.listCurrentUserTaskEnrollments(userId);

  res.json({
    success: true,
    data: {
      enrollments,
    },
  });
}

/**
 * Look up a task by invite code for user enrollment
 */
export async function joinTask(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { inviteCode } = req.body;

  if (!inviteCode || typeof inviteCode !== 'string') {
    throw new AppError(400, 'Invite code is required');
  }

  const { task, enrollment } = await TaskService.joinTaskByInviteCode(inviteCode, userId);

  res.json({
    success: true,
    data: {
      task: {
        id: task.id,
        taskId: task.id,
        enrollmentId: enrollment?.id || null,
        name: task.name,
        description: task.description,
        startDate: task.startDate,
        endDate: task.endDate,
        lifecycleStatus: task.lifecycleStatus,
        environmentConfig: task.environmentConfig,
        enrolledUserCount: task.enrolledUserCount ?? 0,
        inviteCode: task.taskToken.slice(0, 6).toUpperCase(),
	        documentId: enrollment?.documentId || null,
	        currentAttemptNumber: enrollment?.currentAttemptNumber || null,
	        attemptCount: enrollment?.attemptCount || 0,
	        joinedAt: enrollment?.joinedAt || null,
	      },
    },
  });
}

/**
 * Remove current user's enrollment from a task
 */
export async function leaveTask(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.taskId;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  await TaskService.leaveTask(taskId, userId);

  res.json({
    success: true,
    message: 'Task enrollment hidden from dashboard successfully',
  });
}

/**
 * Link current user's task enrollment to a submission document
 */
export async function linkSubmissionDocument(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.taskId;
  const { documentId } = req.body;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  if (!documentId || typeof documentId !== 'string') {
    throw new AppError(400, 'Document ID is required');
  }

  await TaskService.linkSubmissionDocument(taskId, userId, documentId);

  res.json({
    success: true,
    message: 'Assigned task document linked successfully',
  });
}

/**
 * Start a new task attempt when the task policy allows restarts.
 */
export async function startNewTaskAttempt(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.taskId;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  const result = await TaskService.startNewTaskAttempt(taskId, userId);

  res.status(201).json({
    success: true,
    data: {
      task: {
        ...result.task,
        id: result.task.id,
        taskId: result.task.id,
        enrollmentId: result.enrollment.id,
        documentId: result.document.id,
        currentAttemptNumber: result.attempt.attemptNumber,
        attemptCount: result.enrollment.attemptCount || result.attempt.attemptNumber,
        joinedAt: result.enrollment.joinedAt,
      },
      document: result.document,
      attempt: result.attempt,
    },
    message: 'New task attempt started successfully',
  });
}

/**
 * Start a real analytics session for the current user's assigned task document
 */
export async function startSubmissionSession(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const userEmail = req.user!.email;
  const taskId = req.params.taskId;
  const { documentId } = req.body;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  if (!documentId || typeof documentId !== 'string') {
    throw new AppError(400, 'Document ID is required');
  }

  const ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    undefined;
  const userAgent = req.headers['user-agent'] || undefined;

  const session = await TaskService.startSubmissionSession(
    taskId,
    userId,
    userEmail,
    documentId,
    ipAddress,
    userAgent
  );

  res.status(201).json({
    success: true,
    data: session,
    message: 'Submission session started successfully',
  });
}

/**
 * End a real analytics session for the current user's assigned task document
 */
export async function endSubmissionSession(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const userEmail = req.user!.email;
  const taskId = req.params.taskId;
  const sessionId = req.params.sessionId;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  if (!sessionId) {
    throw new AppError(400, 'Session ID is required');
  }

  await TaskService.endSubmissionSession(taskId, userId, userEmail, sessionId);

  res.json({
    success: true,
    message: 'Submission session ended successfully',
  });
}

/**
 * Submit current user's task document and generate a certificate.
 */
export async function submitTaskDocument(req: Request, res: Response): Promise<void> {
  const { userId, email } = req.user!;
  const taskId = req.params.taskId;
  const { documentId, automatic } = req.body;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  if (!documentId || typeof documentId !== 'string') {
    throw new AppError(400, 'Document ID is required');
  }

  const result = await TaskService.submitTaskDocument(taskId, userId, documentId, email, {
    allowAfterDeadline: automatic === true,
    bypassCharacterBounds: automatic === true,
    skipIfAlreadySubmitted: automatic === true,
    source: automatic === true ? 'time_limit_auto' : 'manual',
  });

  res.status(201).json({
    success: true,
    data: result,
    message: 'Task document submitted successfully',
  });
}

/**
 * List submissions for a task or one enrolled user.
 */
export async function listTaskSubmissions(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.id;
  const enrolledUserId = req.query.userId as string | undefined;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  const submissions = await TaskService.listTaskSubmissions(taskId, userId, enrolledUserId);

  res.json({
    success: true,
    data: {
      submissions,
      latestSubmission: submissions[0] || null,
    },
  });
}

/**
 * Get all document events up to a specific submission timestamp.
 */
export async function getTaskSubmissionEvents(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.id;
  const submissionId = req.params.submissionId;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  if (!submissionId) {
    throw new AppError(400, 'Submission ID is required');
  }

  const result = await TaskService.getTaskSubmissionEvents(taskId, submissionId, userId);

  res.json({
    success: true,
    data: result,
  });
}

/**
 * Update task
 */
export async function updateTask(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.id;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  // Validate request body
  const data = validate(updateTaskSchema, req.body);

  const task = await TaskService.updateTask(taskId, userId, data);

  res.json({
    success: true,
    data: task,
    message: 'Task updated successfully',
  });
}

async function updateTaskLifecycle(
  req: Request,
  res: Response,
  lifecycleStatus: 'active' | 'paused' | 'ended',
  actionLabel: 'launched' | 'paused' | 'resumed' | 'ended'
): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.id;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  const task = await TaskService.updateTaskLifecycle(taskId, userId, lifecycleStatus);

  res.json({
    success: true,
    data: task,
    message: `Task ${actionLabel} successfully`,
  });
}

export async function launchTask(req: Request, res: Response): Promise<void> {
  await updateTaskLifecycle(req, res, 'active', 'launched');
}

export async function pauseTask(req: Request, res: Response): Promise<void> {
  await updateTaskLifecycle(req, res, 'paused', 'paused');
}

export async function resumeTask(req: Request, res: Response): Promise<void> {
  await updateTaskLifecycle(req, res, 'active', 'resumed');
}

export async function endTask(req: Request, res: Response): Promise<void> {
  await updateTaskLifecycle(req, res, 'ended', 'ended');
}

export async function duplicateTask(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.id;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  const task = await TaskService.duplicateTask(taskId, userId);

  res.status(201).json({
    success: true,
    data: task,
    message: 'Task duplicated successfully',
  });
}

/**
 * Delete task
 */
export async function deleteTask(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.id;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  await TaskService.deleteTask(taskId, userId);

  res.json({
    success: true,
    message: 'Task deleted successfully',
  });
}

/**
 * Regenerate task token
 */
export async function regenerateToken(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.id;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  const task = await TaskService.regenerateTaskToken(taskId, userId);

  logger.info('Task token regenerated', { taskId, userId });

  res.json({
    success: true,
    data: task,
    message: 'Task token regenerated successfully',
  });
}

/**
 * Get tracking snippets for a task
 */
export async function getSnippets(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.id;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  const task = await TaskService.getTask(taskId, userId);

  res.json({
    success: true,
    data: {
      trackingSnippet: task.trackingSnippet,
      iframeSnippet: task.iframeSnippet,
      taskToken: task.taskToken,
    },
  });
}
