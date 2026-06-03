import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/error-handler';
import {
  sendChatMessage,
  getLogs,
  getLog,
  applySuggestion,
  getSessions,
  getSession,
  deleteSession,
  trackSelectionAction,
  getSelectionStats,
  uploadChatImageAttachment,
} from '../controllers/ai.controller';

/**
 * Image upload middleware for chat attachments (#93). 10 MB cap is
 * generous for screenshots / photos without becoming a DOS vector; MIME
 * validation is repeated in the controller as defense-in-depth.
 */
const chatImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new AppError(400, 'Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});
import {
  getSettings,
  saveSettings,
  deleteSettings,
  testConnection,
} from '../controllers/ai-settings.controller';

const router: Router = Router();

// All routes require authentication
router.use(authenticate);

// --- User AI Settings ---
router.get('/settings', asyncHandler(getSettings));
router.put('/settings', asyncHandler(saveSettings));
router.delete('/settings', asyncHandler(deleteSettings));
router.post('/settings/test', asyncHandler(testConnection));

// --- AI Chat ---

/**
 * POST /api/v1/ai/chat
 * Send a chat message to AI assistant
 * Body: { documentId: string, sessionId?: string, message: string, context?: { selection?, selectedText?, cursorPosition? } }
 */
router.post('/chat', asyncHandler(sendChatMessage));

/**
 * POST /api/v1/ai/chat/attachments
 * Upload a single chat image attachment (#93).
 * Multipart field name: "image". Returns `{ storageKey, mimeType, filename, size }`.
 * The client then references `storageKey` in the next `ai:message` payload.
 */
router.post(
  '/chat/attachments',
  chatImageUpload.single('image'),
  asyncHandler(uploadChatImageAttachment),
);

/**
 * GET /api/v1/ai/logs
 * Get AI interaction logs
 * Query params:
 * - documentId: string (required)
 * - queryType: AIQueryType (optional)
 * - status: 'success' | 'error' | 'cancelled' | 'pending' (optional)
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 * - limit: number (default: 50)
 * - offset: number (default: 0)
 */
router.get('/logs', asyncHandler(getLogs));

/**
 * GET /api/v1/ai/logs/:logId
 * Get a specific AI interaction log
 */
router.get('/logs/:logId', asyncHandler(getLog));

/**
 * POST /api/v1/ai/apply-suggestion
 * Apply an AI suggestion and log the modification
 * Body: { logId: string, suggestionId: string, modification: AIContentModification }
 */
router.post('/apply-suggestion', asyncHandler(applySuggestion));

/**
 * GET /api/v1/ai/sessions/:documentId
 * Get chat sessions for a document
 * Query params:
 * - limit: number (default: 10)
 */
router.get('/sessions/:documentId', asyncHandler(getSessions));

/**
 * GET /api/v1/ai/sessions/detail/:sessionId
 * Get a specific chat session with messages
 */
router.get('/sessions/detail/:sessionId', asyncHandler(getSession));

/**
 * DELETE /api/v1/ai/sessions/:sessionId
 * Delete a chat session (including messages and logs)
 */
router.delete('/sessions/:sessionId', asyncHandler(deleteSession));

/**
 * POST /api/v1/ai/selection-action
 * Track an AI selection action (Fix grammar, Improve writing, etc.) with user decision
 * Body: { documentId: string, actionType: 'grammar'|'improve'|'simplify'|'formal', originalText: string, suggestedText: string, decision: 'accepted'|'rejected', responseTimeMs?: number, modelVersion?: string }
 */
router.post('/selection-action', asyncHandler(trackSelectionAction));

/**
 * GET /api/v1/ai/selection-stats/:documentId
 * Get AI selection action statistics for a document
 */
router.get('/selection-stats/:documentId', asyncHandler(getSelectionStats));

export default router;
