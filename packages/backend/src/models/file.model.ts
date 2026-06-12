import { query, queryOne } from '../config/database';
import type { AppFile, CreateFileData, FilePurpose } from '@humanly/shared';

export class FileModel {
  static async create(data: CreateFileData): Promise<AppFile> {
    const sql = `
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING ${this.columns}
    `;

    const file = await queryOne<AppFile>(sql, [
      data.id,
      data.ownerUserId,
      data.documentId || null,
      data.taskId || null,
      data.purpose,
      data.title,
      data.originalFilename,
      data.mimeType,
      data.storageProvider,
      data.storageKey,
      data.storageBucket || null,
      data.storageRegion || null,
      data.storageEtag || null,
      data.fileSize,
      data.checksum,
      data.pageCount || null,
      data.uploadStatus || 'ready',
      data.legacySourceId || null,
    ]);

    if (!file) {
      throw new Error('Failed to create file');
    }

    return file;
  }

  static async findById(fileId: string): Promise<AppFile | null> {
    return queryOne<AppFile>(`SELECT ${this.columns} FROM files WHERE id = $1`, [fileId]);
  }

  static async findByDocument(documentId: string, purpose: FilePurpose = 'document_source_pdf'): Promise<AppFile[]> {
    return query<AppFile>(
      `SELECT ${this.columns}
       FROM files
       WHERE document_id = $1 AND purpose = $2
       ORDER BY created_at DESC`,
      [documentId, purpose]
    );
  }

  static async findReadyByDocument(documentId: string, purpose: FilePurpose = 'document_source_pdf'): Promise<AppFile[]> {
    return query<AppFile>(
      `SELECT ${this.columns}
       FROM files
       WHERE document_id = $1 AND purpose = $2 AND upload_status = 'ready'
       ORDER BY created_at DESC`,
      [documentId, purpose]
    );
  }

  static async findByTask(taskId: string, purpose: FilePurpose = 'task_instruction_pdf'): Promise<AppFile[]> {
    return query<AppFile>(
      `SELECT ${this.columns}
       FROM files
       WHERE task_id = $1 AND purpose = $2
       ORDER BY created_at DESC`,
      [taskId, purpose]
    );
  }

  static async findReadyByTask(taskId: string, purpose: FilePurpose = 'task_instruction_pdf'): Promise<AppFile[]> {
    return query<AppFile>(
      `SELECT ${this.columns}
       FROM files
       WHERE task_id = $1 AND purpose = $2 AND upload_status = 'ready'
       ORDER BY created_at DESC`,
      [taskId, purpose]
    );
  }

  static async findByOwner(userId: string): Promise<AppFile[]> {
    return query<AppFile>(
      `SELECT ${this.columns}
       FROM files
       WHERE owner_user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
  }

  static async delete(fileId: string): Promise<void> {
    await query('DELETE FROM files WHERE id = $1', [fileId]);
  }

  static async markReady(fileId: string, data: {
    storageEtag?: string | null;
  } = {}): Promise<AppFile | null> {
    return queryOne<AppFile>(
      `UPDATE files
       SET upload_status = 'ready',
           storage_etag = COALESCE($2, storage_etag),
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${this.columns}`,
      [fileId, data.storageEtag || null]
    );
  }

  static async markFailed(fileId: string): Promise<AppFile | null> {
    return queryOne<AppFile>(
      `UPDATE files
       SET upload_status = 'failed',
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${this.columns}`,
      [fileId]
    );
  }

  static readonly columns = `
    id,
    owner_user_id as "ownerUserId",
    document_id as "documentId",
    task_id as "taskId",
    purpose,
    title,
    original_filename as "originalFilename",
    mime_type as "mimeType",
    storage_provider as "storageProvider",
    storage_key as "storageKey",
    storage_bucket as "storageBucket",
    storage_region as "storageRegion",
    storage_etag as "storageEtag",
    file_size as "fileSize",
    checksum,
    page_count as "pageCount",
    upload_status as "uploadStatus",
    legacy_source_id as "legacySourceId",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
}
