/**
 * Tests for useDocuments — specifically createDocument (Create Document form logic).
 * Covers: document creation, PDF upload flow, rollback on upload failure.
 */

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { apiClient } from '@/lib/api-client';
import { useDocuments } from '@/hooks/use-documents';

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

const fakeDoc = { id: 'doc-1', title: 'My Doc', status: 'draft', createdAt: new Date().toISOString() };

beforeEach(() => {
  jest.clearAllMocks();
  // Default: fetchDocuments returns empty list
  mockApiClient.get.mockResolvedValue({ data: { data: [] } });
});

describe('createDocument', () => {
  it('creates a document without PDF', async () => {
    mockApiClient.post.mockResolvedValueOnce({ data: { data: { document: fakeDoc } } });

    const { result } = renderHook(() => useDocuments());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let doc: any;
    await act(async () => {
      doc = await result.current.createDocument('My Doc');
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/documents',
      expect.objectContaining({ title: 'My Doc' })
    );
    expect(doc).toEqual(fakeDoc);
  });

  it('uploads PDF after document creation when file provided', async () => {
    // Step 1: create doc
    mockApiClient.post.mockResolvedValueOnce({ data: { data: { document: fakeDoc } } });
    // Step 2: get tasks
    mockApiClient.get
      .mockResolvedValueOnce({ data: { data: [] } })           // initial fetchDocuments
      .mockResolvedValueOnce({ data: { data: [{ id: 'proj-1' }] } }); // /tasks?limit=1
    // Step 3: upload paper
    mockApiClient.post.mockResolvedValueOnce({ data: { success: true } });
    // Step 4: refetch documents
    mockApiClient.get.mockResolvedValueOnce({ data: { data: [fakeDoc] } });

    const pdfFile = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });

    const { result } = renderHook(() => useDocuments());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createDocument('PDF Doc', pdfFile);
    });

    // Should have called POST /tasks/:id/papers with FormData
    const paperCall = mockApiClient.post.mock.calls.find(([url]) =>
      url.includes('/papers')
    );
    expect(paperCall).toBeDefined();
    expect(paperCall![1]).toBeInstanceOf(FormData);
  });

  it('creates a default task for a new user before uploading the PDF', async () => {
    mockApiClient.post
      .mockResolvedValueOnce({ data: { data: { document: fakeDoc } } })
      .mockResolvedValueOnce({ data: { data: { id: 'proj-new' } } })
      .mockResolvedValueOnce({ data: { success: true } });

    mockApiClient.get
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockResolvedValueOnce({ data: { data: [fakeDoc] } });

    const pdfFile = new File(['%PDF-1.4'], 'new-user.pdf', { type: 'application/pdf' });

    const { result } = renderHook(() => useDocuments());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createDocument('Fresh User Doc', pdfFile);
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/tasks',
      expect.objectContaining({ name: 'Default Task' })
    );
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/tasks/proj-new/papers',
      expect.any(FormData)
    );
  });

  it('rolls back document when PDF upload fails', async () => {
    mockApiClient.post
      .mockResolvedValueOnce({ data: { data: { document: fakeDoc } } }) // create doc
      .mockRejectedValueOnce(new Error('Upload failed'));               // upload paper

    mockApiClient.get
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockResolvedValueOnce({ data: { data: [{ id: 'proj-1' }] } });

    mockApiClient.delete.mockResolvedValueOnce({});

    const pdfFile = new File(['%PDF'], 'f.pdf', { type: 'application/pdf' });
    const { result } = renderHook(() => useDocuments());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let caughtMessage = '';
    await act(async () => {
      try {
        await result.current.createDocument('Bad PDF', pdfFile);
      } catch (e: any) {
        caughtMessage = e?.message ?? '';
      }
    });

    expect(caughtMessage).toMatch(/upload failed/i);
    // Should have deleted the orphaned document
    expect(mockApiClient.delete).toHaveBeenCalledWith(`/documents/${fakeDoc.id}`);
  });
});

describe('deleteDocument', () => {
  it('calls delete endpoint and refreshes list', async () => {
    mockApiClient.delete.mockResolvedValueOnce({});
    mockApiClient.get.mockResolvedValueOnce({ data: { data: [] } }); // initial load
    mockApiClient.get.mockResolvedValueOnce({ data: { data: [] } }); // after delete

    const { result } = renderHook(() => useDocuments());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteDocument('doc-1');
    });

    expect(mockApiClient.delete).toHaveBeenCalledWith('/documents/doc-1');
  });
});
