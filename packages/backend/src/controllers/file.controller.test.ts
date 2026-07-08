import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import type { Request, Response } from 'express';
import type { AppFile } from '@humanly/shared';
import { downloadFileContent, streamFileContent } from './file.controller';
import { FileService } from '../services/file.service';

class MockResponse extends Writable {
  readonly headers = new Map<string, number | string | readonly string[]>();
  statusCode = 200;

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

async function testDownloadUsesAttachmentDisposition(): Promise<void> {
  await withStreamFileStub(
    async (captured) => {
      const req = createRequest();
      const res = new MockResponse();

      await downloadFileContent(req, res as unknown as Response);

      assert.deepEqual(captured.options, {
        viewToken: undefined,
        rangeHeader: undefined,
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.getHeader('Content-Length'), '100');
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

async function run(): Promise<void> {
  await testInlineContentUsesRangeDelivery();
  await testDownloadUsesAttachmentDisposition();
  console.log('file.controller tests passed');
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
