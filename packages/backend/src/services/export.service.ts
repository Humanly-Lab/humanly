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

/**
 * Service for exporting event data in various formats
 */
export class ExportService {
  /**
   * Export events to JSON format with streaming
   */
  static async exportToJSON(
    taskId: string,
    userId: string,
    filters: ExportFilters = {}
  ): Promise<{ stream: Readable; metadata: ExportMetadata }> {
    try {
      // Verify task ownership
      const ownsTask = await TaskModel.verifyOwnership(taskId, userId);
      if (!ownsTask) {
        throw new AppError(403, 'You do not have access to this task');
      }

      // Get task details
      const task = await TaskModel.findById(taskId);
      if (!task) {
        throw new AppError(404, 'Task not found');
      }

      // Build query
      const { sql, params } = this.buildExportQuery(taskId, filters);

      // Get total count
      const totalEvents = await this.getEventCount(taskId, filters);

      // Create metadata
      const metadata: ExportMetadata = {
        taskId: task.id,
        taskName: task.name,
        exportDate: new Date().toISOString(),
        filters,
        totalEvents,
      };

      const client = await pool.connect();
      let rows: any[] = [];
      try {
        const result = await client.query({
          text: sql,
          values: params,
          rowMode: 'array',
        });
        rows = result.rows;
      } finally {
        client.release();
      }

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
        '  "events": [\n',
      ];

      rows.forEach((row, index) => {
        if (index > 0) chunks.push(',\n');
        chunks.push('    ' + JSON.stringify(this.mapRowToEvent(row)));
      });

      chunks.push('\n  ]\n');
      chunks.push('}\n');

      const stream = Readable.from(chunks);

      logger.info('JSON export completed', {
        taskId,
        userId,
        eventCount: rows.length,
        filters,
      });

      return { stream, metadata };
    } catch (error) {
      logger.error('Failed to export to JSON', {
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Export events to CSV format with streaming
   */
  static async exportToCSV(
    taskId: string,
    userId: string,
    filters: ExportFilters = {}
  ): Promise<{ stream: Readable; metadata: ExportMetadata }> {
    try {
      // Verify task ownership
      const ownsTask = await TaskModel.verifyOwnership(taskId, userId);
      if (!ownsTask) {
        throw new AppError(403, 'You do not have access to this task');
      }

      // Get task details
      const task = await TaskModel.findById(taskId);
      if (!task) {
        throw new AppError(404, 'Task not found');
      }

      // Build query
      const { sql, params } = this.buildExportQuery(taskId, filters);

      // Get total count
      const totalEvents = await this.getEventCount(taskId, filters);

      // Create metadata
      const metadata: ExportMetadata = {
        taskId: task.id,
        taskName: task.name,
        exportDate: new Date().toISOString(),
        filters,
        totalEvents,
      };

      const client = await pool.connect();
      let rows: any[] = [];
      try {
        const result = await client.query({
          text: sql,
          values: params,
          rowMode: 'array',
        });
        rows = result.rows;
      } finally {
        client.release();
      }

      const headers = [
        'id',
        'session_id',
        'task_id',
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
      const stream = Readable.from(chunks);

      logger.info('CSV export completed', {
        taskId,
        userId,
        eventCount: rows.length,
        filters,
      });

      return { stream, metadata };
    } catch (error) {
      logger.error('Failed to export to CSV', {
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Build SQL query for exporting events with filters
   */
  private static buildExportQuery(
    taskId: string,
    filters: ExportFilters
  ): { sql: string; params: any[] } {
    const conditions: string[] = ['e.task_id = $1'];
    const params: any[] = [taskId];
    let paramCount = 1;

    // Date range filters
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

    // Session IDs filter
    if (filters.sessionIds && filters.sessionIds.length > 0) {
      paramCount++;
      conditions.push(`e.session_id = ANY($${paramCount})`);
      params.push(filters.sessionIds);
    }

    // User IDs filter (external user IDs)
    if (filters.userIds && filters.userIds.length > 0) {
      paramCount++;
      conditions.push(`s.external_user_id = ANY($${paramCount})`);
      params.push(filters.userIds);
    }

    const whereClause = conditions.join(' AND ');

    // Query with all event fields and external_user_id from sessions
    const sql = `
      SELECT
        e.id,
        e.session_id,
        e.task_id,
        s.external_user_id,
        e.event_type,
        e.timestamp,
        e.target_element,
        e.key_code,
        e.key_char,
        e.text_before,
        e.text_after,
        e.cursor_position,
        e.selection_start,
        e.selection_end,
        e.metadata
      FROM events e
      LEFT JOIN sessions s ON e.session_id = s.id
      WHERE ${whereClause}
      ORDER BY e.timestamp ASC
    `;

    return { sql, params };
  }

  /**
   * Get total event count for export
   */
  private static async getEventCount(
    taskId: string,
    filters: ExportFilters
  ): Promise<number> {
    const conditions: string[] = ['e.task_id = $1'];
    const params: any[] = [taskId];
    let paramCount = 1;

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

    if (filters.sessionIds && filters.sessionIds.length > 0) {
      paramCount++;
      conditions.push(`e.session_id = ANY($${paramCount})`);
      params.push(filters.sessionIds);
    }

    if (filters.userIds && filters.userIds.length > 0) {
      paramCount++;
      conditions.push(`s.external_user_id = ANY($${paramCount})`);
      params.push(filters.userIds);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT COUNT(*) as count
      FROM events e
      LEFT JOIN sessions s ON e.session_id = s.id
      WHERE ${whereClause}
    `;

    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      return parseInt(result.rows[0].count, 10);
    } finally {
      client.release();
    }
  }

  /**
   * Map database row to Event object
   */
  private static mapRowToEvent(row: any[]): any {
    return {
      id: row[0],
      sessionId: row[1],
      taskId: row[2],
      externalUserId: row[3],
      eventType: row[4],
      timestamp: row[5],
      targetElement: row[6],
      keyCode: row[7],
      keyChar: row[8],
      textBefore: row[9],
      textAfter: row[10],
      cursorPosition: row[11],
      selectionStart: row[12],
      selectionEnd: row[13],
      metadata: row[14],
    };
  }

  /**
   * Flatten event object to CSV row with proper escaping
   */
  private static flattenEventToCSV(row: any[]): string {
    const values = [
      row[0], // id
      row[1], // session_id
      row[2], // task_id
      row[3], // external_user_id
      row[4], // event_type
      row[5], // timestamp
      row[6], // target_element
      row[7], // key_code
      row[8], // key_char
      row[9], // text_before
      row[10], // text_after
      row[11], // cursor_position
      row[12], // selection_start
      row[13], // selection_end
      row[14] ? JSON.stringify(row[14]) : '', // metadata as JSON string
    ];

    // Escape and quote CSV values
    return values
      .map((value) => {
        if (value === null || value === undefined) {
          return '';
        }

        const stringValue = String(value);

        // If value contains comma, quote, or newline, wrap in quotes and escape quotes
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

  /**
   * Generate filename for export download
   */
  static generateFilename(
    taskId: string,
    format: 'json' | 'csv',
    date: Date = new Date()
  ): string {
    const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `humanly-export-${taskId}-${timestamp}.${format}`;
  }
}
