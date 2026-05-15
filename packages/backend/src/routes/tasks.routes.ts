import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error-handler';
import {
  createTask,
  getTask,
  listTasks,
  listTaskEnrollments,
  listMyTaskEnrollments,
  joinTask,
  leaveTask,
  linkSubmissionDocument,
  startSubmissionSession,
  endSubmissionSession,
  submitTaskDocument,
  listTaskSubmissions,
  getTaskSubmissionEvents,
  updateTask,
  deleteTask,
  regenerateToken,
  getSnippets,
} from '../controllers/task.controller';

const router = Router();

// All routes require authentication
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
 * POST /api/v1/tasks
 * Create a new task
 * Body: { name, description?, userIdKey?, externalServiceType?, externalServiceUrl? }
 */
router.post('/', asyncHandler(createTask));

/**
 * POST /api/v1/tasks/join
 * Look up an active task by 6-character invite code.
 */
router.post('/join', asyncHandler(joinTask));

/**
 * GET /api/v1/tasks/my-enrollments
 * List the current user's task enrollments for the user portal.
 */
router.get('/my-enrollments', asyncHandler(listMyTaskEnrollments));

/**
 * DELETE /api/v1/tasks/enrollments/:taskId
 * Remove the current user's enrollment from a task.
 */
router.delete('/enrollments/:taskId', asyncHandler(leaveTask));

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
