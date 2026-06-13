import { query, queryOne } from '../config/database';
import {
  DocumentEvent,
  DocumentEventInsertData,
  DocumentEventQueryFilters,
  AwayFromWorkspaceStats,
  WritingAnomalyThresholds,
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

export interface AnomalyTypingSpeedFeature {
  maxCharsInWindow: number;
  windowSeconds: number;
  charsPerMinute: number;
}

export interface AnomalyCadenceFeature {
  intervalCount: number;
  meanIntervalMs: number | null;
  stddevIntervalMs: number | null;
  minIntervalMs: number | null;
  maxIntervalMs: number | null;
}

export interface AnomalyTextInfluxFeature {
  eventType: string | null;
  timestamp: Date | null;
  addedCharacters: number;
}

export interface AnomalyFocusInfluxFeature {
  blurTimestamp: Date | null;
  focusTimestamp: Date | null;
  addedCharacters: number;
}

export interface AnomalyClockSkewFeature {
  sessionId: string | null;
  eventCount: number;
  clientSpanSeconds: number;
  serverSpanSeconds: number;
}

export interface DocumentAnomalyAnalysisFeatures {
  totalEvents: number;
  typingEvents: number;
  pasteEvents: number;
  speed: AnomalyTypingSpeedFeature;
  cadence: AnomalyCadenceFeature;
  textInflux: AnomalyTextInfluxFeature;
  focusInflux: AnomalyFocusInfluxFeature;
  awayFromWorkspace: AwayFromWorkspaceStats;
  clockSkew: AnomalyClockSkewFeature;
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

  static async getAwayFromWorkspaceStats(documentId: string): Promise<AwayFromWorkspaceStats> {
    const sql = `
      WITH visibility_events AS (
        SELECT
          event_type,
          CASE
            WHEN event_type = 'page_visible'
              AND metadata ? 'hiddenDurationMs'
              AND (metadata->>'hiddenDurationMs') ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN GREATEST((metadata->>'hiddenDurationMs')::numeric, 0)
            ELSE 0
          END as away_ms
        FROM document_events
        WHERE document_id = $1
          AND event_type IN ('page_hidden', 'page_visible')
      )
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'page_hidden')::int as left_count,
        COUNT(*) FILTER (WHERE event_type = 'page_visible')::int as returned_count,
        COALESCE(SUM(away_ms), 0)::float as total_away_ms,
        COALESCE(MAX(away_ms), 0)::float as longest_away_ms
      FROM visibility_events
    `;

    const result = await queryOne<any>(sql, [documentId]);

    return {
      leftCount: parseInt(result?.left_count || '0', 10),
      returnedCount: parseInt(result?.returned_count || '0', 10),
      totalAwayMs: Math.round(parseFloat(result?.total_away_ms || '0')),
      longestAwayMs: Math.round(parseFloat(result?.longest_away_ms || '0')),
    };
  }

  static async getAnomalyAnalysisFeatures(
    documentId: string,
    thresholds: WritingAnomalyThresholds
  ): Promise<DocumentAnomalyAnalysisFeatures> {
    const [metrics, speed, cadence, textInflux, focusInflux, awayFromWorkspace, clockSkew] = await Promise.all([
      this.getEventMetrics(documentId),
      this.getTypingSpeedFeature(documentId, thresholds.highSpeedWindowSeconds),
      this.getCadenceFeature(documentId),
      this.getTextInfluxFeature(documentId, thresholds.textInfluxMinimumCharacters),
      this.getFocusInfluxFeature(documentId, thresholds.focusInfluxWindowSeconds),
      this.getAwayFromWorkspaceStats(documentId),
      this.getClockSkewFeature(documentId, thresholds.clockSkewMinimumEvents),
    ]);

    return {
      totalEvents: metrics.totalEvents,
      typingEvents: metrics.typingEvents,
      pasteEvents: metrics.pasteEvents,
      speed,
      cadence,
      textInflux,
      focusInflux,
      awayFromWorkspace,
      clockSkew,
    };
  }

  private static async getTypingSpeedFeature(
    documentId: string,
    windowSeconds: number
  ): Promise<AnomalyTypingSpeedFeature> {
    const sql = `
      WITH typing_events AS (
        SELECT
          timestamp,
          GREATEST(
            CASE
              WHEN text_after IS NOT NULL AND text_before IS NOT NULL
                THEN char_length(text_after) - char_length(text_before)
              ELSE 0
            END,
            CASE
              WHEN event_type = 'keydown' AND key_char IS NOT NULL AND char_length(key_char) = 1
                THEN 1
              ELSE 0
            END
          ) as added_chars
        FROM document_events
        WHERE document_id = $1
          AND event_type IN ('keydown', 'input')
      ),
      positive_typing_events AS (
        SELECT timestamp, added_chars
        FROM typing_events
        WHERE added_chars > 0
      ),
      windowed AS (
        SELECT
          timestamp,
          SUM(added_chars) OVER (
            ORDER BY timestamp
            RANGE BETWEEN ($2::int * INTERVAL '1 second') PRECEDING AND CURRENT ROW
          ) as chars_in_window
        FROM positive_typing_events
      )
      SELECT COALESCE(MAX(chars_in_window), 0)::int as max_chars_in_window
      FROM windowed
    `;

    const result = await queryOne<{ max_chars_in_window: number | string }>(sql, [
      documentId,
      windowSeconds,
    ]);
    const maxCharsInWindow = parseInt(String(result?.max_chars_in_window || '0'), 10);

    return {
      maxCharsInWindow,
      windowSeconds,
      charsPerMinute: windowSeconds > 0 ? Math.round((maxCharsInWindow / windowSeconds) * 60) : 0,
    };
  }

  private static async getCadenceFeature(documentId: string): Promise<AnomalyCadenceFeature> {
    const sql = `
      WITH key_events AS (
        SELECT timestamp
        FROM document_events
        WHERE document_id = $1
          AND event_type = 'keydown'
          AND key_char IS NOT NULL
        ORDER BY timestamp ASC, created_at ASC, id ASC
      ),
      deltas AS (
        SELECT
          EXTRACT(EPOCH FROM (timestamp - LAG(timestamp) OVER (ORDER BY timestamp ASC))) * 1000 as interval_ms
        FROM key_events
      ),
      usable_deltas AS (
        SELECT interval_ms
        FROM deltas
        WHERE interval_ms > 0 AND interval_ms <= 5000
      )
      SELECT
        COUNT(*)::int as interval_count,
        AVG(interval_ms) as mean_interval_ms,
        STDDEV_POP(interval_ms) as stddev_interval_ms,
        MIN(interval_ms) as min_interval_ms,
        MAX(interval_ms) as max_interval_ms
      FROM usable_deltas
    `;

    const result = await queryOne<any>(sql, [documentId]);

    return {
      intervalCount: parseInt(result?.interval_count || '0', 10),
      meanIntervalMs: result?.mean_interval_ms === null || result?.mean_interval_ms === undefined
        ? null
        : parseFloat(result.mean_interval_ms),
      stddevIntervalMs: result?.stddev_interval_ms === null || result?.stddev_interval_ms === undefined
        ? null
        : parseFloat(result.stddev_interval_ms),
      minIntervalMs: result?.min_interval_ms === null || result?.min_interval_ms === undefined
        ? null
        : parseFloat(result.min_interval_ms),
      maxIntervalMs: result?.max_interval_ms === null || result?.max_interval_ms === undefined
        ? null
        : parseFloat(result.max_interval_ms),
    };
  }

  private static async getTextInfluxFeature(
    documentId: string,
    minimumCharacters: number
  ): Promise<AnomalyTextInfluxFeature> {
    const sql = `
      WITH deltas AS (
        SELECT
          event_type,
          timestamp,
          GREATEST(char_length(COALESCE(text_after, '')) - char_length(COALESCE(text_before, '')), 0) as added_chars
        FROM document_events
        WHERE document_id = $1
          AND text_after IS NOT NULL
      )
      SELECT
        event_type,
        timestamp,
        added_chars::int
      FROM deltas
      WHERE added_chars >= $2
        AND event_type NOT IN (
          'keydown',
          'input',
          'paste',
          'ai_modification_applied',
          'ai_insert_from_chat',
          'ai_selection_action',
          'replace',
          'replace-all'
        )
      ORDER BY added_chars DESC, timestamp ASC
      LIMIT 1
    `;

    const result = await queryOne<{
      event_type: string;
      timestamp: Date;
      added_chars: number | string;
    }>(sql, [documentId, minimumCharacters]);

    return {
      eventType: result?.event_type || null,
      timestamp: result?.timestamp || null,
      addedCharacters: parseInt(String(result?.added_chars || '0'), 10),
    };
  }

  private static async getFocusInfluxFeature(
    documentId: string,
    windowSeconds: number
  ): Promise<AnomalyFocusInfluxFeature> {
    const sql = `
      WITH focus_events AS (
        SELECT
          focus_event.timestamp as focus_timestamp,
          (
            SELECT MAX(blur_event.timestamp)
            FROM document_events blur_event
            WHERE blur_event.document_id = $1
              AND blur_event.event_type = 'blur'
              AND blur_event.timestamp < focus_event.timestamp
          ) as blur_timestamp
        FROM document_events focus_event
        WHERE focus_event.document_id = $1
          AND focus_event.event_type = 'focus'
      ),
      focus_windows AS (
        SELECT *
        FROM focus_events
        WHERE blur_timestamp IS NOT NULL
      ),
      influx AS (
        SELECT
          focus_windows.blur_timestamp,
          focus_windows.focus_timestamp,
          COALESCE(SUM(GREATEST(
            char_length(COALESCE(event.text_after, '')) - char_length(COALESCE(event.text_before, '')),
            0
          )), 0)::int as added_chars
        FROM focus_windows
        LEFT JOIN document_events event
          ON event.document_id = $1
          AND event.timestamp >= focus_windows.focus_timestamp
          AND event.timestamp <= focus_windows.focus_timestamp + ($2::int * INTERVAL '1 second')
          AND event.event_type IN ('keydown', 'input', 'paste')
        GROUP BY focus_windows.blur_timestamp, focus_windows.focus_timestamp
      )
      SELECT blur_timestamp, focus_timestamp, added_chars
      FROM influx
      ORDER BY added_chars DESC, focus_timestamp ASC
      LIMIT 1
    `;

    const result = await queryOne<{
      blur_timestamp: Date;
      focus_timestamp: Date;
      added_chars: number | string;
    }>(sql, [documentId, windowSeconds]);

    return {
      blurTimestamp: result?.blur_timestamp || null,
      focusTimestamp: result?.focus_timestamp || null,
      addedCharacters: parseInt(String(result?.added_chars || '0'), 10),
    };
  }

  private static async getClockSkewFeature(
    documentId: string,
    minimumEvents: number
  ): Promise<AnomalyClockSkewFeature> {
    const sql = `
      WITH session_spans AS (
        SELECT
          session_id,
          COUNT(*)::int as event_count,
          COALESCE(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))), 0) as client_span_seconds,
          COALESCE(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))), 0) as server_span_seconds
        FROM document_events
        WHERE document_id = $1
        GROUP BY session_id
      )
      SELECT
        session_id,
        event_count,
        client_span_seconds,
        server_span_seconds
      FROM session_spans
      WHERE event_count >= $2
      ORDER BY (client_span_seconds - server_span_seconds) DESC, event_count DESC
      LIMIT 1
    `;

    const result = await queryOne<any>(sql, [documentId, minimumEvents]);

    return {
      sessionId: result?.session_id || null,
      eventCount: parseInt(result?.event_count || '0', 10),
      clientSpanSeconds: parseFloat(result?.client_span_seconds || '0'),
      serverSpanSeconds: parseFloat(result?.server_span_seconds || '0'),
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
