import type { Readable } from 'stream';
import { Storage, type StorageOptions } from '@google-cloud/storage';
import { AppError } from '../../middleware/error-handler';
import type {
  FileStorageAdapter,
  FileStorageObjectMetadata,
  NormalizedFileStorageLocator,
  SignedFileUrl,
  StoredFile,
} from './types';

export class GcsFileStorageAdapter implements FileStorageAdapter {
  readonly provider = 'gcs' as const;
  private gcsClient: Storage | null = null;

  async init(): Promise<void> {
    this.gcsBucketName();
  }

  async store(file: Buffer, storageKey: string, checksum: string): Promise<StoredFile> {
    const bucketName = this.gcsBucketName();
    const gcsFile = this.gcsClientInstance().bucket(bucketName).file(storageKey);

    await gcsFile.save(file, {
      contentType: 'application/pdf',
      resumable: false,
      metadata: {
        metadata: {
          checksum,
        },
      },
    });

    const [metadata] = await gcsFile.getMetadata();

    return {
      storageProvider: this.provider,
      storageKey,
      storageBucket: bucketName,
      storageRegion: process.env.GCS_BUCKET_REGION || process.env.GCS_REGION || null,
      storageEtag: typeof metadata.etag === 'string' ? metadata.etag : null,
      checksum,
      fileSize: file.length,
      uploadStatus: 'ready',
    };
  }

  async getStream(locator: NormalizedFileStorageLocator): Promise<Readable> {
    const gcsFile = await this.getExistingGcsFile(locator);
    return gcsFile.createReadStream();
  }

  async getBuffer(locator: NormalizedFileStorageLocator): Promise<Buffer> {
    const gcsFile = await this.getExistingGcsFile(locator);
    const [buffer] = await gcsFile.download();
    return buffer;
  }

  async delete(locator: NormalizedFileStorageLocator): Promise<void> {
    const gcsFile = this.getGcsFile(locator);
    await gcsFile.delete({ ignoreNotFound: true });
  }

  async createSignedUploadUrl(
    storageKey: string,
    options: { contentType: string; expiresAt: Date }
  ): Promise<SignedFileUrl> {
    const bucketName = this.gcsBucketName();
    const gcsFile = this.gcsClientInstance().bucket(bucketName).file(storageKey);
    const [url] = await gcsFile.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: options.expiresAt,
      contentType: options.contentType,
    });

    return {
      url,
      expiresAt: options.expiresAt,
      requiredHeaders: {
        'Content-Type': options.contentType,
      },
    };
  }

  async createSignedReadUrl(
    locator: NormalizedFileStorageLocator,
    options: { expiresAt: Date }
  ): Promise<SignedFileUrl> {
    const gcsFile = await this.getExistingGcsFile(locator);
    const [url] = await gcsFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: options.expiresAt,
    });

    return {
      url,
      expiresAt: options.expiresAt,
    };
  }

  async getMetadata(locator: NormalizedFileStorageLocator): Promise<FileStorageObjectMetadata> {
    const gcsFile = this.getGcsFile(locator);

    try {
      const [metadata] = await gcsFile.getMetadata();
      const sizeValue = typeof metadata.size === 'string'
        ? Number(metadata.size)
        : typeof metadata.size === 'number'
          ? metadata.size
          : null;

      return {
        exists: true,
        contentType: typeof metadata.contentType === 'string' ? metadata.contentType : null,
        size: Number.isFinite(sizeValue) ? sizeValue : null,
        etag: typeof metadata.etag === 'string' ? metadata.etag : null,
      };
    } catch (error) {
      if (this.storageErrorStatus(error) === 404) {
        return { exists: false };
      }
      throw error;
    }
  }

  private async getExistingGcsFile(locator: NormalizedFileStorageLocator) {
    const gcsFile = this.getGcsFile(locator);

    try {
      await gcsFile.getMetadata();
    } catch (error) {
      this.throwStorageError(error);
    }

    return gcsFile;
  }

  private getGcsFile(locator: NormalizedFileStorageLocator) {
    const bucketName = this.gcsBucketName(locator.storageBucket);
    return this.gcsClientInstance().bucket(bucketName).file(locator.storageKey);
  }

  private throwStorageError(error: unknown): never {
    const statusCode = this.storageErrorStatus(error);

    if (statusCode === 404) {
      throw new AppError(404, 'File not found');
    }

    throw error;
  }

  private storageErrorStatus(error: unknown): number | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? Number((error as { code?: unknown }).code)
      : undefined;
  }

  private gcsClientInstance(): Storage {
    if (!this.gcsClient) {
      const options: StorageOptions = {};
      if (process.env.GCS_PROJECT_ID) {
        options.projectId = process.env.GCS_PROJECT_ID;
      }
      if (process.env.GCS_KEY_FILENAME) {
        options.keyFilename = process.env.GCS_KEY_FILENAME;
      }
      this.gcsClient = new Storage(options);
    }

    return this.gcsClient;
  }

  private gcsBucketName(bucketName?: string | null): string {
    const resolved = bucketName || process.env.GCS_BUCKET_NAME;
    if (!resolved) {
      throw new AppError(500, 'Google Cloud Storage bucket is not configured');
    }

    return resolved;
  }
}
