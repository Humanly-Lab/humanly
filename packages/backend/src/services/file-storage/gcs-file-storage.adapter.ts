import type { Readable } from 'stream';
import { Storage, type StorageOptions } from '@google-cloud/storage';
import { AppError } from '../../middleware/error-handler';
import type {
  FileStorageAdapter,
  FileStorageStreamOptions,
  ListStorageObjectsOptions,
  NormalizedFileStorageLocator,
  StoredFile,
  StorageObjectMetadata,
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

  async getStream(
    locator: NormalizedFileStorageLocator,
    options: FileStorageStreamOptions = {}
  ): Promise<Readable> {
    const gcsFile = await this.getExistingGcsFile(locator);
    return gcsFile.createReadStream({
      start: options.start,
      end: options.end,
    });
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

  async *listObjects(options: ListStorageObjectsOptions = {}): AsyncIterable<StorageObjectMetadata> {
    const bucketName = this.gcsBucketName();
    const stream = this.gcsClientInstance().bucket(bucketName).getFilesStream({
      prefix: options.prefix,
    });

    for await (const gcsFile of stream as AsyncIterable<any>) {
      const metadata = gcsFile.metadata || {};
      const updatedAt = typeof metadata.updated === 'string'
        ? new Date(metadata.updated)
        : null;
      const size = metadata.size === undefined || metadata.size === null
        ? null
        : Number(metadata.size);

      yield {
        storageProvider: this.provider,
        storageKey: gcsFile.name,
        storageBucket: bucketName,
        updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
        size: Number.isFinite(size) ? size : null,
      };
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
    const statusCode = typeof error === 'object' && error !== null && 'code' in error
      ? Number((error as { code?: unknown }).code)
      : undefined;

    if (statusCode === 404) {
      throw new AppError(404, 'File not found');
    }

    throw error;
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
