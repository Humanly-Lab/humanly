import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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
let mockDocumentPlainText = '';
let mockDocumentCharacterCount = 0;
let mockDocumentWritingStartedAt: string | null = null;
let mockTaskEnrollments: any[] = [];
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
      content: {},
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
    mockDocumentPlainText = '';
    mockDocumentCharacterCount = 0;
    mockDocumentWritingStartedAt = null;
    mockTaskEnrollments = [];
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
      if (path === '/documents/doc-1/events?limit=100&offset=0') {
        return {
          data: {
            count: 40,
            data: {
              events: [{
                id: 'event-1',
                eventType: 'input',
                timestamp: '2026-05-14T12:00:00.000Z',
                keyChar: 'Q',
              }],
            },
          },
        };
      }
      if (path === '/ai/logs?documentId=doc-1&limit=50&offset=0') {
        return { data: { data: [] } };
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

  it('shows personal writing character bounds and blocks certificate generation below minimum', async () => {
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
    expect(screen.getByText('4/50 characters · min 10')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /generate certificate/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm generate certificate/i }));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Minimum length required',
      variant: 'destructive',
    }));
    expect(mockGenerateCertificate).not.toHaveBeenCalled();
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

  it('shows persisted document event count in the logs view', async () => {
    render(<DocumentLogsPage />);

    expect(await screen.findByText('Event Summary')).toBeInTheDocument();
    expect(await screen.findByText('40')).toBeInTheDocument();
    expect(await screen.findByText('input')).toBeInTheDocument();
    expect(screen.queryByText(/failed to load logs/i)).not.toBeInTheDocument();
  });
});
