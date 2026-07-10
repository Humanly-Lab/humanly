import crypto from 'crypto';
import path from 'path';
import { AppError } from '../middleware/error-handler';
import { GcsFileStorageAdapter } from './file-storage/gcs-file-storage.adapter';
import { LocalFileStorageAdapter } from './file-storage/local-file-storage.adapter';
import type {
  FileStorageAdapter,
  FileStorageLocator,
  FileStorageProvider,
  FileStorageStreamOptions,
  ListStorageObjectsOptions,
  NormalizedFileStorageLocator,
  SignedStorageReadUrl,
  StoredFile,
  StorageObjectMetadata,
} from './file-storage/types';

export class FileStorageService {
  private static readonly localAdapter = new LocalFileStorageAdapter();
  private static readonly gcsAdapter = new GcsFileStorageAdapter();

  static async init(): Promise<void> {
    await this.writeAdapter().init();
  }

  static async store(file: Buffer, fileId: string): Promise<StoredFile> {
    const checksum = crypto.createHash('sha256').update(file).digest('hex');
    const storageKey = this.buildObjectKey(fileId, checksum);
    return this.writeAdapter().store(file, storageKey, checksum);
  }

  static async getStream(locator: FileStorageLocator, options?: FileStorageStreamOptions) {
    const normalized = this.normalizeLocator(locator);
    return this.readAdapter(normalized.storageProvider).getStream(normalized, options);
  }

  static async getBuffer(locator: FileStorageLocator): Promise<Buffer> {
    const normalized = this.normalizeLocator(locator);
    return this.readAdapter(normalized.storageProvider).getBuffer(normalized);
  }

  static async getSignedReadUrl(
    locator: FileStorageLocator,
    expiresAt: Date
  ): Promise<SignedStorageReadUrl | null> {
    const normalized = this.normalizeLocator(locator);
    const adapter = this.readAdapter(normalized.storageProvider);
    if (!adapter.getSignedReadUrl) {
      return null;
    }

    return adapter.getSignedReadUrl(normalized, expiresAt);
  }

  static async delete(locator: FileStorageLocator): Promise<void> {
    const normalized = this.normalizeLocator(locator);
    return this.readAdapter(normalized.storageProvider).delete(normalized);
  }

  static listObjects(options: ListStorageObjectsOptions = {}): AsyncIterable<StorageObjectMetadata> {
    return this.writeAdapter().listObjects(options);
  }

  static activeStorageProvider(): FileStorageProvider {
    return this.activeProvider();
  }

  static defaultStorageKeyPrefix(): string {
    return this.storageKeyPrefix();
  }

  private static writeAdapter(): FileStorageAdapter {
    return this.adapterForProvider(this.activeProvider());
  }

  private static readAdapter(provider: FileStorageProvider): FileStorageAdapter {
    return this.adapterForProvider(provider);
  }

  private static adapterForProvider(provider: FileStorageProvider): FileStorageAdapter {
    if (provider === 'local') {
      return this.localAdapter;
    }

    if (!this.isGcsAdapterEnabled()) {
      throw new AppError(409, 'File unavailable in this environment');
    }

    return this.gcsAdapter;
  }

  private static isGcsAdapterEnabled(): boolean {
    return this.activeProvider() === 'gcs';
  }

  private static normalizeLocator(locator: FileStorageLocator): NormalizedFileStorageLocator {
    if (typeof locator === 'string') {
      return {
        storageProvider: 'local',
        storageKey: locator,
      };
    }

    const storageProvider = locator.storageProvider === 'gcs' ? 'gcs' : 'local';
    return {
      storageProvider,
      storageKey: locator.storageKey,
      storageBucket: locator.storageBucket,
    };
  }

  private static activeProvider(): FileStorageProvider {
    return process.env.FILE_STORAGE_PROVIDER?.toLowerCase() === 'gcs' ? 'gcs' : 'local';
  }

  private static buildObjectKey(fileId: string, checksum: string): string {
    const prefix = this.storageKeyPrefix();
    const filename = `${checksum}.pdf`;
    return prefix
      ? path.posix.join(prefix, fileId, filename)
      : path.posix.join(fileId, filename);
  }

  private static storageKeyPrefix(): string {
    return (process.env.FILE_STORAGE_KEY_PREFIX || process.env.GCS_UPLOAD_PREFIX || 'files')
      .trim()
      .replace(/^\/+|\/+$/g, '');
  }
}
