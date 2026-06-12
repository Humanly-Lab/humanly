import fs from 'fs-extra';
import os from 'os';
import path from 'path';

describe('FileStorageService', () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'humanly-file-storage-'));
    process.env.UPLOAD_DIR = tempDir;
    process.env.FILE_STORAGE_PROVIDER = 'local';
    jest.resetModules();
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.remove(tempDir);
    jest.dontMock('@google-cloud/storage');
    jest.resetModules();
  });

  it('stores, reads, and deletes PDF files through the local storage adapter', async () => {
    const { LocalFileStorageAdapter } = await import('../../services/file-storage/local-file-storage.adapter');
    const adapter = new LocalFileStorageAdapter();
    const pdf = Buffer.from('%PDF-1.4\nnew file\n');

    const stored = await adapter.store(pdf, 'files/file-1/checksum.pdf', 'checksum');
    const readBack = await adapter.getBuffer(stored);
    await adapter.delete(stored);

    expect(stored.storageProvider).toBe('local');
    expect(stored.storageKey).toBe('files/file-1/checksum.pdf');
    expect(stored.uploadStatus).toBe('ready');
    expect(readBack).toEqual(pdf);
    await expect(adapter.getBuffer(stored)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('stores newly uploaded PDF files through the configured write adapter', async () => {
    const { FileStorageService } = await import('../../services/file-storage.service');
    const pdf = Buffer.from('%PDF-1.4\nnew file\n');

    const stored = await FileStorageService.store(pdf, 'file-1');
    const readBack = await FileStorageService.getBuffer(stored);

    expect(stored.storageProvider).toBe('local');
    expect(stored.storageKey).toMatch(/^files\/file-1\/[a-f0-9]{64}\.pdf$/);
    expect(stored.uploadStatus).toBe('ready');
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

  it('stores, reads, and deletes PDF files through the Google Cloud Storage adapter when configured', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const getMetadata = jest.fn().mockResolvedValue([{ etag: 'etag-1' }]);
    const download = jest.fn().mockResolvedValue([Buffer.from('%PDF-1.4\ngcs file\n')]);
    const deleteObject = jest.fn().mockResolvedValue([{}]);
    const getSignedUrl = jest.fn()
      .mockResolvedValueOnce(['https://storage.example/upload'])
      .mockResolvedValueOnce(['https://storage.example/read']);
    const file = jest.fn().mockReturnValue({
      save,
      getMetadata,
      download,
      delete: deleteObject,
      getSignedUrl,
    });
    const bucket = jest.fn().mockReturnValue({ file });
    const Storage = jest.fn().mockReturnValue({ bucket });

    jest.doMock('@google-cloud/storage', () => ({ Storage }));
    process.env.FILE_STORAGE_PROVIDER = 'gcs';
    process.env.GCS_BUCKET_NAME = 'humanly-pdfs';
    process.env.GCS_BUCKET_REGION = 'northamerica-northeast1';

    const { GcsFileStorageAdapter } = await import('../../services/file-storage/gcs-file-storage.adapter');
    const adapter = new GcsFileStorageAdapter();

    const stored = await adapter.store(Buffer.from('%PDF-1.4\ngcs file\n'), 'files/file-2/checksum.pdf', 'checksum');
    const uploadUrl = await adapter.createSignedUploadUrl('files/file-2/checksum.pdf', {
      contentType: 'application/pdf',
      expiresAt: new Date('2026-05-15T12:30:00.000Z'),
    });
    const readUrl = await adapter.createSignedReadUrl(stored, {
      expiresAt: new Date('2026-05-15T12:10:00.000Z'),
    });
    const readBack = await adapter.getBuffer(stored);
    await adapter.delete(stored);

    expect(stored).toEqual(expect.objectContaining({
      storageProvider: 'gcs',
      storageBucket: 'humanly-pdfs',
      storageRegion: 'northamerica-northeast1',
      storageEtag: 'etag-1',
      uploadStatus: 'ready',
    }));
    expect(stored.storageKey).toBe('files/file-2/checksum.pdf');
    expect(bucket).toHaveBeenCalledWith('humanly-pdfs');
    expect(file).toHaveBeenCalledWith(stored.storageKey);
    expect(save).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({
      contentType: 'application/pdf',
      resumable: false,
    }));
    expect(getSignedUrl).toHaveBeenNthCalledWith(1, {
      version: 'v4',
      action: 'write',
      expires: new Date('2026-05-15T12:30:00.000Z'),
      contentType: 'application/pdf',
    });
    expect(getSignedUrl).toHaveBeenNthCalledWith(2, {
      version: 'v4',
      action: 'read',
      expires: new Date('2026-05-15T12:10:00.000Z'),
    });
    expect(uploadUrl).toEqual({
      url: 'https://storage.example/upload',
      expiresAt: new Date('2026-05-15T12:30:00.000Z'),
      requiredHeaders: { 'Content-Type': 'application/pdf' },
    });
    expect(readUrl).toEqual({
      url: 'https://storage.example/read',
      expiresAt: new Date('2026-05-15T12:10:00.000Z'),
    });
    expect(getMetadata).toHaveBeenCalledTimes(3);
    expect(readBack).toEqual(Buffer.from('%PDF-1.4\ngcs file\n'));
    expect(deleteObject).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('does not fetch GCS-backed files when the local environment disables GCS storage', async () => {
    const Storage = jest.fn();
    jest.doMock('@google-cloud/storage', () => ({ Storage }));
    process.env.FILE_STORAGE_PROVIDER = 'local';

    const { FileStorageService } = await import('../../services/file-storage.service');

    await expect(FileStorageService.getBuffer({
      storageProvider: 'gcs',
      storageKey: 'files/remote/checksum.pdf',
      storageBucket: 'humanly-prod-pdfs',
      storageRegion: 'US',
      storageEtag: 'etag-1',
    })).rejects.toMatchObject({
      statusCode: 409,
      message: 'File unavailable in this environment',
    });
    expect(Storage).not.toHaveBeenCalled();
  });
});
