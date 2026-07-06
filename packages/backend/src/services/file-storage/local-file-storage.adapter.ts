import fs from 'fs-extra';
import path from 'path';
import type { Readable } from 'stream';
import { AppError } from '../../middleware/error-handler';
import type {
  FileStorageAdapter,
  FileStorageStreamOptions,
  ListStorageObjectsOptions,
  NormalizedFileStorageLocator,
  StoredFile,
  StorageObjectMetadata,
} from './types';

export class LocalFileStorageAdapter implements FileStorageAdapter {
  readonly provider = 'local' as const;

  async init(): Promise<void> {
    await fs.ensureDir(this.localStorageRoot());
  }

  async store(file: Buffer, storageKey: string, checksum: string): Promise<StoredFile> {
    await this.init();

    const absolutePath = this.localPath(storageKey);
    const directory = path.dirname(absolutePath);
    await fs.ensureDir(directory);

    await fs.writeFile(absolutePath, file);

    return {
      storageProvider: this.provider,
      storageKey,
      storageBucket: null,
      storageRegion: null,
      storageEtag: null,
      checksum,
      fileSize: file.length,
      uploadStatus: 'ready',
    };
  }

  async getStream(
    locator: NormalizedFileStorageLocator,
    options: FileStorageStreamOptions = {}
  ): Promise<Readable> {
    const absolutePath = await this.resolveAndVerify(locator.storageKey);
    return fs.createReadStream(absolutePath, {
      start: options.start,
      end: options.end,
    });
  }

  async getBuffer(locator: NormalizedFileStorageLocator): Promise<Buffer> {
    const absolutePath = await this.resolveAndVerify(locator.storageKey);
    return fs.readFile(absolutePath);
  }

  async delete(locator: NormalizedFileStorageLocator): Promise<void> {
    const absolutePath = path.isAbsolute(locator.storageKey)
      ? locator.storageKey
      : this.localPath(locator.storageKey);

    if (!(await fs.pathExists(absolutePath))) {
      return;
    }

    const realPath = await fs.realpath(absolutePath);
    await this.verifyPathUnderStorageRoot(realPath);

    await fs.remove(realPath);

    const parentDirectory = path.dirname(realPath);
    const files = await fs.readdir(parentDirectory).catch(() => []);
    if (files.length === 0) {
      await fs.remove(parentDirectory);
    }
  }

  async *listObjects(options: ListStorageObjectsOptions = {}): AsyncIterable<StorageObjectMetadata> {
    const root = this.localStorageRoot();
    if (!(await fs.pathExists(root))) {
      return;
    }

    const realRoot = await fs.realpath(root);
    const normalizedPrefix = this.normalizeStorageKey(options.prefix || '');
    const scanRoot = normalizedPrefix ? this.localPath(normalizedPrefix) : root;

    if (!(await fs.pathExists(scanRoot))) {
      return;
    }

    const realScanRoot = await fs.realpath(scanRoot);
    await this.verifyPathUnderStorageRoot(realScanRoot);

    yield* this.walkStorageDirectory(realScanRoot, realRoot, normalizedPrefix);
  }

  private async resolveAndVerify(storageKey: string): Promise<string> {
    const absolutePath = path.isAbsolute(storageKey)
      ? storageKey
      : this.localPath(storageKey);

    if (!(await fs.pathExists(absolutePath))) {
      throw new AppError(404, 'File not found');
    }

    const realPath = await fs.realpath(absolutePath);
    await this.verifyPathUnderStorageRoot(realPath);
    return realPath;
  }

  private async verifyPathUnderStorageRoot(realPath: string): Promise<void> {
    const realStorageRoot = await fs.realpath(this.localStorageRoot());

    if (!realPath.startsWith(realStorageRoot + path.sep) && realPath !== realStorageRoot) {
      throw new AppError(403, 'Invalid file path');
    }
  }

  private localStorageRoot(): string {
    return process.env.UPLOAD_DIR || path.join(__dirname, '../../../storage');
  }

  private localPath(storageKey: string): string {
    return path.join(this.localStorageRoot(), storageKey);
  }

  private normalizeStorageKey(storageKey: string): string {
    return storageKey
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
  }

  private async *walkStorageDirectory(
    directory: string,
    realRoot: string,
    prefix: string
  ): AsyncIterable<StorageObjectMetadata> {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const realPath = await fs.realpath(absolutePath);
      await this.verifyPathUnderStorageRoot(realPath);

      if (entry.isDirectory()) {
        yield* this.walkStorageDirectory(realPath, realRoot, prefix);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativeKey = path.relative(realRoot, realPath).split(path.sep).join('/');
      if (prefix && relativeKey !== prefix && !relativeKey.startsWith(`${prefix}/`)) {
        continue;
      }

      const stat = await fs.stat(realPath);
      yield {
        storageProvider: this.provider,
        storageKey: relativeKey,
        storageBucket: null,
        updatedAt: stat.mtime,
        size: stat.size,
      };
    }
  }
}
