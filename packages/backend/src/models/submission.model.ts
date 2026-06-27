import { query, queryOne } from '../config/database';
import { Submission, SubmissionInsertData } from '@humanly/shared';

export type SubmissionSummary = Omit<Submission, 'payloadSnapshot' | 'plainTextSnapshot'>;

export interface SubmissionListOptions {
  limit?: number;
  offset?: number;
}

export interface SubmissionListResult {
  submissions: SubmissionSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const DEFAULT_SUBMISSION_LIST_LIMIT = 100;
const MAX_SUBMISSION_LIST_LIMIT = 500;

const SUBMISSION_SELECT_FIELDS = `
  id,
  task_id as "taskId",
  user_id as "userId",
  document_id as "documentId",
  task_attempt_id as "taskAttemptId",
  NULL::int as "attemptNumber",
  certificate_id as "certificateId",
  NULL::text as "certificateVerificationToken",
  submitted_at as "submittedAt",
  payload_snapshot as "payloadSnapshot",
  plain_text_snapshot as "plainTextSnapshot",
  supersedes_submission_id as "supersedesSubmissionId",
  status,
  anomaly_flags as "anomalyFlags",
  0::int as "aiPolicyRefusalCount",
  created_at as "createdAt"
`;

const SUBMISSION_WITH_CERTIFICATE_SELECT_FIELDS = `
  s.id,
  s.task_id as "taskId",
  s.user_id as "userId",
  u.email as "userEmail",
  s.document_id as "documentId",
  d.title as "documentTitle",
  s.task_attempt_id as "taskAttemptId",
  ta.attempt_number as "attemptNumber",
  s.certificate_id as "certificateId",
  c.verification_token as "certificateVerificationToken",
  s.submitted_at as "submittedAt",
  s.payload_snapshot as "payloadSnapshot",
  s.plain_text_snapshot as "plainTextSnapshot",
  s.supersedes_submission_id as "supersedesSubmissionId",
  s.status,
  COALESCE(s.anomaly_flags, c.anomaly_flags, '[]'::jsonb) as "anomalyFlags",
  COALESCE((
    SELECT COUNT(*)::int
    FROM document_events de
    WHERE de.document_id = s.document_id
      AND de.event_type = 'ai_policy_refusal'
      AND de.timestamp <= s.submitted_at
  ), 0) as "aiPolicyRefusalCount",
  s.created_at as "createdAt"
`;

const SUBMISSION_SUMMARY_SELECT_FIELDS = `
  s.id,
  s.task_id as "taskId",
  s.user_id as "userId",
  u.email as "userEmail",
  s.document_id as "documentId",
  d.title as "documentTitle",
  s.task_attempt_id as "taskAttemptId",
  ta.attempt_number as "attemptNumber",
  s.certificate_id as "certificateId",
  c.verification_token as "certificateVerificationToken",
  s.submitted_at as "submittedAt",
  s.supersedes_submission_id as "supersedesSubmissionId",
  s.status,
  COALESCE(s.anomaly_flags, c.anomaly_flags, '[]'::jsonb) as "anomalyFlags",
  s.created_at as "createdAt"
`;

function normalizeSubmissionListOptions(options: SubmissionListOptions = {}) {
  const requestedLimit = Number.isFinite(options.limit)
    ? Math.trunc(options.limit as number)
    : DEFAULT_SUBMISSION_LIST_LIMIT;
  const requestedOffset = Number.isFinite(options.offset)
    ? Math.trunc(options.offset as number)
    : 0;

  return {
    limit: Math.min(Math.max(requestedLimit, 1), MAX_SUBMISSION_LIST_LIMIT),
    offset: Math.max(requestedOffset, 0),
  };
}

export class SubmissionModel {
  static async create(data: SubmissionInsertData): Promise<Submission> {
    const sql = `
      INSERT INTO submissions (
        task_id,
        user_id,
        document_id,
        task_attempt_id,
        payload_snapshot,
        plain_text_snapshot,
        supersedes_submission_id,
        anomaly_flags,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${SUBMISSION_SELECT_FIELDS}
    `;

    const submission = await queryOne<Submission>(sql, [
      data.taskId,
      data.userId,
      data.documentId,
      data.taskAttemptId || null,
      JSON.stringify(data.payloadSnapshot),
      data.plainTextSnapshot,
      data.supersedesSubmissionId || null,
      JSON.stringify(data.anomalyFlags || []),
      data.status || 'active',
    ]);

    if (!submission) {
      throw new Error('Failed to create submission');
    }

    return submission;
  }

  static async findById(id: string): Promise<Submission | null> {
    const sql = `
      SELECT ${SUBMISSION_WITH_CERTIFICATE_SELECT_FIELDS}
      FROM submissions s
      LEFT JOIN certificates c ON c.id = s.certificate_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN documents d ON d.id = s.document_id
      LEFT JOIN task_attempts ta ON ta.id = s.task_attempt_id
      WHERE s.id = $1
    `;

    return queryOne<Submission>(sql, [id]);
  }

  static async findLatestForUserTask(taskId: string, userId: string): Promise<Submission | null> {
    const sql = `
      SELECT ${SUBMISSION_SELECT_FIELDS}
      FROM submissions
      WHERE task_id = $1 AND user_id = $2
      ORDER BY submitted_at DESC, created_at DESC
      LIMIT 1
    `;

    return queryOne<Submission>(sql, [taskId, userId]);
  }

  static async findActiveForUserTask(taskId: string, userId: string): Promise<Submission | null> {
    const sql = `
      SELECT ${SUBMISSION_SELECT_FIELDS}
      FROM submissions
      WHERE task_id = $1 AND user_id = $2 AND status = 'active'
      ORDER BY submitted_at DESC, created_at DESC
      LIMIT 1
    `;

    return queryOne<Submission>(sql, [taskId, userId]);
  }

  static async findActiveForTaskAttempt(taskAttemptId: string): Promise<Submission | null> {
    const sql = `
      SELECT ${SUBMISSION_SELECT_FIELDS}
      FROM submissions
      WHERE task_attempt_id = $1 AND status = 'active'
      ORDER BY submitted_at DESC, created_at DESC
      LIMIT 1
    `;

    return queryOne<Submission>(sql, [taskAttemptId]);
  }

  private static async listForTaskScope(
    taskId: string,
    userId: string | null,
    options: SubmissionListOptions = {}
  ): Promise<SubmissionListResult> {
    const { limit, offset } = normalizeSubmissionListOptions(options);
    const hasUserFilter = Boolean(userId);
    const filterClause = hasUserFilter ? 'WHERE s.task_id = $1 AND s.user_id = $2' : 'WHERE s.task_id = $1';
    const countFilterClause = hasUserFilter ? 'WHERE task_id = $1 AND user_id = $2' : 'WHERE task_id = $1';
    const baseParams: string[] = hasUserFilter && userId ? [taskId, userId] : [taskId];
    const limitParamIndex = baseParams.length + 1;
    const offsetParamIndex = baseParams.length + 2;

    const sql = `
      WITH scoped_submissions AS (
        SELECT ${SUBMISSION_SUMMARY_SELECT_FIELDS}
        FROM submissions s
        LEFT JOIN certificates c ON c.id = s.certificate_id
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN documents d ON d.id = s.document_id
        LEFT JOIN task_attempts ta ON ta.id = s.task_attempt_id
        ${filterClause}
        ORDER BY s.submitted_at DESC, s.created_at DESC, s.id DESC
        LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
      ),
      refusal_counts AS (
        SELECT
          ss."id" AS "submissionId",
          COUNT(de.id)::int AS "aiPolicyRefusalCount"
        FROM scoped_submissions ss
        JOIN document_events de
          ON de.document_id = ss."documentId"
          AND de.event_type = 'ai_policy_refusal'
          AND de.timestamp <= ss."submittedAt"
        GROUP BY ss."id"
      )
      SELECT
        ss.*,
        COALESCE(rc."aiPolicyRefusalCount", 0) AS "aiPolicyRefusalCount"
      FROM scoped_submissions ss
      LEFT JOIN refusal_counts rc ON rc."submissionId" = ss."id"
      ORDER BY ss."submittedAt" DESC, ss."createdAt" DESC, ss."id" DESC
    `;

    const countSql = `
      SELECT COUNT(*)::int AS count
      FROM submissions
      ${countFilterClause}
    `;

    const [submissions, totalRow] = await Promise.all([
      query<SubmissionSummary>(sql, [...baseParams, limit, offset]),
      queryOne<{ count: number | string }>(countSql, baseParams),
    ]);
    const total = Number(totalRow?.count || 0);

    return {
      submissions,
      total,
      limit,
      offset,
      hasMore: offset + submissions.length < total,
    };
  }

  static async listForUserTaskPage(
    taskId: string,
    userId: string,
    options: SubmissionListOptions = {}
  ): Promise<SubmissionListResult> {
    return this.listForTaskScope(taskId, userId, options);
  }

  static async listForTaskPage(
    taskId: string,
    options: SubmissionListOptions = {}
  ): Promise<SubmissionListResult> {
    return this.listForTaskScope(taskId, null, options);
  }

  static async listForUserTask(taskId: string, userId: string): Promise<SubmissionSummary[]> {
    const result = await this.listForUserTaskPage(taskId, userId);
    return result.submissions;
  }

  static async listForTask(taskId: string): Promise<SubmissionSummary[]> {
    const result = await this.listForTaskPage(taskId);
    return result.submissions;
  }

  static async markHistoricalForUserTask(taskId: string, userId: string): Promise<void> {
    const sql = `
      UPDATE submissions
      SET status = 'historical'
      WHERE task_id = $1 AND user_id = $2 AND status = 'active'
    `;

    await query(sql, [taskId, userId]);
  }

  static async attachCertificate(submissionId: string, certificateId: string): Promise<Submission | null> {
    const sql = `
      UPDATE submissions
      SET
        certificate_id = $2,
        anomaly_flags = COALESCE((SELECT anomaly_flags FROM certificates WHERE id = $2), '[]'::jsonb)
      WHERE id = $1
      RETURNING ${SUBMISSION_SELECT_FIELDS}
    `;

    return queryOne<Submission>(sql, [submissionId, certificateId]);
  }
}
