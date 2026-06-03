import { query, queryOne } from '../config/database';
import { Session, SessionWithStats } from '@humanly/shared';

export interface CreateSessionData {
  taskId: string;
  externalUserId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionFilters {
  externalUserId?: string;
  startDate?: Date;
  endDate?: Date;
  submitted?: boolean;
  limit?: number;
  offset?: number;
}

export class SessionModel {
  /**
   * Create a new session
   */
  static async create(data: CreateSessionData): Promise<Session> {
    const sql = `
      INSERT INTO sessions (
        task_id,
        external_user_id,
        session_start,
        ip_address,
        user_agent
      )
      VALUES ($1, $2, NOW(), $3, $4)
      RETURNING
        id,
        task_id as "taskId",
        external_user_id as "externalUserId",
        session_start as "sessionStart",
        session_end as "sessionEnd",
        submitted,
        submission_time as "submissionTime",
        ip_address as "ipAddress",
        user_agent as "userAgent",
        created_at as "createdAt"
    `;

    const session = await queryOne<Session>(sql, [
      data.taskId,
      data.externalUserId,
      data.ipAddress || null,
      data.userAgent || null,
    ]);

    if (!session) {
      throw new Error('Failed to create session');
    }

    return session;
  }

  /**
   * Find session by ID
   */
  static async findById(sessionId: string): Promise<Session | null> {
    const sql = `
      SELECT
        id,
        task_id as "taskId",
        external_user_id as "externalUserId",
        session_start as "sessionStart",
        session_end as "sessionEnd",
        submitted,
        submission_time as "submissionTime",
        ip_address as "ipAddress",
        user_agent as "userAgent",
        created_at as "createdAt"
      FROM sessions
      WHERE id = $1
    `;

    return queryOne<Session>(sql, [sessionId]);
  }

  /**
   * Find sessions by task ID with optional filters
   */
  static async findByTaskId(
    taskId: string,
    filters: SessionFilters = {}
  ): Promise<SessionWithStats[]> {
    const conditions: string[] = ['s.task_id = $1'];
    const params: any[] = [taskId];
    let paramCount = 1;

    // Add filters
    if (filters.externalUserId) {
      paramCount++;
      conditions.push(`s.external_user_id = $${paramCount}`);
      params.push(filters.externalUserId);
    }

    if (filters.startDate) {
      paramCount++;
      conditions.push(`s.session_start >= $${paramCount}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      paramCount++;
      conditions.push(`s.session_start <= $${paramCount}`);
      params.push(filters.endDate);
    }

    if (filters.submitted !== undefined) {
      paramCount++;
      conditions.push(`s.submitted = $${paramCount}`);
      params.push(filters.submitted);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT
        s.id,
        s.task_id as "taskId",
        s.external_user_id as "externalUserId",
        s.session_start as "sessionStart",
        s.session_end as "sessionEnd",
        s.submitted,
        s.submission_time as "submissionTime",
        s.ip_address as "ipAddress",
        s.user_agent as "userAgent",
        s.created_at as "createdAt",
        (COUNT(DISTINCT e.id) + COUNT(DISTINCT de.id) + COUNT(DISTINCT unlinked_de.id)) as "eventCount",
        EXTRACT(EPOCH FROM (COALESCE(s.session_end, NOW()) - s.session_start)) * 1000 as duration
      FROM sessions s
      LEFT JOIN events e ON s.id = e.session_id
      LEFT JOIN document_events de ON s.id = de.session_id
      LEFT JOIN users u ON u.email = s.external_user_id
      LEFT JOIN task_enrollments pe
        ON pe.task_id = s.task_id
       AND pe.user_id = u.id
      LEFT JOIN document_events unlinked_de
        ON unlinked_de.session_id IS NULL
       AND unlinked_de.document_id = pe.submission_document_id
       AND unlinked_de.user_id = pe.user_id
       AND unlinked_de.created_at >= s.session_start
       AND unlinked_de.created_at <= COALESCE(s.session_end, NOW()) + INTERVAL '10 seconds'
      WHERE ${whereClause}
      GROUP BY s.id
      ORDER BY s.session_start DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(filters.limit || 50);
    params.push(filters.offset || 0);

    const results = await query<any>(sql, params);

    return results.map((row) => ({
      ...row,
      eventCount: parseInt(row.eventCount, 10),
      duration: row.duration ? parseFloat(row.duration) : undefined,
    }));
  }

  /**
   * Update session data
   */
  static async update(sessionId: string, data: Partial<Session>): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    if (data.sessionEnd !== undefined) {
      paramCount++;
      updates.push(`session_end = $${paramCount}`);
      params.push(data.sessionEnd);
    }

    if (data.submitted !== undefined) {
      paramCount++;
      updates.push(`submitted = $${paramCount}`);
      params.push(data.submitted);
    }

    if (data.submissionTime !== undefined) {
      paramCount++;
      updates.push(`submission_time = $${paramCount}`);
      params.push(data.submissionTime);
    }

    if (updates.length === 0) {
      return;
    }

    paramCount++;
    const sql = `
      UPDATE sessions
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
    `;

    params.push(sessionId);

    await query(sql, params);
  }

  /**
   * Mark session as submitted
   */
  static async markSubmitted(sessionId: string): Promise<void> {
    const sql = `
      UPDATE sessions
      SET submitted = TRUE,
          submission_time = NOW()
      WHERE id = $1
    `;

    await query(sql, [sessionId]);
  }

  /**
   * Mark the latest session for a task user as submitted.
   *
   * User-portal task submissions do not carry a session id at submit time, so
   * the best server-side source of truth is the latest session opened for the
   * task and authenticated user's email.
   */
  static async markLatestSubmittedForTaskUser(
    taskId: string,
    externalUserId: string
  ): Promise<void> {
    const sql = `
      UPDATE sessions
      SET submitted = TRUE,
          submission_time = COALESCE(submission_time, NOW()),
          session_end = COALESCE(session_end, NOW())
      WHERE id = (
        SELECT id
        FROM sessions
        WHERE task_id = $1
          AND external_user_id = $2
        ORDER BY session_start DESC, created_at DESC
        LIMIT 1
      )
    `;

    await query(sql, [taskId, externalUserId]);
  }

  /**
   * End session by setting session_end timestamp
   */
  static async endSession(sessionId: string): Promise<void> {
    const sql = `
      UPDATE sessions
      SET session_end = NOW()
      WHERE id = $1 AND session_end IS NULL
    `;

    await query(sql, [sessionId]);
  }

  /**
   * Count sessions by task ID with optional filters
   */
  static async countByTaskId(
    taskId: string,
    filters: SessionFilters = {}
  ): Promise<number> {
    const conditions: string[] = ['task_id = $1'];
    const params: any[] = [taskId];
    let paramCount = 1;

    if (filters.externalUserId) {
      paramCount++;
      conditions.push(`external_user_id = $${paramCount}`);
      params.push(filters.externalUserId);
    }

    if (filters.startDate) {
      paramCount++;
      conditions.push(`session_start >= $${paramCount}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      paramCount++;
      conditions.push(`session_start <= $${paramCount}`);
      params.push(filters.endDate);
    }

    if (filters.submitted !== undefined) {
      paramCount++;
      conditions.push(`submitted = $${paramCount}`);
      params.push(filters.submitted);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `SELECT COUNT(*) as count FROM sessions WHERE ${whereClause}`;

    const result = await queryOne<{ count: string }>(sql, params);
    return result ? parseInt(result.count, 10) : 0;
  }
}
