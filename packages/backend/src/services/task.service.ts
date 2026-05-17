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
import { FileModel } from '../models/file.model';
import { CertificateService } from './certificate.service';
import type { AppFile, Task, TaskWithSnippets } from '@humanly/shared';
import { BRAND, getTrackerComment, getIframeComment } from '@humanly/shared';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { cacheDelPattern } from '../config/redis';
import { FileStorageService } from './file-storage.service';

export class TaskService {
  private static async invalidateAnalytics(taskId: string): Promise<void> {
    await cacheDelPattern(`analytics:${taskId}:*`);
  }

  /**
   * Create a new task
   */
  static async createTask(
    userId: string,
    data: CreateTaskData
  ): Promise<TaskWithSnippets> {
    try {
      logger.info('Creating task', { userId, taskName: data.name });

      const task = await TaskModel.create(userId, data);

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
  static async joinTaskByInviteCode(inviteCode: string, userId: string): Promise<Task> {
    const normalizedCode = inviteCode.trim().toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
      throw new AppError(400, 'Invite code must be 6 letters or numbers');
    }

    const task = await TaskModel.findByInviteCode(normalizedCode);

    if (!task) {
      throw new AppError(404, 'Task invite code not found');
    }

    await TaskModel.enrollUser(task.id, userId);
    await this.invalidateAnalytics(task.id);

    const enrolledTask = await TaskModel.findById(task.id);
    return enrolledTask || task;
  }

  /**
   * Remove a user portal enrollment from a task.
   */
  static async leaveTask(taskIdOrInviteCode: string, userId: string): Promise<void> {
    const normalizedIdentifier = taskIdOrInviteCode.trim();
    const task = /^[A-Z0-9]{6}$/i.test(normalizedIdentifier)
      ? await TaskModel.findByInviteCode(normalizedIdentifier.toUpperCase())
      : await TaskModel.findById(normalizedIdentifier);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    await TaskModel.unenrollUser(task.id, userId);
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
    userEmail?: string
  ) {
    const normalizedIdentifier = taskIdOrInviteCode.trim();
    const task = /^[A-Z0-9]{6}$/i.test(normalizedIdentifier)
      ? await TaskModel.findByInviteCode(normalizedIdentifier.toUpperCase())
      : await TaskModel.findById(normalizedIdentifier);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    const now = new Date();
    const startDate = new Date(task.startDate);
    const endDate = new Date(task.endDate);
    if (now < startDate) {
      throw new AppError(400, 'This task is not open for submissions yet');
    }
    if (now > endDate) {
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

    await TaskModel.linkSubmissionDocument(task.id, userId, documentId);

    const latestSubmission = await SubmissionModel.findLatestForUserTask(task.id, userId);
    await SubmissionModel.markHistoricalForUserTask(task.id, userId);
    await CertificateModel.markSupersededForDocument(documentId, userId);

    const submission = await SubmissionModel.create({
      taskId: task.id,
      userId,
      documentId,
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

    const events = await DocumentEventModel.findByDocumentId(submission.documentId, {
      endDate: new Date(submission.submittedAt),
      limit: 5000,
      offset: 0,
    });

    return {
      submission,
      events: events.reverse(),
      totalEvents: events.length,
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

    logger.info('Updating task', { taskId, userId });

    const updatedTask = await TaskModel.update(taskId, data);

    if (!updatedTask) {
      throw new AppError(500, 'Failed to update task');
    }

    logger.info('Task updated successfully', { taskId, userId });

    return updatedTask;
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

    const files = await FileModel.findByTask(taskId);

    await this.invalidateAnalytics(taskId);
    await TaskModel.delete(taskId);
    await this.deleteTaskFileStorage(taskId, userId, files);

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
