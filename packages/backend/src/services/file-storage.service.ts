import crypto from 'crypto';
import path from 'path';
import { AppError } from '../middleware/error-handler';
import { GcsFileStorageAdapter } from './file-storage/gcs-file-storage.adapter';
import { LocalFileStorageAdapter } from './file-storage/local-file-storage.adapter';
import type {
  FileStorageObjectMetadata,
  FileStorageAdapter,
  FileStorageLocator,
  FileStorageProvider,
  NormalizedFileStorageLocator,
  SignedFileUrl,
  StoredFile,
} from './file-storage/types';

const SIGNED_UPLOAD_TTL_MS = 30 * 60 * 1000;
const SIGNED_READ_TTL_MS = 10 * 60 * 1000;

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

  static supportsSignedUploads(): boolean {
    return this.activeProvider() === 'gcs';
  }

  static async createSignedUploadUrl(
    storageKey: string,
    contentType = 'application/pdf'
  ): Promise<SignedFileUrl> {
    const adapter = this.writeAdapter();
    if (!adapter.createSignedUploadUrl) {
      throw new AppError(409, 'Signed file upload is unavailable in this environment');
    }

    return adapter.createSignedUploadUrl(storageKey, {
      contentType,
      expiresAt: new Date(Date.now() + SIGNED_UPLOAD_TTL_MS),
    });
  }

  static async createSignedReadUrl(locator: FileStorageLocator): Promise<SignedFileUrl> {
    const normalized = this.normalizeLocator(locator);
    const adapter = this.readAdapter(normalized.storageProvider);
    if (!adapter.createSignedReadUrl) {
      throw new AppError(409, 'Signed file read is unavailable in this environment');
    }

    return adapter.createSignedReadUrl(normalized, {
      expiresAt: new Date(Date.now() + SIGNED_READ_TTL_MS),
    });
  }

  static async getMetadata(locator: FileStorageLocator): Promise<FileStorageObjectMetadata> {
    const normalized = this.normalizeLocator(locator);
    const adapter = this.readAdapter(normalized.storageProvider);
    if (!adapter.getMetadata) {
      throw new AppError(409, 'File metadata is unavailable in this environment');
    }

    return adapter.getMetadata(normalized);
  }

  static buildObjectKey(fileId: string, checksum: string): string {
    const normalizedChecksum = checksum.toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalizedChecksum)) {
      throw new AppError(400, 'Invalid file checksum');
    }

    const prefix = (process.env.FILE_STORAGE_KEY_PREFIX || process.env.GCS_UPLOAD_PREFIX || 'files')
      .trim()
      .replace(/^\/+|\/+$/g, '');

    const filename = `${normalizedChecksum}.pdf`;
    return prefix
      ? path.posix.join(prefix, fileId, filename)
      : path.posix.join(fileId, filename);
  }

  static async getStream(locator: FileStorageLocator) {
    const normalized = this.normalizeLocator(locator);
    return this.readAdapter(normalized.storageProvider).getStream(normalized);
  }

  static async getBuffer(locator: FileStorageLocator): Promise<Buffer> {
    const normalized = this.normalizeLocator(locator);
    return this.readAdapter(normalized.storageProvider).getBuffer(normalized);
  }

  static async delete(locator: FileStorageLocator): Promise<void> {
    const normalized = this.normalizeLocator(locator);
    return this.readAdapter(normalized.storageProvider).delete(normalized);
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

}
