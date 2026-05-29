'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  PanelLeft,
  PanelLeftClose,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LexicalEditor, type EditorAIBridgeAPI, type SelectionReplacementResult } from '@humanly/editor';
import { useDocument } from '@/hooks/use-document';
import { useCertificates } from '@/hooks/use-certificates';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/use-toast';
import { validatePdfFile } from '@/lib/document-pdf';
import { downloadBlob } from '@/lib/download';
import {
  CertificateGenerationDialog,
  type CertificateGenerationOptions,
} from '@/components/certificates/certificate-generation-dialog';
import { AIAssistantButton, AIAssistantPanel, AISelectionMenu, type ActionType } from '@/components/ai';
import { useAI } from '@/hooks/use-ai';
import { useAIStore } from '@/stores/ai-store';
import type { TrackedEvent } from '@humanly/editor';
import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, type ChangeEvent } from 'react';
import dynamic from 'next/dynamic';
import { apiClient, TokenManager } from '@/lib/api-client';
import {
  AI_PROVIDER_OPTIONS,
  getProviderValueForBaseUrl,
  getWhitelist,
} from '@/lib/ai-models';
import { formatDateTime } from '@/lib/utils';
import { isGuestUserEmail } from '@/components/navigation/user-display';
import {
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  normalizeCopyPastePolicy,
  type WritingAiProviderConfig,
  type WritingEnvironmentConfig,
} from '@humanly/shared';

// ✅ Overleaf-style: resizable panels
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';

// Dynamically import PDFViewer with SSR disabled (PDF.js loaded from CDN)
const PDFViewer = dynamic(() => import('@/components/pdf/PDFViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-muted/40">
      <p className="text-muted-foreground">Loading PDF viewer...</p>
    </div>
  ),
});

interface TaskEnrollment {
  id: string;
  taskId?: string;
  enrollmentId?: string;
  name: string;
  inviteCode: string;
  documentId: string | null;
  joinedAt: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  environmentConfig?: WritingEnvironmentConfig | null;
}

interface TaskInstructionFile {
  id: string;
  title: string;
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:3001/api/v1');
const SUBMISSION_SESSION_START_DELAY_MS = 250;
const EDITOR_AUTO_SAVE_INTERVAL_MS = 750;
type SaveStatus = 'saved' | 'saving' | 'error';
type PendingActivityEvent = Record<string, unknown>;

interface PendingActivityEventBatch {
  events: PendingActivityEvent[];
  sessionId?: string | null;
}

function formatTimerDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatCountdownDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return formatTimerDuration(safeSeconds);
}

const getTimestampMs = (value?: string | Date | null): number | null => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getAiProviderConfigForBaseUrl = (baseUrl: string): WritingAiProviderConfig | undefined => {
  const normalizedBaseUrl = baseUrl.trim();
  if (!normalizedBaseUrl) return undefined;
  return {
    provider: getProviderValueForBaseUrl(normalizedBaseUrl),
    baseUrl: normalizedBaseUrl,
  };
};

const getAiProviderConfigForModel = (model: string): WritingAiProviderConfig | undefined => {
  const normalizedModel = model.trim();
  if (!normalizedModel) return undefined;

  const provider = AI_PROVIDER_OPTIONS.find((option) => (
    !!option.baseUrl && getWhitelist(option.baseUrl)?.includes(normalizedModel)
  ));

  return provider?.baseUrl ? getAiProviderConfigForBaseUrl(provider.baseUrl) : undefined;
};

const enrichEnvironmentConfigForExport = (
  config: WritingEnvironmentConfig,
): WritingEnvironmentConfig => {
  if (config.aiAccess === 'off' || config.aiProvider?.baseUrl) {
    return config;
  }

  const model = config.allowedModels?.[0] || config.customModels?.[0] || '';
  const inferredProvider = getAiProviderConfigForModel(model);
  return inferredProvider ? { ...config, aiProvider: inferredProvider } : config;
};

function normalizeEditorInitialContent(content: unknown): string | Record<string, any> | undefined {
  if (!content) {
    return undefined;
  }

  const parsedContent = typeof content === 'string'
    ? (() => {
        try {
          return JSON.parse(content);
        } catch {
          return null;
        }
      })()
    : content;

  if (parsedContent && typeof parsedContent === 'object' && 'root' in parsedContent) {
    const root = (parsedContent as { root?: { children?: unknown } }).root;
    if (!root || !Array.isArray(root.children) || root.children.length === 0) {
      return undefined;
    }
  }

  return typeof content === 'string' ? content : content as Record<string, any>;
}

interface EditorAIBridgeCaptureProps {
  insertAtCursor: EditorAIBridgeAPI['insertAtCursor'] | null;
  onInsertAtCursorChange: (insertAtCursor: EditorAIBridgeAPI['insertAtCursor'] | null) => void;
}

function EditorAIBridgeCapture({
  insertAtCursor,
  onInsertAtCursorChange,
}: EditorAIBridgeCaptureProps): null {
  useEffect(() => {
    onInsertAtCursorChange(insertAtCursor);
    return () => onInsertAtCursorChange(null);
  }, [insertAtCursor, onInsertAtCursorChange]);

  return null;
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  const config = {
    saving: {
      icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />,
      label: 'Saving...',
      className: 'text-muted-foreground',
    },
    saved: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: 'Saved',
      className: 'text-emerald-700',
    },
    error: {
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      label: 'Save failed',
      className: 'text-destructive',
    },
  }[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${config.className}`}
      aria-live="polite"
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
}

function usePublicTaskDocumentToken(documentId: string) {
  const previousAccessTokenRef = useRef<string | null | undefined>(undefined);

  useLayoutEffect(() => {
    const publicDocumentAccessToken = TokenManager.getPublicDocumentAccessToken(documentId);
    if (!publicDocumentAccessToken) return undefined;

    const currentAccessToken = TokenManager.getAccessToken();
    if (currentAccessToken === publicDocumentAccessToken) return undefined;

    previousAccessTokenRef.current = currentAccessToken;
    TokenManager.setAccessToken(publicDocumentAccessToken);

    return () => {
      if (TokenManager.getAccessToken() !== publicDocumentAccessToken) {
        previousAccessTokenRef.current = undefined;
        return;
      }

      const previousAccessToken = previousAccessTokenRef.current;
      if (previousAccessToken) {
        TokenManager.setAccessToken(previousAccessToken);
      } else {
        TokenManager.clearAccessToken();
      }
      previousAccessTokenRef.current = undefined;
    };
  }, [documentId]);
}

export default function DocumentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const documentId = params.id as string;
  const { user } = useAuthStore();
  usePublicTaskDocumentToken(documentId);
  const {
    document,
    linkedFile,
    isLoading,
    error,
    isSaving,
    updateDocument,
    startWritingSession,
    trackEvents,
    uploadPdf,
  } = useDocument(documentId);
  const [showPdfPanel, setShowPdfPanel] = useState(true);
  const { generateCertificate } = useCertificates();

  const [title, setTitle] = useState('');
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isGeneratingCertificate, setIsGeneratingCertificate] = useState(false);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [isSyncingActivityLogs, setIsSyncingActivityLogs] = useState(false);
  const [showCertificateDialog, setShowCertificateDialog] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [taskInstructionFile, setTaskInstructionFile] = useState<TaskInstructionFile | null>(null);
  const [taskInstructionFiles, setTaskInstructionFiles] = useState<TaskInstructionFile[]>([]);
  const [selectedInstructionFileId, setSelectedInstructionFileId] = useState<string | null>(null);
  const [submissionSessionId, setSubmissionSessionId] = useState<string | null>(null);
  const [taskEnrollment, setTaskEnrollment] = useState<TaskEnrollment | null>(null);
  const [isTaskEnrollmentLoading, setIsTaskEnrollmentLoading] = useState(true);
  const [editorInsertAtCursor, setEditorInsertAtCursor] = useState<EditorAIBridgeAPI['insertAtCursor'] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submissionSessionRef = useRef<{ taskId: string; sessionId: string } | null>(null);
  const lastSubmissionSessionRef = useRef<{ taskId: string; sessionId: string } | null>(null);
  const autoSubmittedTimeLimitRef = useRef<string | null>(null);
  const quickActionTriggerRef = useRef<((type: ActionType) => void) | null>(null);
  const latestEditorSnapshotRef = useRef<{ content: Record<string, any>; plainText: string } | null>(null);
  const loadedDocumentIdRef = useRef<string | null>(null);
  const lastCharacterLimitToastRef = useRef(0);
  const flushEditorEventsRef = useRef<(() => Promise<void>) | null>(null);
  const pendingEventWriteRef = useRef<Promise<void>>(Promise.resolve());
  const failedEventBatchesRef = useRef<PendingActivityEventBatch[]>([]);

  // AI Assistant
  const {
    isPanelOpen: isAIPanelOpen,
    togglePanel: toggleAIPanel,
    closePanel: closeAIPanel,
  } = useAI(documentId);

  // Store document metrics for the editor UI. AI full-document retrieval happens server-side.
  const [characterCount, setCharacterCount] = useState<number>(0);
  const [timerStartedAtMs, setTimerStartedAtMs] = useState<number | null>(null);
  const [timerNowMs, setTimerNowMs] = useState(() => Date.now());
  const isTaskDocument = Boolean(taskEnrollment);
  const isGuestUser = isGuestUserEmail(user?.email);
  const isPublicTaskGuestDocument = isTaskDocument && isGuestUser;
  const taskEnvironmentConfig = taskEnrollment?.environmentConfig || null;

  const currentEnvironmentConfig = useMemo(() => {
    const sourceConfig: Partial<WritingEnvironmentConfig> = isTaskDocument
      ? taskEnvironmentConfig || {}
      : document?.environmentConfig || {};
    const baseConfig = { ...DEFAULT_WRITING_ENVIRONMENT_CONFIG, ...sourceConfig };

    return {
      ...baseConfig,
      instructions: {
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.instructions,
        ...(sourceConfig.instructions || {}),
      },
      aiTokenBudget: {
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.aiTokenBudget,
        ...(sourceConfig.aiTokenBudget || {}),
      },
      aiUsageLimit: {
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.aiUsageLimit,
        ...(sourceConfig.aiUsageLimit || {}),
      },
      time: {
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.time,
        ...(sourceConfig.time || {}),
      },
      submission: {
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.submission,
        ...(sourceConfig.submission || {}),
      },
      traceability: {
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.traceability,
        ...(sourceConfig.traceability || {}),
      },
      copyPastePolicy: normalizeCopyPastePolicy(sourceConfig.copyPastePolicy),
    };
  }, [document?.environmentConfig, isTaskDocument, taskEnvironmentConfig]);

  const editorInitialContent = useMemo(
    () => normalizeEditorInitialContent(document?.content),
    [document?.content]
  );

  const activeTimeLimitSeconds =
    currentEnvironmentConfig.time.timeLimitSeconds
      ? Math.max(1, Math.floor(currentEnvironmentConfig.time.timeLimitSeconds))
      : null;
  const hasLoadedDocument = Boolean(document?.id);
  const documentWritingStartedAt = document?.writingStartedAt || null;

  const timeLimitRemainingSeconds = activeTimeLimitSeconds === null
    ? null
    : timerStartedAtMs === null
      ? activeTimeLimitSeconds
      : Math.max(0, activeTimeLimitSeconds - Math.floor((timerNowMs - timerStartedAtMs) / 1000));
  const isTimeLimitExpired =
    activeTimeLimitSeconds !== null &&
    timerStartedAtMs !== null &&
    timeLimitRemainingSeconds === 0;
  const isEditorReadOnly = isTimeLimitExpired;
  const taskDeadlineMs = taskEnrollment ? getTimestampMs(taskEnrollment.endDate) : null;
  const taskDeadlineRemainingSeconds = taskDeadlineMs === null
    ? null
    : Math.max(0, Math.floor((taskDeadlineMs - timerNowMs) / 1000));
  const visibleCountdown = timeLimitRemainingSeconds !== null
    ? {
        label: timeLimitRemainingSeconds === 0 ? 'Writing time limit reached' : 'Writing time left',
        value: formatCountdownDuration(timeLimitRemainingSeconds),
        variant: timeLimitRemainingSeconds === 0 ? 'destructive' as const : 'outline' as const,
        title: `Writing time limit: ${formatCountdownDuration(activeTimeLimitSeconds || 0)}`,
      }
    : taskDeadlineRemainingSeconds !== null
      ? {
          label: taskDeadlineRemainingSeconds === 0 ? 'Task deadline reached' : 'Task deadline in',
          value: formatCountdownDuration(taskDeadlineRemainingSeconds),
          variant: taskDeadlineRemainingSeconds === 0 ? 'destructive' as const : 'outline' as const,
          title: taskEnrollment?.endDate ? `Task deadline: ${formatDateTime(taskEnrollment.endDate)}` : 'Task deadline',
        }
      : null;
  const minimumSubmissionCharacters =
    isTaskDocument && currentEnvironmentConfig.submission.minCharacters
      ? Math.max(1, Math.floor(currentEnvironmentConfig.submission.minCharacters))
      : null;
  const maximumSubmissionCharacters =
    currentEnvironmentConfig.submission.maxCharacters
      ? Math.max(1, Math.floor(currentEnvironmentConfig.submission.maxCharacters))
      : null;
  const hasCharacterBounds =
    minimumSubmissionCharacters !== null || maximumSubmissionCharacters !== null;
  const characterBoundsTitle =
    minimumSubmissionCharacters !== null && maximumSubmissionCharacters !== null
      ? `Character count includes letters, spaces, punctuation, and symbols. Required range: ${minimumSubmissionCharacters.toLocaleString()}-${maximumSubmissionCharacters.toLocaleString()} characters.`
      : minimumSubmissionCharacters !== null
        ? `Character count includes letters, spaces, punctuation, and symbols. Minimum: ${minimumSubmissionCharacters.toLocaleString()} characters.`
        : maximumSubmissionCharacters !== null
          ? `Character count includes letters, spaces, punctuation, and symbols. Maximum: ${maximumSubmissionCharacters.toLocaleString()} characters.`
          : '';
  const characterBoundsLabel =
    minimumSubmissionCharacters !== null && maximumSubmissionCharacters !== null
      ? `${characterCount.toLocaleString()}/${maximumSubmissionCharacters.toLocaleString()} characters · min ${minimumSubmissionCharacters.toLocaleString()}`
      : minimumSubmissionCharacters !== null
        ? `${characterCount.toLocaleString()} characters · min ${minimumSubmissionCharacters.toLocaleString()}`
        : maximumSubmissionCharacters !== null
          ? `${characterCount.toLocaleString()}/${maximumSubmissionCharacters.toLocaleString()} characters`
          : '';

  useEffect(() => {
    if (document) {
      setTitle(document.title || '');
      if (loadedDocumentIdRef.current !== document.id) {
        loadedDocumentIdRef.current = document.id;
        setSaveStatus('saved');
      }
      setCharacterCount(document.characterCount ?? (document.plainText || '').length);
      setTimerStartedAtMs(getTimestampMs(document.writingStartedAt));
      latestEditorSnapshotRef.current = {
        content: document.content,
        plainText: document.plainText || '',
      };
    }
  }, [document]);

  useEffect(() => {
    setTimerNowMs(Date.now());
  }, [documentId, activeTimeLimitSeconds]);

  useEffect(() => {
    if (!hasLoadedDocument || activeTimeLimitSeconds === null) return;

    const existingStartMs = getTimestampMs(documentWritingStartedAt);
    if (existingStartMs !== null) {
      setTimerStartedAtMs(existingStartMs);
      return;
    }

    let cancelled = false;

    startWritingSession()
      .then((startedDocument) => {
        if (cancelled) return;
        setTimerStartedAtMs(getTimestampMs(startedDocument?.writingStartedAt) ?? Date.now());
        setTimerNowMs(Date.now());
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to persist writing timer start:', err);
        setTimerStartedAtMs(Date.now());
        setTimerNowMs(Date.now());
      });

    return () => {
      cancelled = true;
    };
  }, [activeTimeLimitSeconds, documentWritingStartedAt, hasLoadedDocument, startWritingSession]);

  useEffect(() => {
    if (!activeTimeLimitSeconds && taskDeadlineMs === null) return;
    const interval = window.setInterval(() => setTimerNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeTimeLimitSeconds, taskDeadlineMs]);

  useEffect(() => {
    const quickActionByKey: Record<string, ActionType> = {
      '1': 'grammar',
      '2': 'improve',
      '3': 'simplify',
      '4': 'formal',
      '!': 'grammar',
      '@': 'improve',
      '#': 'simplify',
      '$': 'formal',
    };
    const quickActionByCode: Record<string, ActionType> = {
      Digit1: 'grammar',
      Digit2: 'improve',
      Digit3: 'simplify',
      Digit4: 'formal',
      Numpad1: 'grammar',
      Numpad2: 'improve',
      Numpad3: 'simplify',
      Numpad4: 'formal',
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditorReadOnly) return;
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      const actionType = quickActionByKey[event.key] || quickActionByCode[event.code];
      if (!actionType || !quickActionTriggerRef.current) return;
      event.preventDefault();
      quickActionTriggerRef.current(actionType);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditorReadOnly]);

  // Keyboard shortcut for AI Assistant (Cmd/Ctrl + J)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        toggleAIPanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleAIPanel]);

  useEffect(() => {
    if (linkedFile) {
      setShowPdfPanel(true);
    }
  }, [linkedFile]);

  useEffect(() => {
    let cancelled = false;

    const fetchTaskEnrollment = async () => {
      try {
        setIsTaskEnrollmentLoading(true);
        const response = await apiClient.get('/tasks/my-enrollments');
        if (cancelled) return;

        const enrollments = response.data.data?.enrollments || [];
        const enrollment = enrollments.find((task: TaskEnrollment) => task.documentId === documentId) || null;
        setTaskEnrollment(enrollment);
      } catch {
        if (!cancelled) {
          setTaskEnrollment(null);
        }
      } finally {
        if (!cancelled) {
          setIsTaskEnrollmentLoading(false);
        }
      }
    };

    fetchTaskEnrollment();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    let cancelled = false;

    const fetchTaskInstructionFiles = async () => {
      const enrollment = taskEnrollment;
      if (!enrollment) {
        setTaskInstructionFile(null);
        setTaskInstructionFiles([]);
        setSelectedInstructionFileId(null);
        return;
      }

      try {
        await apiClient.put(`/tasks/enrollments/${enrollment.id}/submission-document`, {
          documentId,
        });
        const response = await apiClient.get(`/tasks/enrollments/${enrollment.id}/instruction-files`);
        if (cancelled) return;
        const files = response.data.data?.files || [];
        const file = response.data.data?.file || files[0] || null;
        setTaskInstructionFile(file);
        setTaskInstructionFiles(files);
        setSelectedInstructionFileId((currentId) => {
          if (currentId && files.some((item: TaskInstructionFile) => item.id === currentId)) {
            return currentId;
          }
          return file?.id || null;
        });
        if (file) setShowPdfPanel(true);
      } catch {
        if (!cancelled) {
          setTaskInstructionFile(null);
          setTaskInstructionFiles([]);
          setSelectedInstructionFileId(null);
        }
      }
    };

    fetchTaskInstructionFiles();

    return () => {
      cancelled = true;
    };
  }, [documentId, taskEnrollment]);

  useEffect(() => {
    const enrollment = taskEnrollment;
    if (!enrollment) {
      setSubmissionSessionId(null);
      submissionSessionRef.current = null;
      lastSubmissionSessionRef.current = null;
      return;
    }

    let cancelled = false;

    const endSubmissionSession = () => {
      const activeSession = submissionSessionRef.current;
      if (!activeSession) return;

      submissionSessionRef.current = null;
      setSubmissionSessionId(null);

      const token = TokenManager.getAccessToken();
      void fetch(
        `${API_URL}/tasks/enrollments/${activeSession.taskId}/submission-sessions/${activeSession.sessionId}/end`,
        {
          method: 'PUT',
          keepalive: true,
          credentials: 'include',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      ).catch(() => {});
    };

    const startSubmissionSession = async () => {
      try {
        const response = await apiClient.post(`/tasks/enrollments/${enrollment.id}/submission-sessions`, {
          documentId,
        });

        if (cancelled) {
          const sessionId = response.data.data?.sessionId;
          if (sessionId) {
            const token = TokenManager.getAccessToken();
            await fetch(`${API_URL}/tasks/enrollments/${enrollment.id}/submission-sessions/${sessionId}/end`, {
              method: 'PUT',
              keepalive: true,
              credentials: 'include',
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            }).catch(() => {});
          }
          return;
        }

        const sessionId = response.data.data?.sessionId;
        if (!sessionId) return;

        submissionSessionRef.current = {
          taskId: enrollment.id,
          sessionId,
        };
        lastSubmissionSessionRef.current = {
          taskId: enrollment.id,
          sessionId,
        };
        setSubmissionSessionId(sessionId);
      } catch (err) {
        console.error('Failed to start submission session:', err);
        setSubmissionSessionId(null);
        submissionSessionRef.current = null;
        lastSubmissionSessionRef.current = null;
      }
    };

    const startTimer = window.setTimeout(
      startSubmissionSession,
      SUBMISSION_SESSION_START_DELAY_MS
    );
    window.addEventListener('pagehide', endSubmissionSession);
    window.addEventListener('beforeunload', endSubmissionSession);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.removeEventListener('pagehide', endSubmissionSession);
      window.removeEventListener('beforeunload', endSubmissionSession);
      endSubmissionSession();
    };
  }, [documentId, taskEnrollment]);

  const handleTitleSave = async () => {
    if (!document) return;
    try {
      setSaveStatus('saving');
      await updateDocument(document.content, document.plainText || '', title);
      setSaveStatus('saved');
      setIsTitleEditing(false);
      toast({ title: 'Success', description: 'Document title updated' });
    } catch {
      setSaveStatus('error');
      toast({ title: 'Error', description: 'Failed to update title', variant: 'destructive' });
    }
  };

  const handleContentChange = async (content: Record<string, any>, plainText: string) => {
    latestEditorSnapshotRef.current = { content, plainText };
    setSaveStatus('saving');
    setCharacterCount(plainText.length);
  };

  const handleAutoSave = async (content: Record<string, any>, plainText: string) => {
    try {
      setSaveStatus('saving');
      latestEditorSnapshotRef.current = { content, plainText };
      await updateDocument(content, plainText);
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      console.error('Auto-save failed:', err);
    }
  };

  const postEventBatch = useCallback(
    async (batch: PendingActivityEventBatch) => {
      await trackEvents(batch.events as any, batch.sessionId, { throwOnError: true });
    },
    [trackEvents]
  );

  const retryFailedEventBatches = useCallback(async () => {
    while (failedEventBatchesRef.current.length > 0) {
      const batches = [...failedEventBatchesRef.current];
      failedEventBatchesRef.current = [];

      for (let index = 0; index < batches.length; index += 1) {
        try {
          await postEventBatch(batches[index]);
        } catch (error) {
          failedEventBatchesRef.current = [
            batches[index],
            ...batches.slice(index + 1),
            ...failedEventBatchesRef.current,
          ];
          throw error;
        }
      }
    }
  }, [postEventBatch]);

  const enqueueEventWrite = useCallback(
    (
      events: PendingActivityEvent[],
      sessionId?: string | null,
      options: { retainOnFailure?: boolean } = {}
    ) => {
      if (events.length === 0) {
        return Promise.resolve();
      }

      const batch: PendingActivityEventBatch = { events, sessionId };
      const writePromise = pendingEventWriteRef.current
        .catch(() => undefined)
        .then(() => postEventBatch(batch))
        .catch((error) => {
          if (options.retainOnFailure) {
            failedEventBatchesRef.current.push(batch);
          }
          throw error;
        });

      pendingEventWriteRef.current = writePromise.catch(() => undefined);
      return writePromise;
    },
    [postEventBatch]
  );

  const handleEventsBuffer = async (events: TrackedEvent[]) => {
    const currentSessionId =
      submissionSessionRef.current?.sessionId ||
      lastSubmissionSessionRef.current?.sessionId ||
      submissionSessionId;
    const mappedEvents = events.map((event) => ({
      sessionId: currentSessionId || undefined,
      eventType: event.eventType,
      timestamp: event.timestamp,
      keyCode: event.keyCode,
      keyChar: event.keyChar,
      textBefore: event.textBefore,
      textAfter: event.textAfter,
      cursorPosition: event.cursorPosition,
      selectionStart: event.selectionStart,
      selectionEnd: event.selectionEnd,
      editorStateBefore: event.editorStateBefore,
      editorStateAfter: event.editorStateAfter,
      metadata: event.metadata,
    }));
    await enqueueEventWrite(mappedEvents, currentSessionId, { retainOnFailure: false });
  };

  const handleEventFlushReady = useCallback((flushPendingEvents: (() => Promise<void>) | null) => {
    flushEditorEventsRef.current = flushPendingEvents;
  }, []);

  const syncActivityLogsForAuditAction = useCallback(async (): Promise<boolean> => {
    setIsSyncingActivityLogs(true);
    try {
      await flushEditorEventsRef.current?.();
      await pendingEventWriteRef.current;
      await retryFailedEventBatches();
      return true;
    } catch (error) {
      toast({
        title: 'Activity logs failed to save',
        description: 'Check your connection and try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSyncingActivityLogs(false);
    }
  }, [retryFailedEventBatches, toast]);

  const handleViewLogs = useCallback(async () => {
    const activityLogsSynced = await syncActivityLogsForAuditAction();
    if (!activityLogsSynced) return;

    router.push(`/logs/${documentId}`);
  }, [documentId, router, syncActivityLogsForAuditAction]);

  const openPanelWithQuote = useAIStore((state) => state.openPanelWithQuote);
  const handleAskAI = useCallback((selectedText: string) => openPanelWithQuote(selectedText), [openPanelWithQuote]);

  const handleEditorInsertAtCursorChange = useCallback(
    (insertAtCursor: EditorAIBridgeAPI['insertAtCursor'] | null) => {
      setEditorInsertAtCursor(() => insertAtCursor);
    },
    []
  );

  const handleInsertAssistantMessage = useCallback(
    async (
      text: string,
      source: { messageId: string; logId?: string }
    ) => {
      if (!editorInsertAtCursor) {
        toast({
          title: 'Editor unavailable',
          description: 'Open this document in the editor to insert AI text.',
          variant: 'destructive',
        });
        return;
      }

      const insertion = editorInsertAtCursor(text);
      if (insertion.inserted === false) return;
      const currentSessionId =
        submissionSessionRef.current?.sessionId ||
        lastSubmissionSessionRef.current?.sessionId ||
        submissionSessionId;
      const event = {
        sessionId: currentSessionId || undefined,
        eventType: 'ai_insert_from_chat',
        timestamp: new Date(),
        textBefore: insertion.textBefore,
        textAfter: insertion.textAfter,
        cursorPosition: insertion.cursorPosition,
        selectionStart: insertion.selectionStart,
        selectionEnd: insertion.selectionEnd,
        editorStateBefore: insertion.editorStateBefore,
        editorStateAfter: insertion.editorStateAfter,
        metadata: {
          messageId: source.messageId,
          logId: source.logId,
          insertedTextLength: text.length,
        },
      };

      void enqueueEventWrite([event as any], currentSessionId, { retainOnFailure: true }).catch(() => undefined);
      toast({ title: 'Inserted into document' });
    },
    [editorInsertAtCursor, enqueueEventWrite, submissionSessionId, toast]
  );

  const handleCharacterLimitReached = useCallback((limit: number) => {
    const now = Date.now();
    if (now - lastCharacterLimitToastRef.current < 1200) return;
    lastCharacterLimitToastRef.current = now;

    toast({
      title: 'Maximum length reached',
      description: `This document is limited to ${limit.toLocaleString()} characters.`,
    });
  }, [toast]);

  const handleAISelectionAction = useCallback(
    async (
      actionType: ActionType,
      originalText: string,
      newText: string,
      replacementResult?: SelectionReplacementResult
    ) => {
      const event = {
        sessionId: submissionSessionRef.current?.sessionId || lastSubmissionSessionRef.current?.sessionId || submissionSessionId || undefined,
        eventType: 'ai_selection_action',
        timestamp: new Date(),
        textBefore: originalText,
        textAfter: newText,
        cursorPosition: replacementResult?.cursorPosition,
        selectionStart: replacementResult?.selectionStart,
        selectionEnd: replacementResult?.selectionEnd,
        editorStateBefore: replacementResult?.editorStateBefore,
        editorStateAfter: replacementResult?.editorStateAfter,
        metadata: { actionType, originalText, newText },
      };
      void enqueueEventWrite(
        [event as any],
        submissionSessionRef.current?.sessionId || submissionSessionId,
        { retainOnFailure: true }
      ).catch(() => undefined);
    },
    [enqueueEventWrite, submissionSessionId]
  );

  const validateCharacterBounds = useCallback((actionLabel: string): boolean => {
    if (minimumSubmissionCharacters && characterCount < minimumSubmissionCharacters) {
      toast({
        title: 'Minimum length required',
        description: `Write at least ${minimumSubmissionCharacters.toLocaleString()} characters before ${actionLabel}. Current length: ${characterCount.toLocaleString()} characters.`,
        variant: 'destructive',
      });
      return false;
    }

    if (maximumSubmissionCharacters && characterCount > maximumSubmissionCharacters) {
      toast({
        title: 'Maximum length exceeded',
        description: `Keep the submission at most ${maximumSubmissionCharacters.toLocaleString()} characters before ${actionLabel}. Current length: ${characterCount.toLocaleString()} characters.`,
        variant: 'destructive',
      });
      return false;
    }

    return true;
  }, [characterCount, maximumSubmissionCharacters, minimumSubmissionCharacters, toast]);

  const handleGenerateCertificate = async (options: CertificateGenerationOptions) => {
    if (!validateCharacterBounds('generating a certificate')) return;

    try {
      setIsGeneratingCertificate(true);
      const activityLogsSynced = await syncActivityLogsForAuditAction();
      if (!activityLogsSynced) return;

      const certificate = await generateCertificate(documentId, {
        certificateType: 'full_authorship',
        ...options,
      });

      toast({ title: 'Success', description: 'Certificate generated successfully' });
      setShowCertificateDialog(false);
      router.push(`/certificates/${certificate.id}`);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to generate certificate',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingCertificate(false);
    }
  };

  const handleSubmitTask = useCallback(async (options: { automatic?: boolean } = {}) => {
    if (!taskEnrollment) return;

    if (!options.automatic && !validateCharacterBounds('submitting')) return;

    try {
      setIsSubmittingTask(true);
      const activityLogsSynced = await syncActivityLogsForAuditAction();
      if (!activityLogsSynced) return;

      if (latestEditorSnapshotRef.current) {
        await updateDocument(
          latestEditorSnapshotRef.current.content,
          latestEditorSnapshotRef.current.plainText
        );
      }
      const response = await apiClient.post(`/tasks/enrollments/${taskEnrollment.id}/submissions`, {
        documentId,
        ...(options.automatic ? { automatic: true } : {}),
      });
      const certificate = response.data.data?.certificate;
      toast({
        title: options.automatic ? 'Auto-submitted' : 'Submitted',
        description: options.automatic
          ? 'Time expired, so your task submission and certificate were created automatically.'
          : 'Your task submission and certificate were created.',
      });
      if (certificate?.id && !options.automatic) {
        router.push(`/certificates/${certificate.id}`);
      }
    } catch (err: any) {
      toast({
        title: 'Submission failed',
        description: err.response?.data?.message || err.message || 'Failed to submit task',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingTask(false);
    }
  }, [documentId, router, syncActivityLogsForAuditAction, taskEnrollment, toast, updateDocument, validateCharacterBounds]);

  useEffect(() => {
    if (!isTimeLimitExpired || !taskEnrollment || isSubmittingTask) return;

    const autoSubmitKey = `${documentId}:${taskEnrollment.id}:${timerStartedAtMs}`;
    if (autoSubmittedTimeLimitRef.current === autoSubmitKey) return;

    autoSubmittedTimeLimitRef.current = autoSubmitKey;
    void handleSubmitTask({ automatic: true });
  }, [documentId, handleSubmitTask, isSubmittingTask, isTimeLimitExpired, taskEnrollment, timerStartedAtMs]);

  const handlePdfSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      validatePdfFile(file);
      setIsUploadingPdf(true);
      await uploadPdf(file, title);
      toast({
        title: 'Success',
        description: 'PDF uploaded and linked to this document.',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to upload PDF',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingPdf(false);
      event.target.value = '';
    }
  };

  if (isLoading || isTaskEnrollmentLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">{error || 'Document not found'}</p>
          {!isGuestUser && (
            <Button onClick={() => router.push('/documents')} className="mt-4">
              Back to Documents
            </Button>
          )}
        </div>
      </div>
    );
  }

  const CANVAS = 'mx-auto w-full max-w-[2400px] px-3 sm:px-4';
  const selectedInstructionFile =
    taskInstructionFiles.find((file) => file.id === selectedInstructionFileId) ||
    taskInstructionFile;
  const displayFile = selectedInstructionFile || linkedFile;
  const aiEnabled = currentEnvironmentConfig.aiAccess !== 'off';
  const lockedAiModel = currentEnvironmentConfig.allowedModels?.[0] || (taskEnrollment ? 'Task model' : undefined);
  const lockedAiBaseUrl = currentEnvironmentConfig.aiProvider?.baseUrl;

  const handleExportConfig = () => {
    const configForExport = enrichEnvironmentConfigForExport(currentEnvironmentConfig);
    const blob = new Blob(
      [JSON.stringify(configForExport, null, 2)],
      { type: 'application/json' }
    );
    downloadBlob(
      blob,
      `${(title || 'document').replace(/[^a-z0-9_-]+/gi, '_')}-environment-config.json`
    );
  };

  const effectiveSaveStatus: SaveStatus = isSaving ? 'saving' : saveStatus;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border/70 bg-card">
        <div className={`${CANVAS} py-3`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {!isPublicTaskGuestDocument && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Back to Documents"
                  onClick={() => router.push('/documents')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}

              <div className="min-w-0 flex-1">
                {isTitleEditing ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="text-lg font-semibold"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleTitleSave();
                        else if (e.key === 'Escape') {
                          setTitle(document.title || '');
                          setIsTitleEditing(false);
                        }
                      }}
                      autoFocus
                    />
                    <Button size="sm" onClick={handleTitleSave}>
                      Save
                    </Button>
                    <SaveStatusIndicator status={effectiveSaveStatus} />
                  </div>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    <h1
                      className="min-w-0 cursor-pointer truncate text-lg font-semibold tracking-normal hover:text-muted-foreground"
                      onClick={() => setIsTitleEditing(true)}
                      title={title || 'Untitled Document'}
                    >
                      {title || 'Untitled Document'}
                    </h1>
                    <SaveStatusIndicator status={effectiveSaveStatus} />
                  </div>
                )}
                {taskEnrollment && (taskEnrollment.startDate || taskEnrollment.endDate) && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {taskEnrollment.startDate && (
                      <span>Starts {formatDateTime(taskEnrollment.startDate)}</span>
                    )}
                    {taskEnrollment.endDate && (
                      <span>Deadline {formatDateTime(taskEnrollment.endDate)}</span>
                    )}
                  </div>
                )}
                {visibleCountdown && (
                  <Badge
                    variant={visibleCountdown.variant}
                    className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md"
                    title={visibleCountdown.title}
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{visibleCountdown.label}</span>
                    <span className=" font-semibold">{visibleCountdown.value}</span>
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {!displayFile && !taskEnrollment && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={handlePdfSelect}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPdf}
                    className="sm:size-default"
                  >
                    {isUploadingPdf ? (
                      <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 sm:mr-2" />
                    )}
                    <span className="hidden sm:inline">{isUploadingPdf ? 'Uploading...' : 'Upload PDF'}</span>
                  </Button>
                </>
              )}

              {displayFile && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPdfPanel(!showPdfPanel)}
                  title={showPdfPanel ? 'Hide PDF' : 'Show PDF'}
                >
                  {showPdfPanel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
                  <span className="hidden sm:inline ml-1">PDF</span>
                </Button>
              )}

              {!hasCharacterBounds && (
                <div
                  className="hidden sm:block text-sm text-muted-foreground"
                  title="Character count includes letters, spaces, punctuation, and symbols."
                >
                  {characterCount.toLocaleString()} characters
                </div>
              )}

              {hasCharacterBounds && (
                <Badge
                  variant="secondary"
                  className="rounded-md"
                  title={characterBoundsTitle}
                >
                  {characterBoundsLabel}
                </Badge>
              )}

              {aiEnabled && (
                <AIAssistantButton isOpen={isAIPanelOpen} onClick={toggleAIPanel} />
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleViewLogs}
                disabled={isSyncingActivityLogs}
                className="sm:size-default"
              >
                {isSyncingActivityLogs ? (
                  <>
                    <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                    <span className="hidden sm:inline">Saving activity...</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">View Logs</span>
                  </>
                )}
              </Button>

              {!taskEnrollment && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportConfig}
                  className="sm:size-default"
                >
                  <Download className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Export Config</span>
                </Button>
              )}

              {taskEnrollment ? (
                <Button
                  size="sm"
                  onClick={() => handleSubmitTask()}
                  disabled={isSubmittingTask || isSyncingActivityLogs}
                  className="sm:size-default"
                >
                  {isSubmittingTask || isSyncingActivityLogs ? (
                    <>
                      <Clock className="h-4 w-4 sm:mr-2 animate-spin" />
                      <span className="hidden sm:inline">
                        {isSyncingActivityLogs ? 'Saving activity...' : 'Submitting...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Award className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Submit</span>
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setShowCertificateDialog(true)}
                  disabled={isGeneratingCertificate || isSyncingActivityLogs}
                  className="sm:size-default"
                >
                  {isGeneratingCertificate ? (
                    <>
                      <Clock className="h-4 w-4 sm:mr-2 animate-spin" />
                      <span className="hidden sm:inline">Generating...</span>
                    </>
                  ) : (
                    <>
                      <Award className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Generate Certificate</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <div className={`${CANVAS} h-full py-3`}>
          {/* ✅ Resizable like Overleaf */}
          <ResizablePanelGroup direction="horizontal" className="h-full w-full overflow-hidden rounded-lg border border-border/80 bg-card">
            {/* PDF */}
            {displayFile && showPdfPanel ? (
              <ResizablePanel defaultSize={38} minSize={22}>
                <div className="flex h-full flex-col overflow-hidden border-r border-border/70 bg-card">
                  {taskInstructionFiles.length > 1 ? (
                    <div className="shrink-0 border-b border-border/70 bg-muted/30 px-3 py-2">
                      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                        {taskInstructionFiles.map((file, index) => (
                          <Button
                            key={file.id}
                            type="button"
                            variant={file.id === displayFile.id ? 'default' : 'outline'}
                            size="sm"
                            className="max-w-[240px] shrink-0 justify-start truncate"
                            title={file.title}
                            onClick={() => setSelectedInstructionFileId(file.id)}
                          >
                            <span className="truncate">{file.title || `File ${index + 1}`}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <PDFViewer
                      key={displayFile.id}
                      fileId={displayFile.id}
                      documentId={documentId}
                    />
                  </div>
                </div>
              </ResizablePanel>
            ) : null}

            {displayFile && showPdfPanel ? <ResizableHandle withHandle /> : null}

            {/* Editor */}
            <ResizablePanel
              defaultSize={displayFile && showPdfPanel ? (isAIPanelOpen ? 37 : 62) : (isAIPanelOpen ? 70 : 100)}
              minSize={30}
            >
              <div className="h-full overflow-auto bg-background">
                <div className={`${displayFile || isAIPanelOpen ? 'px-4 py-4' : 'px-6 py-6'} h-full`}>
                  {!displayFile && (
                    <div className="mb-4 rounded-lg border border-dashed border-border/80 bg-muted/30 p-4">
                      <div>
                        <div>
                          <h2 className="text-sm font-semibold">No PDF linked</h2>
                          <p className="text-sm text-muted-foreground">
                            You can keep writing here and upload the source PDF later for side-by-side reference.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {isEditorReadOnly && (
                    <div className="mb-4 rounded-lg border border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
                      The writing time limit has ended. This document is now read-only.
                      {taskEnrollment ? ' Humanly is submitting the task automatically.' : null}
                    </div>
                  )}
                  <LexicalEditor
                    documentId={documentId}
                    userId={user?.id}
                    initialContent={editorInitialContent}
                    placeholder={displayFile ? 'Start writing with your PDF open...' : 'Start typing your document...'}
                    editable={!isEditorReadOnly}
                    trackingEnabled={!isEditorReadOnly}
                    copyPastePolicy={currentEnvironmentConfig.copyPastePolicy}
                    maxCharacters={maximumSubmissionCharacters}
                    onCharacterLimitReached={handleCharacterLimitReached}
                    autoSaveEnabled={!isEditorReadOnly}
                    autoSaveInterval={EDITOR_AUTO_SAVE_INTERVAL_MS}
                    onContentChange={handleContentChange}
                    onEventsBuffer={handleEventsBuffer}
                    onEventFlushReady={handleEventFlushReady}
                    onAutoSave={handleAutoSave}
                    className="h-full"
                    renderSelectionPopup={aiEnabled && !isEditorReadOnly ? ({ selection, onClose, replaceSelection, cancelAIAction, undoLastAction }) => (
                      <AISelectionMenu
                        documentId={documentId}
                        selection={selection}
                        onClose={onClose}
                        replaceSelection={replaceSelection}
                        cancelAIAction={cancelAIAction}
                        undoLastAction={undoLastAction}
                        onActionApplied={handleAISelectionAction}
                        onAskAI={(text) => {
                          onClose();
                          handleAskAI(text);
                        }}
                        taskManaged={!!taskEnrollment}
                        getDocumentPlainText={() => document?.plainText || ''}
                        documentTitle={document?.title || ''}
                        registerActionTrigger={(trigger) => {
                          quickActionTriggerRef.current = trigger;
                        }}
                      />
                    ) : undefined}
                    renderAIBridge={({ insertAtCursor }) => (
                      <EditorAIBridgeCapture
                        insertAtCursor={isEditorReadOnly ? null : insertAtCursor}
                        onInsertAtCursorChange={handleEditorInsertAtCursorChange}
                      />
                    )}
                  />
                </div>
              </div>
            </ResizablePanel>

            {/* AI */}
            {aiEnabled && isAIPanelOpen ? (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={25} minSize={18}>
                  <div className="h-full overflow-hidden border-l border-border/70 bg-card">
                    <AIAssistantPanel
                      documentId={documentId}
                      onClose={closeAIPanel}
                      taskManaged={!!taskEnrollment}
                      lockedModel={lockedAiModel}
                      lockedBaseUrl={lockedAiBaseUrl}
                      insertAtCursor={!isEditorReadOnly && editorInsertAtCursor ? handleInsertAssistantMessage : null}
                    />
                  </div>
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        </div>
      </div>

      <CertificateGenerationDialog
        open={showCertificateDialog}
        onOpenChange={setShowCertificateDialog}
        onGenerate={handleGenerateCertificate}
        isGenerating={isGeneratingCertificate}
      />
    </div>
  );
}
