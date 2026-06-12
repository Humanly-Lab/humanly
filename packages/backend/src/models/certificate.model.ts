import { query, queryOne } from '../config/database';
import {
  Certificate,
  CertificateInsertData,
  CertificateFilters,
  PaginatedResult,
} from '@humanly/shared';

const CERTIFICATE_SELECT_FIELDS = `
  id,
  submission_id as "submissionId",
  document_id as "documentId",
  user_id as "userId",
  certificate_type as "certificateType",
  status,
  title,
  document_snapshot as "documentSnapshot",
  plain_text_snapshot as "plainTextSnapshot",
  total_events as "totalEvents",
  typing_events as "typingEvents",
  paste_events as "pasteEvents",
  total_characters as "totalCharacters",
  typed_characters as "typedCharacters",
  pasted_characters as "pastedCharacters",
  editing_time_seconds as "editingTimeSeconds",
  anomaly_flags as "anomalyFlags",
  policy_hash as "policyHash",
  signature,
  verification_token as "verificationToken",
  signer_name as "signerName",
  include_full_text as "includeFullText",
  include_edit_history as "includeEditHistory",
  access_code as "accessCode",
  access_code_hash as "accessCodeHash",
  is_protected as "isProtected",
  generated_at as "generatedAt",
  pdf_generated as "pdfGenerated",
  pdf_url as "pdfUrl",
  json_url as "jsonUrl",
  created_at as "createdAt"
`;

export class CertificateModel {
  /**
   * Create a new certificate
   */
  static async create(data: CertificateInsertData): Promise<Certificate> {
    const sql = `
      INSERT INTO certificates (
        id, submission_id, document_id, user_id, certificate_type, status,
        title, document_snapshot, plain_text_snapshot,
        total_events, typing_events, paste_events,
        total_characters, typed_characters, pasted_characters,
        editing_time_seconds, anomaly_flags, policy_hash, signature, verification_token,
        signer_name, include_full_text, include_edit_history,
        access_code, access_code_hash, is_protected, generated_at
      )
      VALUES (
        COALESCE($1::uuid, uuid_generate_v4()), $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18, $19, $20,
        $21, $22, $23,
        $24, $25, $26, COALESCE($27::timestamptz, NOW())
      )
      RETURNING ${CERTIFICATE_SELECT_FIELDS}
    `;

    const certificate = await queryOne<Certificate>(sql, [
      data.id || null,
      data.submissionId || null,
      data.documentId,
      data.userId,
      data.certificateType,
      data.status || 'active',
      data.title,
      JSON.stringify(data.documentSnapshot),
      data.plainTextSnapshot,
      data.totalEvents,
      data.typingEvents,
      data.pasteEvents,
      data.totalCharacters,
      data.typedCharacters,
      data.pastedCharacters,
      data.editingTimeSeconds,
      JSON.stringify(data.anomalyFlags || []),
      data.policyHash || null,
      data.signature,
      data.verificationToken,
      data.signerName || null,
      data.includeFullText !== undefined ? data.includeFullText : true,
      data.includeEditHistory !== undefined ? data.includeEditHistory : true,
      data.accessCode || null,
      data.accessCodeHash || null,
      data.isProtected || false,
      data.generatedAt || null,
    ]);

    if (!certificate) {
      throw new Error('Failed to create certificate');
    }

    return certificate;
  }

  /**
   * Find certificate by ID
   */
  static async findById(id: string): Promise<Certificate | null> {
    const sql = `
      SELECT ${CERTIFICATE_SELECT_FIELDS}
      FROM certificates
      WHERE id = $1
    `;

    return queryOne<Certificate>(sql, [id]);
  }

  /**
   * Find certificate by ID and verify ownership
   */
  static async findByIdAndUserId(id: string, userId: string): Promise<Certificate | null> {
    const sql = `
      SELECT ${CERTIFICATE_SELECT_FIELDS}
      FROM certificates
      WHERE id = $1 AND user_id = $2
    `;

    return queryOne<Certificate>(sql, [id, userId]);
  }

  /**
   * Find certificate by verification token (for public verification)
   */
  static async findByVerificationToken(token: string): Promise<Certificate | null> {
    const sql = `
      SELECT ${CERTIFICATE_SELECT_FIELDS}
      FROM certificates
      WHERE verification_token = $1
    `;

    return queryOne<Certificate>(sql, [token]);
  }

  /**
   * Find certificates by user ID with filters
   */
  static async findByUserId(
    userId: string,
    filters: CertificateFilters = {}
  ): Promise<PaginatedResult<Certificate>> {
    const {
      documentId,
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    let whereClauses = ['user_id = $1'];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (documentId) {
      whereClauses.push(`document_id = $${paramIndex}`);
      params.push(documentId);
      paramIndex++;
    }

    const whereClause = whereClauses.join(' AND ');

    // Map sortBy to database column
    const sortColumnMap: Record<string, string> = {
      createdAt: 'created_at',
      generatedAt: 'generated_at',
    };
    const sortColumn = sortColumnMap[sortBy] || 'created_at';
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countSql = `
      SELECT COUNT(*) as count
      FROM certificates
      WHERE ${whereClause}
    `;
    const countResult = await queryOne<{ count: string }>(countSql, params);
    const total = parseInt(countResult?.count || '0', 10);

    // Get certificates
    const sql = `
      SELECT ${CERTIFICATE_SELECT_FIELDS}
      FROM certificates
      WHERE ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const certificates = await query<Certificate>(sql, [...params, limit, offset]);

    return {
      data: certificates,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + certificates.length < total,
      },
    };
  }

  /**
   * Find certificates by document ID
   */
  static async findByDocumentId(documentId: string): Promise<Certificate[]> {
    const sql = `
      SELECT ${CERTIFICATE_SELECT_FIELDS}
      FROM certificates
      WHERE document_id = $1
      ORDER BY created_at DESC
    `;

    return query<Certificate>(sql, [documentId]);
  }

  static async findBySubmissionId(submissionId: string): Promise<Certificate | null> {
    const sql = `
      SELECT ${CERTIFICATE_SELECT_FIELDS}
      FROM certificates
      WHERE submission_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    return queryOne<Certificate>(sql, [submissionId]);
  }

  static async markSupersededForDocument(documentId: string, userId: string): Promise<void> {
    const sql = `
      UPDATE certificates
      SET status = 'superseded'
      WHERE document_id = $1 AND user_id = $2 AND submission_id IS NOT NULL AND status = 'active'
    `;

    await query(sql, [documentId, userId]);
  }

  /**
   * Update PDF generation status and URL
   */
  static async updatePdfUrl(id: string, pdfUrl: string): Promise<void> {
    const sql = `
      UPDATE certificates
      SET pdf_generated = TRUE, pdf_url = $1
      WHERE id = $2
    `;

    await query(sql, [pdfUrl, id]);
  }

  /**
   * Update JSON URL
   */
  static async updateJsonUrl(id: string, jsonUrl: string): Promise<void> {
    const sql = `
      UPDATE certificates
      SET json_url = $1
      WHERE id = $2
    `;

    await query(sql, [jsonUrl, id]);
  }

  /**
   * Update certificate integrity signature
   */
  static async updateSignature(id: string, signature: string): Promise<Certificate | null> {
    const sql = `
      UPDATE certificates
      SET signature = $1
      WHERE id = $2
      RETURNING ${CERTIFICATE_SELECT_FIELDS}
    `;

    return queryOne<Certificate>(sql, [signature, id]);
  }

  /**
   * Count certificates for a user
   */
  static async countByUserId(userId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) as count
      FROM certificates
      WHERE user_id = $1
    `;

    const result = await queryOne<{ count: string }>(sql, [userId]);
    return parseInt(result?.count || '0', 10);
  }

  /**
   * Count certificates for a document
   */
  static async countByDocumentId(documentId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) as count
      FROM certificates
      WHERE document_id = $1
    `;

    const result = await queryOne<{ count: string }>(sql, [documentId]);
    return parseInt(result?.count || '0', 10);
  }

  /**
   * Check if verification token exists
   */
  static async verificationTokenExists(token: string): Promise<boolean> {
    const sql = `
      SELECT id
      FROM certificates
      WHERE verification_token = $1
    `;

    const result = await queryOne<{ id: string }>(sql, [token]);
    return !!result;
  }

  /**
   * Update certificate access code
   */
  static async updateAccessCode(
    id: string,
    accessCode: string | null,
    accessCodeHash: string | null,
    isProtected: boolean
  ): Promise<Certificate | null> {
    const sql = `
      UPDATE certificates
      SET access_code = $1, access_code_hash = $2, is_protected = $3
      WHERE id = $4
      RETURNING ${CERTIFICATE_SELECT_FIELDS}
    `;

    return queryOne<Certificate>(sql, [accessCode, accessCodeHash, isProtected, id]);
  }

  /**
   * Update certificate display options
   */
  static async updateDisplayOptions(
    id: string,
    includeFullText: boolean,
    includeEditHistory: boolean
  ): Promise<Certificate | null> {
    const sql = `
      UPDATE certificates
      SET include_full_text = $1, include_edit_history = $2
      WHERE id = $3
      RETURNING ${CERTIFICATE_SELECT_FIELDS}
    `;

    return queryOne<Certificate>(sql, [includeFullText, includeEditHistory, id]);
  }

  /**
   * Delete certificate
   */
  static async delete(id: string, userId: string): Promise<boolean> {
    const sql = `
      DELETE FROM certificates
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await queryOne<{ id: string }>(sql, [id, userId]);
    return !!result;
  }
}
