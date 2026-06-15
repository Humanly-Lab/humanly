import { pool } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export type AIActionType = 'grammar' | 'improve' | 'simplify' | 'formal';
export type AIDecision = 'accepted' | 'rejected';

export interface AISelectionAction {
  id: string;
  documentId: string;
  userId: string;
  actionType: AIActionType;
  originalText: string;
  suggestedText: string;
  decision: AIDecision;
  finalText: string;
  responseTimeMs?: number;
  modelVersion?: string;
  createdAt: Date;
}

export interface CreateAISelectionActionInput {
  documentId: string;
  userId: string;
  actionType: AIActionType;
  originalText: string;
  suggestedText: string;
  decision: AIDecision;
  responseTimeMs?: number;
  modelVersion?: string;
}

export interface AISelectionActionStats {
  totalActions: number;
  grammarActions: number;
  improveActions: number;
  simplifyActions: number;
  formalActions: number;
  acceptedCount: number;
  rejectedCount: number;
  acceptanceRate: number;
}

export class AISelectionActionModel {
  /**
   * Create a new AI selection action record
   */
  static async create(input: CreateAISelectionActionInput): Promise<AISelectionAction> {
    const id = uuidv4();
    const finalText = input.decision === 'accepted' ? input.suggestedText : input.originalText;

    const query = `
      INSERT INTO ai_selection_actions (
        id, document_id, user_id, action_type, original_text, suggested_text,
        decision, final_text, response_time_ms, model_version
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      id,
      input.documentId,
      input.userId,
      input.actionType,
      input.originalText,
      input.suggestedText,
      input.decision,
      finalText,
      input.responseTimeMs || null,
      input.modelVersion || null,
    ];

    const result = await pool.query(query, values);
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get all AI selection actions for a document
   */
  static async findByDocumentId(documentId: string): Promise<AISelectionAction[]> {
    const query = `
      SELECT * FROM ai_selection_actions
      WHERE document_id = $1
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [documentId]);
    return result.rows.map(this.mapRow);
  }

  /**
   * Get statistics for a document's AI selection actions
   */
  static async getStatsByDocumentId(
    documentId: string,
    filters: { endDate?: Date | string } = {}
  ): Promise<AISelectionActionStats> {
    const whereClauses = ['document_id = $1'];
    const params: any[] = [documentId];

    if (filters.endDate) {
      whereClauses.push(`created_at <= $${params.length + 1}`);
      params.push(new Date(filters.endDate));
    }

    const query = `
      SELECT
        COUNT(*) as total_actions,
        COUNT(*) FILTER (WHERE action_type = 'grammar') as grammar_actions,
        COUNT(*) FILTER (WHERE action_type = 'improve') as improve_actions,
        COUNT(*) FILTER (WHERE action_type = 'simplify') as simplify_actions,
        COUNT(*) FILTER (WHERE action_type = 'formal') as formal_actions,
        COUNT(*) FILTER (WHERE decision = 'accepted') as accepted_count,
        COUNT(*) FILTER (WHERE decision = 'rejected') as rejected_count
      FROM ai_selection_actions
      WHERE ${whereClauses.join(' AND ')}
    `;

    const result = await pool.query(query, params);
    const row = result.rows[0];

    const totalActions = parseInt(row.total_actions) || 0;
    const acceptedCount = parseInt(row.accepted_count) || 0;
    const rejectedCount = parseInt(row.rejected_count) || 0;

    return {
      totalActions,
      grammarActions: parseInt(row.grammar_actions) || 0,
      improveActions: parseInt(row.improve_actions) || 0,
      simplifyActions: parseInt(row.simplify_actions) || 0,
      formalActions: parseInt(row.formal_actions) || 0,
      acceptedCount,
      rejectedCount,
      acceptanceRate: totalActions > 0 ? (acceptedCount / totalActions) * 100 : 0,
    };
  }

  /**
   * Map database row to AISelectionAction interface
   */
  private static mapRow(row: any): AISelectionAction {
    return {
      id: row.id,
      documentId: row.document_id,
      userId: row.user_id,
      actionType: row.action_type,
      originalText: row.original_text,
      suggestedText: row.suggested_text,
      decision: row.decision,
      finalText: row.final_text,
      responseTimeMs: row.response_time_ms,
      modelVersion: row.model_version,
      createdAt: new Date(row.created_at),
    };
  }
}
