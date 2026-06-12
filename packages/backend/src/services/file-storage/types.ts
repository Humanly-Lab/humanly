import type { Readable } from 'stream';
import type { AppFile, FileUploadStatus } from '@humanly/shared';

export type FileStorageProvider = 'local' | 'gcs';

export type FileStorageLocator = string | Pick<
  AppFile,
  'storageProvider' | 'storageKey' | 'storageBucket' | 'storageRegion' | 'storageEtag'
>;

export interface NormalizedFileStorageLocator {
  storageProvider: FileStorageProvider;
  storageKey: string;
  storageBucket?: string | null;
}

export interface StoredFile {
  storageProvider: FileStorageProvider;
  storageKey: string;
  storageBucket?: string | null;
  storageRegion?: string | null;
  storageEtag?: string | null;
  checksum: string;
  fileSize: number;
  uploadStatus: FileUploadStatus;
}

export interface SignedFileUrl {
  url: string;
  expiresAt: Date;
  requiredHeaders?: Record<string, string>;
}

export interface FileStorageObjectMetadata {
  exists: boolean;
  contentType?: string | null;
  size?: number | null;
  etag?: string | null;
}

export interface FileStorageAdapter {
  readonly provider: FileStorageProvider;
  init(): Promise<void>;
  store(file: Buffer, storageKey: string, checksum: string): Promise<StoredFile>;
  getStream(locator: NormalizedFileStorageLocator): Promise<Readable>;
  getBuffer(locator: NormalizedFileStorageLocator): Promise<Buffer>;
  delete(locator: NormalizedFileStorageLocator): Promise<void>;
  createSignedUploadUrl?(storageKey: string, options: {
    contentType: string;
    expiresAt: Date;
  }): Promise<SignedFileUrl>;
  createSignedReadUrl?(locator: NormalizedFileStorageLocator, options: {
    expiresAt: Date;
  }): Promise<SignedFileUrl>;
  getMetadata?(locator: NormalizedFileStorageLocator): Promise<FileStorageObjectMetadata>;
}
