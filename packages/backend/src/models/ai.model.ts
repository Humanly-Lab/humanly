import { query, queryOne } from '../config/database';
import {
  AIChatSession,
  AIChatMessage,
  AIInteractionLog,
  AILogQueryFilters,
  AIQueryType,
  AISuggestion,
  AIContentModification,
  ModelCapabilities,
} from '@humanly/shared';

/**
 * Database row types
 */
interface AIChatSessionRow {
  id: string;
  document_id: string;
  user_id: string;
  status: 'active' | 'closed';
  model_version: string | null;
  model_capabilities: ModelCapabilities | Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface AIChatMessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, any>;
  created_at: Date;
}

export type AIQuestionCategory = 'understanding' | 'generation' | 'other';

interface AIInteractionLogRow {
  id: string;
  document_id: string;
  user_id: string;
  session_id: string | null;
  query: string;
  query_type: AIQueryType;
  question_category: AIQuestionCategory | null;
  context_snapshot: Record<string, any>;
  response: string | null;
  suggestions: AISuggestion[];
  response_time_ms: number | null;
  tokens_used: Record<string, any>;
  modifications_applied: boolean;
  modifications: AIContentModification[];
  model_version: string | null;
  status: 'success' | 'error' | 'cancelled' | 'pending';
  error_message: string | null;
  created_at: Date;
}

/**
 * Transform database row to AIChatSession
 */
function toAIChatSession(row: AIChatSessionRow): AIChatSession {
  const createdAt = normalizeAITimestamp(row.created_at);
  const updatedAt = normalizeAITimestamp(row.updated_at);

  return {
    id: row.id,
    documentId: row.document_id,
    userId: row.user_id,
    status: row.status,
    messages: [],
    modelVersion: row.model_version ?? undefined,
    modelCapabilities: isModelCapabilities(row.model_capabilities)
      ? (row.model_capabilities as ModelCapabilities)
      : undefined,
    createdAt,
    updatedAt,
  };
}

function isModelCapabilities(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const inputs = (value as { inputs?: unknown }).inputs;
  return Array.isArray(inputs);
}

function hasExplicitTimezone(value: string) {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}

function normalizeAITimestamp(value: Date | string): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
      value.getMilliseconds()
    ));
  }

  const trimmed = String(value).trim();
  if (!trimmed) return new Date(value);

  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  return new Date(hasExplicitTimezone(normalized) ? normalized : `${normalized}Z`);
}

/**
 * Transform database row to AIChatMessage
 */
function toAIChatMessage(row: AIChatMessageRow): AIChatMessage {
  const timestamp = normalizeAITimestamp(row.created_at);

  return {
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp,
    metadata: row.metadata,
  };
}

/**
 * Transform database row to AIInteractionLog
 */
function toAIInteractionLog(row: AIInteractionLogRow): AIInteractionLog {
  const timestamp = normalizeAITimestamp(row.created_at);

  return {
    id: row.id,
    documentId: row.document_id,
    userId: row.user_id,
    sessionId: row.session_id || undefined,
    timestamp,
    query: row.query,
    queryType: row.query_type,
    questionCategory: row.question_category || undefined,
    contextSnapshot: row.context_snapshot,
    response: row.response || '',
    suggestions: row.suggestions,
    responseTimeMs: row.response_time_ms || undefined,
    tokensUsed: row.tokens_used as { input: number; output: number } | undefined,
    modificationsApplied: row.modifications_applied,
    modifications: row.modifications,
    modelVersion: row.model_version || undefined,
    status: row.status,
    errorMessage: row.error_message || undefined,
    createdAt: timestamp,
  };
}

/**
 * Thrown when an `ai_chat_messages` insert references a `session_id` that
 * no longer exists in `ai_chat_sessions` (Postgres FK violation 23503 on
 * `ai_chat_messages_session_id_fkey`). Surfacing a typed error lets callers
 * translate it into a clean user-facing message instead of letting the raw
 * constraint string reach the UI (issue #90).
 */
export class AIChatSessionMissingError extends Error {
  public readonly sessionId: string;

  constructor(sessionId: string) {
    super(`AI chat session ${sessionId} no longer exists`);
    this.name = 'AIChatSessionMissingError';
    this.sessionId = sessionId;
  }
}

/**
 * Postgres error code for foreign key violations. Centralised so the model
 * layer doesn't sprinkle magic strings across the catch blocks.
 */
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_UNDEFINED_COLUMN = '42703';
let supportsSessionModelSnapshotColumns: boolean | null = null;

function isUndefinedColumnError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === PG_UNDEFINED_COLUMN;
}

async function aiChatSessionsSupportsModelSnapshotColumns(): Promise<boolean> {
  if (supportsSessionModelSnapshotColumns !== null && process.env.NODE_ENV !== 'test') {
    return supportsSessionModelSnapshotColumns;
  }

  const rows = await query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'ai_chat_sessions'
        AND column_name IN ('model_version', 'model_capabilities')
    `
  );
  const columns = new Set(rows.map(row => row.column_name));
  const supportsColumns = columns.has('model_version') && columns.has('model_capabilities');

  if (process.env.NODE_ENV !== 'test') {
    supportsSessionModelSnapshotColumns = supportsColumns;
  }

  return supportsColumns;
}

function isAIChatMessagesSessionFkViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const constraint = (error as { constraint?: unknown }).constraint;
  return (
    code === PG_FOREIGN_KEY_VIOLATION &&
    constraint === 'ai_chat_messages_session_id_fkey'
  );
}

export class AIModel {
  // ============================================================================
  // Chat Sessions
  // ============================================================================

  /**
   * Create a new chat session. The optional model snapshot is persisted on
   * the session row so the websocket layer can detect mid-session model
   * switches that drop a modality already used in the conversation (#93).
   */
  static async createSession(
    documentId: string,
    userId: string,
    modelSnapshot?: { modelVersion: string; capabilities: ModelCapabilities },
  ): Promise<AIChatSession> {
    const sqlWithModelSnapshot = `
      INSERT INTO ai_chat_sessions (document_id, user_id, status, model_version, model_capabilities)
      VALUES ($1, $2, 'active', $3, $4)
      RETURNING *
    `;

    const legacySql = `
      INSERT INTO ai_chat_sessions (document_id, user_id, status)
      VALUES ($1, $2, 'active')
      RETURNING *
    `;

    let row: AIChatSessionRow | null;
    if (await aiChatSessionsSupportsModelSnapshotColumns()) {
      try {
        row = await queryOne<AIChatSessionRow>(sqlWithModelSnapshot, [
          documentId,
          userId,
          modelSnapshot?.modelVersion ?? null,
          JSON.stringify(modelSnapshot?.capabilities ?? {}),
        ]);
      } catch (error) {
        if (!isUndefinedColumnError(error)) {
          throw error;
        }

        supportsSessionModelSnapshotColumns = false;
        row = await queryOne<AIChatSessionRow>(legacySql, [documentId, userId]);
      }
    } else {
      row = await queryOne<AIChatSessionRow>(legacySql, [documentId, userId]);
    }

    if (!row) {
      throw new Error('Failed to create AI chat session');
    }

    return toAIChatSession(row);
  }

  /**
   * Find chat session by ID
   */
  static async findSessionById(sessionId: string): Promise<AIChatSession | null> {
    const sql = `
      SELECT * FROM ai_chat_sessions WHERE id = $1
    `;

    const row = await queryOne<AIChatSessionRow>(sql, [sessionId]);
    if (!row) return null;

    const session = toAIChatSession(row);

    // Load messages
    const messages = await this.getSessionMessages(sessionId);
    session.messages = messages;

    return session;
  }

  /**
   * Find active session for document and user
   */
  static async findActiveSession(documentId: string, userId: string): Promise<AIChatSession | null> {
    const sql = `
      SELECT * FROM ai_chat_sessions
      WHERE document_id = $1 AND user_id = $2 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const row = await queryOne<AIChatSessionRow>(sql, [documentId, userId]);
    if (!row) return null;

    const session = toAIChatSession(row);

    // Load messages
    const messages = await this.getSessionMessages(row.id);
    session.messages = messages;

    return session;
  }

  /**
   * Get or create active session. When creating a new session and a model
   * snapshot is supplied, the snapshot is persisted so capability gating
   * (#93) has a stable reference for the rest of the conversation.
   */
  static async getOrCreateSession(
    documentId: string,
    userId: string,
    modelSnapshot?: { modelVersion: string; capabilities: ModelCapabilities },
  ): Promise<AIChatSession> {
    const existing = await this.findActiveSession(documentId, userId);
    if (existing) return existing;

    return this.createSession(documentId, userId, modelSnapshot);
  }

  /**
   * Close a chat session
   */
  static async closeSession(sessionId: string): Promise<void> {
    const sql = `
      UPDATE ai_chat_sessions SET status = 'closed' WHERE id = $1
    `;

    await query(sql, [sessionId]);
  }

  /**
   * Delete a chat session completely (messages are deleted, but logs are preserved for statistics)
   */
  static async deleteSession(sessionId: string): Promise<void> {
    // Preserve interaction logs for statistics/audit, but mark them so the
    // frontend can hide the deleted conversation from chat history.
    await query(`
      UPDATE ai_interaction_logs
      SET
        session_id = NULL,
        context_snapshot = COALESCE(context_snapshot, '{}'::jsonb) || jsonb_build_object(
          'conversationDeleted', true,
          'deletedSessionId', $1,
          'conversationDeletedAt', NOW()
        )
      WHERE session_id = $1
    `, [sessionId]);

    // Delete messages associated with this session
    await query(`DELETE FROM ai_chat_messages WHERE session_id = $1`, [sessionId]);

    // Delete the session itself
    await query(`DELETE FROM ai_chat_sessions WHERE id = $1`, [sessionId]);
  }

  /**
   * Get sessions for a document
   */
  static async getSessionsByDocument(
    documentId: string,
    userId: string,
    limit = 10
  ): Promise<AIChatSession[]> {
    const sql = `
      SELECT * FROM ai_chat_sessions
      WHERE document_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `;

    const rows = await query<AIChatSessionRow>(sql, [documentId, userId, limit]);
    return rows.map(toAIChatSession);
  }

  // ============================================================================
  // Chat Messages
  // ============================================================================

  /**
   * Add a message to a session
   */
  static async addMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, any>
  ): Promise<AIChatMessage> {
    const sql = `
      INSERT INTO ai_chat_messages (session_id, role, content, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    let row: AIChatMessageRow | null;
    try {
      row = await queryOne<AIChatMessageRow>(sql, [
        sessionId,
        role,
        content,
        JSON.stringify(metadata || {}),
      ]);
    } catch (error) {
      // Translate the Postgres FK violation into a typed error so the
      // websocket/REST layer can return a clean message instead of leaking
      // the constraint name to the user (issue #90).
      if (isAIChatMessagesSessionFkViolation(error)) {
        throw new AIChatSessionMissingError(sessionId);
      }
      throw error;
    }

    if (!row) {
      throw new Error('Failed to add AI chat message');
    }

    return toAIChatMessage(row);
  }

  /**
   * Get messages for a session
   */
  static async getSessionMessages(sessionId: string): Promise<AIChatMessage[]> {
    const sql = `
      SELECT * FROM ai_chat_messages
      WHERE session_id = $1
      ORDER BY created_at ASC
    `;

    const rows = await query<AIChatMessageRow>(sql, [sessionId]);
    return rows.map(toAIChatMessage);
  }

  // ============================================================================
  // Interaction Logs
  // ============================================================================

  /**
   * Create an interaction log entry
   */
  static async createLog(data: {
    documentId: string;
    userId: string;
    sessionId?: string;
    query: string;
    queryType?: AIQueryType;
    questionCategory?: AIQuestionCategory;
    contextSnapshot?: Record<string, any>;
  }): Promise<AIInteractionLog> {
    const sql = `
      INSERT INTO ai_interaction_logs (
        document_id, user_id, session_id, query, query_type, question_category, context_snapshot, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *
    `;

    const row = await queryOne<AIInteractionLogRow>(sql, [
      data.documentId,
      data.userId,
      data.sessionId || null,
      data.query,
      data.queryType || 'other',
      data.questionCategory || null,
      JSON.stringify(data.contextSnapshot || {}),
    ]);

    if (!row) {
      throw new Error('Failed to create AI interaction log');
    }

    return toAIInteractionLog(row);
  }

  /**
   * Update log with response
   */
  static async updateLogWithResponse(
    logId: string,
    data: {
      response: string;
      suggestions?: AISuggestion[];
      responseTimeMs?: number;
      tokensUsed?: { input: number; output: number };
      modelVersion?: string;
      status?: 'success' | 'error' | 'cancelled';
      errorMessage?: string;
    }
  ): Promise<AIInteractionLog | null> {
    const sql = `
      UPDATE ai_interaction_logs
      SET
        response = $2,
        suggestions = $3,
        response_time_ms = $4,
        tokens_used = $5,
        model_version = $6,
        status = $7,
        error_message = $8
      WHERE id = $1
      RETURNING *
    `;

    const row = await queryOne<AIInteractionLogRow>(sql, [
      logId,
      data.response,
      JSON.stringify(data.suggestions || []),
      data.responseTimeMs || null,
      JSON.stringify(data.tokensUsed || {}),
      data.modelVersion || null,
      data.status || 'success',
      data.errorMessage || null,
    ]);

    return row ? toAIInteractionLog(row) : null;
  }

  /**
   * Update log with applied modifications
   */
  static async updateLogWithModifications(
    logId: string,
    modifications: AIContentModification[]
  ): Promise<AIInteractionLog | null> {
    const sql = `
      UPDATE ai_interaction_logs
      SET
        modifications_applied = TRUE,
        modifications = $2
      WHERE id = $1
      RETURNING *
    `;

    const row = await queryOne<AIInteractionLogRow>(sql, [
      logId,
      JSON.stringify(modifications),
    ]);

    return row ? toAIInteractionLog(row) : null;
  }

  /**
   * Find log by ID
   */
  static async findLogById(logId: string): Promise<AIInteractionLog | null> {
    const sql = `
      SELECT * FROM ai_interaction_logs WHERE id = $1
    `;

    const row = await queryOne<AIInteractionLogRow>(sql, [logId]);
    return row ? toAIInteractionLog(row) : null;
  }

  /**
   * Find a recent AI log generated from the same inline selection action.
   * Used to avoid duplicate log rows when the client fails to pass logId back.
   */
  static async findRecentSelectionLog(params: {
    documentId: string;
    userId: string;
    queryType: AIQueryType;
    originalText: string;
    suggestedText: string;
  }): Promise<AIInteractionLog | null> {
    const sql = `
      SELECT *
      FROM ai_interaction_logs
      WHERE document_id = $1
        AND user_id = $2
        AND query_type = $3
        AND response = $4
        AND context_snapshot->'selection'->>'text' = $5
        AND created_at >= NOW() - INTERVAL '10 minutes'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const row = await queryOne<AIInteractionLogRow>(sql, [
      params.documentId,
      params.userId,
      params.queryType,
      params.suggestedText,
      params.originalText,
    ]);

    return row ? toAIInteractionLog(row) : null;
  }

  /**
   * Get logs with filters
   */
  static async getLogs(filters: AILogQueryFilters): Promise<{
    logs: AIInteractionLog[];
    total: number;
  }> {
    const {
      documentId,
      userId,
      sessionId,
      queryType,
      status,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = filters;

    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (documentId) {
      whereClauses.push(`document_id = $${paramIndex++}`);
      params.push(documentId);
    }

    if (userId) {
      whereClauses.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (sessionId) {
      whereClauses.push(`session_id = $${paramIndex++}`);
      params.push(sessionId);
    }

    if (queryType) {
      whereClauses.push(`query_type = $${paramIndex++}`);
      params.push(queryType);
    }

    if (status) {
      whereClauses.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (startDate) {
      whereClauses.push(`created_at >= $${paramIndex++}`);
      params.push(new Date(startDate));
    }

    if (endDate) {
      whereClauses.push(`created_at <= $${paramIndex++}`);
      params.push(new Date(endDate));
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count
    const countSql = `SELECT COUNT(*) as count FROM ai_interaction_logs ${whereClause}`;
    const countResult = await queryOne<{ count: string }>(countSql, params);
    const total = parseInt(countResult?.count || '0', 10);

    // Get logs
    const sql = `
      SELECT * FROM ai_interaction_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const rows = await query<AIInteractionLogRow>(sql, [...params, limit, offset]);

    return {
      logs: rows.map(toAIInteractionLog),
      total,
    };
  }

  /**
   * Get logs for a document
   */
  static async getLogsByDocument(
    documentId: string,
    userId: string,
    limit = 50,
    offset = 0
  ): Promise<{ logs: AIInteractionLog[]; total: number }> {
    return this.getLogs({ documentId, userId, limit, offset });
  }

  /**
   * Delete logs for a document
   */
  static async deleteLogsByDocument(documentId: string, userId: string): Promise<number> {
    const sql = `
      DELETE FROM ai_interaction_logs
      WHERE document_id = $1 AND user_id = $2
      RETURNING id
    `;

    const rows = await query<{ id: string }>(sql, [documentId, userId]);
    return rows.length;
  }

  /**
   * Get AI question statistics for a document (for certificate generation)
   */
  static async getQuestionStatsByDocument(documentId: string): Promise<{
    totalQuestions: number;
    understandingQuestions: number;
    generationQuestions: number;
    otherQuestions: number;
  }> {
    const sql = `
      SELECT
        COUNT(*) as total_questions,
        COUNT(*) FILTER (WHERE question_category = 'understanding') as understanding_questions,
        COUNT(*) FILTER (WHERE question_category = 'generation') as generation_questions,
        COUNT(*) FILTER (WHERE question_category = 'other' OR question_category IS NULL) as other_questions
      FROM ai_interaction_logs
      WHERE document_id = $1 AND status = 'success'
    `;

    const row = await queryOne<{
      total_questions: string;
      understanding_questions: string;
      generation_questions: string;
      other_questions: string;
    }>(sql, [documentId]);

    return {
      totalQuestions: parseInt(row?.total_questions || '0'),
      understandingQuestions: parseInt(row?.understanding_questions || '0'),
      generationQuestions: parseInt(row?.generation_questions || '0'),
      otherQuestions: parseInt(row?.other_questions || '0'),
    };
  }
}
