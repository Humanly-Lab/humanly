import { DocumentModel } from '../models/document.model';
import { DocumentEventModel } from '../models/document-event.model';
import { SessionModel } from '../models/session.model';
import { FileModel } from '../models/file.model';
import { query, queryOne, transaction } from '../config/database';
import { cacheDelPattern } from '../config/redis';
import { FileStorageService } from './file-storage.service';
import { buildDocumentEventTimeline } from './document-event-timeline.service';
import type {
  AppFile,
  Document,
  DocumentInsertData,
  DocumentUpdateData,
  DocumentFilters,
  DocumentStatistics,
  DocumentEvent,
  DocumentEventInsertData,
  DocumentEventQueryFilters,
  DocumentEventTimelineResponse,
  PaginatedResult,
  WritingEnvironmentConfig,
} from '@humanly/shared';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

type DeleteDocumentResult = {
  deleted: boolean;
  taskIds: string[];
  files: AppFile[];
  blockedTaskSubmission?: boolean;
};

export class DocumentService {
  private static async buildMissingDocumentError(
    documentId: string,
    userId: string,
    fallbackMessage = 'Document not found'
  ): Promise<AppError> {
    const isRevokedTaskSubmission = await DocumentModel.isRevokedTaskSubmissionDocument(
      documentId,
      userId
    );

    if (isRevokedTaskSubmission) {
      return new AppError(404, 'Task link not found or inactive');
    }

    return new AppError(404, fallbackMessage);
  }

  /**
   * Create a new document
   */
  static async createDocument(
    userId: string,
    title: string,
    content: Record<string, any> = {},
    initialStatus: 'draft' | 'published' | 'archived' = 'draft',
    environmentConfig?: WritingEnvironmentConfig | null,
    description: string | null = null
  ): Promise<Document> {
    try {
      logger.info('Creating document', { userId, title });

      const plainText = this.extractPlainText(content);
      const wordCount = this.calculateWordCount(plainText);
      const characterCount = this.calculateCharacterCount(plainText);

      const data: DocumentInsertData = {
        userId,
        title,
        description,
        content,
        plainText,
        status: initialStatus,
        wordCount,
        characterCount,
        environmentConfig,
      };

      const document = await DocumentModel.create(data);

      logger.info('Document created successfully', {
        documentId: document.id,
        userId,
      });

      return document;
    } catch (error) {
      logger.error('Error creating document', { error, userId });
      throw error;
    }
  }

  /**
   * Get document by ID with ownership verification
   */
  static async getDocument(documentId: string, userId: string): Promise<Document> {
    try {
      const document = await DocumentModel.findByIdAndUserId(documentId, userId);

      if (!document) {
        throw await this.buildMissingDocumentError(documentId, userId);
      }

      return document;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error fetching document', { error, documentId, userId });
      throw error;
    }
  }

  /**
   * Update document
   */
  static async updateDocument(
    documentId: string,
    userId: string,
    updates: DocumentUpdateData
  ): Promise<Document> {
    try {
      logger.info('Updating document', { documentId, userId });

      // If content is updated, recalculate plainText, wordCount, and characterCount
      if (updates.content !== undefined) {
        updates.plainText = this.extractPlainText(updates.content);
        updates.wordCount = this.calculateWordCount(updates.plainText);
        updates.characterCount = this.calculateCharacterCount(updates.plainText);
      }

      const document = await DocumentModel.update(documentId, userId, updates);

      if (!document) {
        throw await this.buildMissingDocumentError(
          documentId,
          userId,
          'Document not found or unauthorized'
        );
      }

      logger.info('Document updated successfully', { documentId, userId });

      return document;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error updating document', { error, documentId, userId });
      throw error;
    }
  }

  /**
   * Mark the first entry into a timed writing session.
   *
   * This is intentionally idempotent: refreshing or reopening a document must
   * not reset the countdown.
   */
  static async startWritingSession(documentId: string, userId: string): Promise<Document> {
    try {
      const document = await DocumentModel.startWritingSession(documentId, userId);

      if (!document) {
        throw await this.buildMissingDocumentError(
          documentId,
          userId,
          'Document not found or unauthorized'
        );
      }

      return document;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error starting document writing session', { error, documentId, userId });
      throw error;
    }
  }

  /**
   * Delete document
   */
  static async deleteDocument(documentId: string, userId: string): Promise<void> {
    try {
      logger.info('Deleting document', { documentId, userId });

      const deleteResult: DeleteDocumentResult = await transaction(async (client) => {
        const documentResult = await client.query(
          `
            SELECT id
            FROM documents
            WHERE id = $1 AND user_id = $2
          `,
          [documentId, userId]
        );

        if (documentResult.rowCount === 0) {
          return { deleted: false, taskIds: [] as string[], files: [] };
        }

	        const linkedTaskResult = await client.query(
	          `
	            SELECT DISTINCT task_id
	            FROM (
	              SELECT task_id
	              FROM task_enrollments
	              WHERE submission_document_id = $1
	                AND user_id = $2
	              UNION
	              SELECT task_id
	              FROM task_attempts
	              WHERE document_id = $1
	                AND user_id = $2
	            ) linked_tasks
	          `,
	          [documentId, userId]
	        );

        const taskIds = linkedTaskResult.rows.map((row: { task_id: string }) => row.task_id);

        if (taskIds.length > 0) {
          return {
            deleted: false,
            taskIds,
            files: [],
            blockedTaskSubmission: true,
          };
        }

        const fileResult = await client.query(
          `
            SELECT ${FileModel.columns}
            FROM files
            WHERE document_id = $1
              AND owner_user_id = $2
          `,
          [documentId, userId]
        );
        const files = fileResult.rows as AppFile[];

        const deletedDocumentResult = await client.query(
          `
            DELETE FROM documents
            WHERE id = $1 AND user_id = $2
            RETURNING id
          `,
          [documentId, userId]
        );

        return {
          deleted: deletedDocumentResult.rowCount > 0,
          taskIds,
          files,
        };
      });

      if (deleteResult.blockedTaskSubmission) {
        throw new AppError(
          409,
          'Assigned task documents cannot be deleted. Remove the task from your dashboard instead.'
        );
      }

      if (!deleteResult.deleted) {
        throw new AppError(404, 'Document not found or unauthorized');
      }

      await Promise.all(
        deleteResult.taskIds.map((taskId: string) => cacheDelPattern(`analytics:${taskId}:*`))
      );

      await this.deleteDocumentFileStorage(documentId, userId, deleteResult.files);

      logger.info('Document deleted successfully', { documentId, userId });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error deleting document', { error, documentId, userId });
      throw error;
    }
  }

  private static async deleteDocumentFileStorage(
    documentId: string,
    userId: string,
    files: AppFile[]
  ): Promise<void> {
    await Promise.all(
      files
        .filter((file) => !file.legacySourceId)
        .map(async (file) => {
          try {
            const remainingReferenceCount = await FileModel.countStorageReferences(file);
            if (remainingReferenceCount > 0) {
              logger.info('Skipping document file storage delete because object is still referenced', {
                documentId,
                userId,
                fileId: file.id,
                storageProvider: file.storageProvider,
                storageBucket: file.storageBucket,
                storageKey: file.storageKey,
                remainingReferenceCount,
              });
              return;
            }
            await FileStorageService.delete(file);
          } catch (error) {
            logger.error('Failed to delete document file storage object', {
              error,
              documentId,
              userId,
              fileId: file.id,
              storageProvider: file.storageProvider,
              storageBucket: file.storageBucket,
              storageKey: file.storageKey,
            });
          }
        })
    );
  }

  /**
   * List documents with filters and pagination
   */
  static async listDocuments(
    userId: string,
    filters: DocumentFilters
  ): Promise<PaginatedResult<Document>> {
    try {
      const result = await DocumentModel.findByUserId(userId, filters);
      return result;
    } catch (error) {
      logger.error('Error listing documents', { error, userId });
      throw error;
    }
  }

  /**
   * Track events for a document
   */
  static async trackEvents(
    documentId: string,
    userId: string,
    events: DocumentEventInsertData[]
  ): Promise<void> {
    try {
      // Assigned task and guest shared-link documents are accessible through
      // enrollment/attempt records, not always direct document ownership.
      const canAccess = await DocumentModel.canAccess(documentId, userId);
      if (!canAccess) {
        throw new AppError(404, 'Document not found or unauthorized');
      }

      await this.verifyEventSessions(documentId, userId, events);

      // Ensure all events have correct documentId and userId
      const validatedEvents = events.map((event) => ({
        ...event,
        documentId,
        userId,
      }));

      await DocumentEventModel.batchInsert(validatedEvents);
      await this.invalidateTaskAnalyticsForDocument(documentId);

      logger.info('Document events tracked', {
        documentId,
        userId,
        eventCount: events.length,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error tracking document events', {
        error,
        documentId,
        userId,
      });
      throw error;
    }
  }

  private static async verifyEventSessions(
    documentId: string,
    userId: string,
    events: DocumentEventInsertData[]
  ): Promise<void> {
    const sessionIds = Array.from(
      new Set(events.map((event) => event.sessionId).filter(Boolean))
    ) as string[];

    for (const sessionId of sessionIds) {
      const session = await SessionModel.findById(sessionId);
      if (!session) {
        throw new AppError(404, 'Session not found');
      }

      const enrollment = await queryOne<{ id: string }>(
        `
          SELECT pe.id
	          FROM task_enrollments pe
	          JOIN users u ON u.id = pe.user_id
	          WHERE pe.task_id = $1
	            AND pe.user_id = $2
	            AND (
	              pe.submission_document_id = $3
	              OR EXISTS (
	                SELECT 1
	                FROM task_attempts ta
	                WHERE ta.task_id = pe.task_id
	                  AND ta.user_id = pe.user_id
	                  AND ta.document_id = $3
	              )
	            )
	            AND u.email = $4
	          LIMIT 1
	        `,
        [session.taskId, userId, documentId, session.externalUserId]
      );

      if (!enrollment) {
        throw new AppError(403, 'Session does not belong to this document enrollment');
      }
    }
  }

  private static async invalidateTaskAnalyticsForDocument(documentId: string): Promise<void> {
	    const linkedTasks = await query<{ taskId: string }>(
	      `
	        SELECT DISTINCT task_id as "taskId"
	        FROM (
	          SELECT task_id
	          FROM task_enrollments
	          WHERE submission_document_id = $1
	          UNION
	          SELECT task_id
	          FROM task_attempts
	          WHERE document_id = $1
	        ) linked_tasks
	      `,
	      [documentId]
	    );

    await Promise.all(
      linkedTasks.map((task) => cacheDelPattern(`analytics:${task.taskId}:*`))
    );
  }

  /**
   * Get document events with total count
   */
  static async getDocumentEvents(
    documentId: string,
    userId: string,
    filters: DocumentEventQueryFilters = {}
  ): Promise<{ events: DocumentEvent[]; total: number }> {
    try {
      const canAccess = await DocumentModel.canAccess(documentId, userId);
      if (!canAccess) {
        throw new AppError(404, 'Document not found or unauthorized');
      }

      // Get both events and total count in parallel
      const [events, total] = await Promise.all([
        DocumentEventModel.findByDocumentId(documentId, filters),
        DocumentEventModel.countByDocumentIdWithFilters(documentId, filters),
      ]);

      return { events, total };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error fetching document events', {
        error,
        documentId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get a readable derived event timeline without changing raw audit storage.
   */
  static async getDocumentEventTimeline(
    documentId: string,
    userId: string,
    filters: DocumentEventQueryFilters = {}
  ): Promise<DocumentEventTimelineResponse> {
    try {
      const canAccess = await DocumentModel.canAccess(documentId, userId);
      if (!canAccess) {
        throw new AppError(404, 'Document not found or unauthorized');
      }

      const timelineFilters = {
        ...filters,
        limit: Math.min(filters.limit || 10000, 10000),
        offset: filters.offset || 0,
      };

      const [events, total] = await Promise.all([
        DocumentEventModel.findByDocumentId(documentId, timelineFilters),
        DocumentEventModel.countByDocumentIdWithFilters(documentId, timelineFilters),
      ]);

      return buildDocumentEventTimeline(events, total);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error fetching document event timeline', {
        error,
        documentId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get document statistics
   */
  static async getDocumentStatistics(
    documentId: string,
    userId: string
  ): Promise<DocumentStatistics> {
    try {
      const canAccess = await DocumentModel.canAccess(documentId, userId);
      if (!canAccess) {
        throw await this.buildMissingDocumentError(
          documentId,
          userId,
          'Document not found or unauthorized'
        );
      }

      const stats = await DocumentModel.getStatistics(documentId, userId);

      if (!stats) {
        throw new AppError(404, 'Document not found or unauthorized');
      }

      return stats;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error fetching document statistics', {
        error,
        documentId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Extract plain text from Lexical editor state
   * This is a simplified extraction - in production, use Lexical's built-in methods
   */
  static extractPlainText(lexicalState: Record<string, any>): string {
    try {
      if (!lexicalState || typeof lexicalState !== 'object') {
        return '';
      }

      // Lexical stores content in root.children
      const root = lexicalState.root;
      if (!root || !root.children) {
        return '';
      }

      // Recursively extract text from nodes
      const extractTextFromNode = (node: any): string => {
        if (!node) return '';

        // If node has text property, return it
        if (typeof node.text === 'string') {
          return node.text;
        }

        // If node has children, recursively extract from them
        if (Array.isArray(node.children)) {
          return node.children.map(extractTextFromNode).join('');
        }

        return '';
      };

      const text = root.children.map(extractTextFromNode).join('\n');
      return text.trim();
    } catch (error) {
      logger.warn('Error extracting plain text from Lexical state', { error });
      return '';
    }
  }

  /**
   * Calculate word count from plain text
   */
  static calculateWordCount(text: string): number {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    // Remove extra whitespace and split by whitespace
    const words = text
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter((word) => word.length > 0);

    return words.length;
  }

  /**
   * Calculate character count from plain text (excluding whitespace)
   */
  static calculateCharacterCount(text: string): number {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    // Count all characters including spaces
    return text.length;
  }

  /**
   * Verify document ownership (helper method)
   */
  static async verifyOwnership(documentId: string, userId: string): Promise<void> {
    const isOwner = await DocumentModel.isOwner(documentId, userId);
    if (!isOwner) {
      throw new AppError(404, 'Document not found or unauthorized');
    }
  }
}
