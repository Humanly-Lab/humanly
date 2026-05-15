import fs from 'fs-extra';
import path from 'path';
import type { Readable } from 'stream';
import { AppError } from '../../middleware/error-handler';
import type {
  FileStorageAdapter,
  NormalizedFileStorageLocator,
  StoredFile,
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

  async getStream(locator: NormalizedFileStorageLocator): Promise<Readable> {
    const absolutePath = await this.resolveAndVerify(locator.storageKey);
    return fs.createReadStream(absolutePath);
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
}
