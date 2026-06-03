import { render, screen, waitFor } from '@testing-library/react';
import { AIAssistantPanel } from '@/components/ai/ai-assistant-panel';

window.HTMLElement.prototype.scrollIntoView = jest.fn();

const mockApiGet = jest.fn();
const mockStartNewChat = jest.fn();
let mockMessages: any[] = [];

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
    messages: mockMessages,
    isStreaming: false,
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
    startNewChat: mockStartNewChat,
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
  mockMessages = [];
  mockApiGet.mockResolvedValue({
    data: {
      hasApiKey: true,
      baseUrl: 'https://api.together.xyz/v1',
      model: 'moonshotai/Kimi-K2.6',
    },
  });
  mockStartNewChat.mockResolvedValue(undefined);
});

describe('AIAssistantPanel locked environment model display', () => {
  it('shows the document-locked image+text model without exposing settings or a model selector', async () => {
    render(
      <AIAssistantPanel
        documentId="doc-1"
        onClose={jest.fn()}
        lockedBaseUrl="https://openrouter.ai/api/v1"
        lockedModel="qwen/qwen3.5-9b"
      />
    );

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/ai/settings'));

    expect(await screen.findByText('AI model: qwen/qwen3.5-9b (image+text)')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByTitle('AI Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Quick access')).not.toBeInTheDocument();
  });

  it('uses the locked text-only model for image attachment gating', async () => {
    render(
      <AIAssistantPanel
        documentId="doc-1"
        onClose={jest.fn()}
        lockedBaseUrl="https://openrouter.ai/api/v1"
        lockedModel="deepseek/deepseek-v4-pro"
      />
    );

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/ai/settings'));

    expect(await screen.findByText('AI model: deepseek/deepseek-v4-pro (text only)')).toBeInTheDocument();
    const attachButton = screen.getByRole('button', { name: /attach image/i });
    expect(attachButton).toBeDisabled();
    expect(attachButton).toHaveAttribute(
      'title',
      '"deepseek/deepseek-v4-pro" doesn\'t accept image input',
    );
  });

  it('does not offer an in-editor settings shortcut when the user has no usable key', async () => {
    mockApiGet.mockResolvedValueOnce({ data: { hasApiKey: false } });

    render(
      <AIAssistantPanel
        documentId="doc-1"
        onClose={jest.fn()}
        lockedBaseUrl="https://openrouter.ai/api/v1"
        lockedModel="qwen/qwen3.5-9b"
      />
    );

    expect(await screen.findByText('AI unavailable')).toBeInTheDocument();
    expect(screen.getByText("This document's AI configuration is locked, but no usable API key is available.")).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByTitle('AI Settings')).not.toBeInTheDocument();
  });

  it('uses task-managed AI configuration without checking the guest user key', async () => {
    render(
      <AIAssistantPanel
        documentId="doc-1"
        onClose={jest.fn()}
        taskManaged
        lockedBaseUrl="https://openrouter.ai/api/v1"
        lockedModel="qwen/qwen3.5-9b"
      />
    );

    expect(await screen.findByText('AI model: qwen/qwen3.5-9b (image+text)')).toBeInTheDocument();
    expect(mockApiGet).not.toHaveBeenCalledWith('/ai/settings');
    expect(screen.queryByText('AI unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText("This document's AI configuration is locked, but no usable API key is available.")).not.toBeInTheDocument();
  });
});
