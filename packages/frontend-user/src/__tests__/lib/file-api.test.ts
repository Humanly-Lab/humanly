import { fileApi } from '@/lib/file-api';

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockGetAccessToken = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
  },
  TokenManager: {
    getAccessToken: () => mockGetAccessToken(),
  },
}));

const digestBytes = Uint8Array.from({ length: 32 }, () => 1).buffer;
const digestHex = '01'.repeat(32);

function makePdfFile() {
  return new File([new Blob(['%PDF-1.4'], { type: 'application/pdf' })], 'source.pdf', {
    type: 'application/pdf',
  });
}

describe('fileApi', () => {
  const originalCrypto = globalThis.crypto;
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalFileArrayBuffer = File.prototype.arrayBuffer;
  const mockDigest = jest.fn();
  const mockFetch = jest.fn();
  const mockCreateObjectUrl = jest.fn();
  const mockFileArrayBuffer = jest.fn();

  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockGetAccessToken.mockReset();
    mockDigest.mockReset();
    mockFetch.mockReset();
    mockCreateObjectUrl.mockReset();
    mockFileArrayBuffer.mockReset();

    mockDigest.mockResolvedValue(digestBytes);
    mockFetch.mockResolvedValue({ ok: true });
    mockCreateObjectUrl.mockReturnValue('blob:pdf-file');
    mockFileArrayBuffer.mockResolvedValue(new ArrayBuffer(8));
    mockGetAccessToken.mockReturnValue('access-token');

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        subtle: {
          digest: mockDigest,
        },
      },
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: mockFetch,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: mockCreateObjectUrl,
    });
    Object.defineProperty(File.prototype, 'arrayBuffer', {
      configurable: true,
      value: mockFileArrayBuffer,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: originalFetch,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(File.prototype, 'arrayBuffer', {
      configurable: true,
      value: originalFileArrayBuffer,
    });
  });

  it('uploads document PDFs through signed GCS upload and completes the file', async () => {
    mockApiPost
      .mockResolvedValueOnce({
        data: {
          data: {
            fileId: 'file-1',
            storageKey: `files/file-1/${digestHex}.pdf`,
            uploadUrl: 'https://storage.example/upload',
            requiredHeaders: { 'Content-Type': 'application/pdf' },
            expiresAt: '2026-05-15T12:30:00.000Z',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            file: { id: 'file-1', uploadStatus: 'ready' },
          },
        },
      });

    const result = await fileApi.uploadDocumentPdf('doc-1', 'Source PDF', makePdfFile());

    expect(mockDigest).toHaveBeenCalledWith('SHA-256', expect.any(ArrayBuffer));
    expect(mockApiPost).toHaveBeenNthCalledWith(1, '/documents/doc-1/files/uploads', {
      title: 'Source PDF',
      filename: 'source.pdf',
      mimeType: 'application/pdf',
      fileSize: 8,
      checksum: digestHex,
    });
    expect(mockFetch).toHaveBeenCalledWith('https://storage.example/upload', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: expect.any(File),
    });
    expect(mockApiPost).toHaveBeenNthCalledWith(2, '/files/file-1/complete');
    expect(result).toEqual({ id: 'file-1', uploadStatus: 'ready' });
  });

  it('falls back to multipart upload when signed upload is unavailable', async () => {
    mockApiPost
      .mockRejectedValueOnce({ response: { status: 409 } })
      .mockResolvedValueOnce({
        data: {
          data: { id: 'file-1', uploadStatus: 'ready' },
        },
      });

    const result = await fileApi.uploadDocumentPdf('doc-1', 'Source PDF', makePdfFile());

    expect(mockApiPost).toHaveBeenNthCalledWith(1, '/documents/doc-1/files/uploads', expect.objectContaining({
      checksum: digestHex,
    }));
    expect(mockApiPost).toHaveBeenNthCalledWith(2, '/documents/doc-1/files', expect.any(FormData));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'file-1', uploadStatus: 'ready' });
  });

  it('prefers signed read URLs for GCS-backed PDF viewing', async () => {
    mockApiGet.mockResolvedValueOnce({
      data: {
        data: {
          url: 'https://storage.example/read',
          expiresAt: '2026-05-15T12:10:00.000Z',
          fallbackMode: 'signed_url',
        },
      },
    });

    await expect(fileApi.getPdfBlob('file-1')).resolves.toBe('https://storage.example/read');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses view-only token streams without requesting signed read URLs', async () => {
    mockApiGet.mockResolvedValueOnce({
      data: {
        data: {
          token: 'view-token-1',
          expiresAt: '2026-05-15T12:01:00.000Z',
          expiresInSeconds: 60,
        },
      },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    });

    await expect(fileApi.getPdfBlob('file-1', { viewOnly: true })).resolves.toBe('blob:pdf-file');
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith('/files/file-1/view-token');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/files/file-1/content'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-token' },
        credentials: 'include',
      })
    );
    expect(mockFetch.mock.calls[0][0]).toContain('viewToken=view-token-1');
  });

  it('falls back to backend stream for local PDF viewing', async () => {
    mockApiGet.mockResolvedValueOnce({
      data: {
        data: {
          url: null,
          expiresAt: null,
          fallbackMode: 'stream',
        },
      },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    });

    await expect(fileApi.getPdfBlob('file-1')).resolves.toBe('blob:pdf-file');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/files/file-1/content'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-token' },
        credentials: 'include',
      })
    );
  });
});
