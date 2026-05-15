import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error-handler';
import {
  createDocument,
  getDocument,
  listDocuments,
  updateDocument,
  deleteDocument,
  trackDocumentEvents,
  getDocumentEvents,
  getDocumentStatistics,
} from '../controllers/document.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/documents
 * List user's documents with pagination and filters
 * Query params:
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 * - status: 'draft' | 'published' | 'archived' (optional)
 * - search: string (optional, searches title and content)
 * - sortBy: 'createdAt' | 'updatedAt' | 'title' (default: 'updatedAt')
 * - sortOrder: 'asc' | 'desc' (default: 'desc')
 */
router.get('/', asyncHandler(listDocuments));

/**
 * POST /api/v1/documents
 * Create a new document
 * Body: { title: string, content?: object, status?: 'draft' | 'published' | 'archived' }
 */
router.post('/', asyncHandler(createDocument));

/**
 * GET /api/v1/documents/:id
 * Get document by ID
 */
router.get('/:id', asyncHandler(getDocument));

/**
 * PUT /api/v1/documents/:id
 * Update document
 * Body: { title?: string, content?: object, status?: 'draft' | 'published' | 'archived' }
 */
router.put('/:id', asyncHandler(updateDocument));

/**
 * DELETE /api/v1/documents/:id
 * Delete document
 */
router.delete('/:id', asyncHandler(deleteDocument));

/**
 * POST /api/v1/documents/:id/events
 * Track document events (batch insert)
 * Body: { events: DocumentEventInsertData[] }
 */
router.post('/:id/events', asyncHandler(trackDocumentEvents));

/**
 * GET /api/v1/documents/:id/events
 * Get document events
 * Query params:
 * - eventType: string (optional)
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 * - limit: number (default: 1000, max: 10000)
 * - offset: number (default: 0)
 */
router.get('/:id/events', asyncHandler(getDocumentEvents));

/**
 * GET /api/v1/documents/:id/stats
 * Get document statistics (event counts, timing, etc.)
 */
router.get('/:id/stats', asyncHandler(getDocumentStatistics));

export default router;
