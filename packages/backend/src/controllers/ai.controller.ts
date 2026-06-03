import { Request, Response } from 'express';
import { AIService } from '../services/ai.service';
import { AIChatRequest, AILogQueryFilters, AIContentModification } from '@humanly/shared';
import { AppError } from '../middleware/error-handler';
import { AISelectionActionModel, AIActionType, AIDecision } from '../models/ai-selection-action.model';
import { AIModel } from '../models/ai.model';
import { AIChatAttachmentModel } from '../models/ai-chat-attachment.model';
import { FileStorageService } from '../services/file-storage.service';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Allow-list of image MIME types accepted as chat attachments (#93).
 * Kept narrow on purpose — vision models on Together / OpenAI / Anthropic
 * all support these formats, and refusing exotic types at the upload edge
 * keeps the rest of the pipeline simple.
 */
const ALLOWED_CHAT_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

/**
 * POST /api/v1/ai/chat/attachments — upload a single chat image attachment.
 *
 * The chat panel uses this BEFORE sending the chat turn: it uploads the
 * bytes, gets back `{ storageKey, mimeType }`, then passes that as an
 * `attachments` entry on the websocket `ai:message` payload. The actual
 * image inlining for the LLM happens server-side in AIService just before
 * the provider call, so the websocket frame and the persisted message rows
 * stay small.
 */
export async function uploadChatImageAttachment(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Unauthorized');
  }
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    throw new AppError(400, 'No file uploaded (use multipart field "image")');
  }
  if (!ALLOWED_CHAT_IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw new AppError(
      400,
      `Unsupported image type "${file.mimetype}". Allowed: png, jpeg, webp, gif.`,
    );
  }
  // File storage adapter expects an opaque fileId; mint a UUID per upload.
  const stored = await FileStorageService.store(file.buffer, `chat-image-${uuidv4()}`);
  // Persist ownership so later dispatches can refuse cross-user use of
  // this storageKey (#93 security follow-up).
  await AIChatAttachmentModel.record({
    storageKey: stored.storageKey,
    storageProvider: stored.storageProvider,
    storageBucket: stored.storageBucket,
    userId,
    mimeType: file.mimetype,
    filename: file.originalname,
    sizeBytes: file.size,
    imageBytes: file.buffer,
  });
  res.status(201).json({
    success: true,
    data: {
      storageKey: stored.storageKey,
      mimeType: file.mimetype,
      filename: file.originalname,
      size: file.size,
    },
  });
}

const AI_ACTION_QUERY_MAP: Record<AIActionType, { queryType: 'grammar_check' | 'rewrite'; label: string }> = {
  grammar: { queryType: 'grammar_check', label: 'Fix grammar' },
  improve: { queryType: 'rewrite', label: 'Improve writing' },
  simplify: { queryType: 'rewrite', label: 'Simplify text' },
  formal: { queryType: 'rewrite', label: 'Make formal' },
};

/**
 * Send a chat message to AI assistant
 * POST /api/v1/ai/chat
 */
export async function sendChatMessage(req: Request, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Unauthorized');
  }

  const { documentId, sessionId, message, context, silent, attachments, forceNewSession } = req.body;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  // Allow image-only turns: a vision query with no text is valid (#93).
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  const messageStr = typeof message === 'string' ? message.trim() : '';
  if (messageStr.length === 0 && !hasAttachments) {
    throw new AppError(400, 'Message or image attachment is required');
  }

  const request: AIChatRequest = {
    documentId,
    sessionId,
    message: messageStr,
    context,
    attachments: hasAttachments ? attachments : undefined,
    forceNewSession: forceNewSession === true,
  };

  // Silent mode: only get AI response without creating session/logs
  if (silent) {
    const response = await AIService.silentChat(userId, request);
    res.json({
      success: true,
      data: response,
    });
    return;
  }

  const response = await AIService.chat(userId, request);

  res.json({
    success: true,
    data: response,
  });
}

/**
 * Get AI interaction logs for a document
 * GET /api/v1/ai/logs
 */
export async function getLogs(req: Request, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Unauthorized');
  }

  const { documentId } = req.query;

  if (!documentId || typeof documentId !== 'string') {
    throw new AppError(400, 'Document ID is required');
  }

  const filters: Omit<AILogQueryFilters, 'documentId' | 'userId'> = {
    queryType: req.query.queryType as any,
    status: req.query.status as any,
    startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
    endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
  };

  const result = await AIService.getLogs(userId, documentId, filters);

  res.json({
    success: true,
    data: result.logs,
    pagination: {
      total: result.total,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
      hasMore: (filters.offset || 0) + result.logs.length < result.total,
    },
  });
}

/**
 * Get a specific AI interaction log
 * GET /api/v1/ai/logs/:logId
 */
export async function getLog(req: Request, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Unauthorized');
  }

  const { logId } = req.params;

  if (!logId) {
    throw new AppError(400, 'Log ID is required');
  }

  const log = await AIService.getLog(userId, logId);

  res.json({
    success: true,
    data: log,
  });
}

/**
 * Apply an AI suggestion
 * POST /api/v1/ai/apply-suggestion
 */
export async function applySuggestion(req: Request, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Unauthorized');
  }

  const { logId, suggestionId, modification } = req.body;

  if (!logId) {
    throw new AppError(400, 'Log ID is required');
  }

  if (!suggestionId) {
    throw new AppError(400, 'Suggestion ID is required');
  }

  if (!modification || !modification.type || !modification.before || !modification.after) {
    throw new AppError(400, 'Valid modification data is required');
  }

  const modificationData: AIContentModification = {
    id: suggestionId,
    type: modification.type,
    before: modification.before,
    after: modification.after,
    location: modification.location || { startOffset: 0, endOffset: 0 },
    timestamp: new Date(),
  };

  const log = await AIService.applySuggestion(userId, logId, suggestionId, modificationData);

  res.json({
    success: true,
    data: log,
  });
}

/**
 * Get chat sessions for a document
 * GET /api/v1/ai/sessions/:documentId
 */
export async function getSessions(req: Request, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Unauthorized');
  }

  const { documentId } = req.params;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
  const sessions = await AIService.getSessions(userId, documentId, limit);

  res.json({
    success: true,
    data: sessions,
  });
}

/**
 * Get a specific chat session with messages
 * GET /api/v1/ai/sessions/detail/:sessionId
 */
export async function getSession(req: Request, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Unauthorized');
  }

  const { sessionId } = req.params;

  if (!sessionId) {
    throw new AppError(400, 'Session ID is required');
  }

  const session = await AIService.getSession(userId, sessionId);

  res.json({
    success: true,
    data: session,
  });
}

/**
 * Delete a chat session (including messages and logs)
 * DELETE /api/v1/ai/sessions/:sessionId
 */
export async function deleteSession(req: Request, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Unauthorized');
  }

  const { sessionId } = req.params;

  if (!sessionId) {
    throw new AppError(400, 'Session ID is required');
  }

  await AIService.deleteSession(userId, sessionId);

  res.json({
    success: true,
    message: 'Session deleted',
  });
}

/**
 * Track an AI selection action (Fix grammar, Improve writing, etc.)
 * POST /api/v1/ai/selection-action
 */
export async function trackSelectionAction(req: Request, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Unauthorized');
  }

  const { documentId, logId, actionType, originalText, suggestedText, decision, responseTimeMs, modelVersion } = req.body;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  const validActionTypes: AIActionType[] = ['grammar', 'improve', 'simplify', 'formal'];
  if (!actionType || !validActionTypes.includes(actionType)) {
    throw new AppError(400, 'Valid action type is required (grammar, improve, simplify, formal)');
  }
  const validatedActionType = actionType as AIActionType;

  if (!originalText || typeof originalText !== 'string') {
    throw new AppError(400, 'Original text is required');
  }

  if (!suggestedText || typeof suggestedText !== 'string') {
    throw new AppError(400, 'Suggested text is required');
  }

  const validDecisions: AIDecision[] = ['accepted', 'rejected'];
  if (!decision || !validDecisions.includes(decision)) {
    throw new AppError(400, 'Valid decision is required (accepted, rejected)');
  }

  const action = await AISelectionActionModel.create({
    documentId,
    userId,
    actionType: validatedActionType,
    originalText,
    suggestedText,
    decision,
    responseTimeMs,
    modelVersion,
  });

  try {
    let targetLogId = logId as string | undefined;
    const { queryType, label } = AI_ACTION_QUERY_MAP[validatedActionType];

    if (!targetLogId) {
      const existingLog = await AIModel.findRecentSelectionLog({
        documentId,
        userId,
        queryType,
        originalText,
        suggestedText,
      });
      targetLogId = existingLog?.id;
    }

    if (!targetLogId) {
      const log = await AIModel.createLog({
        documentId,
        userId,
        query: `${label}: ${originalText}`,
        queryType,
        questionCategory: 'generation',
        contextSnapshot: {
          selection: {
            text: originalText,
            startOffset: 0,
            endOffset: originalText.length,
          },
        },
      });

      targetLogId = log.id;
    }

    await AIModel.updateLogWithResponse(targetLogId, {
      response: suggestedText,
      responseTimeMs,
      modelVersion,
      status: decision === 'accepted' ? 'success' : 'cancelled',
    });

    if (decision === 'accepted' && targetLogId) {
      const modification: AIContentModification = {
        id: `selection-action-${action.id}`,
        type: 'replace',
        before: originalText,
        after: suggestedText,
        location: {
          startOffset: 0,
          endOffset: originalText.length,
        },
        timestamp: action.createdAt,
      };

      await AIModel.updateLogWithModifications(targetLogId, [modification]);
    }
  } catch (error) {
    logger.warn('Failed to mirror AI selection action into AI interaction logs', {
      userId,
      documentId,
      actionType: validatedActionType,
      error,
    });
  }

  res.json({
    success: true,
    data: action,
  });
}

/**
 * Get AI selection action statistics for a document
 * GET /api/v1/ai/selection-stats/:documentId
 */
export async function getSelectionStats(req: Request, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(401, 'Unauthorized');
  }

  const { documentId } = req.params;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  const stats = await AISelectionActionModel.getStatsByDocumentId(documentId);

  res.json({
    success: true,
    data: stats,
  });
}
