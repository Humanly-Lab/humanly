import { Request, Response } from 'express';
import { CertificateService } from '../services/certificate.service';
import { PDFService } from '../services/pdf.service';
import { DocumentEventModel } from '../models/document-event.model';
import { AIModel } from '../models/ai.model';
import { buildDocumentEventTimeline } from '../services/document-event-timeline.service';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';
import type { Certificate, CertificateVerification } from '@humanly/shared';

async function resolvePublicDocumentSnapshot(certificate: Certificate): Promise<Record<string, any>> {
  let documentSnapshot = certificate.documentSnapshot;

  if (!certificate.includeFullText || (documentSnapshot && Object.keys(documentSnapshot).length > 0)) {
    return documentSnapshot;
  }

  try {
    const events = await DocumentEventModel.findByDocumentId(certificate.documentId, {
      limit: 5000,
      offset: 0,
    });

    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.editorStateAfter && typeof event.editorStateAfter === 'object') {
        const editorState = event.editorStateAfter as any;
        if (editorState.root && editorState.root.children) {
          const hasContent = editorState.root.children.some((child: any) =>
            child.children && child.children.length > 0
          );
          if (hasContent) {
            documentSnapshot = event.editorStateAfter;
            logger.info('Using edit history for certificate document snapshot', {
              certificateId: certificate.id,
              documentId: certificate.documentId,
              eventTimestamp: event.timestamp,
            });
            break;
          }
        }
      }
    }
  } catch (error) {
    logger.error('Failed to fetch edit history for certificate document snapshot', { error });
  }

  return documentSnapshot;
}

async function buildPublicCertificateResponse(
  verification: CertificateVerification,
  options: { includeProtectedContent?: boolean } = {}
) {
  if (!verification.valid || !verification.certificate) {
    return {
      valid: verification.valid,
      verifiedAt: verification.verifiedAt,
      message: verification.message,
      seal: verification.seal,
      sealStatus: verification.sealStatus,
      integrityMessage: verification.integrityMessage,
    };
  }

  const certificate = verification.certificate;

  if (certificate.isProtected && !options.includeProtectedContent) {
    return {
      valid: verification.valid,
      certificate: {
        id: certificate.id,
        title: certificate.title,
        certificateType: certificate.certificateType,
        generatedAt: certificate.generatedAt,
        isProtected: true,
      },
      verifiedAt: verification.verifiedAt,
      message: verification.message,
      seal: verification.seal,
      sealStatus: verification.sealStatus,
      integrityMessage: verification.integrityMessage,
    };
  }

  const documentSnapshot = await resolvePublicDocumentSnapshot(certificate);
  const aiAuthorshipStats = await CertificateService.getAIAuthorshipStats(certificate.documentId);

  return {
    valid: verification.valid,
    certificate: {
      id: certificate.id,
      submissionId: certificate.submissionId,
      title: certificate.title,
      certificateType: certificate.certificateType,
      generatedAt: certificate.generatedAt,
      totalCharacters: certificate.totalCharacters,
      typedCharacters: certificate.typedCharacters,
      pastedCharacters: certificate.pastedCharacters,
      totalEvents: certificate.totalEvents,
      typingEvents: certificate.typingEvents,
      pasteEvents: certificate.pasteEvents,
      editingTimeSeconds: certificate.editingTimeSeconds,
      anomalyFlags: certificate.anomalyFlags || [],
      isProtected: certificate.isProtected,
      includeFullText: certificate.includeFullText,
      includeEditHistory: certificate.includeEditHistory,
      plainTextSnapshot: certificate.includeFullText ? certificate.plainTextSnapshot : undefined,
      documentSnapshot: certificate.includeFullText ? documentSnapshot : undefined,
      signerName: certificate.signerName,
      documentId: certificate.documentId,
      environmentConfig: certificate.environmentConfig || null,
    },
    aiAuthorshipStats,
    verifiedAt: verification.verifiedAt,
    message: verification.message,
    seal: verification.seal,
    sealStatus: verification.sealStatus,
    integrityMessage: verification.integrityMessage,
  };
}

async function resolvePublicCertificateWithEditHistoryAccess(
  req: Request,
  res: Response,
  token: string,
  protectedAccessMessage: string
): Promise<CertificateVerification> {
  if (!token) {
    throw new AppError(400, 'Certificate token is required');
  }

  const verification = await CertificateService.verifyCertificate(token);

  if (!verification.valid || !verification.certificate) {
    throw new AppError(404, 'Certificate not found or invalid');
  }

  if (!verification.certificate.includeEditHistory) {
    throw new AppError(403, 'Edit history is not available for this certificate');
  }

  if (verification.certificate.isProtected) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'X-Access-Code');

    const accessCode =
      (req.headers['x-access-code'] as string) ||
      (req.body?.accessCode as string) ||
      '';
    const accessCheck = accessCode
      ? await CertificateService.verifyCertificateWithAccessCode(token, accessCode)
      : null;
    if (!accessCheck || !accessCheck.valid) {
      throw new AppError(403, protectedAccessMessage);
    }
  }

  return verification;
}

/**
 * Generate a certificate for a document
 */
export async function generateCertificate(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const {
    documentId,
    submissionId,
    certificateType,
    signerName,
    includeFullText,
    includeEditHistory,
    accessCode,
  } = req.body;

  if (!documentId) {
    throw new AppError(400, 'Document ID is required');
  }

  const validTypes = ['full_authorship', 'partial_authorship'];
  const type = certificateType && validTypes.includes(certificateType)
    ? certificateType
    : 'full_authorship';

  const certificate = await CertificateService.generateCertificate(
    documentId,
    userId,
    {
      certificateType: type,
      submissionId,
      signerName,
      includeFullText: includeFullText !== undefined ? includeFullText : true,
      includeEditHistory: includeEditHistory !== undefined ? includeEditHistory : true,
      accessCode,
    }
  );

  res.status(201).json({
    success: true,
    data: { certificate },
    message: 'Certificate generated successfully',
  });
}

/**
 * Get certificate by ID
 */
export async function getCertificate(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const certificateId = req.params.id;

  if (!certificateId) {
    throw new AppError(400, 'Certificate ID is required');
  }

  const certificate = await CertificateService.getCertificate(certificateId, userId);
  const integrity = CertificateService.getCertificateIntegrity(certificate);

  res.json({
    success: true,
    data: {
      certificate,
      seal: integrity.seal,
      sealStatus: integrity.sealStatus,
      integrityMessage: integrity.message,
    },
  });
}

/**
 * Verify access code for protected certificate
 */
export async function verifyAccessCode(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const certificateId = req.params.id;
  const { accessCode } = req.body;

  if (!certificateId) {
    throw new AppError(400, 'Certificate ID is required');
  }

  if (!accessCode) {
    throw new AppError(400, 'Access code is required');
  }

  const isValid = await CertificateService.verifyAccessCode(certificateId, userId, accessCode);

  res.json({
    success: true,
    data: { valid: isValid },
  });
}

/**
 * List user's certificates
 */
export async function listCertificates(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  // Parse query parameters
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const documentId = req.query.documentId as string | undefined;
  const sortBy = (req.query.sortBy as 'createdAt' | 'generatedAt') || 'createdAt';
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

  const result = await CertificateService.listCertificates(userId, {
    documentId,
    limit,
    offset,
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
 * Download certificate as JSON
 */
export async function downloadCertificateJSON(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const certificateId = req.params.id;

  if (!certificateId) {
    throw new AppError(400, 'Certificate ID is required');
  }

  const certificate = await CertificateService.getCertificate(certificateId, userId);
  const jsonCertificate = await CertificateService.generateJSON(certificate);

  // Set headers for file download
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="certificate-${certificate.id}.json"`
  );

  res.json(jsonCertificate);
}

/**
 * Download certificate as PDF
 */
export async function downloadCertificatePDF(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const certificateId = req.params.id;

  if (!certificateId) {
    throw new AppError(400, 'Certificate ID is required');
  }

  const certificate = await CertificateService.getCertificate(certificateId, userId);
  const aiStats = await CertificateService.getAIAuthorshipStats(certificate.documentId);
  const pdfBuffer = await PDFService.generateCertificatePDF({ ...certificate, aiAuthorshipStats: aiStats } as any);
  const requestedFilename = typeof req.query.filename === 'string' ? req.query.filename : '';
  const fallbackFilename = `certificate-${certificate.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
  const filename = requestedFilename
    ? requestedFilename.replace(/[^a-z0-9._-]/gi, '-').replace(/^-+|-+$/g, '')
    : fallbackFilename;
  const disposition = req.query.disposition === 'inline' || req.query.inline === 'true'
    ? 'inline'
    : 'attachment';

  // Set headers for file download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${filename.endsWith('.pdf') ? filename : `${filename}.pdf`}"`
  );
  res.setHeader('Content-Length', pdfBuffer.length);

  res.send(pdfBuffer);
}

/**
 * Verify certificate by verification token (public endpoint, no auth required)
 */
export async function verifyCertificate(req: Request, res: Response): Promise<void> {
  const token = req.params.token;

  if (!token) {
    throw new AppError(400, 'Certificate token is required');
  }

  const verification = await CertificateService.verifyCertificate(token);

  if (verification.valid) {
    res.json({
      success: true,
      data: await buildPublicCertificateResponse(verification),
    });
  } else {
    res.status(400).json({
      success: false,
      data: await buildPublicCertificateResponse(verification),
    });
  }
}

/**
 * Verify certificate with access code (public endpoint, no auth required)
 */
export async function verifyCertificateWithAccessCode(req: Request, res: Response): Promise<void> {
  const token = req.params.token;
  const { accessCode } = req.body;

  if (!token) {
    throw new AppError(400, 'Certificate token is required');
  }

  if (!accessCode) {
    throw new AppError(400, 'Access code is required');
  }

  const result = await CertificateService.verifyCertificateWithAccessCode(token, accessCode);

  if (result.valid && result.certificate) {
    res.json({
      success: true,
      data: await buildPublicCertificateResponse(result, { includeProtectedContent: true }),
    });
  } else {
    res.status(403).json({
      success: false,
      data: await buildPublicCertificateResponse(result),
    });
  }
}

/**
 * Update certificate access code
 */
export async function updateAccessCode(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const certificateId = req.params.id;
  const { accessCode } = req.body;

  if (!certificateId) {
    throw new AppError(400, 'Certificate ID is required');
  }

  const certificate = await CertificateService.updateAccessCode(certificateId, userId, accessCode);
  const integrity = CertificateService.getCertificateIntegrity(certificate);

  res.json({
    success: true,
    data: {
      certificate,
      seal: integrity.seal,
      sealStatus: integrity.sealStatus,
      integrityMessage: integrity.message,
    },
    message: accessCode
      ? 'Access code updated successfully'
      : 'Access code removed successfully',
  });
}

/**
 * Update certificate display options
 */
export async function updateDisplayOptions(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const certificateId = req.params.id;
  const { includeFullText, includeEditHistory } = req.body;

  if (!certificateId) {
    throw new AppError(400, 'Certificate ID is required');
  }

  const certificate = await CertificateService.updateDisplayOptions(
    certificateId,
    userId,
    includeFullText,
    includeEditHistory
  );
  const integrity = CertificateService.getCertificateIntegrity(certificate);

  res.json({
    success: true,
    data: {
      certificate,
      seal: integrity.seal,
      sealStatus: integrity.sealStatus,
      integrityMessage: integrity.message,
    },
    message: 'Display options updated successfully',
  });
}

/**
 * Delete certificate
 */
export async function deleteCertificate(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const certificateId = req.params.id;

  if (!certificateId) {
    throw new AppError(400, 'Certificate ID is required');
  }

  await CertificateService.deleteCertificate(certificateId, userId);

  res.json({
    success: true,
    message: 'Certificate deleted successfully',
  });
}

/**
 * Get edit history for public certificate verification (no auth required)
 */
export async function getEditHistory(req: Request, res: Response): Promise<void> {
  const token = req.params.token;
  const verification = await resolvePublicCertificateWithEditHistoryAccess(
    req,
    res,
    token,
    'Access code required to view edit history'
  );
  const certificate = verification.certificate!;

  // Get the document events with editor state
  const events = await DocumentEventModel.findByDocumentId(certificate.documentId, {
    limit: 5000, // Limit to first 5000 events for performance
    offset: 0,
  });

  // Filter and simplify events to only those that changed the editor state.
  // Reverse so events are in chronological order (oldest first) for playback.
  const editHistory = events
    .filter(event => event.editorStateAfter && typeof event.editorStateAfter === 'object')
    .reverse()
    .map(event => ({
      timestamp: event.timestamp,
      editorState: event.editorStateAfter,
      eventType: event.eventType,
      metadata: event.metadata || undefined,
      textBefore: event.textBefore || undefined,
      textAfter: event.textAfter || undefined,
      selectionStart: event.selectionStart ?? undefined,
      selectionEnd: event.selectionEnd ?? undefined,
    }));

  res.json({
    success: true,
    data: {
      editHistory,
      totalEvents: editHistory.length,
    },
  });
}

/**
 * Get public certificate logs for shared certificate verification (no auth required)
 */
export async function getPublicCertificateLogs(req: Request, res: Response): Promise<void> {
  const token = req.params.token;
  const verification = await resolvePublicCertificateWithEditHistoryAccess(
    req,
    res,
    token,
    'Access code required to view logs'
  );

  const certificate = verification.certificate!;
  const eventLimit = Math.min(parseInt(req.query.limit as string) || 10000, 10000);
  const aiLogLimit = Math.min(parseInt(req.query.aiLimit as string) || 50, 200);

  const [events, rawEventTotal, aiLogResult] = await Promise.all([
    DocumentEventModel.findByDocumentId(certificate.documentId, {
      limit: eventLimit,
      offset: 0,
    }),
    DocumentEventModel.countByDocumentId(certificate.documentId),
    AIModel.getLogs({
      documentId: certificate.documentId,
      limit: aiLogLimit,
      offset: 0,
    }).catch((error) => {
      logger.warn('Failed to fetch public certificate AI logs', {
        certificateId: certificate.id,
        documentId: certificate.documentId,
        error,
      });
      return { logs: [], total: 0 };
    }),
  ]);

  res.json({
    success: true,
    data: {
      certificateId: certificate.id,
      documentId: certificate.documentId,
      title: certificate.title,
      anomalyFlags: certificate.anomalyFlags || [],
      timeline: buildDocumentEventTimeline(events, rawEventTotal),
      aiLogs: aiLogResult.logs,
      aiLogTotal: aiLogResult.total,
    },
  });
}

/**
 * Get AI authorship statistics for a certificate
 */
export async function getAIAuthorshipStats(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const certificateId = req.params.id;

  if (!certificateId) {
    throw new AppError(400, 'Certificate ID is required');
  }

  // Verify ownership and get certificate
  const certificate = await CertificateService.getCertificate(certificateId, userId);

  // Get AI authorship stats for the document
  const aiStats = await CertificateService.getAIAuthorshipStats(certificate.documentId);

  res.json({
    success: true,
    data: aiStats,
  });
}
