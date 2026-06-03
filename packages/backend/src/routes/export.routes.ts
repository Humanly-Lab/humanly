import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error-handler';
import { exportJSON, exportCSV } from '../controllers/export.controller';

const router: Router = Router();

// All export routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/tasks/:taskId/export/json
 * Export events as JSON
 *
 * Query parameters:
 * - startDate: ISO date string (optional) - Filter events from this date
 * - endDate: ISO date string (optional) - Filter events until this date
 * - sessionIds: comma-separated UUIDs (optional) - Filter by specific sessions
 * - userIds: comma-separated strings (optional) - Filter by external user IDs
 *
 * Response:
 * - Content-Type: application/json
 * - Content-Disposition: attachment; filename="humanly-export-{taskId}-{timestamp}.json"
 * - Streamed JSON response with task metadata and events
 *
 * Security:
 * - Requires authentication
 * - Verifies task ownership before exporting
 *
 * Example:
 * GET /api/v1/tasks/abc123/export/json?startDate=2024-01-01T00:00:00Z&endDate=2024-12-31T23:59:59Z
 */
router.get('/:taskId/export/json', asyncHandler(exportJSON));

/**
 * GET /api/v1/tasks/:taskId/export/csv
 * Export events as CSV
 *
 * Query parameters:
 * - startDate: ISO date string (optional) - Filter events from this date
 * - endDate: ISO date string (optional) - Filter events until this date
 * - sessionIds: comma-separated UUIDs (optional) - Filter by specific sessions
 * - userIds: comma-separated strings (optional) - Filter by external user IDs
 *
 * Response:
 * - Content-Type: text/csv
 * - Content-Disposition: attachment; filename="humanly-export-{taskId}-{timestamp}.csv"
 * - Streamed CSV response with headers and flattened event data
 *
 * CSV Format:
 * Headers: id, session_id, task_id, external_user_id, event_type, timestamp,
 *          target_element, key_code, key_char, text_before, text_after,
 *          cursor_position, selection_start, selection_end, metadata_json
 *
 * Security:
 * - Requires authentication
 * - Verifies task ownership before exporting
 *
 * Example:
 * GET /api/v1/tasks/abc123/export/csv?sessionIds=session-uuid-1,session-uuid-2
 */
router.get('/:taskId/export/csv', asyncHandler(exportCSV));

export default router;
