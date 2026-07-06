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

export interface StorageObjectMetadata {
  storageProvider: FileStorageProvider;
  storageKey: string;
  storageBucket?: string | null;
  updatedAt?: Date | null;
  size?: number | null;
}

export interface ListStorageObjectsOptions {
  prefix?: string;
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

export interface FileStorageStreamOptions {
  start?: number;
  end?: number;
}

export interface FileStorageAdapter {
  readonly provider: FileStorageProvider;
  init(): Promise<void>;
  store(file: Buffer, storageKey: string, checksum: string): Promise<StoredFile>;
  getStream(locator: NormalizedFileStorageLocator, options?: FileStorageStreamOptions): Promise<Readable>;
  getBuffer(locator: NormalizedFileStorageLocator): Promise<Buffer>;
  delete(locator: NormalizedFileStorageLocator): Promise<void>;
  listObjects(options?: ListStorageObjectsOptions): AsyncIterable<StorageObjectMetadata>;
}
