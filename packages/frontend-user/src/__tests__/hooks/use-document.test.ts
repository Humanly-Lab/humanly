jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { apiClient } from '@/lib/api-client';
import { useDocument } from '@/hooks/use-document';

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

const fakeDocument = {
  id: 'doc-1',
  title: 'My Draft',
  content: {},
  plainText: '',
  status: 'draft',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const fakePaper = {
  id: 'paper-1',
  title: 'My Draft',
  pdfStoragePath: '/tmp/paper.pdf',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useDocument', () => {
  it('uploads a PDF for an existing document and refreshes linked paper state', async () => {
    mockApiClient.get
      .mockResolvedValueOnce({ data: { data: { document: fakeDocument } } })
      .mockRejectedValueOnce(new Error('No paper linked'))
      .mockResolvedValueOnce({ data: { data: [{ id: 'proj-1' }] } })
      .mockResolvedValueOnce({ data: { data: { document: fakeDocument } } })
      .mockResolvedValueOnce({ data: { data: { paper: fakePaper } } });

    mockApiClient.post.mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useDocument('doc-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.linkedPaper).toBeNull();

    const pdfFile = new File(['%PDF-1.4'], 'draft.pdf', { type: 'application/pdf' });

    await act(async () => {
      await result.current.uploadPdf(pdfFile);
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/tasks/proj-1/papers',
      expect.any(FormData)
    );
    expect(result.current.linkedPaper).toEqual(fakePaper);
  });
});
