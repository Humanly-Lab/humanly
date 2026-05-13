import { pool, query, queryOne } from '../config/database';
import { Event, TrackerEvent, EventType, EventQueryFilters } from '@humanly/shared';

export interface EventInsertData {
  sessionId: string;
  taskId: string;
  eventType: EventType;
  timestamp: Date;
  targetElement?: string;
  keyCode?: string;
  keyChar?: string;
  textBefore?: string;
  textAfter?: string;
  cursorPosition?: number;
  selectionStart?: number;
  selectionEnd?: number;
  metadata?: Record<string, any>;
}

export interface EventTypeCount {
  eventType: EventType;
  count: number;
}

export class EventModel {
  /**
   * Batch insert events efficiently using PostgreSQL COPY or multi-value INSERT
   */
  static async batchInsert(events: EventInsertData[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    // Use multi-value INSERT for batch efficiency
    // PostgreSQL can handle large batch inserts efficiently
    const chunkSize = 1000; // Process in chunks to avoid hitting query size limits

    for (let i = 0; i < events.length; i += chunkSize) {
      const chunk = events.slice(i, i + chunkSize);
      await this.insertChunk(chunk);
    }
  }

  /**
   * Insert a chunk of events
   */
  private static async insertChunk(events: EventInsertData[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    // Build multi-value INSERT query
    const values: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    for (const event of events) {
      const valueGroup: string[] = [];

      // Add each parameter
      valueGroup.push(`$${++paramCount}`); // session_id
      params.push(event.sessionId);

      valueGroup.push(`$${++paramCount}`); // task_id
      params.push(event.taskId);

      valueGroup.push(`$${++paramCount}`); // event_type
      params.push(event.eventType);

      valueGroup.push(`$${++paramCount}`); // timestamp
      params.push(event.timestamp);

      valueGroup.push(`$${++paramCount}`); // target_element
      params.push(event.targetElement || null);

      valueGroup.push(`$${++paramCount}`); // key_code
      params.push(event.keyCode || null);

      valueGroup.push(`$${++paramCount}`); // key_char
      params.push(event.keyChar || null);

      valueGroup.push(`$${++paramCount}`); // text_before
      params.push(event.textBefore || null);

      valueGroup.push(`$${++paramCount}`); // text_after
      params.push(event.textAfter || null);

      valueGroup.push(`$${++paramCount}`); // cursor_position
      params.push(event.cursorPosition ?? null);

      valueGroup.push(`$${++paramCount}`); // selection_start
      params.push(event.selectionStart ?? null);

      valueGroup.push(`$${++paramCount}`); // selection_end
      params.push(event.selectionEnd ?? null);

      valueGroup.push(`$${++paramCount}`); // metadata
      params.push(event.metadata ? JSON.stringify(event.metadata) : null);

      values.push(`(${valueGroup.join(', ')})`);
    }

    const sql = `
      INSERT INTO events (
        session_id,
        task_id,
        event_type,
        timestamp,
        target_element,
        key_code,
        key_char,
        text_before,
        text_after,
        cursor_position,
        selection_start,
        selection_end,
        metadata
      )
      VALUES ${values.join(', ')}
    `;

    await query(sql, params);
  }

  /**
   * Find events by session ID with pagination
   */
  static async findBySessionId(
    sessionId: string,
    limit: number = 1000,
    offset: number = 0
  ): Promise<Event[]> {
    const sql = `
      SELECT
        id,
        session_id as "sessionId",
        task_id as "taskId",
        event_type as "eventType",
        timestamp,
        target_element as "targetElement",
        key_code as "keyCode",
        key_char as "keyChar",
        text_before as "textBefore",
        text_after as "textAfter",
        cursor_position as "cursorPosition",
        selection_start as "selectionStart",
        selection_end as "selectionEnd",
        metadata,
        created_at as "createdAt"
      FROM events
      WHERE session_id = $1
      ORDER BY timestamp ASC
      LIMIT $2 OFFSET $3
    `;

    return query<Event>(sql, [sessionId, limit, offset]);
  }

  /**
   * Find events by task ID with filters and pagination
   */
  static async findByTaskId(
    taskId: string,
    filters: EventQueryFilters = {}
  ): Promise<Event[]> {
    const conditions: string[] = ['e.task_id = $1'];
    const params: any[] = [taskId];
    let paramCount = 1;

    // Add filters
    if (filters.sessionId) {
      paramCount++;
      conditions.push(`e.session_id = $${paramCount}`);
      params.push(filters.sessionId);
    }

    if (filters.externalUserId) {
      paramCount++;
      conditions.push(`s.external_user_id = $${paramCount}`);
      params.push(filters.externalUserId);
    }

    if (filters.startDate) {
      paramCount++;
      conditions.push(`e.timestamp >= $${paramCount}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      paramCount++;
      conditions.push(`e.timestamp <= $${paramCount}`);
      params.push(filters.endDate);
    }

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      paramCount++;
      conditions.push(`e.event_type = ANY($${paramCount})`);
      params.push(filters.eventTypes);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT
        e.id,
        e.session_id as "sessionId",
        e.task_id as "taskId",
        e.event_type as "eventType",
        e.timestamp,
        e.target_element as "targetElement",
        e.key_code as "keyCode",
        e.key_char as "keyChar",
        e.text_before as "textBefore",
        e.text_after as "textAfter",
        e.cursor_position as "cursorPosition",
        e.selection_start as "selectionStart",
        e.selection_end as "selectionEnd",
        e.metadata,
        e.created_at as "createdAt"
      FROM events e
      LEFT JOIN sessions s ON e.session_id = s.id
      WHERE ${whereClause}
      ORDER BY e.timestamp DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(filters.limit || 1000);
    params.push(filters.offset || 0);

    return query<Event>(sql, params);
  }

  /**
   * Count events by task ID with filters
   */
  static async countByTaskId(
    taskId: string,
    filters: EventQueryFilters = {}
  ): Promise<number> {
    const conditions: string[] = ['e.task_id = $1'];
    const params: any[] = [taskId];
    let paramCount = 1;

    if (filters.sessionId) {
      paramCount++;
      conditions.push(`e.session_id = $${paramCount}`);
      params.push(filters.sessionId);
    }

    if (filters.externalUserId) {
      paramCount++;
      conditions.push(`s.external_user_id = $${paramCount}`);
      params.push(filters.externalUserId);
    }

    if (filters.startDate) {
      paramCount++;
      conditions.push(`e.timestamp >= $${paramCount}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      paramCount++;
      conditions.push(`e.timestamp <= $${paramCount}`);
      params.push(filters.endDate);
    }

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      paramCount++;
      conditions.push(`e.event_type = ANY($${paramCount})`);
      params.push(filters.eventTypes);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT COUNT(*) as count
      FROM events e
      LEFT JOIN sessions s ON e.session_id = s.id
      WHERE ${whereClause}
    `;

    const result = await queryOne<{ count: string }>(sql, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Get event type distribution for a task
   */
  static async getEventTypes(taskId: string): Promise<EventTypeCount[]> {
    const sql = `
      SELECT
        event_type as "eventType",
        COUNT(*) as count
      FROM events
      WHERE task_id = $1
      GROUP BY event_type
      ORDER BY count DESC
    `;

    const results = await query<any>(sql, [taskId]);

    return results.map((row) => ({
      eventType: row.eventType,
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Count events by session ID
   */
  static async countBySessionId(sessionId: string): Promise<number> {
    const sql = `SELECT COUNT(*) as count FROM events WHERE session_id = $1`;
    const result = await queryOne<{ count: string }>(sql, [sessionId]);
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Delete events by session ID (for data cleanup)
   */
  static async deleteBySessionId(sessionId: string): Promise<void> {
    const sql = `DELETE FROM events WHERE session_id = $1`;
    await query(sql, [sessionId]);
  }

  /**
   * Delete events by task ID (for data cleanup)
   */
  static async deleteByTaskId(taskId: string): Promise<void> {
    const sql = `DELETE FROM events WHERE task_id = $1`;
    await query(sql, [taskId]);
  }
}
