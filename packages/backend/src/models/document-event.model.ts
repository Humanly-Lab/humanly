import { query, queryOne } from '../config/database';
import {
  DocumentEvent,
  DocumentEventInsertData,
  DocumentEventQueryFilters,
} from '@humanly/shared';

export interface EventMetrics {
  totalEvents: number;
  typingEvents: number;
  pasteEvents: number;
  copyEvents: number;
  cutEvents: number;
  firstEvent: Date | null;
  lastEvent: Date | null;
  editingDurationSeconds: number;
}

export class DocumentEventModel {
  /**
   * Batch insert document events efficiently using multi-value INSERT
   */
  static async batchInsert(events: DocumentEventInsertData[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    // Process in chunks of 1000 events to avoid query size limits
    const chunkSize = 1000;

    for (let i = 0; i < events.length; i += chunkSize) {
      const chunk = events.slice(i, i + chunkSize);
      await this.insertChunk(chunk);
    }
  }

  /**
   * Insert a chunk of events
   */
  private static async insertChunk(events: DocumentEventInsertData[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    // Build multi-value INSERT query
    const values: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    for (const event of events) {
      const valueGroup: string[] = [];

      valueGroup.push(`$${++paramCount}`); // document_id
      params.push(event.documentId);

      valueGroup.push(`$${++paramCount}`); // user_id
      params.push(event.userId);

      valueGroup.push(`$${++paramCount}`); // session_id
      params.push(event.sessionId || null);

      valueGroup.push(`$${++paramCount}`); // event_type
      params.push(event.eventType);

      valueGroup.push(`$${++paramCount}`); // timestamp
      params.push(event.timestamp);

      valueGroup.push(`$${++paramCount}`); // key_code
      params.push(event.keyCode || null);

      valueGroup.push(`$${++paramCount}`); // key_char
      params.push(event.keyChar || null);

      valueGroup.push(`$${++paramCount}`); // text_before
      params.push(event.textBefore ?? null);

      valueGroup.push(`$${++paramCount}`); // text_after
      params.push(event.textAfter ?? null);

      valueGroup.push(`$${++paramCount}`); // cursor_position
      params.push(event.cursorPosition ?? null);

      valueGroup.push(`$${++paramCount}`); // selection_start
      params.push(event.selectionStart ?? null);

      valueGroup.push(`$${++paramCount}`); // selection_end
      params.push(event.selectionEnd ?? null);

      valueGroup.push(`$${++paramCount}`); // editor_state_before
      params.push(event.editorStateBefore ? JSON.stringify(event.editorStateBefore) : null);

      valueGroup.push(`$${++paramCount}`); // editor_state_after
      params.push(event.editorStateAfter ? JSON.stringify(event.editorStateAfter) : null);

      valueGroup.push(`$${++paramCount}`); // metadata
      params.push(event.metadata ? JSON.stringify(event.metadata) : null);

      values.push(`(${valueGroup.join(', ')})`);
    }

    const sql = `
      INSERT INTO document_events (
        document_id, user_id, session_id, event_type, timestamp,
        key_code, key_char, text_before, text_after,
        cursor_position, selection_start, selection_end,
        editor_state_before, editor_state_after, metadata
      )
      VALUES ${values.join(', ')}
    `;

    await query(sql, params);
  }

  /**
   * Find events by document ID with optional filters
   */
  static async findByDocumentId(
    documentId: string,
    filters: DocumentEventQueryFilters = {}
  ): Promise<DocumentEvent[]> {
    const {
      eventType,
      startDate,
      endDate,
      limit = 1000,
      offset = 0,
    } = filters;

    let whereClauses = ['document_id = $1'];
    const params: any[] = [documentId];
    let paramIndex = 2;

    if (eventType) {
      if (Array.isArray(eventType)) {
        // Handle array of event types with IN clause
        const placeholders = eventType.map((_, i) => `$${paramIndex + i}`).join(', ');
        whereClauses.push(`event_type IN (${placeholders})`);
        params.push(...eventType);
        paramIndex += eventType.length;
      } else {
        // Handle single event type
        whereClauses.push(`event_type = $${paramIndex}`);
        params.push(eventType);
        paramIndex++;
      }
    }

    if (startDate) {
      whereClauses.push(`timestamp >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClauses.push(`timestamp <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = whereClauses.join(' AND ');

    const sql = `
      SELECT
        id,
        document_id as "documentId",
        user_id as "userId",
        session_id as "sessionId",
        event_type as "eventType",
        timestamp,
        key_code as "keyCode",
        key_char as "keyChar",
        text_before as "textBefore",
        text_after as "textAfter",
        cursor_position as "cursorPosition",
        selection_start as "selectionStart",
        selection_end as "selectionEnd",
        editor_state_before as "editorStateBefore",
        editor_state_after as "editorStateAfter",
        metadata,
        created_at as "createdAt"
      FROM document_events
      WHERE ${whereClause}
      ORDER BY timestamp DESC, created_at DESC, id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    return query<DocumentEvent>(sql, [...params, limit, offset]);
  }

  /**
   * Count events for a document
   */
  static async countByDocumentId(documentId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) as count
      FROM document_events
      WHERE document_id = $1
    `;

    const result = await queryOne<{ count: string }>(sql, [documentId]);
    return parseInt(result?.count || '0', 10);
  }

  /**
   * Count events for a document with filters
   */
  static async countByDocumentIdWithFilters(
    documentId: string,
    filters: DocumentEventQueryFilters = {}
  ): Promise<number> {
    const {
      eventType,
      startDate,
      endDate,
    } = filters;

    let whereClauses = ['document_id = $1'];
    const params: any[] = [documentId];
    let paramIndex = 2;

    if (eventType) {
      if (Array.isArray(eventType)) {
        // Handle array of event types with IN clause
        const placeholders = eventType.map((_, i) => `$${paramIndex + i}`).join(', ');
        whereClauses.push(`event_type IN (${placeholders})`);
        params.push(...eventType);
        paramIndex += eventType.length;
      } else {
        // Handle single event type
        whereClauses.push(`event_type = $${paramIndex}`);
        params.push(eventType);
        paramIndex++;
      }
    }

    if (startDate) {
      whereClauses.push(`timestamp >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClauses.push(`timestamp <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = whereClauses.join(' AND ');

    const sql = `
      SELECT COUNT(*) as count
      FROM document_events
      WHERE ${whereClause}
    `;

    const result = await queryOne<{ count: string }>(sql, params);
    return parseInt(result?.count || '0', 10);
  }

  /**
   * Get event metrics/statistics for a document
   */
  static async getEventMetrics(documentId: string): Promise<EventMetrics> {
    const sql = `
      SELECT
        COUNT(*) as total_events,
        COUNT(CASE WHEN event_type IN ('keydown', 'keyup', 'input') THEN 1 END) as typing_events,
        COUNT(CASE WHEN event_type = 'paste' THEN 1 END) as paste_events,
        COUNT(CASE WHEN event_type = 'copy' THEN 1 END) as copy_events,
        COUNT(CASE WHEN event_type = 'cut' THEN 1 END) as cut_events,
        MIN(timestamp) as first_event,
        MAX(timestamp) as last_event,
        COALESCE(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))), 0) as editing_duration_seconds
      FROM document_events
      WHERE document_id = $1
    `;

    const result = await queryOne<any>(sql, [documentId]);

    if (!result) {
      return {
        totalEvents: 0,
        typingEvents: 0,
        pasteEvents: 0,
        copyEvents: 0,
        cutEvents: 0,
        firstEvent: null,
        lastEvent: null,
        editingDurationSeconds: 0,
      };
    }

    return {
      totalEvents: parseInt(result.total_events || '0', 10),
      typingEvents: parseInt(result.typing_events || '0', 10),
      pasteEvents: parseInt(result.paste_events || '0', 10),
      copyEvents: parseInt(result.copy_events || '0', 10),
      cutEvents: parseInt(result.cut_events || '0', 10),
      firstEvent: result.first_event,
      lastEvent: result.last_event,
      editingDurationSeconds: parseFloat(result.editing_duration_seconds || '0'),
    };
  }

  /**
   * Calculate typing metrics for certificate generation
   */
  static async calculateTypingMetrics(documentId: string): Promise<{
    typedCharacters: number;
    pastedCharacters: number;
  }> {
    // Get all events with text_after field
    const sql = `
      SELECT
        event_type as "eventType",
        text_before as "textBefore",
        text_after as "textAfter"
      FROM document_events
      WHERE document_id = $1
        AND text_after IS NOT NULL
      ORDER BY timestamp ASC
    `;

    const events = await query<{
      eventType: string;
      textBefore: string | null;
      textAfter: string | null;
    }>(sql, [documentId]);

    let typedCharacters = 0;
    let pastedCharacters = 0;

    for (const event of events) {
      if (!event.textAfter) continue;

      const beforeLength = event.textBefore?.length || 0;
      const afterLength = event.textAfter.length;
      const difference = afterLength - beforeLength;

      if (difference > 0) {
        if (event.eventType === 'paste') {
          pastedCharacters += difference;
        } else if (event.eventType === 'keydown' || event.eventType === 'input') {
          typedCharacters += difference;
        }
      }
    }

    return { typedCharacters, pastedCharacters };
  }

  /**
   * Delete all events for a document (used when document is deleted)
   */
  static async deleteByDocumentId(documentId: string): Promise<number> {
    const sql = `
      DELETE FROM document_events
      WHERE document_id = $1
      RETURNING id
    `;

    const result = await query<{ id: string }>(sql, [documentId]);
    return result.length;
  }

  /**
   * Get recent events for a document (for live preview)
   */
  static async getRecentEvents(documentId: string, limit: number = 10): Promise<DocumentEvent[]> {
    const sql = `
      SELECT
        id,
        document_id as "documentId",
        user_id as "userId",
        event_type as "eventType",
        timestamp,
        key_code as "keyCode",
        key_char as "keyChar",
        text_before as "textBefore",
        text_after as "textAfter",
        cursor_position as "cursorPosition",
        selection_start as "selectionStart",
        selection_end as "selectionEnd",
        editor_state_before as "editorStateBefore",
        editor_state_after as "editorStateAfter",
        metadata,
        created_at as "createdAt"
      FROM document_events
      WHERE document_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const events = await query<DocumentEvent>(sql, [documentId, limit]);
    return events.reverse(); // Return in chronological order
  }
}
