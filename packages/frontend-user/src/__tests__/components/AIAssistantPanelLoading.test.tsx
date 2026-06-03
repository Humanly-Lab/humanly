import { render, screen, waitFor } from '@testing-library/react';
import { AIAssistantPanel } from '@/components/ai/ai-assistant-panel';

window.HTMLElement.prototype.scrollIntoView = jest.fn();

const mockApiGet = jest.fn();

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
    messages: [],
    isStreaming: true,
    streamingContent: '',
    streamingMessageId: null,
    suggestions: [],
    toolCallTimelines: {},
    thinkingByMessageId: {},
    isLoading: false,
    error: null,
    sendMessage: jest.fn(),
    cancelStream: jest.fn(),
    clearMessages: jest.fn(),
    startNewChat: jest.fn(),
    loadSession: jest.fn(),
    viewLogsAsMessages: jest.fn(),
    clearError: jest.fn(),
  }),
  useAILogs: () => ({
    logs: [],
    isLoading: false,
    loadMore: jest.fn(),
    hasMore: false,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/stores/ai-store', () => ({
  useAIStore: (selector: any) => selector({
    quotedText: null,
    clearQuotedText: jest.fn(),
  }),
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

describe('AIAssistantPanel response loading state', () => {
  it('labels the empty streaming state as thinking', async () => {
    render(
      <AIAssistantPanel
        documentId="doc-1"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/ai/settings'));

    expect(screen.getByRole('status')).toHaveTextContent('Thinking');
    expect(screen.getByText('Thinking')).toHaveClass('humanly-thinking-shimmer');
    expect(screen.getByRole('status').querySelector('.animate-spin')).toBeNull();
  });
});
