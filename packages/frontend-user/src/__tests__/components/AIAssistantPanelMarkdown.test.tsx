import { render, screen, waitFor, within } from '@testing-library/react';
import { AIAssistantPanel } from '@/components/ai/ai-assistant-panel';

window.HTMLElement.prototype.scrollIntoView = jest.fn();

const mockApiGet = jest.fn();

const markdownTableMessage = {
  id: 'message-1',
  role: 'assistant' as const,
  content: [
    '| Component | Percentage |',
    '| --- | ---: |',
    '| Attendance and Participation | 18% |',
    '| Final Exam | 34% |',
  ].join('\n'),
  timestamp: new Date('2026-05-14T00:00:00Z'),
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
    messages: [markdownTableMessage],
    isStreaming: false,
    streamingContent: '',
    streamingMessageId: null,
    suggestions: [],
    toolCallTimelines: {},
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

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: function mockRemarkGfm() {},
}));

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children, remarkPlugins }: any) => {
    const React = require('react');
    const source = String(children || '');
    if (remarkPlugins?.length && source.includes('| Component | Percentage |')) {
      return React.createElement(
        'table',
        {},
        React.createElement(
          'thead',
          {},
          React.createElement(
            'tr',
            {},
            React.createElement('th', {}, 'Component'),
            React.createElement('th', {}, 'Percentage')
          )
        ),
        React.createElement(
          'tbody',
          {},
          React.createElement(
            'tr',
            {},
            React.createElement('td', {}, 'Attendance and Participation'),
            React.createElement('td', {}, '18%')
          ),
          React.createElement(
            'tr',
            {},
            React.createElement('td', {}, 'Final Exam'),
            React.createElement('td', {}, '34%')
          )
        )
      );
    }
    return React.createElement(React.Fragment, {}, children);
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockApiGet.mockResolvedValue({ data: { hasApiKey: true, baseUrl: '', model: '' } });
});

describe('AIAssistantPanel markdown rendering', () => {
  it('renders GitHub-flavored Markdown tables as table elements', async () => {
    render(
      <AIAssistantPanel
        documentId="doc-1"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/ai/settings'));

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Component' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'Attendance and Participation' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '34%' })).toBeInTheDocument();
  });
});
