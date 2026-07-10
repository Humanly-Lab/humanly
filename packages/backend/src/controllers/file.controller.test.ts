import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import type { Request, Response } from 'express';
import type { AppFile } from '@humanly/shared';
import { downloadFileContent, getFileViewSource, streamFileContent } from './file.controller';
import { FileService } from '../services/file.service';

class MockResponse extends Writable {
  readonly headers = new Map<string, number | string | readonly string[]>();
  statusCode = 200;
  body: unknown;

  setHeader(name: string, value: number | string | readonly string[]): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  getHeader(name: string): number | string | readonly string[] | undefined {
    return this.headers.get(name.toLowerCase());
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(body: unknown): this {
    this.body = body;
    return this;
  }

  _write(_chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    callback();
  }
}

function createRequest(headers: Record<string, string> = {}, query: Record<string, string> = {}): Request {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    params: { fileId: 'file-1' },
    query,
    user: { userId: 'user-1' },
    get(name: string) {
      return normalizedHeaders.get(name.toLowerCase());
    },
  } as unknown as Request;
}

function createAppFile(originalFilename = 'source.pdf'): AppFile {
  return {
    id: 'file-1',
    ownerUserId: 'user-1',
    documentId: 'document-1',
    taskId: null,
    purpose: 'document_source_pdf',
    title: 'Source',
    originalFilename,
    mimeType: 'application/pdf',
    storageProvider: 'local',
    storageKey: 'files/file-1/source.pdf',
    storageBucket: null,
    storageRegion: null,
    storageEtag: null,
    fileSize: 100,
    checksum: 'checksum',
    pageCount: 1,
    uploadStatus: 'ready',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

async function withStreamFileStub(
  handler: (captured: { options?: { viewToken?: string; rangeHeader?: string } }) => Promise<void>,
  result: Awaited<ReturnType<typeof FileService.streamFile>>
): Promise<void> {
  const originalStreamFile = FileService.streamFile;
  const captured: { options?: { viewToken?: string; rangeHeader?: string } } = {};

  FileService.streamFile = (async (_fileId, _userId, options) => {
    captured.options = options;
    return result;
  }) as typeof FileService.streamFile;

  try {
    await handler(captured);
  } finally {
    FileService.streamFile = originalStreamFile;
  }
}

async function testInlineContentUsesRangeDelivery(): Promise<void> {
  await withStreamFileStub(
    async (captured) => {
      const req = createRequest({
        Range: 'bytes=0-9',
        'X-File-View-Token': 'view-token',
      });
      const res = new MockResponse();

      await streamFileContent(req, res as unknown as Response);

      assert.deepEqual(captured.options, {
        viewToken: 'view-token',
        rangeHeader: 'bytes=0-9',
      });
      assert.equal(res.statusCode, 206);
      assert.equal(res.getHeader('Content-Disposition'), 'inline');
      assert.equal(res.getHeader('Accept-Ranges'), 'bytes');
      assert.equal(res.getHeader('Content-Length'), '10');
      assert.equal(res.getHeader('Content-Range'), 'bytes 0-9/100');
    },
    {
      kind: 'stream',
      file: createAppFile(),
      stream: Readable.from(['0123456789']),
      fileSize: 100,
      contentLength: 10,
      range: { start: 0, end: 9 },
      contentRange: 'bytes 0-9/100',
    }
  );
}

async function testViewSourceForwardsTokenAndDisablesResponseCaching(): Promise<void> {
  const originalGetFileViewSource = FileService.getFileViewSource;
  let captured: { fileId?: string; userId?: string; viewToken?: string } = {};

  FileService.getFileViewSource = (async (fileId, userId, options) => {
    captured = { fileId, userId, viewToken: options.viewToken };
    return {
      delivery: 'signed-url',
      url: 'https://storage.googleapis.com/example/source.pdf?signature=redacted',
      expiresAt: '2026-01-01T00:15:00.000Z',
      expiresInSeconds: 900,
    };
  }) as typeof FileService.getFileViewSource;

  try {
    const req = createRequest({ 'X-File-View-Token': 'view-token' });
    const res = new MockResponse();

    await getFileViewSource(req, res as unknown as Response);

    assert.deepEqual(captured, {
      fileId: 'file-1',
      userId: 'user-1',
      viewToken: 'view-token',
    });
    assert.equal(res.getHeader('Cache-Control'), 'private, no-store');
    assert.deepEqual(res.body, {
      success: true,
      data: {
        delivery: 'signed-url',
        url: 'https://storage.googleapis.com/example/source.pdf?signature=redacted',
        expiresAt: '2026-01-01T00:15:00.000Z',
        expiresInSeconds: 900,
      },
    });
  } finally {
    FileService.getFileViewSource = originalGetFileViewSource;
  }
}

async function testDownloadUsesAttachmentDisposition(): Promise<void> {
  await withStreamFileStub(
    async (captured) => {
      const req = createRequest({ Range: 'bytes=0-9' });
      const res = new MockResponse();

      await downloadFileContent(req, res as unknown as Response);

      assert.deepEqual(captured.options, {
        viewToken: undefined,
        rangeHeader: undefined,
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.getHeader('Content-Length'), '100');
      assert.equal(res.getHeader('Content-Range'), undefined);
      assert.match(
        String(res.getHeader('Content-Disposition')),
        /^attachment; filename="__ report\.pdf"; filename\*=UTF-8''%E4%B8%AD%E6%96%87%20report\.pdf$/
      );
    },
    {
      kind: 'stream',
      file: createAppFile('中文 report.pdf'),
      stream: Readable.from(['pdf']),
      fileSize: 100,
      contentLength: 100,
      range: null,
    }
  );
}

async function testDownloadTruncatesLongFilenames(): Promise<void> {
  const expectedFilename = `${'a'.repeat(196)}.pdf`;

  await withStreamFileStub(
    async () => {
      const req = createRequest();
      const res = new MockResponse();

      await downloadFileContent(req, res as unknown as Response);

      assert.equal(
        String(res.getHeader('Content-Disposition')),
        `attachment; filename="${expectedFilename}"; filename*=UTF-8''${expectedFilename}`
      );
    },
    {
      kind: 'stream',
      file: createAppFile(`${'a'.repeat(260)}.pdf`),
      stream: Readable.from(['pdf']),
      fileSize: 100,
      contentLength: 100,
      range: null,
    }
  );
}

async function run(): Promise<void> {
  await testViewSourceForwardsTokenAndDisablesResponseCaching();
  await testInlineContentUsesRangeDelivery();
  await testDownloadUsesAttachmentDisposition();
  await testDownloadTruncatesLongFilenames();
  console.log('file.controller tests passed');
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
