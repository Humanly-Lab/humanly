import { useState, useEffect, useCallback } from 'react';
import {
  apiClient,
  getPublicDocumentAuthConfig,
  waitForDocumentScopedAccessTokenReady,
  type HumanlyAxiosRequestConfig,
} from '@/lib/api-client';
import type { AppFile, Document, DocumentEvent } from '@humanly/shared';

interface TrackEventsOptions {
  throwOnError?: boolean;
}

export function useDocument(documentId: string) {
  const [document, setDocument] = useState<Document | null>(null);
  const [linkedFile, setLinkedFile] = useState<AppFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchDocument = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      await waitForDocumentScopedAccessTokenReady(documentId);

      const response = await apiClient.get(
        `/documents/${documentId}`,
        getPublicDocumentAuthConfig(documentId)
      );
      const data = response.data.data || {};
      const doc = data.document || null;
      setDocument(doc);
      setLinkedFile(data.linkedFile || data.linkedFiles?.[0] || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch document');
      console.error('Error fetching document:', err);
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (documentId) {
      fetchDocument();
    }
  }, [documentId, fetchDocument]);

  const updateDocument = useCallback(async (
    content: Record<string, any>,
    plainText: string,
    title?: string
  ) => {
    try {
      setIsSaving(true);
      await waitForDocumentScopedAccessTokenReady(documentId);

      const response = await apiClient.put(
        `/documents/${documentId}`,
        {
          content,
          plainText,
          ...(title !== undefined && { title }),
        },
        getPublicDocumentAuthConfig(documentId)
      );
      setDocument(response.data.data?.document || null);
      return response.data.data?.document;
    } catch (err: any) {
      console.error('Error updating document:', err);
      throw new Error(err.response?.data?.message || 'Failed to update document');
    } finally {
      setIsSaving(false);
    }
  }, [documentId]);

  const startWritingSession = useCallback(async () => {
    try {
      await waitForDocumentScopedAccessTokenReady(documentId);

      const response = await apiClient.post(
        `/documents/${documentId}/writing-session/start`,
        undefined,
        getPublicDocumentAuthConfig(documentId)
      );
      const doc = response.data.data?.document || null;
      setDocument(doc);
      return doc;
    } catch (err: any) {
      console.error('Error starting writing session:', err);
      throw new Error(err.response?.data?.message || 'Failed to start writing session');
    }
  }, [documentId]);

  const trackEvents = useCallback(async (
    events: Partial<DocumentEvent>[],
    sessionId?: string | null,
    options: TrackEventsOptions = {}
  ) => {
    try {
      await waitForDocumentScopedAccessTokenReady(documentId);

      const backgroundRequestConfig: HumanlyAxiosRequestConfig = (
        getPublicDocumentAuthConfig(documentId, { skipAuthRedirect: true })
        || { skipAuthRedirect: true }
      );

      await apiClient.post(`/documents/${documentId}/events`, {
        events,
        ...(sessionId ? { sessionId } : {}),
      }, backgroundRequestConfig);
    } catch (err: any) {
      console.error('Error tracking events:', err);
      if (options.throwOnError) {
        throw err;
      }
    }
  }, [documentId]);

  return {
    document,
    linkedFile,
    isLoading,
    error,
    isSaving,
    updateDocument,
    startWritingSession,
    trackEvents,
    refetch: fetchDocument,
  };
}
