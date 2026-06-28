import { query, queryOne } from '../config/database';
import type { AppFile, CreateFileData, FilePurpose, FileUploadStatus } from '@humanly/shared';

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

  static async findByTask(taskId: string, purpose: FilePurpose = 'task_instruction_pdf'): Promise<AppFile[]> {
    return query<AppFile>(
      `SELECT ${this.columns}
       FROM files
       WHERE task_id = $1 AND purpose = $2
       ORDER BY created_at DESC`,
      [taskId, purpose]
    );
  }

  static async findByTaskIds(taskIds: string[], purpose: FilePurpose = 'task_instruction_pdf'): Promise<AppFile[]> {
    if (taskIds.length === 0) {
      return [];
    }

    return query<AppFile>(
      `SELECT ${this.columns}
       FROM files
       WHERE task_id = ANY($1::uuid[]) AND purpose = $2
       ORDER BY task_id ASC, created_at DESC`,
      [taskIds, purpose]
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

  static async updateStorageMetadata(
    fileId: string,
    data: {
      storageProvider: string;
      storageKey: string;
      storageBucket?: string | null;
      storageRegion?: string | null;
      storageEtag?: string | null;
      fileSize: number;
      checksum: string;
      uploadStatus: FileUploadStatus;
      legacySourceId?: string | null;
    }
  ): Promise<AppFile | null> {
    return queryOne<AppFile>(
      `
        UPDATE files
        SET
          storage_provider = $2,
          storage_key = $3,
          storage_bucket = $4,
          storage_region = $5,
          storage_etag = $6,
          file_size = $7,
          checksum = $8,
          upload_status = $9,
          legacy_source_id = $10,
          updated_at = NOW()
        WHERE id = $1
        RETURNING ${this.columns}
      `,
      [
        fileId,
        data.storageProvider,
        data.storageKey,
        data.storageBucket || null,
        data.storageRegion || null,
        data.storageEtag || null,
        data.fileSize,
        data.checksum,
        data.uploadStatus,
        data.legacySourceId || null,
      ]
    );
  }

  static async delete(fileId: string): Promise<void> {
    await query('DELETE FROM files WHERE id = $1', [fileId]);
  }

  static async countStorageReferences(file: AppFile): Promise<number> {
    const row = await queryOne<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM files
        WHERE storage_provider = $1
          AND storage_key = $2
          AND COALESCE(storage_bucket, '') = COALESCE($3, '')
          AND COALESCE(storage_region, '') = COALESCE($4, '')
      `,
      [
        file.storageProvider,
        file.storageKey,
        file.storageBucket || null,
        file.storageRegion || null,
      ]
    );

    return Number(row?.count || 0);
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
