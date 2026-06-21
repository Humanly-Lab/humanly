import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { CertificateModel } from '../models/certificate.model';
import { DocumentModel } from '../models/document.model';
import { DocumentEventModel } from '../models/document-event.model';
import { AISelectionActionModel } from '../models/ai-selection-action.model';
import { AIModel } from '../models/ai.model';
import {
  Certificate,
  CertificateFilters,
  CertificateVerification,
  CertificateMetrics,
  JSONCertificate,
  AIAuthorshipStats,
  PaginatedResult,
  getEffectiveWritingAiPolicy,
  getCertificateFinalTextCharacterCount,
} from '@humanly/shared';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import {
  CertificateSealInput,
  CertificateSealVerification,
  CertificateSealService,
} from './certificate-seal.service';
import { AnomalyFlagsService } from './anomaly-flags.service';
import { computeAiPolicyTextHash } from '../utils/ai-policy-hash';

export class CertificateService {
  /**
   * Generate a certificate for a document
   */
  static async generateCertificate(
    documentId: string,
    userId: string,
    options: {
      submissionId?: string;
      certificateType?: 'full_authorship' | 'partial_authorship';
      signerName?: string;
      includeFullText?: boolean;
      includeEditHistory?: boolean;
      accessCode?: string;
    } = {}
  ): Promise<Certificate> {
    try {
      const {
        submissionId,
        certificateType = 'full_authorship',
        signerName,
        includeFullText = true,
        includeEditHistory = true,
        accessCode,
      } = options;

      logger.info('Generating certificate', { documentId, userId, certificateType, options });

      // Get document
      const document = await DocumentModel.findByIdAndUserId(documentId, userId);
      if (!document) {
        throw new AppError(404, 'Document not found or unauthorized');
      }

      // Freeze the certificate boundary before reading derived event data.
      // All certificate-facing metrics, replay, logs, and AI stats should use
      // this timestamp as their upper bound so later edits create a new
      // certificate instead of mutating this one.
      const generatedAt = new Date();

      // Calculate certificate metrics
      const metrics = await this.calculateCertificateMetrics(documentId, userId, {
        endDate: generatedAt,
      });
      const anomalyFlags = await AnomalyFlagsService.analyzeDocument(
        documentId,
        document.environmentConfig || null,
        undefined,
        { endDate: generatedAt }
      );

      // Generate verification token
      const verificationToken = this.generateVerificationToken();
      const certificateId = crypto.randomUUID();
      const policyHash = computeAiPolicyTextHash(
        getEffectiveWritingAiPolicy(document.environmentConfig)
      );

      // Hash access code if provided
      let accessCodeHash: string | undefined;
      let accessCodePlaintext: string | undefined;
      let isProtected = false;
      if (accessCode) {
        accessCodeHash = await bcrypt.hash(accessCode, 10);
        accessCodePlaintext = accessCode;
        isProtected = true;
      }

      // Generate a tamper-evident seal over the stable certificate payload.
      const signature = this.generateSignature({
        id: certificateId,
        submissionId: submissionId || null,
        documentId,
        userId,
        certificateType,
        title: document.title,
        documentSnapshot: document.content,
        plainTextSnapshot: document.plainText,
        totalEvents: metrics.totalEvents,
        typingEvents: metrics.typingEvents,
        pasteEvents: metrics.pasteEvents,
        totalCharacters: metrics.totalCharacters,
        typedCharacters: metrics.typedCharacters,
        pastedCharacters: metrics.pastedCharacters,
        finalTextComposition: metrics.finalTextComposition,
        finalTextSourceSpans: metrics.finalTextSourceSpans,
        processInputVolume: metrics.processInputVolume,
        editingTimeSeconds: Math.round(metrics.editingTimeSeconds),
        anomalyFlags,
        policyHash,
        verificationToken,
        signerName: signerName || null,
        includeFullText,
        includeEditHistory,
        isProtected,
        generatedAt,
      });

      // Create certificate
      const certificate = await CertificateModel.create({
        id: certificateId,
        submissionId: submissionId || null,
        documentId,
        userId,
        certificateType,
        title: document.title,
        documentSnapshot: document.content,
        plainTextSnapshot: document.plainText,
        totalEvents: metrics.totalEvents,
        typingEvents: metrics.typingEvents,
        pasteEvents: metrics.pasteEvents,
        totalCharacters: metrics.totalCharacters,
        typedCharacters: metrics.typedCharacters,
        pastedCharacters: metrics.pastedCharacters,
        finalTextComposition: metrics.finalTextComposition,
        finalTextSourceSpans: metrics.finalTextSourceSpans,
        processInputVolume: metrics.processInputVolume,
        editingTimeSeconds: Math.round(metrics.editingTimeSeconds),
        anomalyFlags,
        policyHash,
        environmentConfig: document.environmentConfig || null,
        signature,
        verificationToken,
        signerName,
        includeFullText,
        includeEditHistory,
        accessCode: accessCodePlaintext,
        accessCodeHash,
        isProtected,
        generatedAt,
      });

      logger.info('Certificate generated successfully', {
        certificateId: certificate.id,
        documentId,
        userId,
      });

      return this.withEnvironmentConfig(certificate, document.environmentConfig || null);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error generating certificate', { error, documentId, userId });
      throw error;
    }
  }

  /**
   * Get certificate by ID
   */
  static async getCertificate(certificateId: string, userId: string): Promise<Certificate> {
    try {
      const certificate = await CertificateModel.findByIdAndUserId(certificateId, userId);

      if (!certificate) {
        throw new AppError(404, 'Certificate not found or unauthorized');
      }

      return this.withEnvironmentConfig(certificate);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error fetching certificate', { error, certificateId, userId });
      throw error;
    }
  }

  private static async withEnvironmentConfig(
    certificate: Certificate,
    knownEnvironmentConfig?: Certificate['environmentConfig']
  ): Promise<Certificate> {
    if (knownEnvironmentConfig !== undefined) {
      return { ...certificate, environmentConfig: knownEnvironmentConfig };
    }

    if (certificate.environmentConfig) {
      return certificate;
    }

    try {
      const document = await DocumentModel.findById(certificate.documentId);
      return {
        ...certificate,
        environmentConfig: document?.environmentConfig || null,
      };
    } catch (error) {
      logger.warn('Unable to attach environment config to certificate', {
        error,
        certificateId: certificate.id,
        documentId: certificate.documentId,
      });
      return { ...certificate, environmentConfig: null };
    }
  }

  /**
   * Verify access code for protected certificate
   */
  static async verifyAccessCode(
    certificateId: string,
    userId: string,
    accessCode: string
  ): Promise<boolean> {
    try {
      const certificate = await CertificateModel.findByIdAndUserId(certificateId, userId);

      if (!certificate) {
        throw new AppError(404, 'Certificate not found or unauthorized');
      }

      if (!certificate.isProtected) {
        return true; // Not protected, access granted
      }

      if (!certificate.accessCodeHash) {
        throw new AppError(500, 'Certificate is protected but no access code hash found');
      }

      const isValid = await bcrypt.compare(accessCode, certificate.accessCodeHash);
      return isValid;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error verifying access code', { error, certificateId, userId });
      throw error;
    }
  }

  /**
   * List user's certificates
   */
  static async listCertificates(
    userId: string,
    filters: CertificateFilters
  ): Promise<PaginatedResult<Certificate>> {
    try {
      return await CertificateModel.findByUserId(userId, filters);
    } catch (error) {
      logger.error('Error listing certificates', { error, userId });
      throw error;
    }
  }

  /**
   * Generate JSON certificate for download
   */
  static async generateJSON(certificate: Certificate): Promise<JSONCertificate> {
    const finalTextComposition = certificate.finalTextComposition || {
      typedCharacters: certificate.typedCharacters,
      pastedCharacters: certificate.pastedCharacters,
      aiAssistedCharacters: 0,
      aiAssistedByType: {
        chatInsert: 0,
        grammar: 0,
        improve: 0,
        simplify: 0,
        formal: 0,
        other: 0,
      },
    };
    const totalAuthored = finalTextComposition.typedCharacters
      + finalTextComposition.pastedCharacters
      + finalTextComposition.aiAssistedCharacters;
    const finalTextCharacterCount = getCertificateFinalTextCharacterCount({
      finalTextComposition,
      totalCharacters: certificate.totalCharacters,
    });
    const typedPercentage = totalAuthored > 0
      ? (finalTextComposition.typedCharacters / totalAuthored) * 100
      : 0;

    const pastedPercentage = totalAuthored > 0
      ? (finalTextComposition.pastedCharacters / totalAuthored) * 100
      : 0;

    // Get AI authorship statistics
    const aiStats = await this.getAIAuthorshipStats(certificate.documentId, {
      endDate: certificate.generatedAt,
    });
    const integrity = this.verifyCertificateIntegrity(certificate);

    const jsonCertificate: JSONCertificate = {
      version: '1.2',
      certificateId: certificate.id,
      certificateUrl: `${env.frontendUserUrl}/verify/${certificate.verificationToken}`,
      submissionId: certificate.submissionId || undefined,
      documentId: certificate.documentId,
      userId: certificate.userId,
      generatedAt: certificate.generatedAt.toISOString(),
      document: {
        title: certificate.title,
        wordCount: 0, // Would need to calculate from plain_text_snapshot
        characterCount: finalTextCharacterCount,
      },
      authorship: {
        totalCharacters: finalTextCharacterCount,
        typedCharacters: finalTextComposition.typedCharacters,
        pastedCharacters: finalTextComposition.pastedCharacters,
        finalTextComposition: certificate.finalTextComposition || null,
        finalTextSourceSpans: certificate.finalTextSourceSpans || null,
        processInputVolume: certificate.processInputVolume || null,
        typedPercentage: Math.round(typedPercentage * 10) / 10,
        pastedPercentage: Math.round(pastedPercentage * 10) / 10,
        totalEvents: certificate.totalEvents,
        typingEvents: certificate.typingEvents,
        pasteEvents: certificate.pasteEvents,
        editingTimeMinutes: Math.round(certificate.editingTimeSeconds / 60),
      },
      aiAuthorshipStats: aiStats,
      anomalyFlags: certificate.anomalyFlags || [],
      environmentConfig: certificate.environmentConfig
        ?? (await this.withEnvironmentConfig(certificate)).environmentConfig
        ?? null,
      evidence: {
        replayAvailable: certificate.includeEditHistory,
        fullTextIncluded: certificate.includeFullText,
        editHistoryIncluded: certificate.includeEditHistory,
        aiAssistanceIncluded: true,
      },
      verification: {
        token: certificate.verificationToken,
        verifyUrl: `${env.frontendUserUrl}/verify/${certificate.verificationToken}`,
        signature: certificate.signature,
        seal: integrity.seal,
        sealStatus: integrity.sealStatus,
      },
    };

    return jsonCertificate;
  }

  /**
   * Get AI authorship statistics for a document
   */
  static async getAIAuthorshipStats(
    documentId: string,
    options: { endDate?: Date | string } = {}
  ): Promise<AIAuthorshipStats> {
    // Default empty stats
    const emptyStats: AIAuthorshipStats = {
      selectionActions: {
        total: 0,
        grammarFixes: 0,
        improveWriting: 0,
        simplify: 0,
        makeFormal: 0,
        accepted: 0,
        rejected: 0,
        acceptanceRate: 0,
      },
      aiQuestions: {
        total: 0,
        understanding: 0,
        generation: 0,
        other: 0,
      },
      policyRefusals: {
        total: 0,
      },
    };

    try {
      const refusalFilters: { eventType: 'ai_policy_refusal'; endDate?: Date } = {
        eventType: 'ai_policy_refusal',
      };
      if (options.endDate) {
        refusalFilters.endDate = new Date(options.endDate);
      }

      const [selectionStats, questionStats, policyRefusalCount] = await Promise.all([
        AISelectionActionModel.getStatsByDocumentId(documentId, { endDate: options.endDate }),
        AIModel.getQuestionStatsByDocument(documentId, { endDate: options.endDate }),
        DocumentEventModel.countByDocumentIdWithFilters(documentId, refusalFilters),
      ]);

      return {
        selectionActions: {
          total: selectionStats.totalActions,
          grammarFixes: selectionStats.grammarActions,
          improveWriting: selectionStats.improveActions,
          simplify: selectionStats.simplifyActions,
          makeFormal: selectionStats.formalActions,
          accepted: selectionStats.acceptedCount,
          rejected: selectionStats.rejectedCount,
          acceptanceRate: Math.round(selectionStats.acceptanceRate * 10) / 10,
        },
        aiQuestions: {
          total: questionStats.totalQuestions,
          understanding: questionStats.understandingQuestions,
          generation: questionStats.generationQuestions,
          other: questionStats.otherQuestions,
        },
        policyRefusals: {
          total: policyRefusalCount,
        },
      };
    } catch (error) {
      // If tables don't exist yet (migration not run), return empty stats
      logger.warn('Error fetching AI authorship stats, returning empty stats', { error, documentId });
      return emptyStats;
    }
  }

  /**
   * Verify certificate by verification token
   */
  static async verifyCertificate(verificationToken: string): Promise<CertificateVerification> {
    try {
      const certificate = await CertificateModel.findByVerificationToken(verificationToken);

      if (!certificate) {
        return {
          valid: false,
          certificate: null,
          verifiedAt: new Date(),
          message: 'Certificate not found',
        };
      }

      const integrity = this.verifyCertificateIntegrity(certificate);

      if (integrity.valid) {
        return {
          valid: true,
          certificate: await this.withEnvironmentConfig(certificate),
          verifiedAt: new Date(),
          message: integrity.message,
          seal: integrity.seal,
          sealStatus: integrity.sealStatus,
          integrityMessage: integrity.message,
        };
      }

      return {
        valid: false,
        certificate: await this.withEnvironmentConfig(certificate),
        verifiedAt: new Date(),
        message: integrity.message,
        seal: integrity.seal,
        sealStatus: integrity.sealStatus,
        integrityMessage: integrity.message,
      };
    } catch (error) {
      logger.error('Error verifying certificate', { error, verificationToken });
      throw error;
    }
  }

  /**
   * Calculate certificate metrics from document events
   */
  private static async calculateCertificateMetrics(
    documentId: string,
    _userId: string,
    options: { endDate?: Date } = {}
  ): Promise<CertificateMetrics> {
    // Get event metrics
    const eventMetrics = await DocumentEventModel.getEventMetrics(documentId, {
      endDate: options.endDate,
    });

    const { finalTextComposition, finalTextSourceSpans, processInputVolume } =
      await DocumentEventModel.calculateCompositionMetrics(documentId, {
        endDate: options.endDate,
      });

    const totalCharacters = finalTextComposition.typedCharacters
      + finalTextComposition.pastedCharacters
      + finalTextComposition.aiAssistedCharacters;
    const typedPercentage = totalCharacters > 0
      ? (finalTextComposition.typedCharacters / totalCharacters) * 100
      : 0;
    const pastedPercentage = totalCharacters > 0
      ? (finalTextComposition.pastedCharacters / totalCharacters) * 100
      : 0;

    return {
      totalEvents: eventMetrics.totalEvents,
      typingEvents: eventMetrics.typingEvents,
      pasteEvents: eventMetrics.pasteEvents,
      totalCharacters,
      typedCharacters: finalTextComposition.typedCharacters,
      pastedCharacters: finalTextComposition.pastedCharacters,
      finalTextComposition,
      finalTextSourceSpans,
      processInputVolume,
      editingTimeSeconds: eventMetrics.editingDurationSeconds,
      typedPercentage,
      pastedPercentage,
    };
  }

  /**
   * Generate a versioned tamper-evident seal for the certificate payload.
   */
  private static generateSignature(data: CertificateSealInput): string {
    return CertificateSealService.createSeal(data, env.jwtSecret).signature;
  }

  private static buildSealInput(certificate: Certificate): CertificateSealInput {
    return {
      id: certificate.id,
      submissionId: certificate.submissionId || null,
      documentId: certificate.documentId,
      userId: certificate.userId,
      certificateType: certificate.certificateType,
      title: certificate.title,
      documentSnapshot: certificate.documentSnapshot,
      plainTextSnapshot: certificate.plainTextSnapshot,
      totalEvents: certificate.totalEvents,
      typingEvents: certificate.typingEvents,
      pasteEvents: certificate.pasteEvents,
      totalCharacters: certificate.totalCharacters,
      typedCharacters: certificate.typedCharacters,
      pastedCharacters: certificate.pastedCharacters,
      finalTextComposition: certificate.finalTextComposition || null,
      finalTextSourceSpans: certificate.finalTextSourceSpans || null,
      processInputVolume: certificate.processInputVolume || null,
      editingTimeSeconds: certificate.editingTimeSeconds,
      anomalyFlags: certificate.anomalyFlags || [],
      policyHash: certificate.policyHash || null,
      verificationToken: certificate.verificationToken,
      signerName: certificate.signerName || null,
      includeFullText: certificate.includeFullText,
      includeEditHistory: certificate.includeEditHistory,
      isProtected: certificate.isProtected,
      generatedAt: certificate.generatedAt,
    };
  }

  private static verifyCertificateIntegrity(certificate: Certificate): CertificateSealVerification {
    if (CertificateSealService.isSealSignature(certificate.signature)) {
      return CertificateSealService.verifySeal(
        this.buildSealInput(certificate),
        env.jwtSecret,
        certificate.signature
      );
    }

    try {
      jwt.verify(certificate.signature, env.jwtSecret);
      return {
        valid: true,
        sealStatus: 'legacy_valid' as const,
        message: 'Certificate legacy signature is valid',
      };
    } catch {
      return {
        valid: false,
        sealStatus: certificate.signature ? 'invalid' as const : 'missing' as const,
        message: 'Certificate signature is invalid or has been tampered with',
      };
    }
  }

  static getCertificateIntegrity(certificate: Certificate): CertificateSealVerification {
    return this.verifyCertificateIntegrity(certificate);
  }

  private static async resealCertificate(certificate: Certificate): Promise<Certificate> {
    const signature = this.generateSignature(this.buildSealInput(certificate));
    const updated = await CertificateModel.updateSignature(certificate.id, signature);

    if (!updated) {
      throw new AppError(500, 'Failed to update certificate integrity seal');
    }

    return updated;
  }

  /**
   * Generate unique verification token
   */
  private static generateVerificationToken(): string {
    // Generate a random 32-byte token and convert to hex
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify certificate with access code (for public verification of protected certificates)
   */
  static async verifyCertificateWithAccessCode(
    verificationToken: string,
    accessCode: string
  ): Promise<CertificateVerification> {
    try {
      const certificate = await CertificateModel.findByVerificationToken(verificationToken);

      if (!certificate) {
        return {
          valid: false,
          certificate: null,
          verifiedAt: new Date(),
          message: 'Certificate not found',
        };
      }

      // Check if certificate is protected
      if (!certificate.isProtected) {
        const integrity = this.verifyCertificateIntegrity(certificate);

        if (integrity.valid) {
          return {
            valid: true,
            certificate: await this.withEnvironmentConfig(certificate),
            verifiedAt: new Date(),
            message: integrity.message,
            seal: integrity.seal,
            sealStatus: integrity.sealStatus,
            integrityMessage: integrity.message,
          };
        }

        return {
          valid: false,
          certificate: await this.withEnvironmentConfig(certificate),
          verifiedAt: new Date(),
          message: integrity.message,
          seal: integrity.seal,
          sealStatus: integrity.sealStatus,
          integrityMessage: integrity.message,
        };
      }

      // Certificate is protected, verify access code
      if (!certificate.accessCodeHash) {
        return {
          valid: false,
          certificate: null,
          verifiedAt: new Date(),
          message: 'Certificate is protected but no access code configured',
        };
      }

      const isAccessCodeValid = await bcrypt.compare(accessCode, certificate.accessCodeHash);

      if (!isAccessCodeValid) {
        return {
          valid: false,
          certificate: null,
          verifiedAt: new Date(),
          message: 'Invalid access code',
        };
      }

      const integrity = this.verifyCertificateIntegrity(certificate);

      if (integrity.valid) {
        return {
          valid: true,
          certificate: await this.withEnvironmentConfig(certificate),
          verifiedAt: new Date(),
          message: integrity.message,
          seal: integrity.seal,
          sealStatus: integrity.sealStatus,
          integrityMessage: integrity.message,
        };
      }

      return {
        valid: false,
        certificate: await this.withEnvironmentConfig(certificate),
        verifiedAt: new Date(),
        message: integrity.message,
        seal: integrity.seal,
        sealStatus: integrity.sealStatus,
        integrityMessage: integrity.message,
      };
    } catch (error) {
      logger.error('Error verifying certificate with access code', { error, verificationToken });
      throw error;
    }
  }

  /**
   * Update certificate access code
   */
  static async updateAccessCode(
    certificateId: string,
    userId: string,
    accessCode?: string
  ): Promise<Certificate> {
    try {
      // Verify ownership
      const certificate = await CertificateModel.findByIdAndUserId(certificateId, userId);

      if (!certificate) {
        throw new AppError(404, 'Certificate not found or unauthorized');
      }

      let accessCodeHash: string | null = null;
      let accessCodePlaintext: string | null = null;
      let isProtected = false;

      if (accessCode) {
        // Set or update access code
        accessCodeHash = await bcrypt.hash(accessCode, 10);
        accessCodePlaintext = accessCode;
        isProtected = true;
      }

      // Update certificate
      const updated = await CertificateModel.updateAccessCode(
        certificateId,
        accessCodePlaintext,
        accessCodeHash,
        isProtected
      );

      if (!updated) {
        throw new AppError(500, 'Failed to update access code');
      }

      const resealed = await this.resealCertificate(updated);

      logger.info('Certificate access code updated', {
        certificateId,
        userId,
        isProtected,
      });

      return this.withEnvironmentConfig(resealed);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error updating certificate access code', { error, certificateId, userId });
      throw error;
    }
  }

  /**
   * Update certificate display options
   */
  static async updateDisplayOptions(
    certificateId: string,
    userId: string,
    includeFullText?: boolean,
    includeEditHistory?: boolean
  ): Promise<Certificate> {
    try {
      // Verify ownership
      const certificate = await CertificateModel.findByIdAndUserId(certificateId, userId);

      if (!certificate) {
        throw new AppError(404, 'Certificate not found or unauthorized');
      }

      // Update display options
      const updated = await CertificateModel.updateDisplayOptions(
        certificateId,
        includeFullText !== undefined ? includeFullText : certificate.includeFullText,
        includeEditHistory !== undefined ? includeEditHistory : certificate.includeEditHistory
      );

      if (!updated) {
        throw new AppError(500, 'Failed to update display options');
      }

      const resealed = await this.resealCertificate(updated);

      logger.info('Certificate display options updated', {
        certificateId,
        userId,
        includeFullText: resealed.includeFullText,
        includeEditHistory: resealed.includeEditHistory,
      });

      return this.withEnvironmentConfig(resealed);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error updating certificate display options', { error, certificateId, userId });
      throw error;
    }
  }

  /**
   * Delete certificate (optional - for user management)
   */
  static async deleteCertificate(certificateId: string, userId: string): Promise<void> {
    try {
      const deleted = await CertificateModel.delete(certificateId, userId);

      if (!deleted) {
        throw new AppError(404, 'Certificate not found or unauthorized');
      }

      logger.info('Certificate deleted', { certificateId, userId });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error deleting certificate', { error, certificateId, userId });
      throw error;
    }
  }
}
