import type { AIChatMessage, AIChatSession } from '@humanly/shared';
import api from '@/lib/api-client';
import { emitEvent, offEvent } from '@/lib/socket-client';
import { useAIStore } from '../../stores/ai-store';

const mockSocketHandlers = new Map<string, Set<(data: any) => void>>();

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    delete: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('@/lib/socket-client', () => ({
  getSocket: jest.fn(() => ({ connected: true })),
  initializeSocket: jest.fn(() => ({ connected: true })),
  emitEvent: jest.fn(),
  onEvent: jest.fn((event: string, callback: (data: any) => void) => {
    if (!mockSocketHandlers.has(event)) {
      mockSocketHandlers.set(event, new Set());
    }
    mockSocketHandlers.get(event)!.add(callback);
  }),
  offEvent: jest.fn((event: string, callback?: (data: any) => void) => {
    if (!callback) {
      mockSocketHandlers.delete(event);
      return;
    }
    mockSocketHandlers.get(event)?.delete(callback);
  }),
}));

function serverEmit(event: string, data: any) {
  mockSocketHandlers.get(event)?.forEach((handler) => handler(data));
}

function session(id: string): AIChatSession {
  return {
    id,
    documentId: 'doc-1',
    userId: 'user-1',
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'active',
  };
}

function assistantMessage(id: string, content = 'answer'): AIChatMessage {
  return {
    id,
    role: 'assistant',
    content,
    timestamp: new Date(),
  };
}

describe('AI store session lifecycle', () => {
  beforeEach(() => {
    useAIStore.getState().reset();
    mockSocketHandlers.clear();
    jest.clearAllMocks();
    (api.delete as jest.Mock).mockResolvedValue({ success: true });
  });

  it('starts a new chat without deleting the previous persisted session or logs', async () => {
    useAIStore.setState({
      currentSession: session('session-1'),
      messages: [{ id: 'u-1', role: 'user', content: 'hello', timestamp: new Date() }],
      logs: [
        {
          id: 'log-1',
          sessionId: 'session-1',
          documentId: 'doc-1',
          userId: 'user-1',
          query: 'hello',
          response: 'answer',
          timestamp: new Date(),
        } as any,
      ],
    });

    await useAIStore.getState().startNewChat();

    expect(api.delete).not.toHaveBeenCalled();
    expect(emitEvent).toHaveBeenCalledWith('ai:cancel', { sessionId: 'session-1' });
    expect(emitEvent).toHaveBeenCalledWith('ai:leave-session', { sessionId: 'session-1' });
    expect(useAIStore.getState().currentSession).toBeNull();
    expect(useAIStore.getState().messages).toEqual([]);
    expect(useAIStore.getState().logs).toHaveLength(1);
  });

  it('ignores stale websocket frames from a request that was superseded by New Chat', async () => {
    useAIStore.getState().setupSocketListeners();
    useAIStore.getState().sendMessageViaSocket('doc-1', 'slow question');

    const messageCall = (emitEvent as jest.Mock).mock.calls.find(([event]) => event === 'ai:message');
    const clientRequestId = messageCall?.[1]?.clientRequestId;
    expect(clientRequestId).toBeTruthy();
    expect(useAIStore.getState().isStreaming).toBe(true);

    await useAIStore.getState().startNewChat();

    serverEmit('ai:response-start', {
      sessionId: 'stale-session',
      messageId: 'stale-message',
      clientRequestId,
    });
    serverEmit('ai:response-chunk', {
      sessionId: 'stale-session',
      messageId: 'stale-message',
      clientRequestId,
      chunk: 'stale chunk',
    });
    serverEmit('ai:response-complete', {
      sessionId: 'stale-session',
      clientRequestId,
      message: assistantMessage('assistant-stale', 'stale final'),
      logId: 'log-stale',
    });

    expect(useAIStore.getState().currentSession).toBeNull();
    expect(useAIStore.getState().messages).toEqual([]);
    expect(useAIStore.getState().streamingContent).toBe('');
    expect(useAIStore.getState().isStreaming).toBe(false);
  });

  it('accepts websocket frames only for the active client request', () => {
    useAIStore.getState().setupSocketListeners();
    useAIStore.setState({ currentSession: session('session-1') });
    useAIStore.getState().sendMessageViaSocket('doc-1', 'current question');

    const messageCall = (emitEvent as jest.Mock).mock.calls.find(([event]) => event === 'ai:message');
    const clientRequestId = messageCall?.[1]?.clientRequestId;

    serverEmit('ai:response-start', {
      sessionId: 'session-1',
      messageId: 'assistant-live',
      clientRequestId,
    });
    serverEmit('ai:tool-call', {
      sessionId: 'session-1',
      messageId: 'assistant-live',
      toolCallId: 'tool-1',
      toolName: 'ls',
      args: {},
    });
    serverEmit('ai:response-chunk', {
      sessionId: 'session-1',
      messageId: 'assistant-live',
      clientRequestId,
      chunk: 'live chunk',
    });
    serverEmit('ai:response-complete', {
      sessionId: 'session-1',
      clientRequestId,
      message: assistantMessage('assistant-live', 'live final'),
      logId: 'log-live',
    });

    expect(useAIStore.getState().currentSession?.id).toBe('session-1');
    expect(useAIStore.getState().messages.map((message) => message.content)).toEqual([
      'current question',
      'live final',
    ]);
    expect(useAIStore.getState().toolCallTimelines['assistant-live']).toHaveLength(1);
    expect(useAIStore.getState().isStreaming).toBe(false);
  });

  afterEach(() => {
    useAIStore.getState().cleanupSocketListeners();
    expect(offEvent).toHaveBeenCalled();
  });
});
