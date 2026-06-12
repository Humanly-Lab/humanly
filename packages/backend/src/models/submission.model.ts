import { query, queryOne } from '../config/database';
import { Submission, SubmissionInsertData } from '@humanly/shared';

const SUBMISSION_SELECT_FIELDS = `
  id,
  task_id as "taskId",
  user_id as "userId",
  document_id as "documentId",
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

export class SubmissionModel {
  static async create(data: SubmissionInsertData): Promise<Submission> {
    const sql = `
      INSERT INTO submissions (
        task_id,
        user_id,
        document_id,
        payload_snapshot,
        plain_text_snapshot,
        supersedes_submission_id,
        anomaly_flags,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING ${SUBMISSION_SELECT_FIELDS}
    `;

    const submission = await queryOne<Submission>(sql, [
      data.taskId,
      data.userId,
      data.documentId,
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

  static async listForUserTask(taskId: string, userId: string): Promise<Submission[]> {
    const sql = `
      SELECT ${SUBMISSION_WITH_CERTIFICATE_SELECT_FIELDS}
      FROM submissions s
      LEFT JOIN certificates c ON c.id = s.certificate_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN documents d ON d.id = s.document_id
      WHERE s.task_id = $1 AND s.user_id = $2
      ORDER BY s.submitted_at DESC, s.created_at DESC
    `;

    return query<Submission>(sql, [taskId, userId]);
  }

  static async listForTask(taskId: string): Promise<Submission[]> {
    const sql = `
      SELECT ${SUBMISSION_WITH_CERTIFICATE_SELECT_FIELDS}
      FROM submissions s
      LEFT JOIN certificates c ON c.id = s.certificate_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN documents d ON d.id = s.document_id
      WHERE s.task_id = $1
      ORDER BY s.submitted_at DESC, s.created_at DESC
    `;

    return query<Submission>(sql, [taskId]);
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
