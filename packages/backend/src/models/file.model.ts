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
        file_size,
        checksum,
        page_count,
        legacy_source_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
      data.fileSize,
      data.checksum,
      data.pageCount || null,
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

  static async delete(fileId: string): Promise<void> {
    await query('DELETE FROM files WHERE id = $1', [fileId]);
  }

  private static columns = `
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
    file_size as "fileSize",
    checksum,
    page_count as "pageCount",
    legacy_source_id as "legacySourceId",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
}
