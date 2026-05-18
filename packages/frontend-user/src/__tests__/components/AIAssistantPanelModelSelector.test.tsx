import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIAssistantPanel } from '@/components/ai/ai-assistant-panel';

window.HTMLElement.prototype.scrollIntoView = jest.fn();

const mockApiGet = jest.fn();
const mockApiPut = jest.fn();
const mockStartNewChat = jest.fn();
let mockMessages: any[] = [];

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: jest.fn(),
    put: (...args: any[]) => mockApiPut(...args),
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
  mockMessages = [];
  mockApiGet.mockResolvedValue({
    data: {
      hasApiKey: true,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'qwen/qwen3.5-9b',
    },
  });
  mockApiPut.mockResolvedValue({ data: { success: true } });
  mockStartNewChat.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AIAssistantPanel model selector labels', () => {
  it('uses explicit image+text and text only labels instead of an unexplained emoji', async () => {
    render(
      <AIAssistantPanel
        documentId="doc-1"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/ai/settings'));

    const selector = await screen.findByRole('combobox');
    expect(selector).toHaveTextContent('qwen/qwen3.5-9b (image+text)');
    expect(selector).toHaveTextContent('deepseek/deepseek-v4-pro (text only)');
    expect(selector.textContent).not.toContain('🖼');

    expect(
      screen.getByRole('option', { name: 'qwen/qwen3.5-9b (image+text)' }),
    ).toHaveValue('qwen/qwen3.5-9b');
    expect(
      screen.getByRole('option', { name: 'deepseek/deepseek-v4-pro (text only)' }),
    ).toHaveValue('deepseek/deepseek-v4-pro');
  });

  it('prompts before switching from image+text to text only when image history exists', async () => {
    const user = userEvent.setup();
    mockMessages = [
      {
        id: 'message-with-image',
        role: 'user',
        content: 'Please describe this image.',
        timestamp: new Date('2026-05-18T00:00:00Z'),
        metadata: {
          attachments: [
            {
              type: 'image',
              storageKey: 'image-key',
              mimeType: 'image/png',
            },
          ],
        },
      },
    ];
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <AIAssistantPanel
        documentId="doc-1"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/ai/settings'));

    await user.selectOptions(
      await screen.findByRole('combobox'),
      'deepseek/deepseek-v4-pro',
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('"deepseek/deepseek-v4-pro" doesn\'t accept image input'),
    );
    await waitFor(() => expect(mockStartNewChat).toHaveBeenCalledTimes(1));
    expect(mockApiPut).toHaveBeenCalledWith('/ai/settings', {
      apiKey: '__use_existing__',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'deepseek/deepseek-v4-pro',
    });
  });

  it('keeps the image+text model when the user cancels a text-only switch with image history', async () => {
    const user = userEvent.setup();
    mockMessages = [
      {
        id: 'message-with-image',
        role: 'user',
        content: 'Please describe this image.',
        timestamp: new Date('2026-05-18T00:00:00Z'),
        metadata: {
          attachments: [
            {
              type: 'image',
              storageKey: 'image-key',
              mimeType: 'image/png',
            },
          ],
        },
      },
    ];
    jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <AIAssistantPanel
        documentId="doc-1"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/ai/settings'));

    const selector = await screen.findByRole('combobox');
    await user.selectOptions(selector, 'deepseek/deepseek-v4-pro');

    expect(mockStartNewChat).not.toHaveBeenCalled();
    expect(mockApiPut).not.toHaveBeenCalled();
    expect(selector).toHaveValue('qwen/qwen3.5-9b');
  });
});
