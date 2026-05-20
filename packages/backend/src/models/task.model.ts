import { query, queryOne } from '../config/database';
import { Task, WritingEnvironmentConfig } from '@humanly/shared';
import { generateTaskToken } from '../utils/crypto';

export interface CreateTaskData {
  name: string;
  description?: string;
  userIdKey?: string;
  externalServiceType?: string;
  externalServiceUrl?: string;
  allowedLlmModels?: string[];
  aiUsageLimit?: number;
  startDate: Date;
  endDate: Date;
  environmentConfig?: WritingEnvironmentConfig | null;
}

export interface UpdateTaskData {
  name?: string;
  description?: string;
  userIdKey?: string;
  externalServiceType?: string;
  externalServiceUrl?: string;
  allowedLlmModels?: string[];
  aiUsageLimit?: number;
  startDate?: Date;
  endDate?: Date;
  environmentConfig?: WritingEnvironmentConfig | null;
  isActive?: boolean;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface TaskListResult {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TaskEnrollmentSummary {
  id: string;
  taskId: string;
  userId: string;
  email: string;
  documentId: string | null;
  documentTitle: string | null;
  joinedAt: Date;
  sessionCount: number;
  submissionCount: number;
  eventCount: number;
  lastActivity: Date | null;
}

export interface TaskEnrollmentRecord {
  id: string;
  taskId: string;
  userId: string;
  documentId: string | null;
  joinedAt: Date;
}

export interface CurrentUserTaskEnrollment {
  id: string;
  taskId: string;
  enrollmentId: string;
  name: string;
  description?: string | null;
  inviteCode: string;
  documentId: string | null;
  writingStartedAt?: Date | null;
  joinedAt: Date;
  startDate: Date;
  endDate: Date;
  environmentConfig?: WritingEnvironmentConfig | null;
  isActive: boolean;
}

export interface ExpiredTimedTaskEnrollment {
  enrollmentId: string;
  taskId: string;
  userId: string;
  userEmail: string;
  documentId: string;
  writingStartedAt: Date;
  timeLimitSeconds: number;
}

export class TaskModel {
  private static readonly taskSelect = `
    p.id, p.user_id as "userId", p.name, p.description, p.task_token as "taskToken",
    p.user_id_key as "userIdKey", p.external_service_type as "externalServiceType",
    p.external_service_url as "externalServiceUrl",
    p.allowed_llm_models as "allowedLlmModels", p.ai_usage_limit as "aiUsageLimit",
    p.start_date as "startDate", p.end_date as "endDate",
    p.environment_config as "environmentConfig",
    p.is_active as "isActive",
    COALESCE(pe.enrolled_user_count, 0)::int as "enrolledUserCount",
    COALESCE(ps.document_count, 0)::int as "documentCount",
    COALESCE(ps.event_count, 0)::int as "eventCount",
    COALESCE(ps.submission_count, 0)::int as "submissionCount",
    p.created_at as "createdAt", p.updated_at as "updatedAt"
  `;

  private static readonly enrollmentCountJoin = `
    LEFT JOIN (
      SELECT task_id, COUNT(*)::int as enrolled_user_count
      FROM task_enrollments
      GROUP BY task_id
    ) pe ON pe.task_id = p.id
  `;

  private static readonly taskStatsJoin = `
    LEFT JOIN (
      SELECT
        te.task_id,
        (COUNT(DISTINCT te.submission_document_id)
          FILTER (WHERE te.submission_document_id IS NOT NULL))::int as document_count,
        COUNT(DISTINCT sub.id)::int as submission_count,
        (COUNT(DISTINCT e.id) + COUNT(DISTINCT de.id))::int as event_count
      FROM task_enrollments te
      LEFT JOIN users u ON u.id = te.user_id
      LEFT JOIN sessions s
        ON s.task_id = te.task_id
       AND s.external_user_id = u.email
      LEFT JOIN events e ON e.session_id = s.id
      LEFT JOIN document_events de ON de.document_id = te.submission_document_id
      LEFT JOIN submissions sub
        ON sub.task_id = te.task_id
       AND sub.user_id = te.user_id
      GROUP BY te.task_id
    ) ps ON ps.task_id = p.id
  `;

  /**
   * Create a new task with a unique token
   */
  static async create(userId: string, data: CreateTaskData): Promise<Task> {
    const taskToken = generateTaskToken();
    const userIdKey = data.userIdKey || 'userId';

    const sql = `
      INSERT INTO tasks (
        user_id, name, description, task_token, user_id_key,
        external_service_type, external_service_url,
        allowed_llm_models, ai_usage_limit, start_date, end_date, environment_config, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE)
      RETURNING id, user_id as "userId", name, description, task_token as "taskToken",
                user_id_key as "userIdKey", external_service_type as "externalServiceType",
                external_service_url as "externalServiceUrl",
                allowed_llm_models as "allowedLlmModels", ai_usage_limit as "aiUsageLimit",
                start_date as "startDate", end_date as "endDate",
                environment_config as "environmentConfig",
                is_active as "isActive",
                0 as "enrolledUserCount",
                0 as "documentCount",
                0 as "eventCount",
                0 as "submissionCount",
                created_at as "createdAt", updated_at as "updatedAt"
    `;

    const task = await queryOne<Task>(sql, [
      userId,
      data.name,
      data.description || null,
      taskToken,
      userIdKey,
      data.externalServiceType || null,
      data.externalServiceUrl || null,
      data.allowedLlmModels?.length ? data.allowedLlmModels : ['GPT-4o mini'],
      data.aiUsageLimit ?? 100,
      data.startDate,
      data.endDate,
      data.environmentConfig ? JSON.stringify(data.environmentConfig) : null,
    ]);

    if (!task) throw new Error('Failed to create task');
    return task;
  }

  /**
   * Find task by ID
   */
  static async findById(id: string): Promise<Task | null> {
    const sql = `
      SELECT ${this.taskSelect}
      FROM tasks p
      ${this.enrollmentCountJoin}
      ${this.taskStatsJoin}
      WHERE p.id = $1
    `;
    return queryOne<Task>(sql, [id]);
  }

  /**
   * Find tasks by user ID with pagination
   */
  static async findByUserId(
    userId: string,
    pagination: PaginationParams,
    search?: string
  ): Promise<TaskListResult> {
    const offset = (pagination.page - 1) * pagination.limit;

    // Build search condition
    let tasksSearchCondition = '';
    let countSearchCondition = '';
    const params: any[] = [userId, pagination.limit, offset];
    const countParams: any[] = [userId];

    if (search) {
      tasksSearchCondition = 'AND (name ILIKE $4 OR description ILIKE $4)';
      countSearchCondition = 'AND (name ILIKE $2 OR description ILIKE $2)';
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    // Get tasks
    const tasksSql = `
      SELECT ${this.taskSelect}
      FROM tasks p
      ${this.enrollmentCountJoin}
      ${this.taskStatsJoin}
      WHERE p.user_id = $1 ${tasksSearchCondition}
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const tasks = await query<Task>(tasksSql, params);

    // Get total count
    const countSql = `
      SELECT COUNT(*) as count
      FROM tasks
      WHERE user_id = $1 ${countSearchCondition}
    `;
    const countResult = await queryOne<{ count: string }>(countSql, countParams);
    const total = parseInt(countResult?.count || '0', 10);

    return {
      tasks,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  /**
   * Find task by task token (for tracking)
   */
  static async findByToken(taskToken: string): Promise<Task | null> {
    const sql = `
      SELECT ${this.taskSelect}
      FROM tasks p
      ${this.enrollmentCountJoin}
      ${this.taskStatsJoin}
      WHERE p.task_token = $1 AND p.is_active = TRUE
    `;
    return queryOne<Task>(sql, [taskToken]);
  }

  /**
   * Find active task by short invite code.
   * The invite code is the first 6 characters of the task token.
   */
  static async findByInviteCode(inviteCode: string): Promise<Task | null> {
    const sql = `
      SELECT ${this.taskSelect}
      FROM tasks p
      ${this.enrollmentCountJoin}
      ${this.taskStatsJoin}
      WHERE UPPER(SUBSTRING(p.task_token FROM 1 FOR 6)) = $1
        AND p.is_active = TRUE
      ORDER BY p.created_at DESC
      LIMIT 1
    `;
    return queryOne<Task>(sql, [inviteCode.toUpperCase()]);
  }

  /**
   * Find the task that owns a user's task-scoped submission document.
   */
  static async findBySubmissionDocument(documentId: string, userId: string): Promise<Task | null> {
    const sql = `
      SELECT ${this.taskSelect}
      FROM tasks p
      ${this.enrollmentCountJoin}
      ${this.taskStatsJoin}
      JOIN task_enrollments te
        ON te.task_id = p.id
       AND te.submission_document_id = $1
       AND te.user_id = $2
      WHERE p.is_active = TRUE
      LIMIT 1
    `;
    return queryOne<Task>(sql, [documentId, userId]);
  }

  /**
   * Persist an invite-code enrollment. Repeated joins by the same user are idempotent.
   */
  static async enrollUser(taskId: string, userId: string): Promise<void> {
    const sql = `
      INSERT INTO task_enrollments (task_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (task_id, user_id) DO NOTHING
    `;

    await query(sql, [taskId, userId]);
  }

  /**
   * Remove a user's invite-code enrollment from a task.
   */
  static async unenrollUser(taskId: string, userId: string): Promise<boolean> {
    const sql = `
      DELETE FROM task_enrollments
      WHERE task_id = $1 AND user_id = $2
      RETURNING id
    `;

    const deletedEnrollment = await queryOne<{ id: string }>(sql, [taskId, userId]);
    return !!deletedEnrollment;
  }

  /**
   * Check if a user is enrolled in a task.
   */
  static async hasEnrollment(taskId: string, userId: string): Promise<boolean> {
    const sql = 'SELECT 1 FROM task_enrollments WHERE task_id = $1 AND user_id = $2';
    const result = await queryOne(sql, [taskId, userId]);
    return !!result;
  }

  /**
   * Find one task enrollment for a specific user.
   */
  static async findEnrollmentForUserTask(
    taskId: string,
    userId: string
  ): Promise<TaskEnrollmentRecord | null> {
    const sql = `
      SELECT
        id,
        task_id as "taskId",
        user_id as "userId",
        submission_document_id as "documentId",
        joined_at as "joinedAt"
      FROM task_enrollments
      WHERE task_id = $1 AND user_id = $2
      LIMIT 1
    `;

    return queryOne<TaskEnrollmentRecord>(sql, [taskId, userId]);
  }

  /**
   * Link an enrollment to the user's task submission document.
   */
  static async linkSubmissionDocument(taskId: string, userId: string, documentId: string): Promise<boolean> {
    const sql = `
      UPDATE task_enrollments
      SET submission_document_id = $3
      WHERE task_id = $1 AND user_id = $2
      RETURNING id
    `;
    const result = await queryOne<{ id: string }>(sql, [taskId, userId, documentId]);
    return !!result;
  }

  /**
   * List task enrollments for the current user portal account.
   */
  static async listCurrentUserEnrollments(userId: string): Promise<CurrentUserTaskEnrollment[]> {
    const sql = `
      SELECT
        t.id,
        t.id as "taskId",
        te.id as "enrollmentId",
        t.name,
        t.description,
        UPPER(SUBSTRING(t.task_token FROM 1 FOR 6)) as "inviteCode",
        te.submission_document_id as "documentId",
        d.writing_started_at as "writingStartedAt",
        te.joined_at as "joinedAt",
        t.start_date as "startDate",
        t.end_date as "endDate",
        t.environment_config as "environmentConfig",
        t.is_active as "isActive"
      FROM task_enrollments te
      JOIN tasks t ON t.id = te.task_id
      LEFT JOIN documents d
        ON d.id = te.submission_document_id
       AND d.user_id = te.user_id
      WHERE te.user_id = $1
      ORDER BY te.joined_at DESC
    `;

    return query<CurrentUserTaskEnrollment>(sql, [userId]);
  }

  /**
   * Claim expired timed task enrollments for server-side auto-submission.
   *
   * The claim columns make the job safe when multiple backend instances are
   * running: one worker claims a row, others skip it until the claim ages out.
   */
  static async claimExpiredTimedEnrollments(limit = 25): Promise<ExpiredTimedTaskEnrollment[]> {
    const sql = `
      WITH due AS (
        SELECT te.id
        FROM task_enrollments te
        JOIN tasks t ON t.id = te.task_id
        JOIN documents d
          ON d.id = te.submission_document_id
         AND d.user_id = te.user_id
        WHERE te.submission_document_id IS NOT NULL
          AND d.writing_started_at IS NOT NULL
          AND te.auto_submit_completed_at IS NULL
          AND (
            te.auto_submit_claimed_at IS NULL
            OR te.auto_submit_claimed_at < NOW() - INTERVAL '5 minutes'
          )
          AND t.is_active = true
          AND t.environment_config #>> '{time,timeLimitSeconds}' ~ '^[0-9]+$'
          AND (
            d.writing_started_at
            + make_interval(secs => (t.environment_config #>> '{time,timeLimitSeconds}')::int)
          ) <= NOW()
          AND NOT EXISTS (
            SELECT 1
            FROM submissions s
            WHERE s.task_id = te.task_id
              AND s.user_id = te.user_id
              AND s.status = 'active'
          )
        ORDER BY d.writing_started_at ASC
        FOR UPDATE OF te SKIP LOCKED
        LIMIT $1
      )
      UPDATE task_enrollments te
      SET auto_submit_claimed_at = NOW(),
          auto_submit_error = NULL
      FROM due
      JOIN tasks t ON t.id = (
        SELECT task_id FROM task_enrollments WHERE id = due.id
      )
      JOIN users u ON u.id = (
        SELECT user_id FROM task_enrollments WHERE id = due.id
      )
      JOIN documents d ON d.id = (
        SELECT submission_document_id FROM task_enrollments WHERE id = due.id
      )
      WHERE te.id = due.id
      RETURNING
        te.id as "enrollmentId",
        te.task_id as "taskId",
        te.user_id as "userId",
        u.email as "userEmail",
        te.submission_document_id as "documentId",
        d.writing_started_at as "writingStartedAt",
        (t.environment_config #>> '{time,timeLimitSeconds}')::int as "timeLimitSeconds"
    `;

    return query<ExpiredTimedTaskEnrollment>(sql, [limit]);
  }

  static async markTimedEnrollmentAutoSubmitComplete(enrollmentId: string): Promise<void> {
    const sql = `
      UPDATE task_enrollments
      SET auto_submit_completed_at = NOW(),
          auto_submit_error = NULL
      WHERE id = $1
    `;

    await query(sql, [enrollmentId]);
  }

  static async markTimedEnrollmentAutoSubmitFailed(enrollmentId: string, errorMessage: string): Promise<void> {
    const sql = `
      UPDATE task_enrollments
      SET auto_submit_error = $2
      WHERE id = $1
    `;

    await query(sql, [enrollmentId, errorMessage.slice(0, 1000)]);
  }

  /**
   * List invite-code enrollments for an admin-owned task.
   */
  static async listEnrollments(taskId: string): Promise<TaskEnrollmentSummary[]> {
    const sql = `
      SELECT
        pe.id,
        pe.task_id as "taskId",
        pe.user_id as "userId",
        u.email,
        pe.submission_document_id as "documentId",
        d.title as "documentTitle",
        pe.joined_at as "joinedAt",
        COUNT(DISTINCT s.id)::int as "sessionCount",
        COUNT(DISTINCT sub.id)::int as "submissionCount",
        (COUNT(DISTINCT e.id) + COUNT(DISTINCT de.id))::int as "eventCount",
        MAX(
          GREATEST(
            COALESCE(s.session_end, s.session_start, pe.joined_at),
            COALESCE(de.timestamp, pe.joined_at),
            COALESCE(sub.submitted_at, pe.joined_at),
            pe.joined_at
          )
        ) as "lastActivity"
      FROM task_enrollments pe
      JOIN users u ON u.id = pe.user_id
      LEFT JOIN documents d ON d.id = pe.submission_document_id
      LEFT JOIN sessions s
        ON s.task_id = pe.task_id
       AND s.external_user_id = u.email
      LEFT JOIN events e ON e.session_id = s.id
      LEFT JOIN document_events de ON de.document_id = pe.submission_document_id
      LEFT JOIN submissions sub
        ON sub.task_id = pe.task_id
       AND sub.user_id = pe.user_id
      WHERE pe.task_id = $1
      GROUP BY pe.id, u.email, d.title
      ORDER BY pe.joined_at DESC
    `;

    return query<TaskEnrollmentSummary>(sql, [taskId]);
  }

  /**
   * Update task
   */
  static async update(id: string, data: UpdateTaskData): Promise<Task | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }

    if (data.userIdKey !== undefined) {
      updates.push(`user_id_key = $${paramIndex++}`);
      values.push(data.userIdKey);
    }

    if (data.externalServiceType !== undefined) {
      updates.push(`external_service_type = $${paramIndex++}`);
      values.push(data.externalServiceType);
    }

    if (data.externalServiceUrl !== undefined) {
      updates.push(`external_service_url = $${paramIndex++}`);
      values.push(data.externalServiceUrl);
    }

    if (data.allowedLlmModels !== undefined) {
      updates.push(`allowed_llm_models = $${paramIndex++}`);
      values.push(data.allowedLlmModels);
    }

    if (data.aiUsageLimit !== undefined) {
      updates.push(`ai_usage_limit = $${paramIndex++}`);
      values.push(data.aiUsageLimit);
    }

    if (data.startDate !== undefined) {
      updates.push(`start_date = $${paramIndex++}`);
      values.push(data.startDate);
    }

    if (data.endDate !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      values.push(data.endDate);
    }

    if (data.environmentConfig !== undefined) {
      updates.push(`environment_config = $${paramIndex++}`);
      values.push(data.environmentConfig ? JSON.stringify(data.environmentConfig) : null);
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const sql = `
      UPDATE tasks
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id
    `;

    const updatedTask = await queryOne<{ id: string }>(sql, values);
    return updatedTask ? this.findById(updatedTask.id) : null;
  }

  /**
   * Delete task
   */
  static async delete(id: string): Promise<void> {
    const sql = 'DELETE FROM tasks WHERE id = $1';
    await query(sql, [id]);
  }

  /**
   * Regenerate task token
   */
  static async regenerateToken(id: string): Promise<Task | null> {
    const newToken = generateTaskToken();

    const sql = `
      UPDATE tasks
      SET task_token = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id
    `;

    const updatedTask = await queryOne<{ id: string }>(sql, [newToken, id]);
    return updatedTask ? this.findById(updatedTask.id) : null;
  }

  /**
   * Check if task token exists
   */
  static async tokenExists(token: string): Promise<boolean> {
    const sql = 'SELECT 1 FROM tasks WHERE task_token = $1';
    const result = await queryOne(sql, [token]);
    return !!result;
  }

  /**
   * Verify that a user owns a task
   */
  static async verifyOwnership(taskId: string, userId: string): Promise<boolean> {
    const sql = 'SELECT 1 FROM tasks WHERE id = $1 AND user_id = $2';
    const result = await queryOne(sql, [taskId, userId]);
    return !!result;
  }
}
