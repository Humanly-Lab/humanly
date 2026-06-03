import { Router } from 'express';
import { EventsController } from '../controllers/events.controller';
import {
  validateTaskToken,
  validateSessionId,
  trackingRateLimit,
  trackMetrics,
  validateExternalUserId,
} from '../middleware/tracking.middleware';

const router: Router = Router();

/**
 * Public tracking endpoints
 * These endpoints are protected by X-Task-Token header, not user authentication
 */

// Health check for tracking service
router.get('/health', EventsController.healthCheck);

// Initialize a new tracking session
// POST /api/v1/track/init
// Headers: X-Task-Token
// Body: { externalUserId: string, metadata?: object }
router.post(
  '/init',
  trackingRateLimit,
  trackMetrics,
  validateTaskToken,
  validateExternalUserId,
  EventsController.initSession
);

// Ingest batch of events
// POST /api/v1/track/events
// Headers: X-Task-Token, X-Session-Id
// Body: { events: TrackerEvent[] }
router.post(
  '/events',
  trackingRateLimit,
  trackMetrics,
  validateTaskToken,
  EventsController.ingestEvents
);

// Submit session (mark as completed)
// POST /api/v1/track/submit
// Headers: X-Task-Token, X-Session-Id
router.post(
  '/submit',
  trackingRateLimit,
  trackMetrics,
  validateTaskToken,
  EventsController.submitSession
);

/**
 * Authenticated endpoints for retrieving data
 * These endpoints require user authentication (not tracking authentication)
 * Note: Authentication middleware should be added when auth is implemented
 */

// Get events for a specific session
// GET /api/v1/track/session/:sessionId/events
// Requires: User authentication
router.get(
  '/session/:sessionId/events',
  // TODO: Add user authentication middleware when implemented
  EventsController.getSessionEvents
);

// Query events for a task with filters
// GET /api/v1/track/task/:taskId/events
// Query params: sessionId?, externalUserId?, startDate?, endDate?, eventTypes?, limit?, offset?
// Requires: User authentication
router.get(
  '/task/:taskId/events',
  // TODO: Add user authentication middleware when implemented
  EventsController.queryEvents
);

// Get event statistics for a task
// GET /api/v1/track/task/:taskId/stats
// Requires: User authentication
router.get(
  '/task/:taskId/stats',
  // TODO: Add user authentication middleware when implemented
  EventsController.getEventStats
);

export default router;
