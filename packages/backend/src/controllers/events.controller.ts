import { Request, Response } from 'express';
import { z } from 'zod';
import { EventService } from '../services/event.service';
import { asyncHandler } from '../middleware/error-handler';
import { TrackerEvent, EventType } from '@humanly/shared';
import { logger } from '../utils/logger';

// Validation schemas
const eventTypeSchema = z.enum([
  'keydown',
  'keyup',
  'paste',
  'copy',
  'cut',
  'focus',
  'blur',
  'input',
  'change',
]);

const trackerEventSchema = z.object({
  eventType: eventTypeSchema,
  timestamp: z.string().or(z.date()).transform((val) => new Date(val)),
  targetElement: z.string().optional(),
  keyCode: z.string().optional(),
  keyChar: z.string().optional(),
  textBefore: z.string().optional(),
  textAfter: z.string().optional(),
  cursorPosition: z.number().optional(),
  selectionStart: z.number().optional(),
  selectionEnd: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

const initSessionSchema = z.object({
  externalUserId: z.string().min(1).max(255),
  metadata: z.record(z.any()).optional(),
});

const ingestEventsSchema = z.object({
  events: z.array(trackerEventSchema).min(1).max(1000),
  sessionId: z.string().optional(), // For sendBeacon compatibility
  taskToken: z.string().optional(), // For sendBeacon compatibility
});

export class EventsController {
  /**
   * POST /api/v1/track/init
   * Initialize a new tracking session
   */
  static initSession = asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();

    // Validate request body
    const validatedData = initSessionSchema.parse(req.body);

    // Get task token from header
    const taskToken = req.headers['x-task-token'] as string;

    if (!taskToken) {
      res.status(401).json({
        success: false,
        error: 'Missing task token',
        message: 'X-Task-Token header is required',
      });
      return;
    }

    // Get IP address and user agent
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      undefined;

    const userAgent = req.headers['user-agent'] || undefined;

    // Initialize session
    const result = await EventService.initSession({
      taskToken,
      externalUserId: validatedData.externalUserId,
      metadata: validatedData.metadata,
      ipAddress,
      userAgent,
    });

    const duration = Date.now() - startTime;

    logger.info('Session init request completed', {
      sessionId: result.sessionId,
      taskId: result.taskId,
      duration,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Session initialized successfully',
    });
  });

  /**
   * POST /api/v1/track/events
   * Ingest batch of events for a session
   */
  static ingestEvents = asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();

    // Validate request body
    const validatedData = ingestEventsSchema.parse(req.body);

    // Get session ID from header or body (body is fallback for sendBeacon)
    const sessionId = (req.headers['x-session-id'] as string) || validatedData.sessionId;

    if (!sessionId) {
      res.status(401).json({
        success: false,
        error: 'Missing session ID',
        message: 'X-Session-Id header or sessionId in body is required',
      });
      return;
    }

    // Get task ID from authenticated request (set by validateTaskToken middleware)
    // If not set and taskToken is in body, we need to validate it
    let taskId = req.taskId;

    if (!taskId && validatedData.taskToken) {
      // For sendBeacon requests, task token might be in body
      // We need to validate it here
      const TaskModel = (await import('../models/task.model')).TaskModel;
      const task = await TaskModel.findByToken(validatedData.taskToken);

      if (!task || !task.isActive) {
        res.status(401).json({
          success: false,
          error: 'Invalid task token',
          message: 'Task authentication required',
        });
        return;
      }

      taskId = task.id;
    }

    if (!taskId) {
      res.status(401).json({
        success: false,
        error: 'Missing task ID',
        message: 'Task authentication required',
      });
      return;
    }

    // Ingest events
    const result = await EventService.ingestEvents({
      taskId,
      sessionId,
      events: validatedData.events as TrackerEvent[],
    });

    const duration = Date.now() - startTime;

    logger.info('Event ingestion request completed', {
      sessionId,
      taskId,
      eventCount: validatedData.events.length,
      duration,
    });

    res.status(200).json({
      success: true,
      data: result,
      message: 'Events ingested successfully',
    });
  });

  /**
   * POST /api/v1/track/submit
   * Mark session as submitted
   */
  static submitSession = asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();

    // Get session ID from header
    const sessionId = req.headers['x-session-id'] as string;

    if (!sessionId) {
      res.status(401).json({
        success: false,
        error: 'Missing session ID',
        message: 'X-Session-Id header is required',
      });
      return;
    }

    // Get task ID from authenticated request
    const taskId = req.taskId;

    // Submit session
    const result = await EventService.submitSession(sessionId, taskId);

    const duration = Date.now() - startTime;

    logger.info('Session submit request completed', {
      sessionId,
      taskId,
      duration,
    });

    res.status(200).json({
      success: true,
      data: result,
      message: 'Session submitted successfully',
    });
  });

  /**
   * GET /api/v1/track/health
   * Health check endpoint for tracking service
   */
  static healthCheck = asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'Tracking service is operational',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /api/v1/track/session/:sessionId/events
   * Get events for a specific session (requires user authentication)
   */
  static getSessionEvents = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const userId = (req as any).userId; // Assumes user authentication middleware sets this

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User authentication required',
      });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 1000;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await EventService.getSessionEvents(sessionId, userId, limit, offset);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Session events retrieved successfully',
    });
  });

  /**
   * GET /api/v1/track/task/:taskId/events
   * Query events for a task (requires user authentication)
   */
  static queryEvents = asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const userId = (req as any).userId; // Assumes user authentication middleware sets this

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User authentication required',
      });
      return;
    }

    // Parse query filters
    const filters: any = {
      limit: parseInt(req.query.limit as string) || 1000,
      offset: parseInt(req.query.offset as string) || 0,
    };

    if (req.query.sessionId) {
      filters.sessionId = req.query.sessionId as string;
    }

    if (req.query.externalUserId) {
      filters.externalUserId = req.query.externalUserId as string;
    }

    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate as string);
    }

    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate as string);
    }

    if (req.query.eventTypes) {
      const types = req.query.eventTypes as string;
      filters.eventTypes = types.split(',') as EventType[];
    }

    const result = await EventService.queryEvents(taskId, userId, filters);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Events retrieved successfully',
    });
  });

  /**
   * GET /api/v1/track/task/:taskId/stats
   * Get event statistics for a task (requires user authentication)
   */
  static getEventStats = asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const userId = (req as any).userId; // Assumes user authentication middleware sets this

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User authentication required',
      });
      return;
    }

    const result = await EventService.getEventStats(taskId, userId);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Event statistics retrieved successfully',
    });
  });
}
