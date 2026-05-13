import { Request, Response } from 'express';
import { z } from 'zod';
import { AnalyticsService } from '../services/analytics.service';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

// Validation schemas
const analyticsFiltersSchema = z.object({
  startDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  externalUserId: z.string().optional(),
  eventType: z.string().optional(),
});

const timelineQuerySchema = z.object({
  groupBy: z.enum(['hour', 'day', 'week']).default('day'),
  startDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  externalUserId: z.string().optional(),
  eventType: z.string().optional(),
});

const userActivityQuerySchema = z.object({
  page: z.string().transform(val => parseInt(val, 10)).default('1'),
  limit: z.string().transform(val => parseInt(val, 10)).default('20'),
  startDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
});

/**
 * GET /api/v1/tasks/:taskId/analytics/summary
 * Get summary statistics for a task
 */
export async function getSummaryStats(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.user!.userId;

    // Validate query parameters
    const filters = analyticsFiltersSchema.parse(req.query);

    // Get summary stats
    const stats = await AnalyticsService.getSummaryStats(taskId, userId, filters);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(400, 'Invalid query parameters');
    }
    throw error;
  }
}

/**
 * GET /api/v1/tasks/:taskId/analytics/events-timeline
 * Get events timeline with date grouping
 */
export async function getEventsTimeline(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.user!.userId;

    // Validate query parameters
    const query = timelineQuerySchema.parse(req.query);

    // Extract filters
    const filters = {
      startDate: query.startDate,
      endDate: query.endDate,
      externalUserId: query.externalUserId,
      eventType: query.eventType,
    };

    // Get timeline
    const timeline = await AnalyticsService.getEventsTimeline(
      taskId,
      userId,
      query.groupBy,
      filters
    );

    res.json({
      success: true,
      data: {
        groupBy: query.groupBy,
        timeline,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(400, 'Invalid query parameters');
    }
    throw error;
  }
}

/**
 * GET /api/v1/tasks/:taskId/analytics/event-types
 * Get event type distribution
 */
export async function getEventTypeDistribution(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.user!.userId;

    // Validate query parameters
    const filters = analyticsFiltersSchema.parse(req.query);

    // Get distribution
    const distribution = await AnalyticsService.getEventTypeDistribution(
      taskId,
      userId,
      filters
    );

    res.json({
      success: true,
      data: {
        eventTypes: distribution,
        total: distribution.reduce((sum, item) => sum + item.count, 0),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(400, 'Invalid query parameters');
    }
    throw error;
  }
}

/**
 * GET /api/v1/tasks/:taskId/analytics/users
 * Get user activity list with pagination
 */
export async function getUserActivity(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.user!.userId;

    // Validate query parameters
    const query = userActivityQuerySchema.parse(req.query);

    // Extract filters
    const filters = {
      startDate: query.startDate,
      endDate: query.endDate,
    };

    // Get user activity
    const result = await AnalyticsService.getUserActivity(
      taskId,
      userId,
      query.page,
      query.limit,
      filters
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(400, 'Invalid query parameters');
    }
    throw error;
  }
}

/**
 * GET /api/v1/tasks/:taskId/analytics/sessions/:sessionId
 * Get detailed session information with events
 */
export async function getSessionDetails(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.userId;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      throw new AppError(400, 'Invalid session ID format');
    }

    // Get session details
    const details = await AnalyticsService.getSessionDetails(sessionId, userId);

    res.json({
      success: true,
      data: details,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * GET /api/v1/tasks/:taskId/analytics/sessions
 * Get list of sessions for a task
 */
export async function getSessionsList(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.user!.userId;

    // Parse pagination and filters
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const filters: any = {
      limit,
      offset,
    };

    // Add optional filters
    if (req.query.externalUserId) {
      filters.externalUserId = req.query.externalUserId as string;
    }

    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate as string);
    }

    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate as string);
    }

    if (req.query.submitted !== undefined) {
      filters.submitted = req.query.submitted === 'true';
    }

    // Get sessions
    const sessions = await AnalyticsService.getTaskSessions(taskId, userId, filters);

    // Get total count for pagination
    const totalCount = await AnalyticsService.getSessionsCount(taskId, userId, filters);

    res.json({
      success: true,
      data: {
        sessions,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    throw error;
  }
}

/**
 * GET /api/v1/tasks/:taskId/analytics/export
 * Export analytics data (placeholder for future implementation)
 */
export async function exportAnalytics(req: Request, res: Response): Promise<void> {
  try {
    // This is a placeholder for future export functionality
    // Could export to CSV, JSON, or Excel
    res.json({
      success: false,
      message: 'Export functionality not yet implemented',
    });
  } catch (error) {
    throw error;
  }
}
