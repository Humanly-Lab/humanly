import { useState, useEffect, useCallback } from 'react';
import {
  apiClient,
  getPublicDocumentAuthConfig,
  waitForDocumentScopedAccessTokenReady,
  type HumanlyAxiosRequestConfig,
} from '@/lib/api-client';
import {
  appendDemoEvents,
  getDemoDocument,
  isDemoDocumentId,
  startDemoWritingSession,
  updateDemoDocument,
} from '@/lib/demo-workspace';
import {
  getHumanlyPerformanceTimestamp,
  recordHumanlyPerformanceMetric,
} from '@/lib/performance-metrics';
import type {
  AppFile,
  Document,
  DocumentEvent,
  DocumentWorkspacePayload,
} from '@humanly/shared';

interface TrackEventsOptions {
  throwOnError?: boolean;
}

interface FetchDocumentOptions {
  showLoading?: boolean;
}

export function useDocument(documentId: string) {
  const isDemoDocument = isDemoDocumentId(documentId);
  const [document, setDocument] = useState<Document | null>(null);
  const [linkedFile, setLinkedFile] = useState<AppFile | null>(null);
  const [linkedFiles, setLinkedFiles] = useState<AppFile[]>([]);
  const [taskEnrollment, setTaskEnrollment] = useState<
    DocumentWorkspacePayload['taskEnrollment']
  >(null);
  const [taskInstructionFile, setTaskInstructionFile] = useState<AppFile | null>(null);
  const [taskInstructionFiles, setTaskInstructionFiles] = useState<AppFile[]>([]);
  const [workspacePdfPanel, setWorkspacePdfPanel] = useState<
    DocumentWorkspacePayload['pdfPanel']
  >({ expected: false, source: null });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const applyWorkspacePayload = useCallback(
    (payload: Partial<DocumentWorkspacePayload>) => {
      const files = Array.isArray(payload.linkedFiles)
        ? payload.linkedFiles
        : payload.linkedFile
          ? [payload.linkedFile]
          : [];
      const instructionFiles = Array.isArray(payload.taskInstructionFiles)
        ? payload.taskInstructionFiles
        : payload.taskInstructionFile
          ? [payload.taskInstructionFile]
          : [];
      const linkedFile = payload.linkedFile || files[0] || null;
      const taskInstructionFile =
        payload.taskInstructionFile || instructionFiles[0] || null;

      setDocument(payload.document || null);
      setLinkedFiles(files);
      setLinkedFile(linkedFile);
      setTaskEnrollment(payload.taskEnrollment || null);
      setTaskInstructionFiles(instructionFiles);
      setTaskInstructionFile(taskInstructionFile);
      setWorkspacePdfPanel(
        payload.pdfPanel || {
          expected: Boolean(taskInstructionFile || linkedFile),
          source: taskInstructionFile
            ? 'task_instruction_pdf'
            : linkedFile
              ? 'document_source_pdf'
              : null,
        }
      );
    },
    []
  );

  const fetchDocument = useCallback(async (options: FetchDocumentOptions = {}) => {
    const showLoading = options.showLoading !== false;
    const hydrationStartedAt = getHumanlyPerformanceTimestamp();

    if (isDemoDocument) {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);
      const demo = getDemoDocument(documentId);
      applyWorkspacePayload({
        document: demo?.document,
        linkedFile: demo?.linkedFile || null,
        linkedFiles: demo?.linkedFile ? [demo.linkedFile] : [],
        taskEnrollment: null,
        taskInstructionFile: null,
        taskInstructionFiles: [],
        pdfPanel: {
          expected: Boolean(demo?.linkedFile),
          source: demo?.linkedFile ? 'document_source_pdf' : null,
        },
      });
      recordHumanlyPerformanceMetric(
        'humanly.workspace.hydration',
        hydrationStartedAt,
        {
          documentId,
          expectedPdf: Boolean(demo?.linkedFile),
          mode: 'demo',
        }
      );
      setError(demo ? null : 'Demo document not found');
      if (showLoading) {
        setIsLoading(false);
      }
      return;
    }

    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);
      await waitForDocumentScopedAccessTokenReady(documentId);

      const response = await apiClient.get(
        `/documents/${documentId}/workspace`,
        getPublicDocumentAuthConfig(documentId)
      );
      const workspacePayload = (response.data.data || {}) as Partial<DocumentWorkspacePayload>;
      applyWorkspacePayload(workspacePayload);

      const taskInstructionFiles = Array.isArray(workspacePayload.taskInstructionFiles)
        ? workspacePayload.taskInstructionFiles
        : workspacePayload.taskInstructionFile
          ? [workspacePayload.taskInstructionFile]
          : [];
      const linkedFiles = Array.isArray(workspacePayload.linkedFiles)
        ? workspacePayload.linkedFiles
        : workspacePayload.linkedFile
          ? [workspacePayload.linkedFile]
          : [];
      const pdfFiles = [...taskInstructionFiles, ...linkedFiles];
      const primaryPdf = pdfFiles[0] || null;

      recordHumanlyPerformanceMetric(
        'humanly.workspace.hydration',
        hydrationStartedAt,
        {
          documentId,
          expectedPdf: Boolean(workspacePayload.pdfPanel?.expected),
          fileCount: pdfFiles.length,
          mode: workspacePayload.taskEnrollment ? 'task' : 'personal',
        }
      );
      if (primaryPdf?.textIndexStatus) {
        recordHumanlyPerformanceMetric(
          'humanly.pdf.text_index_readiness',
          hydrationStartedAt,
          {
            documentId,
            fileId: primaryPdf.id,
            status: primaryPdf.textIndexStatus,
          }
        );
      }
    } catch (err: any) {
      if (showLoading) {
        setError(err.response?.data?.message || 'Failed to fetch document');
      }
      console.error('Error fetching document:', err);
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [applyWorkspacePayload, documentId, isDemoDocument]);

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
    if (isDemoDocument) {
      setIsSaving(true);
      const updatedDocument = updateDemoDocument(documentId, content, plainText, title);
      setDocument(updatedDocument);
      setIsSaving(false);
      if (!updatedDocument) {
        throw new Error('Demo document not found');
      }
      return updatedDocument;
    }

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
  }, [documentId, isDemoDocument]);

  const startWritingSession = useCallback(async () => {
    if (isDemoDocument) {
      const startedDocument = startDemoWritingSession(documentId);
      setDocument(startedDocument);
      if (!startedDocument) {
        throw new Error('Demo document not found');
      }
      return startedDocument;
    }

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
  }, [documentId, isDemoDocument]);

  const trackEvents = useCallback(async (
    events: Partial<DocumentEvent>[],
    sessionId?: string | null,
    options: TrackEventsOptions = {}
  ) => {
    if (isDemoDocument) {
      appendDemoEvents(documentId, events.map((event) => ({
        ...event,
        sessionId: sessionId || event.sessionId,
      })));
      return;
    }

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
  }, [documentId, isDemoDocument]);

  return {
    document,
    linkedFile,
    linkedFiles,
    taskEnrollment,
    taskInstructionFile,
    taskInstructionFiles,
    workspacePdfPanel,
    isLoading,
    error,
    isSaving,
    updateDocument,
    startWritingSession,
    trackEvents,
    refetch: fetchDocument,
  };
}
