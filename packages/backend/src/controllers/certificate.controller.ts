import { Request, Response } from 'express';
import { CertificateService } from '../services/certificate.service';
import { PDFService } from '../services/pdf.service';
import { DocumentEventModel } from '../models/document-event.model';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

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

  res.json({
    success: true,
    data: { certificate },
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
    throw new AppError(400, 'Verification token is required');
  }

  const verification = await CertificateService.verifyCertificate(token);

  if (verification.valid) {
    let documentSnapshot = verification.certificate!.documentSnapshot;

    // If documentSnapshot is empty but includeFullText is enabled, try to get from edit history
    if (verification.certificate!.includeFullText && (!documentSnapshot || Object.keys(documentSnapshot).length === 0)) {
      try {
        // Get the last event from edit history by querying directly
        const events = await DocumentEventModel.findByDocumentId(verification.certificate!.documentId, {
          limit: 5000,
          offset: 0,
        });

        // Find the last event with a non-empty editorStateAfter
        for (let i = events.length - 1; i >= 0; i--) {
          const event = events[i];
          if (event.editorStateAfter && typeof event.editorStateAfter === 'object') {
            // Check if it has actual content (not just an empty paragraph)
            const editorState = event.editorStateAfter as any;
            if (editorState.root && editorState.root.children) {
              const hasContent = editorState.root.children.some((child: any) =>
                child.children && child.children.length > 0
              );
              if (hasContent) {
                documentSnapshot = event.editorStateAfter;
                logger.info('Using edit history for document snapshot', {
                  certificateId: verification.certificate!.id,
                  documentId: verification.certificate!.documentId,
                  eventTimestamp: event.timestamp,
                });
                break;
              }
            }
          }
        }
      } catch (error) {
        logger.error('Failed to fetch edit history for document snapshot', { error });
      }
    }

    res.json({
      success: true,
      data: {
        valid: verification.valid,
        certificate: {
          id: verification.certificate!.id,
          submissionId: verification.certificate!.submissionId,
          title: verification.certificate!.title,
          certificateType: verification.certificate!.certificateType,
          generatedAt: verification.certificate!.generatedAt,
          totalCharacters: verification.certificate!.totalCharacters,
          typedCharacters: verification.certificate!.typedCharacters,
          pastedCharacters: verification.certificate!.pastedCharacters,
          totalEvents: verification.certificate!.totalEvents,
          typingEvents: verification.certificate!.typingEvents,
          pasteEvents: verification.certificate!.pasteEvents,
          editingTimeSeconds: verification.certificate!.editingTimeSeconds,
          isProtected: verification.certificate!.isProtected,
          includeFullText: verification.certificate!.includeFullText,
          includeEditHistory: verification.certificate!.includeEditHistory,
          plainTextSnapshot: verification.certificate!.includeFullText ? verification.certificate!.plainTextSnapshot : undefined,
          documentSnapshot: verification.certificate!.includeFullText ? documentSnapshot : undefined,
          signerName: verification.certificate!.signerName,
          documentId: verification.certificate!.documentId,
        },
        verifiedAt: verification.verifiedAt,
        message: verification.message,
      },
    });
  } else {
    res.status(400).json({
      success: false,
      data: {
        valid: verification.valid,
        verifiedAt: verification.verifiedAt,
        message: verification.message,
      },
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
    throw new AppError(400, 'Verification token is required');
  }

  if (!accessCode) {
    throw new AppError(400, 'Access code is required');
  }

  const result = await CertificateService.verifyCertificateWithAccessCode(token, accessCode);

  if (result.valid && result.certificate) {
    // If documentSnapshot is empty but includeFullText is enabled, try to get from edit history
    if (result.certificate.includeFullText && (!result.certificate.documentSnapshot || Object.keys(result.certificate.documentSnapshot).length === 0)) {
      try {
        // Get the last event from edit history by querying directly
        const events = await DocumentEventModel.findByDocumentId(result.certificate.documentId, {
          limit: 5000,
          offset: 0,
        });

        // Find the last event with a non-empty editorStateAfter
        for (let i = events.length - 1; i >= 0; i--) {
          const event = events[i];
          if (event.editorStateAfter && typeof event.editorStateAfter === 'object') {
            // Check if it has actual content (not just an empty paragraph)
            const editorState = event.editorStateAfter as any;
            if (editorState.root && editorState.root.children) {
              const hasContent = editorState.root.children.some((child: any) =>
                child.children && child.children.length > 0
              );
              if (hasContent) {
                result.certificate.documentSnapshot = event.editorStateAfter;
                logger.info('Using edit history for document snapshot (access code)', {
                  certificateId: result.certificate.id,
                  documentId: result.certificate.documentId,
                  eventTimestamp: event.timestamp,
                });
                break;
              }
            }
          }
        }
      } catch (error) {
        logger.error('Failed to fetch edit history for document snapshot', { error });
      }
    }

    res.json({
      success: true,
      data: result,
    });
  } else {
    res.status(403).json({
      success: false,
      data: result,
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

  res.json({
    success: true,
    data: { certificate },
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

  res.json({
    success: true,
    data: { certificate },
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

  if (!token) {
    throw new AppError(400, 'Verification token is required');
  }

  // Verify the certificate by token
  const verification = await CertificateService.verifyCertificate(token);

  if (!verification.valid || !verification.certificate) {
    throw new AppError(404, 'Certificate not found or invalid');
  }

  // Check if edit history is enabled
  if (!verification.certificate.includeEditHistory) {
    throw new AppError(403, 'Edit history is not available for this certificate');
  }

  // Get the document events with editor state
  const events = await DocumentEventModel.findByDocumentId(verification.certificate.documentId, {
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
