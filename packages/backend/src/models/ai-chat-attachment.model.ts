import { query, queryOne } from '../config/database';

/**
 * Ownership record for chat image attachments (#93). Lets the websocket
 * dispatch layer refuse a client that tries to use another user's
 * uploaded storageKey.
 */
export interface AIChatAttachmentRow {
  storage_key: string;
  storage_provider: 'local' | 'gcs';
  storage_bucket: string | null;
  user_id: string;
  mime_type: string;
  filename: string | null;
  size_bytes: number | null;
  image_bytes: Buffer | null;
  created_at: Date;
}

export class AIChatAttachmentModel {
  /**
   * Record an upload right after FileStorageService.store succeeds. The
   * storageKey is the primary key; concurrent uploads of identical bytes
   * by the same user collapse onto the same content-addressed key and the
   * `ON CONFLICT DO NOTHING` keeps the call idempotent.
   */
  static async record(args: {
    storageKey: string;
    storageProvider?: 'local' | 'gcs';
    storageBucket?: string | null;
    userId: string;
    mimeType: string;
    filename?: string;
    sizeBytes?: number;
    imageBytes?: Buffer;
  }): Promise<void> {
    await query(
      `
      INSERT INTO ai_chat_attachments (
        storage_key,
        storage_provider,
        storage_bucket,
        user_id,
        mime_type,
        filename,
        size_bytes,
        image_bytes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (storage_key) DO NOTHING
      `,
      [
        args.storageKey,
        args.storageProvider ?? 'local',
        args.storageBucket ?? null,
        args.userId,
        args.mimeType,
        args.filename ?? null,
        args.sizeBytes ?? null,
        args.imageBytes ?? null,
      ],
    );
  }

  /**
   * Verify the given storageKey belongs to the requesting user. Returns
   * true when the row exists AND its user_id matches; false in every
   * other case (missing row, wrong owner). Callers should refuse the
   * dispatch when this returns false.
   */
  static async isOwnedBy(storageKey: string, userId: string): Promise<boolean> {
    return !!(await this.findOwnedByStorageKey(storageKey, userId));
  }

  /**
   * Return the attachment row only when it belongs to the requesting user.
   * Callers can pass the returned storage locator straight to
   * FileStorageService so provider-specific storage (for example GCS in
   * production) is preserved.
   */
  static async findOwnedByStorageKey(
    storageKey: string,
    userId: string,
  ): Promise<AIChatAttachmentRow | null> {
    return queryOne<AIChatAttachmentRow>(
      `
      SELECT
        storage_key,
        COALESCE(storage_provider, 'local') AS storage_provider,
        storage_bucket,
        user_id,
        mime_type,
        filename,
        size_bytes,
        image_bytes,
        created_at
      FROM ai_chat_attachments
      WHERE storage_key = $1
        AND user_id = $2
      `,
      [storageKey, userId],
    );
  }
}
