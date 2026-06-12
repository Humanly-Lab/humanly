import { Readable } from 'stream';
import { pool } from '../config/database';
import { TaskModel } from '../models/task.model';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

export interface ExportFilters {
  startDate?: string;
  endDate?: string;
  sessionIds?: string[];
  userIds?: string[];
}

export interface ExportMetadata {
  taskId: string;
  taskName: string;
  exportDate: string;
  filters: ExportFilters;
  totalEvents: number;
}

type ExportRow = [
  eventSource: 'tracker' | 'document',
  id: string,
  sessionId: string | null,
  taskId: string,
  externalUserId: string | null,
  eventType: string,
  timestamp: Date,
  targetElement: string | null,
  keyCode: string | null,
  keyChar: string | null,
  textBefore: string | null,
  textAfter: string | null,
  cursorPosition: number | null,
  selectionStart: number | null,
  selectionEnd: number | null,
  metadata: Record<string, any> | null,
  documentId: string | null,
  userId: string | null,
];

interface ExportSubmissionSummary {
  id: string;
  taskId: string;
  userId: string;
  documentId: string;
  certificateId: string | null;
  certificateVerificationToken: string | null;
  submittedAt: Date;
  status: string;
  anomalyFlags: Record<string, any>[];
}

/**
 * Service for exporting task activity in various formats.
 *
 * Humanly currently has two task-event stores:
 * - `events`: legacy tracker/embed events keyed directly by task/session
 * - `document_events`: user-portal editor events keyed by submission document
 *
 * Exports intentionally union both sources and expose `eventSource` so callers
 * can distinguish them without losing task-level completeness.
 */
export class ExportService {
  static async exportToJSON(
    taskId: string,
    userId: string,
    filters: ExportFilters = {}
  ): Promise<{ stream: Readable; metadata: ExportMetadata }> {
    try {
      const task = await this.verifyTaskAccess(taskId, userId);
      const { sql, params } = this.buildExportQuery(taskId, filters);
      const totalEvents = await this.getEventCount(taskId, filters);
      const submissions = await this.fetchSubmissionSummaries(taskId);

      const metadata: ExportMetadata = {
        taskId: task.id,
        taskName: task.name,
        exportDate: new Date().toISOString(),
        filters,
        totalEvents,
      };

      const rows = await this.fetchRows(sql, params);

      const chunks: string[] = [
        '{\n',
        `  "task": ${JSON.stringify({
          id: task.id,
          name: task.name,
          description: task.description,
        })},\n`,
        `  "exportDate": "${metadata.exportDate}",\n`,
        `  "filters": ${JSON.stringify(filters)},\n`,
        `  "totalEvents": ${totalEvents},\n`,
        `  "submissions": ${JSON.stringify(submissions.map((submission) => ({
          ...submission,
          submittedAt: submission.submittedAt.toISOString(),
        })))},\n`,
        '  "events": [\n',
      ];

      rows.forEach((row, index) => {
        if (index > 0) chunks.push(',\n');
        chunks.push('    ' + JSON.stringify(this.mapRowToEvent(row)));
      });

      chunks.push('\n  ]\n');
      chunks.push('}\n');

      logger.info('JSON export completed', {
        taskId,
        userId,
        eventCount: rows.length,
        filters,
      });

      return { stream: Readable.from(chunks), metadata };
    } catch (error) {
      logger.error('Failed to export to JSON', {
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId,
        userId,
      });
      throw error;
    }
  }

  static async exportToCSV(
    taskId: string,
    userId: string,
    filters: ExportFilters = {}
  ): Promise<{ stream: Readable; metadata: ExportMetadata }> {
    try {
      const task = await this.verifyTaskAccess(taskId, userId);
      const { sql, params } = this.buildExportQuery(taskId, filters);
      const totalEvents = await this.getEventCount(taskId, filters);

      const metadata: ExportMetadata = {
        taskId: task.id,
        taskName: task.name,
        exportDate: new Date().toISOString(),
        filters,
        totalEvents,
      };

      const rows = await this.fetchRows(sql, params);
      const headers = [
        'event_source',
        'id',
        'session_id',
        'task_id',
        'document_id',
        'user_id',
        'external_user_id',
        'event_type',
        'timestamp',
        'target_element',
        'key_code',
        'key_char',
        'text_before',
        'text_after',
        'cursor_position',
        'selection_start',
        'selection_end',
        'metadata_json',
      ];

      const chunks = [
        `${headers.join(',')}\n`,
        ...rows.map((row) => `${this.flattenEventToCSV(row)}\n`),
      ];

      logger.info('CSV export completed', {
        taskId,
        userId,
        eventCount: rows.length,
        filters,
      });

      return { stream: Readable.from(chunks), metadata };
    } catch (error) {
      logger.error('Failed to export to CSV', {
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId,
        userId,
      });
      throw error;
    }
  }

  private static async verifyTaskAccess(taskId: string, userId: string) {
    const ownsTask = await TaskModel.verifyOwnership(taskId, userId);
    if (!ownsTask) {
      throw new AppError(403, 'You do not have access to this task');
    }

    const task = await TaskModel.findById(taskId);
    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    return task;
  }

  private static async fetchRows(sql: string, params: any[]): Promise<ExportRow[]> {
    const client = await pool.connect();
    try {
      const result = await client.query({
        text: sql,
        values: params,
        rowMode: 'array',
      });
      return result.rows as ExportRow[];
    } finally {
      client.release();
    }
  }

  private static async fetchSubmissionSummaries(taskId: string): Promise<ExportSubmissionSummary[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT
          s.id::text as "id",
          s.task_id::text as "taskId",
          s.user_id::text as "userId",
          s.document_id::text as "documentId",
          s.certificate_id::text as "certificateId",
          c.verification_token as "certificateVerificationToken",
          s.submitted_at as "submittedAt",
          s.status,
          COALESCE(s.anomaly_flags, c.anomaly_flags, '[]'::jsonb) as "anomalyFlags"
        FROM submissions s
        LEFT JOIN certificates c ON c.id = s.certificate_id
        WHERE s.task_id = $1
        ORDER BY s.submitted_at ASC, s.created_at ASC
      `, [taskId]);

      return result.rows as ExportSubmissionSummary[];
    } finally {
      client.release();
    }
  }

  private static buildExportQuery(
    taskId: string,
    filters: ExportFilters
  ): { sql: string; params: any[] } {
    const trackerConditions: string[] = ['e.task_id = $1'];
    const documentConditions: string[] = ['te.task_id = $1'];
    const params: any[] = [taskId];
    let paramCount = 1;

    if (filters.startDate) {
      paramCount++;
      trackerConditions.push(`e.timestamp >= $${paramCount}`);
      documentConditions.push(`de.timestamp >= $${paramCount}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      paramCount++;
      trackerConditions.push(`e.timestamp <= $${paramCount}`);
      documentConditions.push(`de.timestamp <= $${paramCount}`);
      params.push(filters.endDate);
    }

    if (filters.sessionIds && filters.sessionIds.length > 0) {
      paramCount++;
      trackerConditions.push(`e.session_id = ANY($${paramCount})`);
      documentConditions.push(`de.session_id = ANY($${paramCount})`);
      params.push(filters.sessionIds);
    }

    if (filters.userIds && filters.userIds.length > 0) {
      paramCount++;
      trackerConditions.push(`s.external_user_id = ANY($${paramCount})`);
      documentConditions.push(`u.email = ANY($${paramCount})`);
      params.push(filters.userIds);
    }

    const trackerWhereClause = trackerConditions.join(' AND ');
    const documentWhereClause = documentConditions.join(' AND ');

    const sql = `
      WITH exported_events AS (
        SELECT
          'tracker'::text as event_source,
          e.id::text as id,
          e.session_id::text as session_id,
          e.task_id::text as task_id,
          s.external_user_id,
          e.event_type::text as event_type,
          e.timestamp,
          e.target_element,
          e.key_code,
          e.key_char,
          e.text_before,
          e.text_after,
          e.cursor_position,
          e.selection_start,
          e.selection_end,
          e.metadata,
          NULL::text as document_id,
          NULL::text as user_id
        FROM events e
        LEFT JOIN sessions s ON e.session_id = s.id
        WHERE ${trackerWhereClause}
        UNION ALL
        SELECT
          'document'::text as event_source,
          de.id::text as id,
          de.session_id::text as session_id,
          te.task_id::text as task_id,
          u.email as external_user_id,
          de.event_type::text as event_type,
          de.timestamp,
          NULL::text as target_element,
          de.key_code,
          de.key_char,
          de.text_before,
          de.text_after,
          de.cursor_position,
          de.selection_start,
          de.selection_end,
          de.metadata,
          de.document_id::text as document_id,
          de.user_id::text as user_id
        FROM task_enrollments te
        JOIN document_events de ON de.document_id = te.submission_document_id
        JOIN users u ON u.id = de.user_id
        WHERE ${documentWhereClause}
      )
      SELECT
        event_source,
        id,
        session_id,
        task_id,
        external_user_id,
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
        metadata,
        document_id,
        user_id
      FROM exported_events
      ORDER BY timestamp ASC
    `;

    return { sql, params };
  }

  private static async getEventCount(
    taskId: string,
    filters: ExportFilters
  ): Promise<number> {
    const { sql, params } = this.buildExportQuery(taskId, filters);
    const countSql = `SELECT COUNT(*) as count FROM (${sql.replace(/ORDER BY timestamp ASC\s*$/m, '')}) exported_count`;

    const client = await pool.connect();
    try {
      const result = await client.query(countSql, params);
      return parseInt(result.rows[0].count, 10);
    } finally {
      client.release();
    }
  }

  private static mapRowToEvent(row: ExportRow): Record<string, any> {
    return {
      eventSource: row[0],
      id: row[1],
      sessionId: row[2],
      taskId: row[3],
      externalUserId: row[4],
      eventType: row[5],
      timestamp: row[6],
      targetElement: row[7],
      keyCode: row[8],
      keyChar: row[9],
      textBefore: row[10],
      textAfter: row[11],
      cursorPosition: row[12],
      selectionStart: row[13],
      selectionEnd: row[14],
      metadata: row[15],
      documentId: row[16],
      userId: row[17],
    };
  }

  private static flattenEventToCSV(row: ExportRow): string {
    const values = [
      row[0],
      row[1],
      row[2],
      row[3],
      row[16],
      row[17],
      row[4],
      row[5],
      row[6],
      row[7],
      row[8],
      row[9],
      row[10],
      row[11],
      row[12],
      row[13],
      row[14],
      row[15] ? JSON.stringify(row[15]) : '',
    ];

    return values
      .map((value) => {
        if (value === null || value === undefined) {
          return '';
        }

        const stringValue = String(value);

        if (
          stringValue.includes(',') ||
          stringValue.includes('"') ||
          stringValue.includes('\n') ||
          stringValue.includes('\r')
        ) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }

        return stringValue;
      })
      .join(',');
  }

  static generateFilename(
    taskId: string,
    format: 'json' | 'csv',
    date: Date = new Date()
  ): string {
    const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `humanly-export-${taskId}-${timestamp}.${format}`;
  }
}
