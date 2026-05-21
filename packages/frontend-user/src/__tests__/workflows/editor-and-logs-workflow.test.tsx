import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
let mockTaskEnrollments: any[] = [];
let mockAiLogs: any[] = [];
let mockTimelineSummary: any;
let mockTimelineItems: any[] = [];
let mockLatestEditorProps: any;

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useParams: () => mockUseParams(),
}));

jest.mock('next/dynamic', () => () => function DynamicMock() {
  return <div>PDF viewer unavailable in unit tests</div>;
});

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

jest.mock('@/hooks/use-document', () => ({
  useDocument: () => ({
    document: {
      id: 'doc-1',
      title: 'Workflow Document',
      content: mockDocumentContent,
      plainText: mockDocumentPlainText,
      status: 'draft',
      wordCount: 0,
      characterCount: mockDocumentCharacterCount,
      environmentConfig: mockDocumentEnvironmentConfig,
      writingStartedAt: mockDocumentWritingStartedAt,
    },
    linkedFile: null,
    isLoading: false,
    error: null,
    isSaving: false,
    updateDocument: mockUpdateDocument,
    startWritingSession: mockStartWritingSession,
    trackEvents: mockTrackEvents,
    uploadPdf: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-certificates', () => ({
  useCertificates: () => ({
    generateCertificate: mockGenerateCertificate,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: 'user@example.com' },
    checkAuth: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-ai', () => ({
  useAI: () => ({
    isPanelOpen: false,
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
  AIAssistantPanel: () => null,
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
  },
}));

jest.mock('@humanly/editor', () => ({
  LexicalEditor: (props: any) => {
    mockLatestEditorProps = props;
    const { onContentChange, onEventsBuffer, onAutoSave, placeholder } = props;
    return (
      <textarea
        aria-label="Document editor"
        placeholder={placeholder}
        onChange={(event) => {
          const plainText = event.currentTarget.value;
          const content = { root: { children: [{ text: plainText }] } };
          onContentChange?.(content, plainText);
          onAutoSave?.(content, plainText);
          onEventsBuffer?.([
            {
              eventType: 'input',
              timestamp: new Date().toISOString(),
              keyChar: plainText.at(-1) || '',
            },
          ]);
        }}
        disabled={props.editable === false}
      />
    );
  },
}));

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
    mockTaskEnrollments = [];
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

    await waitFor(() => {
      expect(mockTrackEvents).toHaveBeenCalledWith(
        [expect.objectContaining({ eventType: 'input' })],
        null
      );
    });
    expect(screen.queryByText(/failed to fetch|document not found|application error/i)).not.toBeInTheDocument();
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

  it('shows select-all delete as deleted all text with expandable full text', async () => {
    const deletedText =
      'This entire document was selected and deleted. It has enough content to stay compact in the timeline row while still being available for review.';

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

    fireEvent.click(screen.getByRole('button', { name: /view full text/i }));

    expect(await screen.findByText(deletedText)).toBeInTheDocument();
  });

  it('shows replacement edits as previous text to new text', async () => {
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

    expect(await screen.findByText('Previous text')).toBeInTheDocument();
    expect(screen.getByText('New text')).toBeInTheDocument();
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

    expect(await screen.findByText('Previous text')).toBeInTheDocument();
    expect(screen.getByText('New text')).toBeInTheDocument();
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
