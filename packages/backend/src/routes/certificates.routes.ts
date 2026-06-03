import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error-handler';
import {
  generateCertificate,
  getCertificate,
  verifyAccessCode,
  listCertificates,
  downloadCertificateJSON,
  downloadCertificatePDF,
  verifyCertificate,
  verifyCertificateWithAccessCode,
  updateAccessCode,
  updateDisplayOptions,
  deleteCertificate,
  getEditHistory,
  getAIAuthorshipStats,
} from '../controllers/certificate.controller';

const router: Router = Router();

/**
 * GET /api/v1/certificates/verify/:token
 * Verify certificate by verification token
 * PUBLIC ENDPOINT - No authentication required
 */
router.get('/verify/:token', asyncHandler(verifyCertificate));

/**
 * POST /api/v1/certificates/verify/:token
 * Verify certificate with access code
 * PUBLIC ENDPOINT - No authentication required
 * Body: { accessCode: string }
 */
router.post('/verify/:token', asyncHandler(verifyCertificateWithAccessCode));

/**
 * GET /api/v1/certificates/verify/:token/history
 * Get edit history for certificate verification
 * PUBLIC ENDPOINT - No authentication required
 * Returns timestamped editor states showing how document was created
 */
router.get('/verify/:token/history', asyncHandler(getEditHistory));

// All other routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/certificates
 * List user's certificates with pagination
 * Query params:
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 * - documentId: string (optional, filter by document)
 * - sortBy: 'createdAt' | 'generatedAt' (default: 'createdAt')
 * - sortOrder: 'asc' | 'desc' (default: 'desc')
 */
router.get('/', asyncHandler(listCertificates));

/**
 * POST /api/v1/certificates
 * Generate a certificate for a document
 * Body: { documentId: string, certificateType?: 'full_authorship' | 'partial_authorship' }
 */
router.post('/', asyncHandler(generateCertificate));

/**
 * GET /api/v1/certificates/:id
 * Get certificate by ID
 */
router.get('/:id', asyncHandler(getCertificate));

/**
 * POST /api/v1/certificates/:id/verify-access
 * Verify access code for protected certificate
 * Body: { accessCode: string }
 */
router.post('/:id/verify-access', asyncHandler(verifyAccessCode));

/**
 * GET /api/v1/certificates/:id/json
 * Download certificate as JSON
 */
router.get('/:id/json', asyncHandler(downloadCertificateJSON));

/**
 * GET /api/v1/certificates/:id/pdf
 * Download certificate as PDF
 * Note: PDF generation will be implemented in Phase 5
 */
router.get('/:id/pdf', asyncHandler(downloadCertificatePDF));

/**
 * PATCH /api/v1/certificates/:id/access-code
 * Update or remove access code for a certificate
 * Body: { accessCode?: string } - provide accessCode to set/update, omit or send null to remove
 */
router.patch('/:id/access-code', asyncHandler(updateAccessCode));

/**
 * PATCH /api/v1/certificates/:id/display-options
 * Update certificate display options
 * Body: { includeFullText?: boolean, includeEditHistory?: boolean }
 */
router.patch('/:id/display-options', asyncHandler(updateDisplayOptions));

/**
 * DELETE /api/v1/certificates/:id
 * Delete certificate
 */
router.delete('/:id', asyncHandler(deleteCertificate));

/**
 * GET /api/v1/certificates/:id/ai-stats
 * Get AI authorship statistics for a certificate
 * Returns: { selectionActions: {...}, aiQuestions: {...} }
 */
router.get('/:id/ai-stats', asyncHandler(getAIAuthorshipStats));

export default router;
