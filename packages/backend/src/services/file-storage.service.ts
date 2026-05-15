import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { Readable } from 'stream';
import { AppError } from '../middleware/error-handler';

export class FileStorageService {
  private static storageRoot = process.env.UPLOAD_DIR
    ? process.env.UPLOAD_DIR
    : path.join(__dirname, '../../storage');

  static async init(): Promise<void> {
    await fs.ensureDir(this.storageRoot);
  }

  static async store(file: Buffer, fileId: string): Promise<{
    storageProvider: string;
    storageKey: string;
    checksum: string;
    fileSize: number;
  }> {
    await this.init();

    const checksum = crypto.createHash('sha256').update(file).digest('hex');
    const directory = path.join(this.storageRoot, 'files', fileId);
    await fs.ensureDir(directory);

    const filename = `${checksum}.pdf`;
    const absolutePath = path.join(directory, filename);
    await fs.writeFile(absolutePath, file);

    return {
      storageProvider: 'local',
      storageKey: path.join('files', fileId, filename),
      checksum,
      fileSize: file.length,
    };
  }

  static async getStream(storageKey: string): Promise<Readable> {
    const absolutePath = await this.resolveAndVerify(storageKey);
    return fs.createReadStream(absolutePath);
  }

  static async getBuffer(storageKey: string): Promise<Buffer> {
    const absolutePath = await this.resolveAndVerify(storageKey);
    return fs.readFile(absolutePath);
  }

  static async delete(storageKey: string): Promise<void> {
    const absolutePath = path.isAbsolute(storageKey)
      ? storageKey
      : path.join(this.storageRoot, storageKey);

    if (!(await fs.pathExists(absolutePath))) {
      return;
    }

    const realPath = await fs.realpath(absolutePath);
    const realStorageRoot = await fs.realpath(this.storageRoot);

    if (!realPath.startsWith(realStorageRoot + path.sep) && realPath !== realStorageRoot) {
      throw new AppError(403, 'Invalid file path');
    }

    await fs.remove(realPath);

    const parentDirectory = path.dirname(realPath);
    const files = await fs.readdir(parentDirectory).catch(() => []);
    if (files.length === 0) {
      await fs.remove(parentDirectory);
    }
  }

  private static async resolveAndVerify(storageKey: string): Promise<string> {
    const absolutePath = path.isAbsolute(storageKey)
      ? storageKey
      : path.join(this.storageRoot, storageKey);

    if (!(await fs.pathExists(absolutePath))) {
      throw new AppError(404, 'File not found');
    }

    const realPath = await fs.realpath(absolutePath);
    const realStorageRoot = await fs.realpath(this.storageRoot);

    if (!realPath.startsWith(realStorageRoot + path.sep) && realPath !== realStorageRoot) {
      throw new AppError(403, 'Invalid file path');
    }

    return realPath;
  }
}
