import { Request, Response, NextFunction } from 'express';
import { TaskModel } from '../models/task.model';
import { SessionModel } from '../models/session.model';
import { AppError } from './error-handler';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Extend Express Request to include task and session
declare global {
  namespace Express {
    interface Request {
      task?: any;
      session?: any;
      taskId?: string;
      sessionId?: string;
    }
  }
}

/**
 * Validate X-Task-Token header and attach task to request
 */
export async function validateTaskToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const taskToken = req.headers['x-task-token'] as string;

    if (!taskToken) {
      throw new AppError(401, 'Task token is required');
    }

    // Check cache first
    const redis = getRedisClient();
    const cacheKey = `task:token:${taskToken}`;

    let task;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        task = JSON.parse(cached);
        logger.debug('Task loaded from cache', { taskId: task.id });
      }
    } catch (cacheError) {
      logger.warn('Redis cache error, falling back to database', { error: cacheError });
    }

    // If not cached, fetch from database
    if (!task) {
      task = await TaskModel.findByToken(taskToken);

      if (!task) {
        throw new AppError(401, 'Invalid or inactive task token');
      }

      // Cache task for 5 minutes
      try {
        await redis.setEx(cacheKey, 300, JSON.stringify(task));
      } catch (cacheError) {
        logger.warn('Failed to cache task', { error: cacheError });
      }
    }

    // Check if task is active
    if (!task.isActive) {
      throw new AppError(403, 'Task is not active');
    }

    // Attach task to request
    req.task = task;
    req.taskId = task.id;

    logger.debug('Task token validated', {
      taskId: task.id,
      taskName: task.name,
    });

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Validate X-Session-Id header and attach session to request
 */
export async function validateSessionId(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = req.headers['x-session-id'] as string;

    if (!sessionId) {
      throw new AppError(401, 'Session ID is required');
    }

    // Fetch session from database
    const session = await SessionModel.findById(sessionId);

    if (!session) {
      throw new AppError(404, 'Session not found');
    }

    // Verify session belongs to the authenticated task
    if (req.taskId && session.taskId !== req.taskId) {
      throw new AppError(403, 'Session does not belong to this task');
    }

    // Check if session has ended
    if (session.sessionEnd) {
      throw new AppError(400, 'Session has already ended');
    }

    // Attach session to request
    req.session = session;
    req.sessionId = session.id;

    logger.debug('Session validated', {
      sessionId: session.id,
      taskId: session.taskId,
    });

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Rate limiting for tracking endpoints using Redis
 * Limits: 1000 requests per minute per task
 */
export async function trackingRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const taskId = req.taskId || req.task?.id;

    if (!taskId) {
      // If no task ID, let it pass and let validateTaskToken handle it
      return next();
    }

    const redis = getRedisClient();
    const rateLimitKey = `ratelimit:tracking:${taskId}`;
    const rateLimitWindow = 60; // 1 minute
    const maxRequests = 1000;

    try {
      // Increment request count
      const current = await redis.incr(rateLimitKey);

      // Set expiry on first request in window
      if (current === 1) {
        await redis.expire(rateLimitKey, rateLimitWindow);
      }

      // Check if limit exceeded
      if (current > maxRequests) {
        const ttl = await redis.ttl(rateLimitKey);

        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', (Date.now() + ttl * 1000).toString());

        logger.warn('Rate limit exceeded', {
          taskId,
          current,
          limit: maxRequests,
        });

        throw new AppError(429, 'Rate limit exceeded. Please try again later.');
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current).toString());

      logger.debug('Rate limit check passed', {
        taskId,
        current,
        limit: maxRequests,
      });

      next();
    } catch (redisError: any) {
      // If Redis is down, log warning but allow request through
      if (redisError instanceof AppError) {
        throw redisError;
      }

      logger.warn('Redis rate limiting unavailable, allowing request', {
        error: redisError,
        taskId,
      });
      next();
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Optional: Track metrics for monitoring
 */
export async function trackMetrics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const startTime = Date.now();

  // Track response
  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    const taskId = req.taskId;

    if (taskId) {
      const redis = getRedisClient();
      const metricsKey = `metrics:tracking:${taskId}:${new Date().toISOString().split('T')[0]}`;

      try {
        // Increment request count
        await redis.hIncrBy(metricsKey, 'requests', 1);

        // Track status codes
        await redis.hIncrBy(metricsKey, `status:${res.statusCode}`, 1);

        // Track total duration
        await redis.hIncrBy(metricsKey, 'total_duration_ms', duration);

        // Set expiry (7 days)
        await redis.expire(metricsKey, 7 * 24 * 60 * 60);

        logger.debug('Metrics tracked', {
          taskId,
          statusCode: res.statusCode,
          duration,
        });
      } catch (error) {
        logger.warn('Failed to track metrics', { error });
      }
    }
  });

  next();
}

/**
 * Validate external user ID from request body
 * If not provided, generates a unique anonymous ID
 */
export function validateExternalUserId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let externalUserId = req.body?.externalUserId || req.body?.userId;

  // If no user ID provided, generate an anonymous one
  if (!externalUserId) {
    // Generate unique anonymous ID: anon_timestamp_random
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    externalUserId = `anon_${timestamp}_${random}`;

    logger.debug('Generated anonymous user ID', { externalUserId });
  }

  if (typeof externalUserId !== 'string' || externalUserId.trim().length === 0) {
    throw new AppError(400, 'External user ID must be a non-empty string');
  }

  if (externalUserId.length > 255) {
    throw new AppError(400, 'External user ID must be less than 255 characters');
  }

  // Store normalized external user ID
  req.body.externalUserId = externalUserId.trim();

  next();
}
