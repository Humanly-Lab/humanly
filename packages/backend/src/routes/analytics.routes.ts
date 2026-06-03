import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error-handler';
import {
  getSummaryStats,
  getEventsTimeline,
  getEventTypeDistribution,
  getUserActivity,
  getSessionDetails,
  getSessionsList,
  exportAnalytics,
} from '../controllers/analytics.controller';

const router: Router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/tasks/:taskId/analytics/summary
 * Get summary statistics for a task
 *
 * Query parameters:
 * - startDate: ISO 8601 datetime string (optional) - Filter events from this date
 * - endDate: ISO 8601 datetime string (optional) - Filter events to this date
 * - externalUserId: string (optional) - Filter by specific user
 * - eventType: string (optional) - Filter by event type
 *
 * Returns:
 * - totalEvents: Total number of events
 * - totalSessions: Total number of sessions
 * - uniqueUsers: Number of unique users
 * - avgEventsPerSession: Average events per session
 * - avgSessionDuration: Average session duration in seconds
 * - completionRate: Percentage of submitted sessions
 */
router.get('/:taskId/analytics/summary', asyncHandler(getSummaryStats));

/**
 * GET /api/v1/tasks/:taskId/analytics/events-timeline
 * Get events timeline with date grouping
 *
 * Query parameters:
 * - groupBy: 'hour' | 'day' | 'week' (default: 'day') - Time grouping interval
 * - startDate: ISO 8601 datetime string (optional) - Filter events from this date
 * - endDate: ISO 8601 datetime string (optional) - Filter events to this date
 * - externalUserId: string (optional) - Filter by specific user
 * - eventType: string (optional) - Filter by event type
 *
 * Returns:
 * - groupBy: The grouping interval used
 * - timeline: Array of { date, eventCount } objects
 */
router.get('/:taskId/analytics/events-timeline', asyncHandler(getEventsTimeline));

/**
 * GET /api/v1/tasks/:taskId/analytics/event-types
 * Get event type distribution
 *
 * Query parameters:
 * - startDate: ISO 8601 datetime string (optional) - Filter events from this date
 * - endDate: ISO 8601 datetime string (optional) - Filter events to this date
 * - externalUserId: string (optional) - Filter by specific user
 *
 * Returns:
 * - eventTypes: Array of { eventType, count, percentage } objects
 * - total: Total number of events
 */
router.get('/:taskId/analytics/event-types', asyncHandler(getEventTypeDistribution));

/**
 * GET /api/v1/tasks/:taskId/analytics/users
 * Get user activity list with pagination
 *
 * Query parameters:
 * - page: number (default: 1) - Page number
 * - limit: number (default: 20, max: 100) - Items per page
 * - startDate: ISO 8601 datetime string (optional) - Filter from this date
 * - endDate: ISO 8601 datetime string (optional) - Filter to this date
 *
 * Returns:
 * - users: Array of { externalUserId, sessionCount, eventCount, lastActive }
 * - total: Total number of users
 * - page: Current page
 * - limit: Items per page
 * - totalPages: Total number of pages
 */
router.get('/:taskId/analytics/users', asyncHandler(getUserActivity));

/**
 * GET /api/v1/tasks/:taskId/analytics/sessions
 * Get list of sessions for a task
 *
 * Query parameters:
 * - page: number (default: 1) - Page number
 * - limit: number (default: 50, max: 100) - Items per page
 * - startDate: ISO 8601 datetime string (optional) - Filter from this date
 * - endDate: ISO 8601 datetime string (optional) - Filter to this date
 * - externalUserId: string (optional) - Filter by specific user
 * - submitted: boolean (optional) - Filter by submission status
 *
 * Returns:
 * - sessions: Array of session objects with stats
 * - pagination: { page, limit, totalCount, totalPages }
 */
router.get('/:taskId/analytics/sessions', asyncHandler(getSessionsList));

/**
 * GET /api/v1/tasks/:taskId/analytics/sessions/:sessionId
 * Get detailed session information with events
 *
 * Returns:
 * - id: Session ID
 * - taskId: Task ID
 * - externalUserId: External user ID
 * - sessionStart: Session start timestamp
 * - sessionEnd: Session end timestamp (null if ongoing)
 * - submitted: Whether session was submitted
 * - submissionTime: Submission timestamp (null if not submitted)
 * - durationSeconds: Session duration in seconds
 * - eventCount: Number of events in session
 * - events: Array of event objects with full details
 */
router.get('/:taskId/analytics/sessions/:sessionId', asyncHandler(getSessionDetails));

/**
 * GET /api/v1/tasks/:taskId/analytics/export
 * Export analytics data (placeholder for future implementation)
 *
 * Query parameters:
 * - format: 'csv' | 'json' | 'excel' (default: 'csv')
 * - startDate: ISO 8601 datetime string (optional)
 * - endDate: ISO 8601 datetime string (optional)
 */
router.get('/:taskId/analytics/export', asyncHandler(exportAnalytics));

export default router;
