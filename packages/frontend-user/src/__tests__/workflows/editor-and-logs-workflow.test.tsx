import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { format } from 'date-fns';

import DocumentEditorPage from '@/app/documents/[id]/page';
import DocumentLogsPage from '@/app/logs/[id]/page';

const mockPush = jest.fn();
const mockUseParams = jest.fn(() => ({ id: 'doc-1' }));
const mockToast = jest.fn();
const mockTrackEvents = jest.fn();
const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockUpdateDocument = jest.fn();
const mockGenerateCertificate = jest.fn();
const mockStartWritingSession = jest.fn();
let mockDocumentEnvironmentConfig: any = { aiAccess: 'off', copyPastePolicy: 'allowed' };
let mockDocumentContent: any = {};
let mockDocumentPlainText = '';
let mockDocumentCharacterCount = 0;
let mockDocumentWritingStartedAt: string | null = null;
let mockDocumentOverride: any = undefined;
let mockDocumentError: string | null = null;
let mockTaskEnrollments: any[] = [];
let mockAuthUserEmail = 'user@example.com';
let mockAiLogs: any[] = [];
let mockTimelineSummary: any;
let mockTimelineItems: any[] = [];
let mockLatestEditorProps: any;
let mockEditorBufferedEvents: any[] = [];
let mockFlushEditorEvents: (() => Promise<void>) | null = null;
let mockIsAIPanelOpen = false;

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useParams: () => mockUseParams(),
}));

jest.mock('next/dynamic', () => () => function DynamicMock() {
  return <div>PDF viewer unavailable in unit tests</div>;
});

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: jest.fn(() => 'remark-gfm'),
}));

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children, remarkPlugins }: any) => {
    const source = String(children ?? '');

    if (remarkPlugins?.length && source.includes('| Metric | Value |')) {
      return (
        <div>
          <h2>Markdown heading</h2>
          <p>
            Rendered <strong>bold text</strong>.
          </p>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Revenue</td>
                <td>42</td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    }

    return <div>{source}</div>;
  },
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

jest.mock('@/hooks/use-document', () => ({
  useDocument: () => {
    const document = mockDocumentOverride === undefined ? {
      id: 'doc-1',
      title: 'Workflow Document',
      content: mockDocumentContent,
      plainText: mockDocumentPlainText,
      status: 'draft',
      wordCount: 0,
      characterCount: mockDocumentCharacterCount,
      environmentConfig: mockDocumentEnvironmentConfig,
      writingStartedAt: mockDocumentWritingStartedAt,
    } : mockDocumentOverride;

    return {
      document,
      linkedFile: null,
      isLoading: false,
      error: mockDocumentError,
      isSaving: false,
      updateDocument: mockUpdateDocument,
      startWritingSession: mockStartWritingSession,
      trackEvents: mockTrackEvents,
      uploadPdf: jest.fn(),
    };
  },
}));

jest.mock('@/hooks/use-certificates', () => ({
  useCertificates: () => ({
    generateCertificate: mockGenerateCertificate,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: mockAuthUserEmail },
    checkAuth: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-ai', () => ({
  useAI: () => ({
    isPanelOpen: mockIsAIPanelOpen,
    togglePanel: jest.fn(),
    closePanel: jest.fn(),
  }),
}));

jest.mock('@/stores/ai-store', () => ({
  useAIStore: (selector: any) => selector({
    openPanelWithQuote: jest.fn(),
  }),
}));

jest.mock('@/components/ai', () => ({
  AIAssistantButton: ({ onClick }: any) => (
    <button type="button" onClick={onClick}>AI Assistant</button>
  ),
  AIAssistantPanel: ({ insertAtCursor }: any) => (
    <button
      type="button"
      onClick={() => insertAtCursor?.('AI inserted text', { messageId: 'message-1', logId: 'log-1' })}
    >
      Insert AI Message
    </button>
  ),
  AISelectionMenu: () => null,
}));

jest.mock('@/components/certificates/certificate-generation-dialog', () => ({
  CertificateGenerationDialog: ({ open, onGenerate }: any) => open ? (
    <button
      type="button"
      onClick={() => onGenerate({ includeFullText: true, includeEditHistory: true })}
    >
      Confirm Generate Certificate
    </button>
  ) : null,
}));

jest.mock('@/lib/document-pdf', () => ({
  validatePdfFile: jest.fn(() => null),
}));

jest.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: jest.fn(),
  },
  TokenManager: {
    getAccessToken: jest.fn(() => 'token'),
    setAccessToken: jest.fn(),
    clearAccessToken: jest.fn(),
    getPublicDocumentAccessToken: jest.fn(() => null),
  },
}));

jest.mock('@humanly/editor', () => {
  const React = require('react');
  const mockInsertAtCursor = (text: string) => ({
    inserted: true,
    textBefore: '',
    textAfter: text,
    cursorPosition: text.length,
    selectionStart: 0,
    selectionEnd: text.length,
    editorStateBefore: { root: { children: [] } },
    editorStateAfter: { root: { children: [{ text }] } },
  });

  return {
    LexicalEditor: (props: any) => {
      mockLatestEditorProps = props;
      const {
        onContentChange,
        onEventsBuffer,
        onAutoSave,
        placeholder,
        onEventFlushReady,
        renderAIBridge,
      } = props;

      React.useEffect(() => {
        const flushPendingEvents = async () => {
          if (mockEditorBufferedEvents.length === 0) return;

          const events = [...mockEditorBufferedEvents];
          mockEditorBufferedEvents = [];

          try {
            await onEventsBuffer?.(events);
          } catch (error) {
            mockEditorBufferedEvents = [...events, ...mockEditorBufferedEvents];
            throw error;
          }
        };

        mockFlushEditorEvents = flushPendingEvents;
        onEventFlushReady?.(flushPendingEvents);

        return () => {
          mockFlushEditorEvents = null;
          onEventFlushReady?.(null);
        };
      }, [onEventsBuffer, onEventFlushReady]);

      return (
        <>
          {renderAIBridge?.({ insertAtCursor: mockInsertAtCursor })}
          <textarea
            aria-label="Document editor"
            placeholder={placeholder}
            onChange={(event) => {
              const plainText = event.currentTarget.value;
              const content = { root: { children: [{ text: plainText }] } };
              onContentChange?.(content, plainText);
              onAutoSave?.(content, plainText);
              mockEditorBufferedEvents.push({
                eventType: 'input',
                timestamp: new Date().toISOString(),
                keyChar: plainText.at(-1) || '',
              });
            }}
            disabled={props.editable === false}
          />
        </>
      );
    },
  };
});

describe('editor and logs workflows', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockToast.mockClear();
    mockTrackEvents.mockClear();
    mockGenerateCertificate.mockReset();
    mockGenerateCertificate.mockResolvedValue({ id: 'certificate-1' });
    mockStartWritingSession.mockReset();
    mockUpdateDocument.mockReset();
    mockUpdateDocument.mockResolvedValue(undefined);
    mockDocumentEnvironmentConfig = { aiAccess: 'off', copyPastePolicy: 'allowed' };
    mockDocumentContent = {};
    mockDocumentPlainText = '';
    mockDocumentCharacterCount = 0;
    mockDocumentWritingStartedAt = null;
    mockDocumentOverride = undefined;
    mockDocumentError = null;
    mockTaskEnrollments = [];
    mockAuthUserEmail = 'user@example.com';
    mockAiLogs = [];
    mockTimelineSummary = {
      rawEventTotal: 40,
      timelineItemTotal: 2,
      typingBursts: 1,
      typedCharacters: 11,
      typedWords: 2,
      pasteCharacters: 0,
      deletedCharacters: 0,
    };
    mockTimelineItems = [
      {
        id: 'typing-event-1',
        kind: 'typing_burst',
        label: 'Typed text',
        timestamp: '2026-05-14T12:00:01.000Z',
        startTimestamp: '2026-05-14T12:00:00.000Z',
        endTimestamp: '2026-05-14T12:00:01.000Z',
        text: 'hello world',
        charCount: 11,
        wordCount: 2,
        cursorStart: 0,
        cursorEnd: 11,
        rawEventCount: 11,
        rawEvents: [
          {
            id: 'event-raw-1',
            eventType: 'input',
            timestamp: '2026-05-14T12:00:00.000Z',
            keyChar: 'h',
            insertedText: 'h',
            cursorPosition: 1,
          },
        ],
      },
      {
        id: 'event-hidden-1',
        kind: 'event',
        label: 'Editor blurred',
        timestamp: '2026-05-14T12:00:03.000Z',
        startTimestamp: '2026-05-14T12:00:03.000Z',
        endTimestamp: '2026-05-14T12:00:03.000Z',
        text: '',
        rawEventCount: 1,
        rawEvents: [
          {
            id: 'event-raw-2',
            eventType: 'blur',
            timestamp: '2026-05-14T12:00:03.000Z',
            cursorPosition: 11,
          },
        ],
      },
    ];
    mockLatestEditorProps = undefined;
    mockEditorBufferedEvents = [];
    mockFlushEditorEvents = null;
    mockIsAIPanelOpen = false;
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;
    mockStartWritingSession.mockImplementation(async () => ({
      id: 'doc-1',
      title: 'Workflow Document',
      content: {},
      plainText: mockDocumentPlainText,
      status: 'draft',
      wordCount: 0,
      characterCount: mockDocumentCharacterCount,
      environmentConfig: mockDocumentEnvironmentConfig,
      writingStartedAt: new Date().toISOString(),
    }));
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockUseParams.mockReturnValue({ id: 'doc-1' });

    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/tasks/my-enrollments') {
        return { data: { data: { enrollments: mockTaskEnrollments } } };
      }
      if (path === '/tasks/enrollments/enroll-1/instruction-files') {
        return { data: { data: { files: [], file: null } } };
      }
      if (path === '/documents/doc-1') {
        return { data: { data: { document: { title: 'Workflow Document' } } } };
      }
      if (path === '/documents/doc-1/events/timeline?limit=10000') {
        return {
          data: {
            data: {
              summary: mockTimelineSummary,
              items: mockTimelineItems,
            },
          },
        };
      }
      if (path === '/ai/logs?documentId=doc-1&limit=50&offset=0') {
        return { data: { data: mockAiLogs } };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    mockApiPost.mockImplementation(async (path: string) => {
      if (path === '/tasks/enrollments/enroll-1/submission-sessions') {
        return { data: { data: { sessionId: 'session-1' } } };
      }
      if (path === '/tasks/enrollments/enroll-1/submissions') {
        return { data: { data: { certificate: { id: 'certificate-1' } } } };
      }
      throw new Error(`Unexpected POST ${path}`);
    });
  });

  it('accepts editor typing and sends buffered document events', async () => {
    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/document editor/i), {
      target: { value: 'QA editor text' },
    });

    expect(mockTrackEvents).not.toHaveBeenCalled();

    await act(async () => {
      await mockFlushEditorEvents?.();
    });

    await waitFor(() => {
      expect(mockTrackEvents).toHaveBeenCalledWith(
        [expect.objectContaining({ eventType: 'input' })],
        null,
        { throwOnError: true }
      );
    });
    expect(screen.queryByText(/failed to fetch|document not found|application error/i)).not.toBeInTheDocument();
  });

  it('flushes pending activity logs before navigating to logs', async () => {
    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/document editor/i), {
      target: { value: 'A' },
    });

    fireEvent.click(screen.getByRole('button', { name: /view logs/i }));

    await waitFor(() => {
      expect(mockTrackEvents).toHaveBeenCalledWith(
        [expect.objectContaining({ eventType: 'input' })],
        null,
        { throwOnError: true }
      );
      expect(mockPush).toHaveBeenCalledWith('/logs/doc-1');
    });
    expect(mockTrackEvents.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0]);
  });

  it('does not navigate to logs until a delayed activity log flush finishes', async () => {
    const deferred = createDeferred();
    mockTrackEvents.mockReturnValueOnce(deferred.promise);

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/document editor/i), {
      target: { value: 'A' },
    });

    fireEvent.click(screen.getByRole('button', { name: /view logs/i }));

    expect(await screen.findByText('Saving activity...')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/logs/doc-1');
    });
  });

  it('waits for existing in-flight activity log writes without duplicating the POST', async () => {
    const deferred = createDeferred();
    mockTrackEvents.mockReturnValueOnce(deferred.promise);

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    const inFlightWrite = mockLatestEditorProps.onEventsBuffer([
      {
        eventType: 'focus',
        timestamp: new Date().toISOString(),
      },
    ]);

    await waitFor(() => {
      expect(mockTrackEvents).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /view logs/i }));

    expect(await screen.findByText('Saving activity...')).toBeInTheDocument();
    expect(mockTrackEvents).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve();
      await inFlightWrite;
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/logs/doc-1');
    });
    expect(mockTrackEvents).toHaveBeenCalledTimes(1);
  });

  it('blocks logs navigation when activity log flush fails', async () => {
    mockTrackEvents.mockRejectedValueOnce(new Error('event write failed'));

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/document editor/i), {
      target: { value: 'A' },
    });

    fireEvent.click(screen.getByRole('button', { name: /view logs/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Activity logs failed to save',
        variant: 'destructive',
      }));
    });
    expect(mockPush).not.toHaveBeenCalledWith('/logs/doc-1');
    expect(await screen.findByRole('button', { name: /view logs/i })).toBeEnabled();
  });

  it('waits for pending AI insert activity writes before navigating to logs', async () => {
    const deferred = createDeferred();
    mockDocumentEnvironmentConfig = { aiAccess: 'full', copyPastePolicy: 'allowed' };
    mockIsAIPanelOpen = true;
    mockTrackEvents.mockReturnValueOnce(deferred.promise);

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /insert ai message/i }));

    await waitFor(() => {
      expect(mockTrackEvents).toHaveBeenCalledWith(
        [expect.objectContaining({ eventType: 'ai_insert_from_chat' })],
        null,
        { throwOnError: true }
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /view logs/i }));

    expect(await screen.findByText('Saving activity...')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/logs/doc-1');
    });
  });

  it('uses a short editor autosave window and persists changed content', async () => {
    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/document editor/i), {
      target: { value: 'Short autosave QA text' },
    });

    expect(mockLatestEditorProps.autoSaveEnabled).toBe(true);
    expect(mockLatestEditorProps.autoSaveInterval).toBeLessThanOrEqual(2000);
    await waitFor(() => {
      expect(mockUpdateDocument).toHaveBeenCalledWith(
        expect.objectContaining({ root: expect.any(Object) }),
        'Short autosave QA text'
      );
    });
  });

  it('shows an inline save status beside the document title', async () => {
    let resolveSave: (value?: unknown) => void = () => {};
    mockUpdateDocument.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveSave = resolve;
      })
    );

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/document editor/i), {
      target: { value: 'Pending save status text' },
    });

    expect(await screen.findByText('Saving...')).toBeInTheDocument();

    await act(async () => {
      resolveSave();
    });

    await waitFor(() => {
      expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('opens a document with an empty Lexical root without passing invalid editor state', async () => {
    mockDocumentContent = { root: { children: [] } };

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(mockLatestEditorProps.initialContent).toBeUndefined();
    expect(screen.queryByText(/application error|setEditorState/i)).not.toBeInTheDocument();
  });

  it('shows a configured writing time limit in the editor header', async () => {
    mockDocumentEnvironmentConfig = {
      aiAccess: 'off',
      copyPastePolicy: 'allowed',
      aiUsageLimit: { mode: 'unlimited' },
      time: {
        lateSubmission: 'allowed',
        timeLimitSeconds: 60,
      },
    };

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(screen.getByText('Writing time left')).toBeInTheDocument();
    expect(screen.getByTitle('Writing time limit: 1:00')).toBeInTheDocument();
    await waitFor(() => expect(mockStartWritingSession).toHaveBeenCalled());
  });

  it('keeps an expired timed document read-only after reopening', async () => {
    mockDocumentEnvironmentConfig = {
      aiAccess: 'off',
      copyPastePolicy: 'allowed',
      aiUsageLimit: { mode: 'unlimited' },
      time: {
        lateSubmission: 'allowed',
        timeLimitSeconds: 60,
      },
    };
    mockDocumentWritingStartedAt = new Date(Date.now() - 90_000).toISOString();

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(screen.getByText('Writing time limit reached')).toBeInTheDocument();
    expect(screen.getByText(/This document is now read-only/)).toBeInTheDocument();
    expect(screen.getByLabelText(/document editor/i)).toBeDisabled();
    expect(mockStartWritingSession).not.toHaveBeenCalled();
  });

  it('shows an enrolled task deadline countdown in the editor header', async () => {
    mockTaskEnrollments = [{
      id: 'enroll-1',
      documentId: 'doc-1',
      name: 'Timed Task',
      inviteCode: 'ABC123',
      joinedAt: '2026-05-19T12:00:00.000Z',
      endDate: '2099-01-01T00:00:00.000Z',
      environmentConfig: {
        aiAccess: 'off',
        copyPastePolicy: 'allowed',
      },
    }];

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(screen.getByText('Task deadline in')).toBeInTheDocument();
    expect(screen.getByTitle(/Task deadline:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to documents/i })).toBeInTheDocument();
  });

  it('hides the workspace back button for public guest task documents', async () => {
    mockAuthUserEmail = 'public-task-guest@guest.humanly.local';
    mockTaskEnrollments = [{
      id: 'enroll-1',
      documentId: 'doc-1',
      name: 'Public Task',
      inviteCode: 'ABC123',
      joinedAt: '2026-05-19T12:00:00.000Z',
      endDate: '2099-01-01T00:00:00.000Z',
      environmentConfig: {
        aiAccess: 'off',
        copyPastePolicy: 'allowed',
      },
    }];

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(screen.getByText('Task deadline in')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to documents/i })).not.toBeInTheDocument();
  });

  it('hides the documents back action for guest document load errors', async () => {
    mockAuthUserEmail = 'public-task-guest@guest.humanly.local';
    mockDocumentOverride = null;
    mockDocumentError = 'Document not found or unauthorized';

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Document not found or unauthorized')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to documents/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Back to Documents')).not.toBeInTheDocument();
  });

  it('keeps the documents back action for normal user document load errors', async () => {
    mockDocumentOverride = null;
    mockDocumentError = 'Document not found or unauthorized';

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Document not found or unauthorized')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to documents/i })).toBeInTheDocument();
  });

  it('auto-submits an enrolled timed task when the persisted timer has expired', async () => {
    mockTaskEnrollments = [{
      id: 'enroll-1',
      documentId: 'doc-1',
      name: 'Timed Auto Submit Task',
      inviteCode: 'ABC123',
      joinedAt: '2026-05-19T12:00:00.000Z',
      environmentConfig: {
        aiAccess: 'off',
        copyPastePolicy: 'allowed',
        time: {
          lateSubmission: 'not_allowed',
          timeLimitSeconds: 60,
        },
      },
    }];
    mockDocumentWritingStartedAt = new Date(Date.now() - 90_000).toISOString();
    mockDocumentPlainText = 'Final answer';
    mockDocumentCharacterCount = 12;

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(screen.getByText('Writing time limit reached')).toBeInTheDocument();
    expect(screen.getByLabelText(/document editor/i)).toBeDisabled();

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/tasks/enrollments/enroll-1/submissions',
        { documentId: 'doc-1', automatic: true }
      );
    });
    expect(mockPush).not.toHaveBeenCalledWith('/certificates/certificate-1');
  });

  it('uses enrolled task AI settings over stale document AI settings', async () => {
    mockDocumentEnvironmentConfig = {
      aiAccess: 'off',
      copyPastePolicy: 'allowed',
    };
    mockTaskEnrollments = [{
      id: 'enroll-1',
      documentId: 'doc-1',
      name: 'AI Enabled Task',
      inviteCode: 'ABC123',
      joinedAt: '2026-05-19T12:00:00.000Z',
      environmentConfig: {
        aiAccess: 'full',
        allowedModels: ['GPT-4o mini'],
        copyPastePolicy: 'allowed',
      },
    }];

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI Assistant' })).toBeInTheDocument();
  });

  it('hides AI assistant when the enrolled task disables AI despite stale document AI settings', async () => {
    mockDocumentEnvironmentConfig = {
      aiAccess: 'full',
      allowedModels: ['GPT-4o mini'],
      copyPastePolicy: 'allowed',
    };
    mockTaskEnrollments = [{
      id: 'enroll-1',
      documentId: 'doc-1',
      name: 'No AI Task',
      inviteCode: 'ABC123',
      joinedAt: '2026-05-19T12:00:00.000Z',
      environmentConfig: {
        aiAccess: 'off',
        copyPastePolicy: 'allowed',
      },
    }];

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AI Assistant' })).not.toBeInTheDocument();
  });

  it('does not inherit a stale document minimum character count when the enrolled task has no minimum', async () => {
    mockDocumentEnvironmentConfig = {
      aiAccess: 'off',
      copyPastePolicy: 'allowed',
      submission: {
        mode: 'multiple',
        minCharacters: 20,
      },
    };
    mockTaskEnrollments = [{
      id: 'enroll-1',
      documentId: 'doc-1',
      name: 'No Minimum Task',
      inviteCode: 'ABC123',
      joinedAt: '2026-05-19T12:00:00.000Z',
      environmentConfig: {
        aiAccess: 'off',
        copyPastePolicy: 'allowed',
        submission: {
          mode: 'multiple',
        },
      },
    }];

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(screen.queryByText('0 characters · min 20')).not.toBeInTheDocument();
  });

  it('ignores personal writing minimum character limits while preserving maximum bounds', async () => {
    mockDocumentEnvironmentConfig = {
      aiAccess: 'off',
      copyPastePolicy: 'allowed',
      submission: {
        mode: 'multiple',
        minCharacters: 10,
        maxCharacters: 50,
      },
    };
    mockDocumentPlainText = 'a b!';
    mockDocumentCharacterCount = 4;

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(screen.queryByText('4 characters')).not.toBeInTheDocument();
    expect(screen.getByText('4/50 characters')).toBeInTheDocument();
    expect(screen.queryByText(/min 10/i)).not.toBeInTheDocument();
    expect(mockLatestEditorProps.maxCharacters).toBe(50);

    fireEvent.click(screen.getByRole('button', { name: /generate certificate/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm generate certificate/i }));

    await waitFor(() => {
      expect(mockGenerateCertificate).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({ certificateType: 'full_authorship' })
      );
    });
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({
      title: 'Minimum length required',
    }));
  });

  it('flushes pending activity logs before generating a certificate', async () => {
    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/document editor/i), {
      target: { value: 'Certificate text' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate certificate/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm generate certificate/i }));

    await waitFor(() => {
      expect(mockTrackEvents).toHaveBeenCalledWith(
        [expect.objectContaining({ eventType: 'input' })],
        null,
        { throwOnError: true }
      );
      expect(mockGenerateCertificate).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({ certificateType: 'full_authorship' })
      );
    });
    expect(mockTrackEvents.mock.invocationCallOrder[0]).toBeLessThan(
      mockGenerateCertificate.mock.invocationCallOrder[0]
    );
  });

  it('uses enrolled task copy-paste and time settings over stale document settings', async () => {
    mockDocumentEnvironmentConfig = {
      aiAccess: 'off',
      copyPastePolicy: 'allowed',
      aiUsageLimit: { mode: 'unlimited' },
      time: {
        lateSubmission: 'allowed',
      },
    };
    mockTaskEnrollments = [{
      id: 'enroll-1',
      documentId: 'doc-1',
      name: 'Locked Config Task',
      inviteCode: 'ABC123',
      joinedAt: '2026-05-19T12:00:00.000Z',
      environmentConfig: {
        aiAccess: 'off',
        copyPastePolicy: 'blocked',
        aiUsageLimit: { mode: 'max_requests', maxRequests: 100 },
        time: {
          lateSubmission: 'not_allowed',
          timeLimitSeconds: 90,
        },
      },
    }];

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(mockLatestEditorProps.copyPastePolicy).toBe('blocked');
    expect(screen.getByText('Writing time left')).toBeInTheDocument();
    expect(screen.getByTitle('Writing time limit: 1:30')).toBeInTheDocument();
  });

  it('blocks enrolled task submission below the configured minimum character count', async () => {
    mockTaskEnrollments = [{
      id: 'enroll-1',
      documentId: 'doc-1',
      name: 'Minimum Character Task',
      inviteCode: 'ABC123',
      joinedAt: '2026-05-19T12:00:00.000Z',
      environmentConfig: {
        aiAccess: 'off',
        copyPastePolicy: 'allowed',
        submission: {
          mode: 'multiple',
          minCharacters: 1000,
        },
      },
    }];

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(screen.getByText('0 characters · min 1,000')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Minimum length required',
      variant: 'destructive',
    }));
    expect(mockApiPost).not.toHaveBeenCalledWith(
      '/tasks/enrollments/enroll-1/submissions',
      expect.anything()
    );
  });

  it('blocks enrolled task submission above the configured maximum character count', async () => {
    mockTaskEnrollments = [{
      id: 'enroll-1',
      documentId: 'doc-1',
      name: 'Maximum Character Task',
      inviteCode: 'ABC123',
      joinedAt: '2026-05-19T12:00:00.000Z',
      environmentConfig: {
        aiAccess: 'off',
        copyPastePolicy: 'allowed',
        submission: {
          mode: 'multiple',
          maxCharacters: 5,
        },
      },
    }];
    mockDocumentPlainText = 'Too long';
    mockDocumentCharacterCount = 8;

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    expect(screen.getByText('8/5 characters')).toBeInTheDocument();
    expect(mockLatestEditorProps.maxCharacters).toBe(5);

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Maximum length exceeded',
      variant: 'destructive',
    }));
    expect(mockApiPost).not.toHaveBeenCalledWith(
      '/tasks/enrollments/enroll-1/submissions',
      expect.anything()
    );
  });

  it('flushes pending activity logs before task submit', async () => {
    mockTaskEnrollments = [{
      id: 'enroll-1',
      documentId: 'doc-1',
      name: 'Submit Task',
      inviteCode: 'ABC123',
      joinedAt: '2026-05-19T12:00:00.000Z',
      environmentConfig: {
        aiAccess: 'off',
        copyPastePolicy: 'allowed',
      },
    }];

    render(<DocumentEditorPage />);

    expect(await screen.findByText('Workflow Document')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/tasks/enrollments/enroll-1/submission-sessions',
        { documentId: 'doc-1' }
      );
    });

    fireEvent.change(screen.getByLabelText(/document editor/i), {
      target: { value: 'Submitted text' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(mockTrackEvents).toHaveBeenCalledWith(
        [expect.objectContaining({ eventType: 'input' })],
        'session-1',
        { throwOnError: true }
      );
      expect(mockApiPost).toHaveBeenCalledWith(
        '/tasks/enrollments/enroll-1/submissions',
        { documentId: 'doc-1' }
      );
    });

    const submissionCallOrder = mockApiPost.mock.invocationCallOrder[
      mockApiPost.mock.calls.findIndex(([path]) => path === '/tasks/enrollments/enroll-1/submissions')
    ];
    expect(mockTrackEvents.mock.invocationCallOrder[0]).toBeLessThan(submissionCallOrder);
  });

  it('shows writing events with in-place fold points for less important logs', async () => {
    render(<DocumentLogsPage />);

    expect(await screen.findByText('Event Summary')).toBeInTheDocument();
    expect(screen.getByText(/Total recorded events:/)).toBeInTheDocument();
    expect(screen.getByText(/AI actions logged:/)).toBeInTheDocument();
    expect(await screen.findByText('"hello world"')).toBeInTheDocument();
    expect(screen.getByText('Typed')).toBeInTheDocument();
    expect(screen.getByText('2 words · 11 chars')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.queryByText('Typing bursts')).not.toBeInTheDocument();
    expect(screen.queryByText('Editor blurred')).not.toBeInTheDocument();
    expect(screen.queryByText('input')).not.toBeInTheDocument();
    expect(screen.getByText('raw event')).toBeInTheDocument();
    expect(await screen.findByText('blur')).toBeInTheDocument();
    expect(screen.getByText('Cursor 11')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show 1 other event/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Raw events')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /raw audit events/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/failed to load logs/i)).not.toBeInTheDocument();
  });

  it('labels delete raw events with inserted text as replacements', async () => {
    mockTimelineSummary = {
      rawEventTotal: 2,
      timelineItemTotal: 2,
      typingBursts: 0,
      typedCharacters: 0,
      typedWords: 0,
      pasteCharacters: 0,
      deletedCharacters: 0,
    };
    mockTimelineItems = [
      {
        id: 'raw-delete-replacement',
        kind: 'event',
        label: 'Raw delete replacement',
        timestamp: '2026-05-14T12:00:02.000Z',
        startTimestamp: '2026-05-14T12:00:02.000Z',
        endTimestamp: '2026-05-14T12:00:02.000Z',
        text: '',
        rawEventCount: 1,
        rawEvents: [
          {
            id: 'event-raw-delete-replacement',
            eventType: 'delete',
            timestamp: '2026-05-14T12:00:02.000Z',
            insertedText: 'I am good!',
            cursorPosition: 10,
          },
        ],
      },
      {
        id: 'raw-input-insert',
        kind: 'event',
        label: 'Raw input insert',
        timestamp: '2026-05-14T12:00:01.000Z',
        startTimestamp: '2026-05-14T12:00:01.000Z',
        endTimestamp: '2026-05-14T12:00:01.000Z',
        text: '',
        rawEventCount: 1,
        rawEvents: [
          {
            id: 'event-raw-input-insert',
            eventType: 'input',
            timestamp: '2026-05-14T12:00:01.000Z',
            insertedText: 'hello',
            cursorPosition: 5,
          },
        ],
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByRole('row', {
      name: /delete replaced with "I am good!" cursor 10/i,
    })).toBeInTheDocument();
    expect(screen.getByRole('row', {
      name: /input inserted "hello" cursor 5/i,
    })).toBeInTheDocument();
    expect(screen.queryByRole('row', {
      name: /delete inserted "I am good!"/i,
    })).not.toBeInTheDocument();
  });

  it('shows natural-language details for raw focus blur and select events', async () => {
    mockTimelineSummary = {
      rawEventTotal: 3,
      timelineItemTotal: 3,
      typingBursts: 0,
      typedCharacters: 0,
      typedWords: 0,
      pasteCharacters: 0,
      deletedCharacters: 0,
    };
    mockTimelineItems = [
      {
        id: 'raw-select-short',
        kind: 'event',
        label: 'Text selected',
        timestamp: '2026-05-14T12:00:03.000Z',
        startTimestamp: '2026-05-14T12:00:03.000Z',
        endTimestamp: '2026-05-14T12:00:03.000Z',
        text: '',
        rawEventCount: 1,
        rawEvents: [
          {
            id: 'raw-select-short-event',
            eventType: 'select',
            timestamp: '2026-05-14T12:00:03.000Z',
            cursorPosition: 12,
            metadata: { selectedText: 'selected phrase' },
          },
        ],
      },
      {
        id: 'raw-blur',
        kind: 'event',
        label: 'Editor blurred',
        timestamp: '2026-05-14T12:00:02.000Z',
        startTimestamp: '2026-05-14T12:00:02.000Z',
        endTimestamp: '2026-05-14T12:00:02.000Z',
        text: '',
        rawEventCount: 1,
        rawEvents: [
          {
            id: 'raw-blur-event',
            eventType: 'blur',
            timestamp: '2026-05-14T12:00:02.000Z',
            cursorPosition: 8,
          },
        ],
      },
      {
        id: 'raw-focus',
        kind: 'event',
        label: 'Editor focused',
        timestamp: '2026-05-14T12:00:01.000Z',
        startTimestamp: '2026-05-14T12:00:01.000Z',
        endTimestamp: '2026-05-14T12:00:01.000Z',
        text: '',
        rawEventCount: 1,
        rawEvents: [
          {
            id: 'raw-focus-event',
            eventType: 'focus',
            timestamp: '2026-05-14T12:00:01.000Z',
            cursorPosition: 0,
          },
        ],
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByRole('row', { name: /focus editor focused cursor 0/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /blur editor lost focus cursor 8/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /select "selected phrase" selected cursor 12/i })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /focus —/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /blur —/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /select —/i })).not.toBeInTheDocument();
  });

  it('summarizes long raw selection text instead of rendering it inline', async () => {
    mockTimelineSummary = {
      rawEventTotal: 1,
      timelineItemTotal: 1,
      typingBursts: 0,
      typedCharacters: 0,
      typedWords: 0,
      pasteCharacters: 0,
      deletedCharacters: 0,
    };
    mockTimelineItems = [
      {
        id: 'raw-select-long',
        kind: 'event',
        label: 'Text selected',
        timestamp: '2026-05-14T12:00:04.000Z',
        startTimestamp: '2026-05-14T12:00:04.000Z',
        endTimestamp: '2026-05-14T12:00:04.000Z',
        text: '',
        rawEventCount: 1,
        rawEvents: [
          {
            id: 'raw-select-long-event',
            eventType: 'select',
            timestamp: '2026-05-14T12:00:04.000Z',
            cursorPosition: 32,
            metadata: {
              selectedText: [
                'This selected text is long enough that showing it inline would make the raw row noisy.',
                'It should be summarized by line and character count instead.',
              ].join('\n'),
            },
          },
        ],
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByRole('row', { name: /select 2 lines · \d+ chars selected cursor 32/i })).toBeInTheDocument();
    expect(screen.queryByText(/showing it inline would make/)).not.toBeInTheDocument();
  });

  it('expands long paste and delete text inline from a lightweight button', async () => {
    const longPastedText = [
      'This is a long pasted paragraph that should stay compact in the timeline row.',
      'It has enough content to need a full text viewer below the row.',
      'The expanded content preserves line breaks for audit review.',
    ].join('\n');
    const longDeletedText = [
      'This is a long deleted paragraph that should stay compact in the timeline row.',
      'The reviewer can still open the full deleted text when needed.',
    ].join('\n');

    mockTimelineSummary = {
      rawEventTotal: 2,
      timelineItemTotal: 2,
      typingBursts: 0,
      typedCharacters: 0,
      typedWords: 0,
      pasteCharacters: longPastedText.length,
      deletedCharacters: longDeletedText.length,
    };
    mockTimelineItems = [
      {
        id: 'delete-event-1',
        kind: 'delete',
        label: 'Deleted text',
        timestamp: '2026-05-14T12:00:02.000Z',
        startTimestamp: '2026-05-14T12:00:02.000Z',
        endTimestamp: '2026-05-14T12:00:02.000Z',
        text: longDeletedText,
        charCount: longDeletedText.length,
        rawEventCount: 1,
        rawEvents: [],
      },
      {
        id: 'paste-event-1',
        kind: 'paste',
        label: 'Pasted text',
        timestamp: '2026-05-14T12:00:01.000Z',
        startTimestamp: '2026-05-14T12:00:01.000Z',
        endTimestamp: '2026-05-14T12:00:01.000Z',
        text: longPastedText,
        charCount: longPastedText.length,
        rawEventCount: 1,
        rawEvents: [],
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByText('Pasted')).toBeInTheDocument();
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    expect(screen.queryByText('Pasted text')).not.toBeInTheDocument();
    expect(screen.queryByText('Deleted text')).not.toBeInTheDocument();

    const viewButtons = screen.getAllByRole('button', { name: /view full text/i });
    expect(viewButtons).toHaveLength(2);
    fireEvent.click(viewButtons[0]);
    fireEvent.click(viewButtons[1]);

    expect(await screen.findByText('Pasted text')).toBeInTheDocument();
    expect(await screen.findByText('Deleted text')).toBeInTheDocument();
    expect(screen.getByText(/The expanded content preserves line breaks/)).toBeInTheDocument();
    expect(screen.getByText(/The reviewer can still open the full deleted text/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /hide full text/i })).toHaveLength(2);
  });

  it('summarizes multiline paste previews without line break tokens', async () => {
    const pastedText = [
      'High-Performance Computing',
      '',
      'High-performance computing is the ability to process data at high speeds.',
    ].join('\n');

    mockTimelineSummary = {
      rawEventTotal: 1,
      timelineItemTotal: 1,
      typingBursts: 0,
      typedCharacters: 0,
      typedWords: 0,
      pasteCharacters: pastedText.length,
      deletedCharacters: 0,
    };
    mockTimelineItems = [
      {
        id: 'paste-multiline-preview',
        kind: 'paste',
        label: 'Pasted text',
        timestamp: '2026-05-14T12:00:01.000Z',
        startTimestamp: '2026-05-14T12:00:01.000Z',
        endTimestamp: '2026-05-14T12:00:01.000Z',
        text: pastedText,
        charCount: pastedText.length,
        rawEventCount: 1,
        rawEvents: [],
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByText('Pasted')).toBeInTheDocument();
    expect(screen.getByText(/3 lines pasted · "High-Performance Computing/)).toBeInTheDocument();
    expect(screen.queryByText(/Line break/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view full text/i }));

    expect(await screen.findByText('Pasted text')).toBeInTheDocument();
    expect(screen.getAllByText(/High-performance computing is the ability/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders line breaks as standalone tokens in edit previews', async () => {
    mockTimelineSummary = {
      rawEventTotal: 2,
      timelineItemTotal: 2,
      typingBursts: 0,
      typedCharacters: 0,
      typedWords: 0,
      pasteCharacters: 0,
      deletedCharacters: 9,
    };
    mockTimelineItems = [
      {
        id: 'delete-mixed-line-break',
        kind: 'delete',
        label: 'Deleted text',
        timestamp: '2026-05-14T12:00:02.000Z',
        startTimestamp: '2026-05-14T12:00:02.000Z',
        endTimestamp: '2026-05-14T12:00:02.000Z',
        text: '\nNI',
        charCount: 3,
        rawEventCount: 1,
        rawEvents: [],
      },
      {
        id: 'delete-many-line-breaks',
        kind: 'delete',
        label: 'Deleted text',
        timestamp: '2026-05-14T12:00:01.000Z',
        startTimestamp: '2026-05-14T12:00:01.000Z',
        endTimestamp: '2026-05-14T12:00:01.000Z',
        text: '\n\n\n\n\n\n',
        charCount: 6,
        rawEventCount: 1,
        rawEvents: [],
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByText('Line break')).toBeInTheDocument();
    expect(screen.getByText('"NI"')).toBeInTheDocument();
    expect(screen.getByText('Line break × 6')).toBeInTheDocument();
    expect(screen.queryByText(/↵/)).not.toBeInTheDocument();
  });

  it('shows grouped Enter events as readable line break timeline rows', async () => {
    mockTimelineItems = [
      {
        id: 'line-break-group',
        kind: 'line_break',
        label: 'Inserted blank line',
        timestamp: '2026-05-14T12:00:02.000Z',
        startTimestamp: '2026-05-14T12:00:01.000Z',
        endTimestamp: '2026-05-14T12:00:02.000Z',
        text: '\n\n',
        charCount: 2,
        rawEventCount: 2,
        rawEvents: [
          {
            id: 'line-break-raw-1',
            eventType: 'keydown',
            timestamp: '2026-05-14T12:00:01.000Z',
            keyCode: 'Enter',
            insertedText: '\n\n',
          },
          {
            id: 'line-break-raw-2',
            eventType: 'keydown',
            timestamp: '2026-05-14T12:00:02.000Z',
            keyCode: 'Enter',
            insertedText: '\n\n',
          },
        ],
        metadata: {
          lineBreakCount: 2,
        },
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByText('Blank line')).toBeInTheDocument();
    expect(screen.getByText('Inserted blank line')).toBeInTheDocument();
    expect(screen.getByText('2 line breaks')).toBeInTheDocument();
    expect(screen.queryByText(/raw event/)).not.toBeInTheDocument();
  });

  it('shows select-all delete as deleted all text with expandable all text', async () => {
    const deletedText = 'Short deleted document.';

    mockTimelineItems = [
      {
        id: 'delete-all-text',
        kind: 'delete',
        label: 'Deleted all text',
        timestamp: '2026-05-14T12:00:02.000Z',
        startTimestamp: '2026-05-14T12:00:02.000Z',
        endTimestamp: '2026-05-14T12:00:02.000Z',
        text: deletedText,
        charCount: deletedText.length,
        rawEventCount: 1,
        rawEvents: [],
        metadata: {
          deleteScope: 'all_text',
        },
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByText('Deleted all')).toBeInTheDocument();
    expect(screen.getByText('Deleted all text')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view all text/i }));

    expect(await screen.findByText(deletedText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide all text/i })).toBeInTheDocument();
  });

  it('shows replacement edits as before and after text', async () => {
    const replacedText =
      'Original selected paragraph with enough detail to require the lightweight full text viewer. It includes a second sentence so the preview remains compact.';
    const newText =
      'Replacement paragraph with updated wording and enough detail to compare both sides. It also includes another sentence for the expanded comparison.';

    mockTimelineItems = [
      {
        id: 'replace-selection',
        kind: 'replace',
        label: 'Replaced text',
        timestamp: '2026-05-14T12:00:02.000Z',
        startTimestamp: '2026-05-14T12:00:02.000Z',
        endTimestamp: '2026-05-14T12:00:02.000Z',
        text: newText,
        charCount: newText.length,
        wordCount: 9,
        rawEventCount: 1,
        rawEvents: [],
        metadata: {
          replacedText,
        },
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByText('Replaced')).toBeInTheDocument();
    expect(screen.getByText(`${replacedText.length} → ${newText.length} chars`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view full text/i }));

    expect(await screen.findByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
    expect(screen.getByText(replacedText)).toBeInTheDocument();
    expect(screen.getByText(newText)).toBeInTheDocument();
  });

  it('summarizes multiline replacements instead of showing line break tokens inline', async () => {
    const replacedText = '\n\nI am good and I like this sentence\n\n';
    const newText = '\nI am good and I like this sentence.\n';

    mockTimelineItems = [
      {
        id: 'replace-multiline',
        kind: 'replace',
        label: 'Replaced text',
        timestamp: '2026-05-14T12:00:02.000Z',
        startTimestamp: '2026-05-14T12:00:02.000Z',
        endTimestamp: '2026-05-14T12:00:02.000Z',
        text: newText,
        charCount: newText.length,
        wordCount: 8,
        rawEventCount: 1,
        rawEvents: [],
        metadata: {
          replacedText,
        },
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByText('Replaced')).toBeInTheDocument();
    expect(screen.getByText('5 lines → 3 lines')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view full text/i })).toBeInTheDocument();
    expect(screen.queryByText(/Line break/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view full text/i }));

    expect(await screen.findByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
    expect(screen.getAllByText(/I am good and I like this sentence/)).toHaveLength(2);
  });

  it('hides editor replacement rows that mirror applied AI quick actions', async () => {
    mockTimelineItems = [
      {
        id: 'ai-mirror-replace',
        kind: 'replace',
        label: 'Replaced text',
        timestamp: '2026-05-14T12:00:02.000Z',
        startTimestamp: '2026-05-14T12:00:02.000Z',
        endTimestamp: '2026-05-14T12:00:02.000Z',
        text: 'Am I okay?',
        charCount: 10,
        wordCount: 3,
        rawEventCount: 1,
        rawEvents: [],
        metadata: {
          replacedText: 'AM ok !?',
        },
      },
    ];
    mockAiLogs = [
      {
        id: 'ai-applied-grammar',
        queryType: 'grammar_check',
        query: 'Fix grammar',
        response: 'Am I okay?',
        timestamp: '2026-05-14T12:00:02.000Z',
        status: 'success',
        modificationsApplied: true,
        modifications: [
          {
            id: 'mod-1',
            type: 'replace',
            before: 'AM ok !?',
            after: 'Am I okay?',
            location: { startOffset: 0, endOffset: 8 },
            timestamp: '2026-05-14T12:00:02.000Z',
          },
        ],
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByText('Fix grammar')).toBeInTheDocument();
    expect(screen.queryByText('Replaced')).not.toBeInTheDocument();
    expect(screen.queryByText('8 → 10 chars')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('row', { name: /fix grammar/i }));

    expect(await screen.findByText('Previous text')).toBeInTheDocument();
    expect(screen.getByText('AI modified text')).toBeInTheDocument();
    expect(screen.getAllByText('AM ok !?').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Am I okay?')).toBeInTheDocument();
  });

  it('shows AI chat insertions as primary timeline rows', async () => {
    mockTimelineItems = [
      {
        id: 'ai-insert-1',
        kind: 'ai_insert',
        label: 'AI inserted text',
        timestamp: '2026-05-14T12:00:03.000Z',
        startTimestamp: '2026-05-14T12:00:03.000Z',
        endTimestamp: '2026-05-14T12:00:03.000Z',
        text: 'AI inserted answer.',
        charCount: 19,
        wordCount: 3,
        rawEventCount: 1,
        rawEvents: [
          {
            id: 'ai-raw-1',
            eventType: 'ai_insert_from_chat',
            timestamp: '2026-05-14T12:00:03.000Z',
            insertedText: 'AI inserted answer.',
            cursorPosition: 42,
          },
        ],
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByText('AI inserted')).toBeInTheDocument();
    expect(screen.getByText('"AI inserted answer."')).toBeInTheDocument();
    expect(screen.getByText('3 words · 19 chars')).toBeInTheDocument();
    expect(screen.queryByText('ai_insert_from_chat')).not.toBeInTheDocument();
  });

  it('renders only expanded AI inserted text as Markdown', async () => {
    const markdownText = [
      '## Markdown heading',
      '',
      'Rendered **bold text**.',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      '| Revenue | 42 |',
      '',
      'Additional context keeps this AI inserted content long enough to require the full text viewer.',
    ].join('\n');

    mockTimelineItems = [
      {
        id: 'ai-insert-markdown',
        kind: 'ai_insert',
        label: 'AI inserted text',
        timestamp: '2026-05-14T12:00:04.000Z',
        startTimestamp: '2026-05-14T12:00:04.000Z',
        endTimestamp: '2026-05-14T12:00:04.000Z',
        text: markdownText,
        charCount: markdownText.length,
        wordCount: 7,
        rawEventCount: 1,
        rawEvents: [],
      },
      {
        id: 'paste-markdown',
        kind: 'paste',
        label: 'Pasted text',
        timestamp: '2026-05-14T12:00:03.000Z',
        startTimestamp: '2026-05-14T12:00:03.000Z',
        endTimestamp: '2026-05-14T12:00:03.000Z',
        text: markdownText,
        charCount: markdownText.length,
        rawEventCount: 1,
        rawEvents: [],
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByText('AI inserted')).toBeInTheDocument();
    expect(screen.getByText('Pasted')).toBeInTheDocument();
    expect(screen.getByText(/9 lines inserted/)).toBeInTheDocument();
    expect(screen.getByText(/9 lines pasted/)).toBeInTheDocument();
    expect(screen.queryByText(/Line break/)).not.toBeInTheDocument();

    const viewButtons = screen.getAllByRole('button', { name: /view full text/i });
    expect(viewButtons).toHaveLength(2);
    fireEvent.click(viewButtons[0]);
    fireEvent.click(viewButtons[1]);

    const aiInsertedPanel = screen.getByText('AI inserted text').closest('div.rounded-md');
    expect(aiInsertedPanel).not.toBeNull();
    expect(within(aiInsertedPanel as HTMLElement).getByRole('heading', { name: 'Markdown heading' })).toBeInTheDocument();
    expect(within(aiInsertedPanel as HTMLElement).getByText('bold text')).toBeInTheDocument();
    const markdownTable = within(aiInsertedPanel as HTMLElement)
      .getAllByRole('table')
      .find((table) => table.textContent?.includes('Revenue'));
    expect(markdownTable).toBeTruthy();
    expect(markdownTable).toHaveTextContent('42');

    const pastedPanel = screen.getByText('Pasted text').closest('div.rounded-md');
    expect(pastedPanel).not.toBeNull();
    expect(within(pastedPanel as HTMLElement).getByText(/## Markdown heading/)).toBeInTheDocument();
    expect(within(pastedPanel as HTMLElement).getByText(/\| Metric \| Value \|/)).toBeInTheDocument();
  });

  it('keeps AI logs in the grouped logs timeline', async () => {
    mockAiLogs = [
      {
        id: 'ai-log-1',
        queryType: 'other',
        query: 'What does this paragraph mean?',
        response: 'It explains the core argument.',
        timestamp: '2026-05-14T12:00:02.000Z',
        status: 'success',
        modificationsApplied: false,
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByText('Chat')).toBeInTheDocument();
    expect(screen.getByText(/AI actions logged:/)).toBeInTheDocument();
    expect(screen.getByText('What does this paragraph mean?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('row', { name: /chat what does this paragraph mean/i }));

    expect(await screen.findByText('It explains the core argument.')).toBeInTheDocument();
  });

  it('treats timezone-less AI log timestamps as UTC before displaying local time', async () => {
    mockAiLogs = [
      {
        id: 'ai-log-naive-time',
        queryType: 'other',
        query: 'When was this sent?',
        response: 'The timestamp is normalized.',
        timestamp: '2026-05-14T16:00:02.000',
        status: 'success',
        modificationsApplied: false,
      },
    ];

    render(<DocumentLogsPage />);

    const expectedLocalTime = format(new Date('2026-05-14T16:00:02.000Z'), 'HH:mm:ss');
    expect(await screen.findByRole('row', { name: new RegExp(`${expectedLocalTime}.*Chat`) })).toBeInTheDocument();
  });

  it('does not expand discarded AI quick actions', async () => {
    mockAiLogs = [
      {
        id: 'ai-log-discarded',
        queryType: 'rewrite',
        query: 'Improve this writing',
        response: 'AI improved sentence.',
        timestamp: '2026-05-14T12:00:04.000Z',
        status: 'cancelled',
        modificationsApplied: false,
        modifications: [
          {
            id: 'mod-1',
            type: 'replace',
            before: 'Original sentence.',
            after: 'AI improved sentence.',
            location: { startOffset: 0, endOffset: 18 },
            timestamp: '2026-05-14T12:00:04.000Z',
          },
        ],
      },
    ];

    render(<DocumentLogsPage />);

    expect(await screen.findByText('Improve writing')).toBeInTheDocument();
    const discardedRow = screen.getByText('Discarded').closest('tr');
    expect(discardedRow).not.toBeNull();
    expect(discardedRow).not.toHaveClass('cursor-pointer');

    fireEvent.click(discardedRow!);

    expect(screen.queryByText('AI modified text')).not.toBeInTheDocument();
    expect(screen.queryByText('AI improved sentence.')).not.toBeInTheDocument();
  });
});
