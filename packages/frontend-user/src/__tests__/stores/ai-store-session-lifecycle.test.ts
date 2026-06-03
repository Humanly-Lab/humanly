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

function imageAttachmentWithPreview() {
  return {
    type: 'image',
    storageKey: 'mock/sent.png',
    mimeType: 'image/png',
    filename: 'sent.png',
    previewUrl: 'blob:sent.png',
  } as any;
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
    expect(useAIStore.getState().pendingNewSession).toBe(true);
  });

  it('keeps local image previews on the websocket user echo but strips them from the socket payload', () => {
    const attachment = imageAttachmentWithPreview();

    useAIStore.getState().sendMessageViaSocket('doc-1', 'Can you see this?', undefined, [attachment]);

    const messageCall = (emitEvent as jest.Mock).mock.calls.find(([event]) => event === 'ai:message');
    expect(messageCall?.[1].attachments).toEqual([
      {
        type: 'image',
        storageKey: 'mock/sent.png',
        mimeType: 'image/png',
        filename: 'sent.png',
      },
    ]);
    expect(messageCall?.[1].attachments[0]).not.toHaveProperty('previewUrl');

    const echoedAttachment = useAIStore.getState().messages[0].metadata?.attachments?.[0] as any;
    expect(echoedAttachment.previewUrl).toBe('blob:sent.png');
  });

  it('keeps local image previews on the REST user echo but strips them from the REST payload', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: {
        sessionId: 'session-rest',
        message: assistantMessage('assistant-rest'),
        suggestions: [],
      },
    });
    const attachment = imageAttachmentWithPreview();

    await useAIStore.getState().sendMessage('doc-1', 'Can you see this?', undefined, [attachment]);

    expect(api.post).toHaveBeenCalledWith('/ai/chat', expect.objectContaining({
      attachments: [
        {
          type: 'image',
          storageKey: 'mock/sent.png',
          mimeType: 'image/png',
          filename: 'sent.png',
        },
      ],
    }));
    const payload = (api.post as jest.Mock).mock.calls[0][1];
    expect(payload.attachments[0]).not.toHaveProperty('previewUrl');

    const echoedAttachment = useAIStore.getState().messages[0].metadata?.attachments?.[0] as any;
    expect(echoedAttachment.previewUrl).toBe('blob:sent.png');
  });

  it('forces a fresh backend session for the first turn after New Chat', async () => {
    useAIStore.getState().setupSocketListeners();
    useAIStore.setState({ currentSession: session('session-1') });

    await useAIStore.getState().startNewChat();
    useAIStore.getState().sendMessageViaSocket('doc-1', 'new thread question');

    const firstMessageCall = (emitEvent as jest.Mock).mock.calls
      .filter(([event]) => event === 'ai:message')
      .at(-1);
    const clientRequestId = firstMessageCall?.[1]?.clientRequestId;
    expect(firstMessageCall?.[1]).toEqual(expect.objectContaining({
      documentId: 'doc-1',
      sessionId: undefined,
      forceNewSession: true,
      message: 'new thread question',
    }));

    serverEmit('ai:response-start', {
      sessionId: 'session-2',
      messageId: 'assistant-live-2',
      clientRequestId,
    });
    expect(useAIStore.getState().pendingNewSession).toBe(false);

    serverEmit('ai:response-chunk', {
      sessionId: 'session-2',
      messageId: 'assistant-live-2',
      clientRequestId,
      chunk: 'new answer',
    });
    serverEmit('ai:response-complete', {
      sessionId: 'session-2',
      clientRequestId,
      message: assistantMessage('assistant-live-2', 'new answer'),
      logId: 'log-live-2',
    });

    expect(useAIStore.getState().currentSession?.id).toBe('session-2');
    expect(useAIStore.getState().messages.map((message) => message.content)).toEqual([
      'new thread question',
      'new answer',
    ]);

    useAIStore.getState().sendMessageViaSocket('doc-1', 'follow-up in same thread');
    const secondMessageCall = (emitEvent as jest.Mock).mock.calls
      .filter(([event]) => event === 'ai:message')
      .at(-1);
    expect(secondMessageCall?.[1]).toEqual(expect.objectContaining({
      sessionId: 'session-2',
      forceNewSession: false,
      message: 'follow-up in same thread',
    }));
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

  it('deletes a historical session without touching the current session', async () => {
    useAIStore.setState({
      currentSession: session('session-current'),
      sessions: [session('session-current'), session('session-old')],
      messages: [{ id: 'u-current', role: 'user', content: 'current', timestamp: new Date() }],
      logs: [
        { id: 'log-current', sessionId: 'session-current', query: 'current' } as any,
        { id: 'log-old', sessionId: 'session-old', query: 'old' } as any,
      ],
    });

    await useAIStore.getState().deleteSession('session-old');

    expect(api.delete).toHaveBeenCalledWith('/ai/sessions/session-old');
    expect(emitEvent).toHaveBeenCalledWith('ai:leave-session', { sessionId: 'session-old' });
    expect(emitEvent).not.toHaveBeenCalledWith('ai:cancel', { sessionId: 'session-old' });
    expect(useAIStore.getState().currentSession?.id).toBe('session-current');
    expect(useAIStore.getState().messages.map((message) => message.content)).toEqual(['current']);
    expect(useAIStore.getState().sessions.map((s) => s.id)).toEqual(['session-current']);
    expect(useAIStore.getState().logs.map((log) => log.id)).toEqual(['log-current']);
    expect(useAIStore.getState().pendingNewSession).toBe(false);
  });

  it('deletes the loaded session and prepares the next turn for a fresh session', async () => {
    useAIStore.setState({
      currentSession: session('session-current'),
      sessions: [session('session-current'), session('session-old')],
      messages: [{ id: 'u-current', role: 'user', content: 'current', timestamp: new Date() }],
      logs: [
        { id: 'log-current', sessionId: 'session-current', query: 'current' } as any,
        { id: 'log-old', sessionId: 'session-old', query: 'old' } as any,
      ],
    });

    await useAIStore.getState().deleteSession('session-current');

    expect(api.delete).toHaveBeenCalledWith('/ai/sessions/session-current');
    expect(emitEvent).toHaveBeenCalledWith('ai:cancel', { sessionId: 'session-current' });
    expect(emitEvent).toHaveBeenCalledWith('ai:leave-session', { sessionId: 'session-current' });
    expect(useAIStore.getState().currentSession).toBeNull();
    expect(useAIStore.getState().messages).toEqual([]);
    expect(useAIStore.getState().sessions.map((s) => s.id)).toEqual(['session-old']);
    expect(useAIStore.getState().logs.map((log) => log.id)).toEqual(['log-old']);
    expect(useAIStore.getState().pendingNewSession).toBe(true);
  });

  afterEach(() => {
    useAIStore.getState().cleanupSocketListeners();
    expect(offEvent).toHaveBeenCalled();
  });
});
