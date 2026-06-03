import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIAssistantPanel } from '@/components/ai/ai-assistant-panel';

window.HTMLElement.prototype.scrollIntoView = jest.fn();

const mockApiGet = jest.fn();
const mockUploadChatImage = jest.fn();
const mockSendMessage = jest.fn();

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

jest.mock('@/lib/ai-chat-attachments', () => {
  const actual = jest.requireActual('@/lib/ai-chat-attachments');
  return {
    ...actual,
    uploadChatImage: (...args: any[]) => mockUploadChatImage(...args),
  };
});

jest.mock('@/hooks/use-ai', () => ({
  useAI: () => ({
    messages: [],
    isStreaming: false,
    streamingContent: '',
    streamingMessageId: null,
    suggestions: [],
    toolCallTimelines: {},
    thinkingByMessageId: {},
    isLoading: false,
    error: null,
    sendMessage: mockSendMessage,
    cancelStream: jest.fn(),
    clearMessages: jest.fn(),
    startNewChat: jest.fn(),
    loadSession: jest.fn(),
    viewLogsAsMessages: jest.fn(),
    deleteSession: jest.fn(),
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

function makeImageFile(name = 'shot.png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

function renderPanel(model = 'qwen/qwen3.5-9b') {
  render(
    <AIAssistantPanel
      documentId="doc-1"
      onClose={jest.fn()}
      taskManaged
      lockedBaseUrl="https://openrouter.ai/api/v1"
      lockedModel={model}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiGet.mockResolvedValue({
    data: {
      hasApiKey: true,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'qwen/qwen3.5-9b',
    },
  });
  mockUploadChatImage.mockImplementation(async (file: File) => ({
    type: 'image',
    storageKey: `mock/${file.name}`,
    mimeType: file.type,
    filename: file.name,
  }));
});

describe('AIAssistantPanel image paste and drag-drop', () => {
  it('stages a pasted clipboard image when the locked model accepts image input', async () => {
    renderPanel();
    expect(await screen.findByText('AI model: qwen/qwen3.5-9b (image+text)')).toBeInTheDocument();

    const file = makeImageFile('paste.png');
    fireEvent.paste(screen.getByPlaceholderText('Type your message...'), {
      clipboardData: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
        files: [file],
        types: ['Files'],
      },
    });

    await waitFor(() => expect(mockUploadChatImage).toHaveBeenCalledWith(file));
    expect(await screen.findByText('paste.png')).toBeInTheDocument();
  });

  it('stages a dropped image when the locked model accepts image input', async () => {
    renderPanel();
    expect(await screen.findByText('AI model: qwen/qwen3.5-9b (image+text)')).toBeInTheDocument();

    const file = makeImageFile('drop.png');
    fireEvent.drop(screen.getByPlaceholderText('Type your message...'), {
      dataTransfer: {
        items: [],
        files: [file],
        types: ['Files'],
      },
    });

    await waitFor(() => expect(mockUploadChatImage).toHaveBeenCalledWith(file));
    expect(await screen.findByText('drop.png')).toBeInTheDocument();
  });

  it('keeps the existing image picker path working', async () => {
    renderPanel();
    expect(await screen.findByText('AI model: qwen/qwen3.5-9b (image+text)')).toBeInTheDocument();

    const file = makeImageFile('picker.png');
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [file] } });

    await waitFor(() => expect(mockUploadChatImage).toHaveBeenCalledWith(file));
    expect(await screen.findByText('picker.png')).toBeInTheDocument();
  });

  it('blocks pasted clipboard images for text-only models before upload', async () => {
    renderPanel('deepseek/deepseek-v4-pro');
    expect(await screen.findByText('AI model: deepseek/deepseek-v4-pro (text only)')).toBeInTheDocument();

    const file = makeImageFile('blocked-paste.png');
    fireEvent.paste(screen.getByPlaceholderText('Type your message...'), {
      clipboardData: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
        files: [file],
        types: ['Files'],
      },
    });

    expect(mockUploadChatImage).not.toHaveBeenCalled();
    expect(await screen.findByText(/doesn't accept image input/i)).toBeInTheDocument();
    expect(screen.queryByText('blocked-paste.png')).not.toBeInTheDocument();
  });

  it('blocks dropped images for text-only models before upload', async () => {
    renderPanel('deepseek/deepseek-v4-pro');
    expect(await screen.findByText('AI model: deepseek/deepseek-v4-pro (text only)')).toBeInTheDocument();

    const file = makeImageFile('blocked-drop.png');
    fireEvent.drop(screen.getByPlaceholderText('Type your message...'), {
      dataTransfer: {
        items: [],
        files: [file],
        types: ['Files'],
      },
    });

    expect(mockUploadChatImage).not.toHaveBeenCalled();
    expect(await screen.findByText(/doesn't accept image input/i)).toBeInTheDocument();
    expect(screen.queryByText('blocked-drop.png')).not.toBeInTheDocument();
  });
});
