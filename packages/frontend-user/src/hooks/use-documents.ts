import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { uploadPdfForDocument } from '@/lib/document-pdf';
import type { Document, WritingEnvironmentConfig } from '@humanly/shared';

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiClient.get<any>('/documents');
      // Backend returns documents directly in data array
      const docs = Array.isArray(response.data.data) ? response.data.data : [];
      setDocuments(docs);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch documents');
      setDocuments([]); // Set empty array on error
      console.error('Error fetching documents:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

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
    error,
    fetchDocuments,
    createDocument,
    deleteDocument,
  };
}
