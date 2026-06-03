import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIAssistantPanel } from '@/components/ai/ai-assistant-panel';

window.HTMLElement.prototype.scrollIntoView = jest.fn();

const mockApiGet = jest.fn();
const mockSendMessage = jest.fn();
const mockCancelStream = jest.fn();
const mockClearMessages = jest.fn();
const mockStartNewChat = jest.fn();
const mockLoadSession = jest.fn();
const mockViewLogsAsMessages = jest.fn();
const mockClearError = jest.fn();

const mockAssistantMessage = {
  id: 'message-1',
  role: 'assistant' as const,
  content: 'Here is a sentence to insert.',
  timestamp: new Date('2026-05-13T00:00:00Z'),
  metadata: { logId: 'log-1' },
};

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

jest.mock('@/hooks/use-ai', () => ({
  useAI: () => ({
    messages: [mockAssistantMessage],
    isStreaming: false,
    streamingContent: '',
    streamingMessageId: null,
    suggestions: [],
    toolCallTimelines: {},
    isLoading: false,
    error: null,
    sendMessage: mockSendMessage,
    cancelStream: mockCancelStream,
    clearMessages: mockClearMessages,
    startNewChat: mockStartNewChat,
    loadSession: mockLoadSession,
    viewLogsAsMessages: mockViewLogsAsMessages,
    clearError: mockClearError,
  }),
  useAILogs: () => ({
    logs: [],
    isLoading: false,
    loadMore: jest.fn(),
    hasMore: false,
    refresh: jest.fn(),
  }),
}));

const aiStoreState = {
  quotedText: null,
  clearQuotedText: jest.fn(),
};

jest.mock('@/stores/ai-store', () => ({
  useAIStore: (selector: any) => selector(aiStoreState),
}));

jest.mock('@/stores/pdf-text-store', () => ({
  usePDFTextStore: (selector: any) => selector({ getPDFText: jest.fn().mockReturnValue(null) }),
}));

jest.mock('@/components/ai/ai-settings-dialog', () => ({
  AISettingsDialog: () => null,
}));

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: any) => children,
}));

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: function mockRemarkGfm() {},
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockApiGet.mockResolvedValue({ data: { hasApiKey: true, baseUrl: '', model: '' } });
});

describe('AIAssistantPanel insert-at-cursor action', () => {
  it('passes assistant text and source metadata to the insert callback', async () => {
    const user = userEvent.setup();
    const insertAtCursor = jest.fn();

    render(
      <AIAssistantPanel
        documentId="doc-1"
        onClose={jest.fn()}
        insertAtCursor={insertAtCursor}
      />
    );

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/ai/settings'));

    await user.click(screen.getByRole('button', { name: /insert at cursor/i }));

    expect(insertAtCursor).toHaveBeenCalledWith(
      mockAssistantMessage.content,
      { messageId: mockAssistantMessage.id, logId: 'log-1' }
    );
  });

  it('keeps the insert button disabled when no editor bridge is active', async () => {
    render(
      <AIAssistantPanel
        documentId="doc-1"
        onClose={jest.fn()}
        insertAtCursor={null}
      />
    );

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/ai/settings'));

    expect(screen.getByRole('button', { name: /insert at cursor/i })).toBeDisabled();
  });
});
