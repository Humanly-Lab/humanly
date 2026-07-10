import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { uploadPdfForDocument } from '@/lib/document-pdf';
import type {
  DocumentListItem,
  WritingEnvironmentConfig,
} from '@humanly/shared';

interface UseDocumentsOptions {
  skip?: boolean;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'characterCount';
  sortOrder?: 'asc' | 'desc';
  pageSize?: number;
}

export function useDocuments(options: UseDocumentsOptions = {}) {
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(!options.skip);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const requestSequenceRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  const search = options.search?.trim() || '';
  const sortBy = options.sortBy || 'updatedAt';
  const sortOrder = options.sortOrder || 'desc';
  const pageSize = Math.min(Math.max(options.pageSize || 24, 1), 100);

  const requestDocuments = useCallback(async (
    offset: number,
    mode: 'replace' | 'append'
  ) => {
    if (options.skip) {
      setDocuments([]);
      setTotal(0);
      setHasMore(false);
      setIsLoading(false);
      setIsLoadingMore(false);
      setError(null);
      hasLoadedOnceRef.current = false;
      return;
    }

    const requestSequence = ++requestSequenceRef.current;
    try {
      if (mode === 'replace') {
        if (!hasLoadedOnceRef.current) {
          setIsLoading(true);
        }
      } else {
        setIsLoadingMore(true);
      }
      setError(null);
      const response = await apiClient.get<any>('/documents', {
        params: {
          limit: pageSize,
          offset,
          sortBy,
          sortOrder,
          ...(search ? { search } : {}),
        },
      });

      if (requestSequence !== requestSequenceRef.current) return;

      const nextDocuments: DocumentListItem[] = Array.isArray(
        response.data.data
      )
        ? response.data.data
        : [];
      const pagination = response.data.pagination;

      setDocuments((currentDocuments) => {
        if (mode === 'replace') return nextDocuments;

        const knownIds = new Set(
          currentDocuments.map((document) => document.id)
        );
        return [
          ...currentDocuments,
          ...nextDocuments.filter((document) => !knownIds.has(document.id)),
        ];
      });
      setTotal(pagination?.total ?? nextDocuments.length);
      setHasMore(Boolean(pagination?.hasMore));
      hasLoadedOnceRef.current = true;
    } catch (err: any) {
      if (requestSequence !== requestSequenceRef.current) return;
      setError(err.response?.data?.message || 'Failed to fetch documents');
      if (mode === 'replace') {
        setDocuments([]);
        setTotal(0);
        setHasMore(false);
      }
      console.error('Error fetching documents:', err);
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [options.skip, pageSize, search, sortBy, sortOrder]);

  const fetchDocuments = useCallback(
    async () => requestDocuments(0, 'replace'),
    [requestDocuments]
  );

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  const loadMoreDocuments = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;
    await requestDocuments(documents.length, 'append');
  }, [documents.length, hasMore, isLoading, isLoadingMore, requestDocuments]);

  const createDocument = useCallback(async (
    title: string,
    pdfFile?: File,
    environmentConfig?: WritingEnvironmentConfig | null,
    description?: string
  ) => {
    // Step 1: Create the document
    const response = await apiClient.post('/documents', {
      title,
      description: description?.trim() || undefined,
      content: {},
      status: 'draft',
      environmentConfig: environmentConfig || null,
    });
    const document = response.data.data.document;

    // Step 2: If a PDF file is provided, upload it and link to the document
    if (pdfFile) {
      try {
        await uploadPdfForDocument(document.id, title, pdfFile);
      } catch (uploadErr: any) {
        // Rollback: delete the orphaned document so the user can retry cleanly
        try {
          await apiClient.delete(`/documents/${document.id}`);
        } catch {
          // Ignore rollback error
        }
        throw new Error(uploadErr.message || 'Failed to upload PDF');
      }
    }

    await fetchDocuments();
    return document;
  }, [fetchDocuments]);

  const deleteDocument = useCallback(async (documentId: string) => {
    try {
      await apiClient.delete(`/documents/${documentId}`);
      await fetchDocuments();
    } catch (err: any) {
      throw new Error(err.response?.data?.message || 'Failed to delete document');
    }
  }, [fetchDocuments]);

  return {
    documents,
    isLoading,
    isLoadingMore,
    error,
    total,
    hasMore,
    fetchDocuments,
    loadMoreDocuments,
    createDocument,
    deleteDocument,
  };
}
