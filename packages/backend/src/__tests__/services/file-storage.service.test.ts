import fs from 'fs-extra';
import os from 'os';
import path from 'path';

describe('FileStorageService', () => {
  let tempDir: string;
  let originalUploadDir: string | undefined;

  beforeEach(async () => {
    originalUploadDir = process.env.UPLOAD_DIR;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'humanly-file-storage-'));
    process.env.UPLOAD_DIR = tempDir;
    jest.resetModules();
  });

  afterEach(async () => {
    if (originalUploadDir === undefined) {
      delete process.env.UPLOAD_DIR;
    } else {
      process.env.UPLOAD_DIR = originalUploadDir;
    }
    await fs.remove(tempDir);
    jest.resetModules();
  });

  it('stores and reads newly uploaded PDF files from the unified files path', async () => {
    const { FileStorageService } = await import('../../services/file-storage.service');
    const pdf = Buffer.from('%PDF-1.4\nnew file\n');

    const stored = await FileStorageService.store(pdf, 'file-1');
    const readBack = await FileStorageService.getBuffer(stored.storageKey);

    expect(stored.storageProvider).toBe('local');
    expect(stored.storageKey).toMatch(/^files\/file-1\/[a-f0-9]{64}\.pdf$/);
    expect(readBack).toEqual(pdf);
  });

  it('reads legacy backfilled PDF paths under the configured storage root', async () => {
    const { FileStorageService } = await import('../../services/file-storage.service');
    const legacyStorageKey = 'papers/legacy-file/checksum.pdf';
    const pdf = Buffer.from('%PDF-1.4\nlegacy file\n');

    await fs.ensureDir(path.join(tempDir, 'papers', 'legacy-file'));
    await fs.writeFile(path.join(tempDir, legacyStorageKey), pdf);

    const readBack = await FileStorageService.getBuffer(legacyStorageKey);

    expect(readBack).toEqual(pdf);
  });
});
