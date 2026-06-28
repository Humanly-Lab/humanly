import { Request, Response } from 'express';
import { DocumentService } from '../services/document.service';
import { FileService } from '../services/file.service';
import { AppError } from '../middleware/error-handler';
import { DocumentEventInsertData, EventType } from '@humanly/shared';

/**
 * Create a new document
 */
export async function createDocument(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { title, description, content, status, environmentConfig } = req.body;

  if (!title || typeof title !== 'string') {
    throw new AppError(400, 'Title is required');
  }

  const document = await DocumentService.createDocument(
    userId,
    title,
    content || {},
    status || 'draft',
    environmentConfig || null,
    typeof description === 'string' ? description : null
  );

  res.status(201).json({
    success: true,
    data: { document },
    message: 'Document created successfully',
  });
}

/**
 * Get document by ID
 */
export async function getDocument(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const documentId = req.params.id;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  const document = await DocumentService.getDocument(documentId, userId);
  const files = await FileService.listDocumentFiles(documentId, userId);

  res.json({
    success: true,
    data: {
      document,
      linkedFile: files[0] || null,
      linkedFiles: files,
    },
  });
}

/**
 * List user's documents
 */
export async function listDocuments(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  // Parse query parameters
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const status = req.query.status as 'draft' | 'published' | 'archived' | undefined;
  const search = req.query.search as string | undefined;
  const sortBy = (req.query.sortBy as 'createdAt' | 'updatedAt' | 'title') || 'updatedAt';
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

  const result = await DocumentService.listDocuments(userId, {
    limit,
    offset,
    status,
    search,
    sortBy,
    sortOrder,
  });

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
}

/**
 * Update document
 */
export async function updateDocument(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const documentId = req.params.id;
  const { title, description, content, status, environmentConfig } = req.body;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  const updates: any = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (content !== undefined) updates.content = content;
  if (status !== undefined) updates.status = status;
  if (environmentConfig !== undefined) updates.environmentConfig = environmentConfig;

  const document = await DocumentService.updateDocument(documentId, userId, updates);

  res.json({
    success: true,
    data: { document },
    message: 'Document updated successfully',
  });
}

/**
 * Persist the first entry into a timed writing session.
 */
export async function startWritingSession(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const documentId = req.params.id;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  const document = await DocumentService.startWritingSession(documentId, userId);

  res.json({
    success: true,
    data: { document },
    message: 'Writing session started successfully',
  });
}

/**
 * Delete document
 */
export async function deleteDocument(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const documentId = req.params.id;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  await DocumentService.deleteDocument(documentId, userId);

  res.json({
    success: true,
    message: 'Document deleted successfully',
  });
}

/**
 * Track document events (batch)
 */
export async function trackDocumentEvents(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const documentId = req.params.id;
  const { events, sessionId } = req.body;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  if (!Array.isArray(events) || events.length === 0) {
    throw new AppError(400, 'Events array is required and must not be empty');
  }

  // Validate and sanitize events
  const validatedEvents: DocumentEventInsertData[] = events.map((event: any) => ({
    documentId,
    userId,
    sessionId: event.sessionId || sessionId,
    eventType: event.eventType || 'unknown',
    timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
    keyCode: event.keyCode,
    keyChar: event.keyChar,
    textBefore: event.textBefore,
    textAfter: event.textAfter,
    cursorPosition: event.cursorPosition,
    selectionStart: event.selectionStart,
    selectionEnd: event.selectionEnd,
    editorStateBefore: event.editorStateBefore,
    editorStateAfter: event.editorStateAfter,
    metadata: event.metadata,
  }));

  await DocumentService.trackEvents(documentId, userId, validatedEvents);

  res.json({
    success: true,
    message: `${validatedEvents.length} events tracked successfully`,
  });
}

/**
 * Get document events
 */
export async function getDocumentEvents(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const documentId = req.params.id;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  // Parse query parameters
  const eventTypeParam = req.query.eventType as string | undefined;
  // Support comma-separated event types
  const eventType = eventTypeParam ? eventTypeParam.split(',').map(t => t.trim() as EventType) : undefined;
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 1000, 10000);
  const offset = parseInt(req.query.offset as string) || 0;

  const { events, total } = await DocumentService.getDocumentEvents(documentId, userId, {
    eventType,
    startDate,
    endDate,
    limit,
    offset,
  });

  res.json({
    success: true,
    data: { events },
    count: total,
  });
}

/**
 * Get derived document event timeline
 */
export async function getDocumentEventTimeline(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const documentId = req.params.id;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 10000, 10000);

  const timeline = await DocumentService.getDocumentEventTimeline(documentId, userId, {
    startDate,
    endDate,
    limit,
    offset: 0,
  });

  res.json({
    success: true,
    data: timeline,
  });
}

/**
 * Get document statistics
 */
export async function getDocumentStatistics(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const documentId = req.params.id;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  const stats = await DocumentService.getDocumentStatistics(documentId, userId);

  res.json({
    success: true,
    data: { statistics: stats },
  });
}
