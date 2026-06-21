import { query, queryOne, transaction } from '../config/database';
import { Task, TaskLifecycleStatus, WritingEnvironmentConfig } from '@humanly/shared';
import { generateTaskToken } from '../utils/crypto';
import crypto from 'crypto';

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
  allowGuestSubmissions?: boolean;
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
  allowGuestSubmissions?: boolean;
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
  currentAttemptNumber?: number | null;
  attemptCount?: number;
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
  currentAttemptId?: string | null;
  currentAttemptNumber?: number | null;
  attemptCount?: number;
  joinedAt: Date;
  dashboardHiddenAt?: Date | null;
  dashboardRestoredAt?: Date | null;
}

export interface CurrentUserTaskEnrollment {
  id: string;
  taskId: string;
  enrollmentId: string;
  name: string;
  description?: string | null;
  inviteCode: string;
  documentId: string | null;
  currentAttemptNumber?: number | null;
  attemptCount?: number;
  writingStartedAt?: Date | null;
  joinedAt: Date;
  startDate: Date;
  endDate: Date;
  environmentConfig?: WritingEnvironmentConfig | null;
  isActive: boolean;
  lifecycleStatus: TaskLifecycleStatus;
  launchedAt?: Date | null;
  pausedAt?: Date | null;
  endedAt?: Date | null;
  latestSubmissionId?: string | null;
  latestCertificateId?: string | null;
  latestCertificateGeneratedAt?: Date | null;
  certificateCount: number;
}

export interface TaskAttemptRecord {
  id: string;
  taskId: string;
  userId: string;
  documentId: string;
  attemptNumber: number;
  status: 'active' | 'historical';
  startedAt: Date;
  endedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  private static activeWriterPredicate(alias: string): string {
    return `
      ${alias}.is_active = TRUE
      AND ${alias}.deleted_at IS NULL
      AND COALESCE(${alias}.lifecycle_status, 'active') = 'active'
    `;
  }

  private static readonly taskSelect = `
    p.id, p.user_id as "userId", p.name, p.description, p.task_token as "taskToken",
    p.user_id_key as "userIdKey", p.external_service_type as "externalServiceType",
    p.external_service_url as "externalServiceUrl",
    p.allowed_llm_models as "allowedLlmModels", p.ai_usage_limit as "aiUsageLimit",
    p.start_date as "startDate", p.end_date as "endDate",
    p.environment_config as "environmentConfig",
    p.allow_guest_submissions as "allowGuestSubmissions",
    p.is_active as "isActive",
    p.lifecycle_status as "lifecycleStatus",
    p.launched_at as "launchedAt",
    p.paused_at as "pausedAt",
    p.ended_at as "endedAt",
    p.deleted_at as "deletedAt",
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
        (COUNT(DISTINCT COALESCE(ta.document_id, te.submission_document_id))
          FILTER (WHERE COALESCE(ta.document_id, te.submission_document_id) IS NOT NULL))::int as document_count,
        COUNT(DISTINCT sub.id)::int as submission_count,
        (COUNT(DISTINCT e.id) + COUNT(DISTINCT de.id))::int as event_count
      FROM task_enrollments te
      LEFT JOIN task_attempts ta
        ON ta.task_id = te.task_id
       AND ta.user_id = te.user_id
      LEFT JOIN users u ON u.id = te.user_id
      LEFT JOIN sessions s
        ON s.task_id = te.task_id
       AND s.external_user_id = u.email
      LEFT JOIN events e ON e.session_id = s.id
      LEFT JOIN document_events de ON de.document_id = COALESCE(ta.document_id, te.submission_document_id)
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
        allowed_llm_models, ai_usage_limit, start_date, end_date, environment_config,
        allow_guest_submissions, is_active, lifecycle_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, 'draft')
      RETURNING id, user_id as "userId", name, description, task_token as "taskToken",
                user_id_key as "userIdKey", external_service_type as "externalServiceType",
                external_service_url as "externalServiceUrl",
                allowed_llm_models as "allowedLlmModels", ai_usage_limit as "aiUsageLimit",
                start_date as "startDate", end_date as "endDate",
                environment_config as "environmentConfig",
                allow_guest_submissions as "allowGuestSubmissions",
                is_active as "isActive",
                lifecycle_status as "lifecycleStatus",
                launched_at as "launchedAt",
                ended_at as "endedAt",
                NULL::timestamptz as "deletedAt",
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
      data.allowGuestSubmissions ?? true,
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
        AND p.deleted_at IS NULL
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
      WHERE p.user_id = $1
        AND p.deleted_at IS NULL
        ${tasksSearchCondition}
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const tasks = await query<Task>(tasksSql, params);

    // Get total count
    const countSql = `
      SELECT COUNT(*) as count
      FROM tasks
      WHERE user_id = $1
        AND deleted_at IS NULL
        ${countSearchCondition}
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
      WHERE p.task_token = $1
        AND ${this.activeWriterPredicate('p')}
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
        AND ${this.activeWriterPredicate('p')}
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
       AND te.user_id = $2
      LEFT JOIN task_attempts ta
        ON ta.task_id = te.task_id
       AND ta.user_id = te.user_id
       AND ta.document_id = $1
      WHERE ${this.activeWriterPredicate('p')}
        AND (te.submission_document_id = $1 OR ta.document_id = $1)
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
      ON CONFLICT (task_id, user_id) DO UPDATE
      SET
        dashboard_restored_at = CASE
          WHEN task_enrollments.dashboard_hidden_at IS NOT NULL THEN NOW()
          ELSE task_enrollments.dashboard_restored_at
        END,
        dashboard_hidden_at = NULL
    `;

    await query(sql, [taskId, userId]);
  }

  /**
   * Hide a user's invite-code enrollment from their dashboard without deleting
   * the enrollment or any linked evidence.
   */
  static async hideEnrollmentFromDashboard(taskId: string, userId: string): Promise<boolean> {
    const sql = `
      UPDATE task_enrollments
      SET dashboard_hidden_at = NOW()
      WHERE task_id = $1 AND user_id = $2
      RETURNING id
    `;

    const hiddenEnrollment = await queryOne<{ id: string }>(sql, [taskId, userId]);
    return !!hiddenEnrollment;
  }

  /**
   * Check if a user is enrolled in a task.
   */
  static async hasEnrollment(taskId: string, userId: string): Promise<boolean> {
    const sql = `
      SELECT 1
      FROM task_enrollments te
      JOIN tasks t
        ON t.id = te.task_id
      WHERE te.task_id = $1
        AND te.user_id = $2
        AND t.deleted_at IS NULL
    `;
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
        te.id,
        te.task_id as "taskId",
        te.user_id as "userId",
        te.submission_document_id as "documentId",
        active_attempt.id as "currentAttemptId",
        active_attempt.attempt_number as "currentAttemptNumber",
        COALESCE(attempt_stats.attempt_count, 0)::int as "attemptCount",
        te.joined_at as "joinedAt",
        te.dashboard_hidden_at as "dashboardHiddenAt",
        te.dashboard_restored_at as "dashboardRestoredAt"
      FROM task_enrollments te
      LEFT JOIN LATERAL (
        SELECT ta.id, ta.attempt_number
        FROM task_attempts ta
        WHERE ta.task_id = te.task_id
          AND ta.user_id = te.user_id
          AND ta.document_id = te.submission_document_id
        LIMIT 1
      ) active_attempt ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int as attempt_count
        FROM task_attempts ta
        WHERE ta.task_id = te.task_id
          AND ta.user_id = te.user_id
      ) attempt_stats ON true
      WHERE te.task_id = $1 AND te.user_id = $2
      LIMIT 1
    `;

    return queryOne<TaskEnrollmentRecord>(sql, [taskId, userId]);
  }

  /**
   * Link an enrollment to the user's assigned task document.
   */
  static async linkSubmissionDocument(taskId: string, userId: string, documentId: string): Promise<TaskAttemptRecord | null> {
    return transaction<TaskAttemptRecord | null>(async (client) => {
      const enrollmentResult = await client.query(
        `
          SELECT id, submission_document_id
          FROM task_enrollments
          WHERE task_id = $1 AND user_id = $2
          LIMIT 1
        `,
        [taskId, userId]
      );
      const enrollment = enrollmentResult.rows[0] as { id: string; submission_document_id: string | null } | undefined;
      if (!enrollment) return null;
      if (enrollment.submission_document_id && enrollment.submission_document_id !== documentId) {
        return null;
      }

      const existingAttemptResult = await client.query(
        `
          SELECT
            id,
            task_id as "taskId",
            user_id as "userId",
            document_id as "documentId",
            attempt_number as "attemptNumber",
            status,
            started_at as "startedAt",
            ended_at as "endedAt",
            created_at as "createdAt",
            updated_at as "updatedAt"
          FROM task_attempts
          WHERE task_id = $1 AND user_id = $2 AND document_id = $3
          LIMIT 1
        `,
        [taskId, userId, documentId]
      );

      let attempt = existingAttemptResult.rows[0] as TaskAttemptRecord | undefined;
      if (!attempt) {
        const insertedAttemptResult = await client.query(
          `
            INSERT INTO task_attempts (
              task_id,
              user_id,
              document_id,
              attempt_number,
              status
            )
            VALUES (
              $1,
              $2,
              $3,
              COALESCE((
                SELECT MAX(attempt_number)
                FROM task_attempts
                WHERE task_id = $1 AND user_id = $2
              ), 0) + 1,
              'active'
            )
            RETURNING
              id,
              task_id as "taskId",
              user_id as "userId",
              document_id as "documentId",
              attempt_number as "attemptNumber",
              status,
              started_at as "startedAt",
              ended_at as "endedAt",
              created_at as "createdAt",
              updated_at as "updatedAt"
          `,
          [taskId, userId, documentId]
        );
        attempt = insertedAttemptResult.rows[0] as TaskAttemptRecord;
      }

      await client.query(
        `
          UPDATE task_enrollments
          SET submission_document_id = $3
          WHERE task_id = $1 AND user_id = $2
        `,
        [taskId, userId, documentId]
      );

      return attempt;
    });
  }

  static async createRestartAttempt(taskId: string, userId: string, documentId: string): Promise<TaskAttemptRecord | null> {
    return transaction<TaskAttemptRecord | null>(async (client) => {
      const enrollmentResult = await client.query(
        `
          SELECT id
          FROM task_enrollments
          WHERE task_id = $1 AND user_id = $2
          LIMIT 1
        `,
        [taskId, userId]
      );
      if (enrollmentResult.rowCount === 0) return null;

      await client.query(
        `
          UPDATE task_attempts
          SET status = 'historical',
              ended_at = COALESCE(ended_at, NOW()),
              updated_at = NOW()
          WHERE task_id = $1 AND user_id = $2 AND status = 'active'
        `,
        [taskId, userId]
      );

      const insertedAttemptResult = await client.query(
        `
          INSERT INTO task_attempts (
            task_id,
            user_id,
            document_id,
            attempt_number,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            COALESCE((
              SELECT MAX(attempt_number)
              FROM task_attempts
              WHERE task_id = $1 AND user_id = $2
            ), 0) + 1,
            'active'
          )
          RETURNING
            id,
            task_id as "taskId",
            user_id as "userId",
            document_id as "documentId",
            attempt_number as "attemptNumber",
            status,
            started_at as "startedAt",
            ended_at as "endedAt",
            created_at as "createdAt",
            updated_at as "updatedAt"
        `,
        [taskId, userId, documentId]
      );

      await client.query(
        `
          UPDATE task_enrollments
          SET submission_document_id = $3,
              auto_submit_completed_at = NULL,
              auto_submit_claimed_at = NULL,
              auto_submit_error = NULL,
              dashboard_hidden_at = NULL,
              dashboard_restored_at = NOW()
          WHERE task_id = $1 AND user_id = $2
        `,
        [taskId, userId, documentId]
      );

      return insertedAttemptResult.rows[0] as TaskAttemptRecord;
    });
  }

  static async countAttemptsForUserTask(taskId: string, userId: string): Promise<number> {
    const result = await queryOne<{ count: string }>(
      `
        SELECT COUNT(*)::text as count
        FROM task_attempts
        WHERE task_id = $1 AND user_id = $2
      `,
      [taskId, userId]
    );

    return parseInt(result?.count || '0', 10);
  }

  static async findAttemptForDocument(
    taskId: string,
    userId: string,
    documentId: string
  ): Promise<TaskAttemptRecord | null> {
    const sql = `
      SELECT
        id,
        task_id as "taskId",
        user_id as "userId",
        document_id as "documentId",
        attempt_number as "attemptNumber",
        status,
        started_at as "startedAt",
        ended_at as "endedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM task_attempts
      WHERE task_id = $1 AND user_id = $2 AND document_id = $3
      LIMIT 1
    `;

    return queryOne<TaskAttemptRecord>(sql, [taskId, userId, documentId]);
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
        active_attempt.attempt_number as "currentAttemptNumber",
        COALESCE(attempt_stats.attempt_count, 0)::int as "attemptCount",
        d.writing_started_at as "writingStartedAt",
        te.joined_at as "joinedAt",
        t.start_date as "startDate",
        t.end_date as "endDate",
        t.environment_config as "environmentConfig",
        t.is_active as "isActive",
        t.lifecycle_status as "lifecycleStatus",
        t.launched_at as "launchedAt",
        t.paused_at as "pausedAt",
        t.ended_at as "endedAt",
        latest_submission.id as "latestSubmissionId",
        latest_certificate.id as "latestCertificateId",
        latest_certificate.generated_at as "latestCertificateGeneratedAt",
        COALESCE(certificate_stats.certificate_count, 0)::int as "certificateCount"
      FROM task_enrollments te
      JOIN tasks t ON t.id = te.task_id
      LEFT JOIN documents d
        ON d.id = te.submission_document_id
       AND d.user_id = te.user_id
      LEFT JOIN LATERAL (
        SELECT ta.id, ta.attempt_number
        FROM task_attempts ta
        WHERE ta.task_id = te.task_id
          AND ta.user_id = te.user_id
          AND ta.document_id = te.submission_document_id
        LIMIT 1
      ) active_attempt ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int as attempt_count
        FROM task_attempts ta
        WHERE ta.task_id = te.task_id
          AND ta.user_id = te.user_id
      ) attempt_stats ON true
      LEFT JOIN LATERAL (
        SELECT s.id
        FROM submissions s
        WHERE s.task_id = te.task_id
          AND s.user_id = te.user_id
        ORDER BY (s.status = 'active') DESC, s.submitted_at DESC, s.created_at DESC
        LIMIT 1
      ) latest_submission ON true
      LEFT JOIN LATERAL (
        SELECT c.id, c.generated_at
        FROM certificates c
        WHERE c.user_id = te.user_id
          AND EXISTS (
            SELECT 1
            FROM submissions s
            WHERE s.certificate_id = c.id
              AND s.task_id = te.task_id
              AND s.user_id = te.user_id
          )
        ORDER BY (c.status = 'active') DESC, c.generated_at DESC, c.created_at DESC
        LIMIT 1
      ) latest_certificate ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int as certificate_count
        FROM certificates c
        WHERE c.user_id = te.user_id
          AND EXISTS (
            SELECT 1
            FROM submissions s
            WHERE s.certificate_id = c.id
              AND s.task_id = te.task_id
              AND s.user_id = te.user_id
          )
      ) certificate_stats ON true
      WHERE te.user_id = $1
        AND te.dashboard_hidden_at IS NULL
        AND t.deleted_at IS NULL
        AND t.is_active = TRUE
        AND COALESCE(t.lifecycle_status, 'active') = 'active'
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
        JOIN task_attempts ta
          ON ta.task_id = te.task_id
         AND ta.user_id = te.user_id
         AND ta.document_id = te.submission_document_id
        WHERE te.submission_document_id IS NOT NULL
          AND d.writing_started_at IS NOT NULL
          AND te.auto_submit_completed_at IS NULL
          AND (
            te.auto_submit_claimed_at IS NULL
            OR te.auto_submit_claimed_at < NOW() - INTERVAL '5 minutes'
          )
          AND t.is_active = true
          AND t.deleted_at IS NULL
          AND COALESCE(t.lifecycle_status, 'active') = 'active'
          AND t.environment_config #>> '{time,timeLimitSeconds}' ~ '^[0-9]+$'
          AND (
            d.writing_started_at
            + make_interval(secs => (t.environment_config #>> '{time,timeLimitSeconds}')::int)
          ) <= NOW()
          AND NOT EXISTS (
            SELECT 1
            FROM submissions s
            WHERE s.task_attempt_id = ta.id
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
        active_attempt.attempt_number as "currentAttemptNumber",
        COALESCE(attempt_stats.attempt_count, 0)::int as "attemptCount",
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
      LEFT JOIN LATERAL (
        SELECT ta.id, ta.attempt_number
        FROM task_attempts ta
        WHERE ta.task_id = pe.task_id
          AND ta.user_id = pe.user_id
          AND ta.document_id = pe.submission_document_id
        LIMIT 1
      ) active_attempt ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int as attempt_count
        FROM task_attempts ta
        WHERE ta.task_id = pe.task_id
          AND ta.user_id = pe.user_id
      ) attempt_stats ON true
      LEFT JOIN sessions s
        ON s.task_id = pe.task_id
       AND s.external_user_id = u.email
      LEFT JOIN events e ON e.session_id = s.id
      LEFT JOIN task_attempts ta
        ON ta.task_id = pe.task_id
       AND ta.user_id = pe.user_id
      LEFT JOIN document_events de ON de.document_id = COALESCE(ta.document_id, pe.submission_document_id)
      LEFT JOIN submissions sub
        ON sub.task_id = pe.task_id
       AND sub.user_id = pe.user_id
      WHERE pe.task_id = $1
      GROUP BY pe.id, u.email, d.title, active_attempt.attempt_number, attempt_stats.attempt_count
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

    if (data.allowGuestSubmissions !== undefined) {
      updates.push(`allow_guest_submissions = $${paramIndex++}`);
      values.push(data.allowGuestSubmissions);
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

  static async updateLifecycle(
    id: string,
    lifecycleStatus: TaskLifecycleStatus
  ): Promise<Task | null> {
    const updatedTaskId = await transaction<string | null>(async (client) => {
      const existingResult = await client.query(
        `
          SELECT lifecycle_status, paused_at
          FROM tasks
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      ) as {
        rows: Array<{
          lifecycle_status: TaskLifecycleStatus;
          paused_at: Date | null;
        }>;
      };

      const existing = existingResult.rows[0];
      if (!existing) return null;

      if (
        existing.lifecycle_status === 'paused' &&
        lifecycleStatus === 'active' &&
        existing.paused_at
      ) {
        await client.query(
          `
            UPDATE documents d
            SET writing_started_at = d.writing_started_at + (NOW() - $2::timestamptz)
            WHERE d.writing_started_at IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM task_enrollments te
                WHERE te.task_id = $1
                  AND te.user_id = d.user_id
                  AND te.submission_document_id = d.id
              )
              AND NOT EXISTS (
                SELECT 1
                FROM submissions s
                WHERE s.task_id = $1
                  AND s.document_id = d.id
                  AND s.status = 'active'
              )
          `,
          [id, existing.paused_at]
        );
      }

      const updatedResult = await client.query(
        `
          UPDATE tasks
          SET
            lifecycle_status = $2,
            paused_at = CASE
              WHEN $2 = 'paused' THEN COALESCE(paused_at, NOW())
              WHEN $2 IN ('active', 'ended') THEN NULL
              ELSE paused_at
            END,
            launched_at = CASE
              WHEN $2 = 'active' AND launched_at IS NULL THEN NOW()
              ELSE launched_at
            END,
            ended_at = CASE
              WHEN $2 = 'ended' THEN COALESCE(ended_at, NOW())
              ELSE ended_at
            END,
            updated_at = NOW()
          WHERE id = $1
          RETURNING id
        `,
        [id, lifecycleStatus]
      ) as { rows: Array<{ id: string }> };

      return updatedResult.rows[0]?.id || null;
    });

    return updatedTaskId ? this.findById(updatedTaskId) : null;
  }

  static async duplicate(id: string, userId: string): Promise<Task | null> {
    const newTaskToken = generateTaskToken();
    const newTaskId = await transaction<string>(async (client) => {
      const taskResult = await client.query(`
        INSERT INTO tasks (
          user_id,
          name,
          description,
          task_token,
          user_id_key,
          external_service_type,
          external_service_url,
          allowed_llm_models,
          ai_usage_limit,
          start_date,
          end_date,
          environment_config,
          allow_guest_submissions,
          is_active,
          lifecycle_status
        )
        SELECT
          user_id,
          name || ' Copy',
          description,
          $3,
          user_id_key,
          external_service_type,
          external_service_url,
          allowed_llm_models,
          ai_usage_limit,
          start_date,
          end_date,
          environment_config,
          allow_guest_submissions,
          TRUE,
          'draft'
        FROM tasks
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `, [id, userId, newTaskToken]);

      const duplicatedTaskId = taskResult.rows[0]?.id;
      if (!duplicatedTaskId) {
        throw new Error('Task not found');
      }

      const sourceFiles = await client.query(`
        SELECT id
        FROM files
        WHERE task_id = $1 AND purpose = 'task_instruction_pdf'
        ORDER BY created_at ASC
      `, [id]);

      for (const sourceFile of sourceFiles.rows) {
        const newFileId = crypto.randomUUID();
        await client.query(`
          INSERT INTO files (
            id,
            owner_user_id,
            document_id,
            task_id,
            purpose,
            title,
            original_filename,
            mime_type,
            storage_provider,
            storage_key,
            storage_bucket,
            storage_region,
            storage_etag,
            file_size,
            checksum,
            page_count,
            upload_status,
            legacy_source_id
          )
          SELECT
            $3,
            owner_user_id,
            NULL,
            $2,
            purpose,
            title,
            original_filename,
            mime_type,
            storage_provider,
            storage_key,
            storage_bucket,
            storage_region,
            storage_etag,
            file_size,
            checksum,
            page_count,
            upload_status,
            id
          FROM files
          WHERE id = $1
        `, [sourceFile.id, duplicatedTaskId, newFileId]);

        await client.query(`
          INSERT INTO file_pages (file_id, page_number, text)
          SELECT $2, page_number, text
          FROM file_pages
          WHERE file_id = $1
        `, [sourceFile.id, newFileId]);

        await client.query(`
          INSERT INTO file_sections (file_id, section_title, start_page, end_page, text)
          SELECT $2, section_title, start_page, end_page, text
          FROM file_sections
          WHERE file_id = $1
        `, [sourceFile.id, newFileId]);

        await client.query(`
          INSERT INTO file_text_chunks (file_id, page_number, section_title, chunk_index, text)
          SELECT $2, page_number, section_title, chunk_index, text
          FROM file_text_chunks
          WHERE file_id = $1
        `, [sourceFile.id, newFileId]);
      }

      return duplicatedTaskId;
    });

    return this.findById(newTaskId);
  }

  /**
   * Delete task
   */
  static async delete(id: string): Promise<void> {
    const sql = `
      UPDATE tasks
      SET
        deleted_at = COALESCE(deleted_at, NOW()),
        is_active = FALSE,
        lifecycle_status = 'ended',
        ended_at = COALESCE(ended_at, NOW()),
        updated_at = NOW()
      WHERE id = $1
    `;
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
    const sql = 'SELECT 1 FROM tasks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL';
    const result = await queryOne(sql, [taskId, userId]);
    return !!result;
  }
}
