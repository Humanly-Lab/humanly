import { SessionModel } from '../models/session.model';
import { EventModel, EventInsertData } from '../models/event.model';
import { TaskModel } from '../models/task.model';
import { Session, TrackerEvent, Event, EventQueryFilters } from '@humanly/shared';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

export interface InitSessionInput {
  taskToken: string;
  externalUserId: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface InitSessionResponse {
  sessionId: string;
  taskId: string;
  message: string;
}

export interface IngestEventsInput {
  taskId: string;
  sessionId: string;
  events: TrackerEvent[];
}

export interface IngestEventsResponse {
  success: boolean;
  eventsIngested: number;
  message: string;
}

export interface SubmitSessionResponse {
  success: boolean;
  sessionId: string;
  message: string;
}

export class EventService {
  /**
   * Initialize a new tracking session
   */
  static async initSession(input: InitSessionInput): Promise<InitSessionResponse> {
    const startTime = Date.now();

    try {
      // Verify task token
      const task = await TaskModel.findByToken(input.taskToken);

      if (!task) {
        throw new AppError(401, 'Invalid or inactive task token');
      }

      if (!task.isActive) {
        throw new AppError(403, 'Task is not active');
      }

      // Create new session
      const session = await SessionModel.create({
        taskId: task.id,
        externalUserId: input.externalUserId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });

      const duration = Date.now() - startTime;

      logger.info('Session initialized', {
        sessionId: session.id,
        taskId: task.id,
        externalUserId: input.externalUserId,
        duration,
      });

      // Broadcast session creation via WebSocket if available
      if ((global as any).io) {
        (global as any).io.to(`task:${task.id}`).emit('session-started', {
          sessionId: session.id,
          externalUserId: session.externalUserId,
          timestamp: new Date(),
        });
      }

      return {
        sessionId: session.id,
        taskId: task.id,
        message: 'Session initialized successfully',
      };
    } catch (error) {
      logger.error('Failed to initialize session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        externalUserId: input.externalUserId,
      });
      throw error;
    }
  }

  /**
   * Ingest batch of events for a session
   */
  static async ingestEvents(input: IngestEventsInput): Promise<IngestEventsResponse> {
    const startTime = Date.now();

    try {
      if (!input.events || input.events.length === 0) {
        throw new AppError(400, 'No events provided');
      }

      if (input.events.length > 1000) {
        throw new AppError(400, 'Too many events. Maximum 1000 events per batch.');
      }

      // Verify session exists
      const session = await SessionModel.findById(input.sessionId);

      if (!session) {
        throw new AppError(404, 'Session not found');
      }

      // Verify session belongs to task
      if (session.taskId !== input.taskId) {
        throw new AppError(403, 'Session does not belong to this task');
      }

      // Check if session has ended
      if (session.sessionEnd) {
        throw new AppError(400, 'Cannot add events to an ended session');
      }

      // Prepare events for insertion
      const eventsToInsert: EventInsertData[] = input.events.map((event) => ({
        sessionId: input.sessionId,
        taskId: input.taskId,
        eventType: event.eventType,
        timestamp: typeof event.timestamp === 'string' ? new Date(event.timestamp) : event.timestamp,
        targetElement: event.targetElement,
        keyCode: event.keyCode,
        keyChar: event.keyChar,
        textBefore: event.textBefore,
        textAfter: event.textAfter,
        cursorPosition: event.cursorPosition,
        selectionStart: event.selectionStart,
        selectionEnd: event.selectionEnd,
        metadata: event.metadata,
      }));

      // Batch insert events
      await EventModel.batchInsert(eventsToInsert);

      const duration = Date.now() - startTime;

      logger.info('Events ingested', {
        sessionId: input.sessionId,
        taskId: input.taskId,
        eventCount: input.events.length,
        duration,
      });

      // Broadcast events via WebSocket if available
      // Send each event individually for live preview
      if ((global as any).io) {
        // Get session to include externalUserId
        const sessionForEvent = await SessionModel.findById(input.sessionId);

        if (sessionForEvent) {
          // Emit the first few events individually for live preview
          const eventsToEmit = input.events.slice(0, 10);
          eventsToEmit.forEach((event) => {
            (global as any).io.to(`task:${input.taskId}`).emit('event-received', {
              sessionId: input.sessionId,
              externalUserId: sessionForEvent.externalUserId,
              event,
            });
          });
        }
      }

      return {
        success: true,
        eventsIngested: input.events.length,
        message: 'Events ingested successfully',
      };
    } catch (error) {
      logger.error('Failed to ingest events', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: input.sessionId,
        taskId: input.taskId,
        eventCount: input.events?.length || 0,
      });
      throw error;
    }
  }

  /**
   * Submit session (mark as completed)
   */
  static async submitSession(sessionId: string, taskId?: string): Promise<SubmitSessionResponse> {
    const startTime = Date.now();

    try {
      // Verify session exists
      const session = await SessionModel.findById(sessionId);

      if (!session) {
        throw new AppError(404, 'Session not found');
      }

      // Verify task ownership if taskId provided
      if (taskId && session.taskId !== taskId) {
        throw new AppError(403, 'Session does not belong to this task');
      }

      // Check if already submitted
      if (session.submitted) {
        throw new AppError(400, 'Session already submitted');
      }

      // Mark session as submitted and end it
      await SessionModel.markSubmitted(sessionId);
      await SessionModel.endSession(sessionId);

      const duration = Date.now() - startTime;

      logger.info('Session submitted', {
        sessionId,
        taskId: session.taskId,
        externalUserId: session.externalUserId,
        duration,
      });

      // Broadcast session submission via WebSocket if available
      if ((global as any).io) {
        (global as any).io.to(`task:${session.taskId}`).emit('session-ended', {
          sessionId,
          externalUserId: session.externalUserId,
          submitted: true,
          timestamp: new Date(),
        });
      }

      return {
        success: true,
        sessionId,
        message: 'Session submitted successfully',
      };
    } catch (error) {
      logger.error('Failed to submit session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
      });
      throw error;
    }
  }

  /**
   * Get events for a session (with task ownership verification)
   */
  static async getSessionEvents(
    sessionId: string,
    userId: string,
    limit: number = 1000,
    offset: number = 0
  ): Promise<{ events: Event; session: Session; total: number }> {
    try {
      // Get session
      const session = await SessionModel.findById(sessionId);

      if (!session) {
        throw new AppError(404, 'Session not found');
      }

      // Verify task ownership
      const ownsTask = await TaskModel.verifyOwnership(session.taskId, userId);

      if (!ownsTask) {
        throw new AppError(403, 'You do not have access to this session');
      }

      // Get events
      const events = await EventModel.findBySessionId(sessionId, limit, offset);
      const total = await EventModel.countBySessionId(sessionId);

      logger.info('Session events retrieved', {
        sessionId,
        taskId: session.taskId,
        userId,
        eventCount: events.length,
        total,
      });

      return {
        events: events as any,
        session,
        total,
      };
    } catch (error) {
      logger.error('Failed to get session events', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Query events with filters (with task ownership verification)
   */
  static async queryEvents(
    taskId: string,
    userId: string,
    filters: EventQueryFilters = {}
  ): Promise<{ events: Event[]; total: number }> {
    try {
      // Verify task ownership
      const ownsTask = await TaskModel.verifyOwnership(taskId, userId);

      if (!ownsTask) {
        throw new AppError(403, 'You do not have access to this task');
      }

      // Query events
      const events = await EventModel.findByTaskId(taskId, filters);
      const total = await EventModel.countByTaskId(taskId, filters);

      logger.info('Events queried', {
        taskId,
        userId,
        eventCount: events.length,
        total,
        filters,
      });

      return {
        events,
        total,
      };
    } catch (error) {
      logger.error('Failed to query events', {
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get event statistics for a task
   */
  static async getEventStats(taskId: string, userId: string) {
    try {
      // Verify task ownership
      const ownsTask = await TaskModel.verifyOwnership(taskId, userId);

      if (!ownsTask) {
        throw new AppError(403, 'You do not have access to this task');
      }

      // Get event type distribution
      const eventTypes = await EventModel.getEventTypes(taskId);

      // Get total event count
      const totalEvents = await EventModel.countByTaskId(taskId);

      logger.info('Event statistics retrieved', {
        taskId,
        userId,
        totalEvents,
      });

      return {
        totalEvents,
        eventTypes,
      };
    } catch (error) {
      logger.error('Failed to get event statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId,
        userId,
      });
      throw error;
    }
  }
}
