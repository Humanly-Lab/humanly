import { Router } from 'express';
import multer from 'multer';
import { TASK_INSTRUCTION_PDF_MAX_FILES } from '@humanly/shared';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/error-handler';
import { createRateLimiter } from '../middleware/rate-limit';
import {
  createTask,
  getTask,
  getPublicTask,
  listTasks,
  listDashboardTasks,
  listTaskEnrollments,
  listMyTaskEnrollments,
  joinTask,
  leaveTask,
  linkSubmissionDocument,
  startNewTaskAttempt,
  startSubmissionSession,
  endSubmissionSession,
  submitTaskDocument,
  listTaskSubmissions,
  getTaskSubmissionEvents,
  exportTaskSubmissions,
  exportTaskLogEvents,
  updateTask,
  launchTask,
  pauseTask,
  resumeTask,
  endTask,
  duplicateTask,
  deleteTask,
  regenerateToken,
  getSnippets,
  startPublicTaskDocument,
  submitPublicTaskDocument,
} from '../controllers/task.controller';

const router: Router = Router();
const taskFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: TASK_INSTRUCTION_PDF_MAX_FILES,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new AppError(400, 'Only PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});
const publicTaskRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: 'Too many public task requests, please try again later',
});

/**
 * Public task share-link endpoints. These mirror deliberation-platform's
 * unauthenticated participation link pattern and must stay before authenticate.
 */
router.get('/public/:token', publicTaskRateLimiter, asyncHandler(getPublicTask));
router.post('/public/:token/start', publicTaskRateLimiter, optionalAuth, asyncHandler(startPublicTaskDocument));
router.post('/public/:token/submissions', publicTaskRateLimiter, asyncHandler(submitPublicTaskDocument));

// Remaining routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/tasks
 * List user's tasks with pagination and search
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - search: string (optional, searches name and description)
 */
router.get('/', asyncHandler(listTasks));

/**
 * GET /api/v1/tasks/dashboard
 * List lightweight publisher dashboard task cards with server-side filtering.
 */
router.get('/dashboard', asyncHandler(listDashboardTasks));

/**
 * POST /api/v1/tasks
 * Create a new task. Supports JSON body or multipart with JSON `payload` plus `pdf` files.
 */
router.post('/', taskFileUpload.array('pdf', TASK_INSTRUCTION_PDF_MAX_FILES), asyncHandler(createTask));

/**
 * POST /api/v1/tasks/join
 * Look up an active task by 6-character invite code.
 */
router.post('/join', asyncHandler(joinTask));

/**
 * GET /api/v1/tasks/my-enrollments
 * List the current writer's task enrollments for the Writer Portal.
 */
router.get('/my-enrollments', asyncHandler(listMyTaskEnrollments));

/**
 * DELETE /api/v1/tasks/enrollments/:taskId
 * Remove the current user's enrollment from a task.
 */
router.delete('/enrollments/:taskId', asyncHandler(leaveTask));

/**
 * POST /api/v1/tasks/enrollments/:taskId/attempts
 * Start a new attempt for the current user's task enrollment.
 */
router.post('/enrollments/:taskId/attempts', asyncHandler(startNewTaskAttempt));

/**
 * PUT /api/v1/tasks/enrollments/:taskId/submission-document
 * Link the current user's enrollment to a submission document.
 */
router.put('/enrollments/:taskId/submission-document', asyncHandler(linkSubmissionDocument));

/**
 * POST /api/v1/tasks/enrollments/:taskId/submission-sessions
 * Start a real analytics session for the current user's submission document.
 */
router.post('/enrollments/:taskId/submission-sessions', asyncHandler(startSubmissionSession));

/**
 * PUT /api/v1/tasks/enrollments/:taskId/submission-sessions/:sessionId/end
 * End a real analytics session for the current user's submission document.
 */
router.put('/enrollments/:taskId/submission-sessions/:sessionId/end', asyncHandler(endSubmissionSession));

/**
 * POST /api/v1/tasks/enrollments/:taskId/submissions
 * Submit the current user's task document and generate a certificate.
 */
router.post('/enrollments/:taskId/submissions', asyncHandler(submitTaskDocument));

/**
 * GET /api/v1/tasks/:id/enrollments
 * List enrolled users for a task.
 */
router.get('/:id/enrollments', asyncHandler(listTaskEnrollments));

/**
 * GET /api/v1/tasks/:id/submissions
 * List submissions for a task. Optional query: userId.
 */
router.get('/:id/submissions', asyncHandler(listTaskSubmissions));

/**
 * GET /api/v1/tasks/:id/submissions/:submissionId/events
 * Get document events up to the selected submission timestamp.
 */
router.get('/:id/submissions/:submissionId/events', asyncHandler(getTaskSubmissionEvents));

/**
 * GET /api/v1/tasks/:id/exports/submissions
 * Download submitted text snapshots and submission metadata for a publisher-owned task.
 */
router.get('/:id/exports/submissions', asyncHandler(exportTaskSubmissions));

/**
 * GET /api/v1/tasks/:id/exports/log-events
 * Download full submitted document-event logs for a publisher-owned task.
 */
router.get('/:id/exports/log-events', asyncHandler(exportTaskLogEvents));

/**
 * POST /api/v1/tasks/:id/launch
 * Launch a draft task.
 */
router.post('/:id/launch', asyncHandler(launchTask));

/**
 * POST /api/v1/tasks/:id/pause
 * Pause an active task.
 */
router.post('/:id/pause', asyncHandler(pauseTask));

/**
 * POST /api/v1/tasks/:id/resume
 * Resume a paused task.
 */
router.post('/:id/resume', asyncHandler(resumeTask));

/**
 * POST /api/v1/tasks/:id/end
 * End a task permanently.
 */
router.post('/:id/end', asyncHandler(endTask));

/**
 * POST /api/v1/tasks/:id/duplicate
 * Duplicate task settings into a new draft task.
 */
router.post('/:id/duplicate', asyncHandler(duplicateTask));

/**
 * GET /api/v1/tasks/:id
 * Get task details by ID
 */
router.get('/:id', asyncHandler(getTask));

/**
 * PUT /api/v1/tasks/:id
 * Update task
 * Body: { name?, description?, userIdKey?, externalServiceType?, externalServiceUrl?, isActive? }
 */
router.put('/:id', asyncHandler(updateTask));

/**
 * DELETE /api/v1/tasks/:id
 * Delete task
 */
router.delete('/:id', asyncHandler(deleteTask));

/**
 * POST /api/v1/tasks/:id/regenerate-token
 * Regenerate task token
 */
router.post('/:id/regenerate-token', asyncHandler(regenerateToken));

/**
 * GET /api/v1/tasks/:id/snippet
 * Get tracking snippets (JavaScript and iframe)
 */
router.get('/:id/snippet', asyncHandler(getSnippets));

export default router;
