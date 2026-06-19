import { query, queryOne } from '../config/database';
import {
  Document,
  DocumentInsertData,
  DocumentUpdateData,
  DocumentFilters,
  DocumentStatistics,
  PaginatedResult,
} from '@humanly/shared';

export class DocumentModel {
  private static activeTaskSubmissionGuard(documentAlias: string, userParam: string): string {
    return `
      NOT EXISTS (
        SELECT 1
        FROM task_enrollments te
        JOIN tasks t
          ON t.id = te.task_id
        LEFT JOIN task_attempts ta
          ON ta.task_id = te.task_id
         AND ta.user_id = te.user_id
         AND ta.document_id = ${documentAlias}.id
        WHERE te.user_id = ${userParam}
          AND (te.submission_document_id = ${documentAlias}.id OR ta.id IS NOT NULL)
          AND (
            t.deleted_at IS NOT NULL
            OR t.is_active IS NOT TRUE
            OR COALESCE(t.lifecycle_status, 'active') <> 'active'
          )
      )
    `;
  }

  /**
   * Create a new document
   */
  static async create(data: DocumentInsertData): Promise<Document> {
    const sql = `
      INSERT INTO documents (
        user_id, title, description, content, plain_text, status, word_count, character_count, environment_config
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id,
        user_id as "userId",
        title,
        description,
        content,
        plain_text as "plainText",
        status,
        version,
        word_count as "wordCount",
        character_count as "characterCount",
        environment_config as "environmentConfig",
        writing_started_at as "writingStartedAt",
        created_at as "createdAt",
        updated_at as "updatedAt",
        last_edited_at as "lastEditedAt"
    `;

    const document = await queryOne<Document>(sql, [
      data.userId,
      data.title,
      data.description || null,
      JSON.stringify(data.content),
      data.plainText,
      data.status || 'draft',
      data.wordCount || 0,
      data.characterCount || 0,
      data.environmentConfig ? JSON.stringify(data.environmentConfig) : null,
    ]);

    if (!document) {
      throw new Error('Failed to create document');
    }

    return document;
  }

  /**
   * Find document by ID
   */
  static async findById(id: string): Promise<Document | null> {
    const sql = `
      SELECT
        id,
        user_id as "userId",
        title,
        description,
        content,
        plain_text as "plainText",
        status,
        version,
        word_count as "wordCount",
        character_count as "characterCount",
        environment_config as "environmentConfig",
        writing_started_at as "writingStartedAt",
        created_at as "createdAt",
        updated_at as "updatedAt",
        last_edited_at as "lastEditedAt"
      FROM documents
      WHERE id = $1
    `;

    return queryOne<Document>(sql, [id]);
  }

  /**
   * Find document by ID and verify ownership
   */
  static async findByIdAndUserId(id: string, userId: string): Promise<Document | null> {
    const sql = `
      SELECT
        id,
        user_id as "userId",
        title,
        description,
        content,
        plain_text as "plainText",
        status,
        version,
        word_count as "wordCount",
        character_count as "characterCount",
        environment_config as "environmentConfig",
        writing_started_at as "writingStartedAt",
        created_at as "createdAt",
        updated_at as "updatedAt",
        last_edited_at as "lastEditedAt"
      FROM documents
      WHERE id = $1
        AND user_id = $2
        AND ${this.activeTaskSubmissionGuard('documents', '$2')}
    `;

    return queryOne<Document>(sql, [id, userId]);
  }

  /**
   * Find a document a user can access either directly as owner or through a
   * task submission relationship. Guest shared-link submissions can be linked
   * through task enrollment/attempt records before every downstream service has
   * the same direct-owner assumptions.
   */
  static async findAccessibleByIdAndUserId(id: string, userId: string): Promise<Document | null> {
    const sql = `
      SELECT
        d.id,
        d.user_id as "userId",
        d.title,
        d.description,
        d.content,
        d.plain_text as "plainText",
        d.status,
        d.version,
        d.word_count as "wordCount",
        d.character_count as "characterCount",
        d.environment_config as "environmentConfig",
        d.writing_started_at as "writingStartedAt",
        d.created_at as "createdAt",
        d.updated_at as "updatedAt",
        d.last_edited_at as "lastEditedAt"
      FROM documents d
      WHERE d.id = $1
        AND (
          d.user_id = $2
          OR EXISTS (
            SELECT 1
            FROM task_enrollments te
            WHERE te.submission_document_id = d.id
              AND te.user_id = $2
          )
          OR EXISTS (
            SELECT 1
            FROM task_attempts ta
            WHERE ta.document_id = d.id
              AND ta.user_id = $2
          )
        )
        AND ${this.activeTaskSubmissionGuard('d', '$2')}
    `;

    return queryOne<Document>(sql, [id, userId]);
  }

  /**
   * Find documents by user ID with filters and pagination
   */
  static async findByUserId(
    userId: string,
    filters: DocumentFilters = {}
  ): Promise<PaginatedResult<Document>> {
    const {
      status,
      search,
      limit = 20,
      offset = 0,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
    } = filters;

    let whereClauses = [
      'user_id = $1',
	      `NOT EXISTS (
	        SELECT 1
	        FROM task_enrollments te
	        WHERE te.submission_document_id = documents.id
	          AND te.user_id = documents.user_id
	          AND te.dashboard_hidden_at IS NOT NULL
	      )`,
	      `NOT EXISTS (
	        SELECT 1
	        FROM task_attempts ta
	        WHERE ta.document_id = documents.id
	          AND ta.user_id = documents.user_id
	      )`,
	    ];
    const params: any[] = [userId];
    let paramIndex = 2;

    // Add status filter
    if (status) {
      whereClauses.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    // Add search filter (searches title and plain_text)
    if (search) {
      whereClauses.push(`(
        title ILIKE $${paramIndex} OR
        to_tsvector('english', plain_text) @@ plainto_tsquery('english', $${paramIndex})
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereClauses.join(' AND ');

    // Map sortBy to database column
    const sortColumnMap: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      title: 'title',
    };
    const sortColumn = sortColumnMap[sortBy] || 'updated_at';
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countSql = `
      SELECT COUNT(*) as count
      FROM documents
      WHERE ${whereClause}
    `;
    const countResult = await queryOne<{ count: string }>(countSql, params);
    const total = parseInt(countResult?.count || '0', 10);

    // Get documents
    const sql = `
      SELECT
        id,
        user_id as "userId",
        title,
        description,
        content,
        plain_text as "plainText",
        status,
        version,
        word_count as "wordCount",
        character_count as "characterCount",
        environment_config as "environmentConfig",
        writing_started_at as "writingStartedAt",
        created_at as "createdAt",
        updated_at as "updatedAt",
        last_edited_at as "lastEditedAt"
      FROM documents
      WHERE ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const documents = await query<Document>(sql, [...params, limit, offset]);

    return {
      data: documents,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + documents.length < total,
      },
    };
  }

  /**
   * Update document
   */
  static async update(
    id: string,
    userId: string,
    data: DocumentUpdateData
  ): Promise<Document | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(data.title);
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(data.description || null);
    }

    if (data.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      params.push(JSON.stringify(data.content));
    }

    if (data.plainText !== undefined) {
      updates.push(`plain_text = $${paramIndex++}`);
      params.push(data.plainText);
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }

    if (data.wordCount !== undefined) {
      updates.push(`word_count = $${paramIndex++}`);
      params.push(data.wordCount);
    }

    if (data.characterCount !== undefined) {
      updates.push(`character_count = $${paramIndex++}`);
      params.push(data.characterCount);
    }

    if (data.environmentConfig !== undefined) {
      updates.push(`environment_config = $${paramIndex++}`);
      params.push(data.environmentConfig ? JSON.stringify(data.environmentConfig) : null);
    }

    if (updates.length === 0) {
      return this.findByIdAndUserId(id, userId);
    }

    params.push(id, userId);

    const sql = `
      UPDATE documents
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++}
        AND user_id = $${paramIndex++}
        AND ${this.activeTaskSubmissionGuard('documents', `$${paramIndex - 1}`)}
      RETURNING
        id,
        user_id as "userId",
        title,
        description,
        content,
        plain_text as "plainText",
        status,
        version,
        word_count as "wordCount",
        character_count as "characterCount",
        environment_config as "environmentConfig",
        writing_started_at as "writingStartedAt",
        created_at as "createdAt",
        updated_at as "updatedAt",
        last_edited_at as "lastEditedAt"
    `;

    return queryOne<Document>(sql, params);
  }

  /**
   * Persist the first time a writer enters a timed document.
   */
  static async startWritingSession(id: string, userId: string): Promise<Document | null> {
    const sql = `
      UPDATE documents
      SET writing_started_at = COALESCE(writing_started_at, NOW())
      WHERE id = $1
        AND user_id = $2
        AND ${this.activeTaskSubmissionGuard('documents', '$2')}
      RETURNING
        id,
        user_id as "userId",
        title,
        description,
        content,
        plain_text as "plainText",
        status,
        version,
        word_count as "wordCount",
        character_count as "characterCount",
        environment_config as "environmentConfig",
        writing_started_at as "writingStartedAt",
        created_at as "createdAt",
        updated_at as "updatedAt",
        last_edited_at as "lastEditedAt"
    `;

    return queryOne<Document>(sql, [id, userId]);
  }

  /**
   * Delete document
   */
  static async delete(id: string, userId: string): Promise<boolean> {
    const sql = `
      DELETE FROM documents
      WHERE id = $1
        AND user_id = $2
        AND ${this.activeTaskSubmissionGuard('documents', '$2')}
      RETURNING id
    `;

    const result = await queryOne<{ id: string }>(sql, [id, userId]);
    return !!result;
  }

  /**
   * Get document statistics including event metrics
   */
  static async getStatistics(documentId: string, userId: string): Promise<DocumentStatistics | null> {
    const sql = `
      SELECT
        document_id as "documentId",
        user_id as "userId",
        title,
        status,
        word_count as "wordCount",
        character_count as "characterCount",
        total_events as "totalEvents",
        typing_events as "typingEvents",
        paste_events as "pasteEvents",
        first_event as "firstEvent",
        last_event as "lastEvent",
        editing_duration_seconds as "editingDurationSeconds"
      FROM document_statistics
      WHERE document_id = $1 AND user_id = $2
    `;

    return queryOne<DocumentStatistics>(sql, [documentId, userId]);
  }

  /**
   * Check if user owns the document
   */
  static async isOwner(documentId: string, userId: string): Promise<boolean> {
    const sql = `
      SELECT id
      FROM documents
      WHERE id = $1
        AND user_id = $2
        AND ${this.activeTaskSubmissionGuard('documents', '$2')}
    `;

    const result = await queryOne<{ id: string }>(sql, [documentId, userId]);
    return !!result;
  }

  /**
   * Check direct owner or task-submission access.
   */
  static async canAccess(documentId: string, userId: string): Promise<boolean> {
    const sql = `
      SELECT d.id
      FROM documents d
      WHERE d.id = $1
        AND (
          d.user_id = $2
          OR EXISTS (
            SELECT 1
            FROM task_enrollments te
            WHERE te.submission_document_id = d.id
              AND te.user_id = $2
          )
          OR EXISTS (
            SELECT 1
            FROM task_attempts ta
            WHERE ta.document_id = d.id
              AND ta.user_id = $2
          )
        )
        AND ${this.activeTaskSubmissionGuard('d', '$2')}
    `;

    const result = await queryOne<{ id: string }>(sql, [documentId, userId]);
    return !!result;
  }

  static async isRevokedTaskSubmissionDocument(documentId: string, userId: string): Promise<boolean> {
    const sql = `
      SELECT 1
      FROM documents d
      JOIN task_enrollments te
        ON te.user_id = $2
      JOIN tasks t
        ON t.id = te.task_id
      LEFT JOIN task_attempts ta
        ON ta.task_id = te.task_id
       AND ta.user_id = te.user_id
       AND ta.document_id = d.id
      WHERE d.id = $1
        AND (te.submission_document_id = d.id OR ta.id IS NOT NULL)
        AND (d.user_id = $2 OR te.user_id = $2)
        AND (
          t.deleted_at IS NOT NULL
          OR t.is_active IS NOT TRUE
          OR COALESCE(t.lifecycle_status, 'active') <> 'active'
        )
      LIMIT 1
    `;

    const result = await queryOne(sql, [documentId, userId]);
    return !!result;
  }

  /**
   * Count total documents for a user
   */
  static async countByUserId(userId: string, status?: string): Promise<number> {
    let sql = `
      SELECT COUNT(*) as count
      FROM documents
      WHERE user_id = $1
    `;

    const params: any[] = [userId];

    if (status) {
      sql += ` AND status = $2`;
      params.push(status);
    }

    const result = await queryOne<{ count: string }>(sql, params);
    return parseInt(result?.count || '0', 10);
  }
}
