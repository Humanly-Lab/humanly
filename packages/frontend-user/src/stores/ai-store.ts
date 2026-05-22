import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  AIChatMessage,
  AIChatSession,
  AIInteractionLog,
  AISuggestion,
  AIChatRequest,
  AIChatResponse,
  AgentToolCallPayload,
  AgentToolResultPayload,
  AgentThinkingDeltaPayload,
  AgentTurnStartPayload,
  AgentTurnEndPayload,
} from '@humanly/shared';
import api from '@/lib/api-client';
import { getSocket, initializeSocket, emitEvent, onEvent, offEvent } from '@/lib/socket-client';

/**
 * Sentinel sessionId used by the backend handler for selection-menu quick
 * actions. The chat-panel listeners skip frames carrying this id so the
 * silent stream never adopts a real conversation turn; the streamSilent
 * action registers its own ephemeral listeners scoped to this sentinel.
 */
const SILENT_SESSION_ID = 'silent';

/**
 * Tool-call entry in the per-message agentic timeline.
 *
 * `status` flips from `pending` to `done` when the matching `ai:tool-result`
 * frame arrives. `result` is the raw JSON string the backend tool returned;
 * the chat UI (#05) decodes and pretty-prints it inside a collapsible card.
 */
export interface ToolCallEntry {
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
  result?: string;
  isError?: boolean;
  durationMs?: number;
  startedAt: number;
  completedAt?: number;
  status: 'pending' | 'done';
}

function toEpochMs(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Rebuild the per-message tool-call timeline keyed map from a freshly loaded
 * `AIChatSession.messages` list (issue #94). The backend persists each
 * assistant turn's `AgentToolCallRecord[]` on `metadata.toolCalls`; this
 * walker converts each record into the in-memory `ToolCallEntry` shape the
 * `ToolCallTimeline` component already renders for live streams.
 *
 * A record with no `result` (mid-turn abort persisted by the collector) keeps
 * `status: 'pending'` so the UI shows the trail honestly instead of
 * pretending the call finished.
 */
export function rehydrateToolCallTimelines(
  messages: AIChatMessage[],
): Record<string, ToolCallEntry[]> {
  const result: Record<string, ToolCallEntry[]> = {};
  const now = Date.now();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    const records = message.metadata?.toolCalls;
    if (!records || records.length === 0) continue;
    result[message.id] = records.map((record) => {
      const startedAt = toEpochMs(record.startedAt, now);
      const completedAt =
        record.completedAt !== undefined ? toEpochMs(record.completedAt, startedAt) : undefined;
      const hasResult = record.result !== undefined;
      return {
        toolCallId: record.toolCallId,
        toolName: record.toolName,
        args: record.args,
        result: record.result,
        isError: record.isError,
        durationMs: record.durationMs,
        startedAt,
        completedAt,
        status: hasResult ? 'done' : 'pending',
      };
    });
  }
  return result;
}

/**
 * AI Store State
 */
interface AIState {
  // Session state
  currentSession: AIChatSession | null;
  sessions: AIChatSession[];

  // Chat state
  messages: AIChatMessage[];
  isStreaming: boolean;
  streamingContent: string;

  // Suggestions
  activeSuggestions: AISuggestion[];

  // Agentic tool-call timelines, keyed by assistant messageId. Populated by
  // the ai:tool-call / ai:tool-result WebSocket frames during a streaming
  // turn; rendered by the ToolCallCard component (#9). Initially keyed by
  // the in-flight WebSocket messageId, then re-keyed to the persisted
  // AIChatMessage.id on ai:response-complete.
  toolCallTimelines: Record<string, ToolCallEntry[]>;

  // Provider-exposed reasoning text, keyed by assistant messageId. This is
  // intentionally separate from streamingContent so reasoning never bleeds
  // into the visible assistant markdown body.
  thinkingByMessageId: Record<string, string>;

  // The WebSocket-side messageId for the response currently being streamed,
  // used to bridge tool-call timelines onto the final persisted message id.
  streamingMessageId: string | null;

  // Request/session currently allowed to update the streaming UI. The chat
  // header's New Chat action clears these so stale frames from the previous
  // request cannot bleed into the next conversation.
  activeStreamSessionId: string | null;
  activeStreamClientRequestId: string | null;

  // Logs
  logs: AIInteractionLog[];
  logsTotal: number;

  // UI state
  isPanelOpen: boolean;
  activeTab: 'chat' | 'logs';
  isLoading: boolean;
  error: string | null;

  // Quoted text from selection
  quotedText: string | null;

  // Actions
  openPanel: () => void;
  closePanel: () => void;
  setActiveTab: (tab: 'chat' | 'logs') => void;
  setQuotedText: (text: string | null) => void;
  clearQuotedText: () => void;
  openPanelWithQuote: (text: string) => void;

  // Chat actions
  sendMessage: (
    documentId: string,
    message: string,
    context?: AIChatRequest['context'],
    attachments?: AIChatRequest['attachments'],
  ) => Promise<void>;
  sendMessageViaSocket: (
    documentId: string,
    message: string,
    context?: AIChatRequest['context'],
    attachments?: AIChatRequest['attachments'],
  ) => void;
  // One-shot streaming for selection-menu quick actions. Resolves with the
  // final text once the silent stream completes. Does NOT touch session
  // state or the messages array; emits frames over the SILENT_SESSION_ID
  // sentinel filtered out by the chat-panel listeners.
  streamSilent: (
    documentId: string,
    message: string,
    context: AIChatRequest['context'] | undefined,
    onChunk: (chunk: string) => void,
  ) => Promise<string>;
  cancelSilentStream: () => void;
  cancelStream: () => void;
  clearMessages: () => Promise<void>;
  startNewChat: () => Promise<void>;

  // Session actions
  initSession: (documentId: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  viewLogsAsMessages: (logs: AIInteractionLog[]) => void;
  closeSession: () => Promise<void>;

  // Suggestion actions
  applySuggestion: (logId: string, suggestion: AISuggestion, modification: { before: string; after: string }) => Promise<void>;
  dismissSuggestion: (suggestionId: string) => void;
  clearSuggestions: () => void;

  // Log actions
  loadLogs: (documentId: string, offset?: number, limit?: number) => Promise<void>;
  loadMoreLogs: (documentId: string) => Promise<void>;

  // Socket handlers
  setupSocketListeners: () => void;
  cleanupSocketListeners: () => void;

  // Utilities
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  currentSession: null,
  sessions: [],
  messages: [],
  isStreaming: false,
  streamingContent: '',
  activeSuggestions: [],
  toolCallTimelines: {} as Record<string, ToolCallEntry[]>,
  thinkingByMessageId: {} as Record<string, string>,
  streamingMessageId: null,
  activeStreamSessionId: null,
  activeStreamClientRequestId: null,
  logs: [],
  logsTotal: 0,
  isPanelOpen: false,
  activeTab: 'chat' as const,
  isLoading: false,
  error: null,
  quotedText: null,
};

// Track whether socket listeners have been set up (singleton pattern to prevent duplicates)
let listenersSetup = false;
const ignoredClientRequestIds = new Set<string>();

function createClientRequestId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shouldIgnoreStreamEvent(
  state: Pick<
    AIState,
    'currentSession' | 'isStreaming' | 'activeStreamSessionId' | 'activeStreamClientRequestId'
  >,
  sessionId: string,
  clientRequestId?: string,
): boolean {
  if (sessionId === SILENT_SESSION_ID) return true;
  if (clientRequestId && ignoredClientRequestIds.has(clientRequestId)) return true;

  if (state.activeStreamClientRequestId && clientRequestId !== undefined) {
    return clientRequestId !== state.activeStreamClientRequestId;
  }

  if (state.activeStreamSessionId) {
    return sessionId !== state.activeStreamSessionId;
  }

  if (state.activeStreamClientRequestId) return true;

  if (state.isStreaming) return false;
  if (state.currentSession?.id) return sessionId !== state.currentSession.id;

  return true;
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // UI Actions
      openPanel: () => set({ isPanelOpen: true }),
      closePanel: () => set({ isPanelOpen: false }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setQuotedText: (text) => set({ quotedText: text }),
      clearQuotedText: () => set({ quotedText: null }),
      openPanelWithQuote: (text) => set({ isPanelOpen: true, quotedText: text }),

      // Send message via REST API (non-streaming)
      sendMessage: async (documentId, message, context, attachments) => {
        const { currentSession } = get();

        set({ isLoading: true, error: null });

        try {
          const response = await api.post<{
            success: boolean;
            data: AIChatResponse;
          }>('/ai/chat', {
            documentId,
            sessionId: currentSession?.id,
            message,
            context,
            attachments,
          });

          const { sessionId, message: responseMessage, suggestions } = response.data;

          // Update messages — carry attachments on the user echo so the
          // chat bubble can render image previews on reload (#93).
          const userMessage: AIChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: message,
            timestamp: new Date(),
            metadata: attachments && attachments.length > 0 ? { attachments } : undefined,
          };

          set((state) => ({
            messages: [...state.messages, userMessage, responseMessage],
            currentSession: state.currentSession
              ? { ...state.currentSession, id: sessionId }
              : null,
            activeSuggestions: suggestions || [],
            isLoading: false,
          }));
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to send message',
          });
        }
      },

      // Send message via WebSocket (streaming)
      sendMessageViaSocket: (documentId, message, context, attachments) => {
        const { currentSession } = get();
        const clientRequestId = createClientRequestId('chat');

        // Check if socket is connected before attempting to send
        const socket = getSocket();
        if (!socket || !socket.connected) {
          set({
            error: 'Not connected to server. Please refresh the page and try again.',
          });
          return;
        }

        // Add user message immediately. Attachments ride on metadata so
        // the bubble can show an image thumbnail without re-fetching (#93).
        const userMessage: AIChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: message,
          timestamp: new Date(),
          metadata: attachments && attachments.length > 0 ? { attachments } : undefined,
        };

        set((state) => ({
          messages: [...state.messages, userMessage],
          isStreaming: true,
          streamingContent: '',
          streamingMessageId: null,
          activeStreamSessionId: currentSession?.id ?? null,
          activeStreamClientRequestId: clientRequestId,
          error: null,
        }));

        // Emit message via socket
        emitEvent('ai:message', {
          documentId,
          sessionId: currentSession?.id,
          message,
          context,
          attachments,
          clientRequestId,
        } as AIChatRequest);
      },

      cancelStream: () => {
        const { currentSession, activeStreamSessionId, activeStreamClientRequestId } = get();
        if (activeStreamClientRequestId) {
          ignoredClientRequestIds.add(activeStreamClientRequestId);
        }
        const sessionId = activeStreamSessionId || currentSession?.id;
        if (sessionId) {
          emitEvent('ai:cancel', { sessionId });
        }
        set({
          isStreaming: false,
          streamingContent: '',
          streamingMessageId: null,
          activeStreamSessionId: null,
          activeStreamClientRequestId: null,
        });
      },

      streamSilent: (documentId, message, context, onChunk) =>
        new Promise<string>((resolve, reject) => {
          const clientRequestId = createClientRequestId('silent');
          let messageId: string | null = null;
          let finalContent = '';
          const timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error('AI request timed out. Please try again.'));
          }, 90_000);

          // Ephemeral listeners scoped to the silent sentinel. They piggy-back
          // on the same ai:response-* channel as chat but are matched on the
          // SILENT_SESSION_ID guard and on messageId once response-start
          // assigns one.
          const onStart = (data: { sessionId: string; messageId: string; clientRequestId?: string }) => {
            if (data.sessionId !== SILENT_SESSION_ID) return;
            if (data.clientRequestId !== clientRequestId) return;
            if (messageId !== null) return; // already locked onto an earlier silent stream
            messageId = data.messageId;
          };
          const onChunkEvent = (data: { sessionId: string; messageId: string; clientRequestId?: string; chunk: string }) => {
            if (data.sessionId !== SILENT_SESSION_ID) return;
            if (data.clientRequestId !== clientRequestId) return;
            if (messageId === null || data.messageId !== messageId) return;
            onChunk(data.chunk);
          };
          const onComplete = (response: AIChatResponse & { clientRequestId?: string }) => {
            if (response.sessionId !== SILENT_SESSION_ID) return;
            if (response.clientRequestId !== clientRequestId) return;
            if (messageId === null || response.message.id !== messageId) return;
            finalContent = response.message.content;
            cleanup();
            resolve(finalContent);
          };
          const onError = (data: { sessionId: string; clientRequestId?: string; message: string }) => {
            if (data.sessionId !== SILENT_SESSION_ID) return;
            if (data.clientRequestId !== clientRequestId) return;
            cleanup();
            reject(new Error(data.message || 'Silent AI request failed'));
          };
          const cleanup = () => {
            window.clearTimeout(timeoutId);
            offEvent('ai:response-start', onStart);
            offEvent('ai:response-chunk', onChunkEvent);
            offEvent('ai:response-complete', onComplete);
            offEvent('ai:error', onError);
          };

          onEvent('ai:response-start', onStart);
          onEvent('ai:response-chunk', onChunkEvent);
          onEvent('ai:response-complete', onComplete);
          onEvent('ai:error', onError);

          const socket = getSocket();
          if (!socket || !socket.connected) {
            cleanup();
            reject(new Error('Not connected to server. Please refresh and try again.'));
            return;
          }

          emitEvent('ai:message', {
            documentId,
            message,
            silent: true,
            clientRequestId,
            context,
          } as AIChatRequest);
        }),

      cancelSilentStream: () => {
        emitEvent('ai:cancel', { sessionId: SILENT_SESSION_ID });
      },

      clearMessages: async () => {
        const { currentSession, activeStreamSessionId, activeStreamClientRequestId } = get();
        const deletedSessionId = currentSession?.id;
        const streamSessionId = activeStreamSessionId || deletedSessionId;

        if (activeStreamClientRequestId) {
          ignoredClientRequestIds.add(activeStreamClientRequestId);
        }
        if (streamSessionId) {
          emitEvent('ai:cancel', { sessionId: streamSessionId });
        }

        // If there's an active session, delete it from the backend
        if (deletedSessionId) {
          try {
            await api.delete(`/ai/sessions/${deletedSessionId}`);
            emitEvent('ai:leave-session', { sessionId: deletedSessionId });
          } catch (error) {
            // Log but continue - we still want to clear the local state
            console.warn('Failed to delete session:', error);
          }
        }

        // Clear local state and reset session to allow new one to be created
        set({
          messages: [],
          streamingContent: '',
          isStreaming: false,
          currentSession: null,
          activeSuggestions: [],
          quotedText: null,
          toolCallTimelines: {},
          thinkingByMessageId: {},
          streamingMessageId: null,
          activeStreamSessionId: null,
          activeStreamClientRequestId: null,
          logs: deletedSessionId
            ? get().logs.filter((log) => log.sessionId !== deletedSessionId)
            : get().logs,
        });
      },

      startNewChat: async () => {
        const { currentSession, activeStreamSessionId, activeStreamClientRequestId } = get();
        const previousSessionId = activeStreamSessionId || currentSession?.id;

        if (activeStreamClientRequestId) {
          ignoredClientRequestIds.add(activeStreamClientRequestId);
        }

        // New Chat is navigation, not deletion. Preserve the old session in
        // history, cancel any known in-flight stream, and leave the socket
        // room so future frames from that session are ignored locally.
        if (previousSessionId) {
          emitEvent('ai:cancel', { sessionId: previousSessionId });
          emitEvent('ai:leave-session', { sessionId: previousSessionId });
        }

        // Clear messages AND reset current session to force creation of a new session
        set({
          messages: [],
          isStreaming: false,
          streamingContent: '',
          currentSession: null,
          activeSuggestions: [],
          quotedText: null,
          error: null,
          toolCallTimelines: {},
          thinkingByMessageId: {},
          streamingMessageId: null,
          activeStreamSessionId: null,
          activeStreamClientRequestId: null,
        });
      },

      // Session actions
      initSession: async (documentId) => {
        set({ isLoading: true, error: null });

        try {
          // Initialize socket if not connected
          initializeSocket();

          // Ensure socket listeners are registered now that socket exists
          // (setupSocketListeners may have been called before socket was created)
          get().setupSocketListeners();

          // Join AI session via socket
          emitEvent('ai:join-session', { documentId });

          // Also try to load existing sessions
          const response = await api.get<{
            success: boolean;
            data: AIChatSession[];
          }>(`/ai/sessions/${documentId}`);

          const sessions = response.data;
          const activeSession = sessions.find((s) => s.status === 'active');

          if (activeSession) {
            // Load messages for active session
            const sessionResponse = await api.get<{
              success: boolean;
              data: AIChatSession;
            }>(`/ai/sessions/detail/${activeSession.id}`);

            const loadedMessages = sessionResponse.data.messages || [];
            set({
              currentSession: sessionResponse.data,
              sessions,
              messages: loadedMessages,
              // Rehydrate the tool-call timeline from each assistant
              // message's persisted metadata so reopening the panel shows
              // the agent trail, not just the final answer (#94).
              toolCallTimelines: rehydrateToolCallTimelines(loadedMessages),
              isLoading: false,
            });
          } else {
            set({
              sessions,
              isLoading: false,
            });
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to initialize session',
          });
        }
      },

      loadSession: async (sessionId) => {
        set({ isLoading: true, error: null });

        try {
          const response = await api.get<{
            success: boolean;
            data: AIChatSession;
          }>(`/ai/sessions/detail/${sessionId}`);

          const loadedMessages = response.data.messages || [];
          set({
            currentSession: response.data,
            messages: loadedMessages,
            // Rehydrate the tool-call timeline from persisted metadata so
            // the chat panel shows the agent trail across reloads (#94).
            toolCallTimelines: rehydrateToolCallTimelines(loadedMessages),
            isLoading: false,
          });
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to load session',
          });
        }
      },

      viewLogsAsMessages: (logs: AIInteractionLog[]) => {
        const messages: AIChatMessage[] = [];
        logs.forEach((log) => {
          messages.push({
            id: `${log.id}-user`,
            role: 'user',
            content: log.query,
            timestamp: log.timestamp,
          });
          if (log.response) {
            messages.push({
              id: `${log.id}-assistant`,
              role: 'assistant',
              content: log.response,
              timestamp: log.timestamp,
              metadata: { logId: log.id },
            });
          }
        });
        set({ messages, currentSession: null });
      },

      closeSession: async () => {
        const { currentSession } = get();
        if (!currentSession) return;
        const deletedSessionId = currentSession.id;

        try {
          await api.delete(`/ai/sessions/${deletedSessionId}`);
          emitEvent('ai:leave-session', { sessionId: deletedSessionId });

          set({
            currentSession: null,
            messages: [],
            activeSuggestions: [],
            logs: get().logs.filter((log) => log.sessionId !== deletedSessionId),
          });
        } catch (error: any) {
          set({ error: error.message || 'Failed to close session' });
        }
      },

      // Suggestion actions
      applySuggestion: async (logId, suggestion, modification) => {
        set({ isLoading: true, error: null });

        try {
          await api.post('/ai/apply-suggestion', {
            logId,
            suggestionId: suggestion.id,
            modification: {
              type: suggestion.type,
              ...modification,
              location: suggestion.location,
            },
          });

          // Mark suggestion as applied
          set((state) => ({
            activeSuggestions: state.activeSuggestions.map((s) =>
              s.id === suggestion.id ? { ...s, applied: true } : s
            ),
            isLoading: false,
          }));
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to apply suggestion',
          });
        }
      },

      dismissSuggestion: (suggestionId) => {
        set((state) => ({
          activeSuggestions: state.activeSuggestions.filter((s) => s.id !== suggestionId),
        }));
      },

      clearSuggestions: () => {
        set({ activeSuggestions: [] });
      },

      // Log actions
      loadLogs: async (documentId, offset = 0, limit = 20) => {
        set({ isLoading: true, error: null });

        try {
          const response = await api.get<{
            success: boolean;
            data: AIInteractionLog[];
            pagination: { total: number };
          }>(`/ai/logs?documentId=${documentId}&offset=${offset}&limit=${limit}`);

          set({
            logs: response.data,
            logsTotal: response.pagination.total,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to load logs',
          });
        }
      },

      loadMoreLogs: async (documentId) => {
        const { logs } = get();

        try {
          const response = await api.get<{
            success: boolean;
            data: AIInteractionLog[];
            pagination: { total: number };
          }>(`/ai/logs?documentId=${documentId}&offset=${logs.length}&limit=20`);

          set((state) => ({
            logs: [...state.logs, ...response.data],
            logsTotal: response.pagination.total,
          }));
        } catch (error: any) {
          set({ error: error.message || 'Failed to load more logs' });
        }
      },

      // Socket handlers
      setupSocketListeners: () => {
        // Prevent duplicate listener setup
        if (listenersSetup) return;

        const socket = getSocket();
        if (!socket) return;

        listenersSetup = true;

        // Response start
        onEvent('ai:response-start', ({ sessionId, messageId, clientRequestId }) => {
          const state = get();
          if (shouldIgnoreStreamEvent(state, sessionId, clientRequestId)) return;
          set({
            isStreaming: true,
            streamingContent: '',
            streamingMessageId: messageId,
            activeStreamSessionId: sessionId,
            activeStreamClientRequestId: clientRequestId ?? state.activeStreamClientRequestId,
          });
        });

        // Response chunk (streaming)
        onEvent('ai:response-chunk', ({ sessionId, clientRequestId, chunk }) => {
          if (shouldIgnoreStreamEvent(get(), sessionId, clientRequestId)) return;
          set((state) => ({
            streamingContent: state.streamingContent + chunk,
          }));
        });

        // Response complete
        onEvent('ai:response-complete', (response: AIChatResponse & { clientRequestId?: string }) => {
          if (shouldIgnoreStreamEvent(get(), response.sessionId, response.clientRequestId)) return;
          set((state) => {
            // Don't add if it's the system connection message
            if (response.message.role === 'system' && response.logId === '') {
              return {
                currentSession: state.currentSession
                  ? { ...state.currentSession, id: response.sessionId }
                  : {
                      id: response.sessionId,
                      documentId: '',
                      userId: '',
                      messages: [],
                      createdAt: new Date(),
                      updatedAt: new Date(),
                      status: 'active',
                    },
                isStreaming: false,
                streamingContent: '',
                streamingMessageId: null,
                activeStreamSessionId: null,
                activeStreamClientRequestId: null,
              };
            }

            // Create or update session with the response session ID
            const updatedSession = state.currentSession
              ? { ...state.currentSession, id: response.sessionId }
              : {
                  id: response.sessionId,
                  documentId: '',
                  userId: '',
                  messages: [],
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  status: 'active' as const,
                };

            // Re-key the tool-call timeline from the in-flight WebSocket
            // messageId onto the persisted AIChatMessage.id so the chat UI
            // can look it up by the same id it renders.
            let toolCallTimelines = state.toolCallTimelines;
            if (state.streamingMessageId && toolCallTimelines[state.streamingMessageId]) {
              const { [state.streamingMessageId]: timeline, ...rest } = toolCallTimelines;
              toolCallTimelines = { ...rest, [response.message.id]: timeline };
            }

            let thinkingByMessageId = state.thinkingByMessageId;
            if (state.streamingMessageId && thinkingByMessageId[state.streamingMessageId]) {
              const { [state.streamingMessageId]: thinking, ...rest } = thinkingByMessageId;
              thinkingByMessageId = { ...rest, [response.message.id]: thinking };
            }

            // If we were streaming, the content was already shown via streamingContent
            // Just convert it to a proper message, don't duplicate
            if (state.isStreaming && state.streamingContent) {
              return {
                messages: [...state.messages, response.message],
                currentSession: updatedSession,
                activeSuggestions: response.suggestions || state.activeSuggestions,
                isStreaming: false,
                streamingContent: '', // Clear streaming content since message is now in messages array
                streamingMessageId: null,
                activeStreamSessionId: null,
                activeStreamClientRequestId: null,
                toolCallTimelines,
                thinkingByMessageId,
              };
            }

            // Non-streaming response (from REST API)
            return {
              messages: [...state.messages, response.message],
              currentSession: updatedSession,
              activeSuggestions: response.suggestions || state.activeSuggestions,
              isStreaming: false,
              streamingContent: '',
              streamingMessageId: null,
              activeStreamSessionId: null,
              activeStreamClientRequestId: null,
              toolCallTimelines,
              thinkingByMessageId,
            };
          });
        });

        // Suggestions
        onEvent('ai:suggestion', ({ sessionId, suggestions }) => {
          if (sessionId === SILENT_SESSION_ID) return;
          const { currentSession } = get();
          if (currentSession?.id && sessionId !== currentSession.id) return;
          set({ activeSuggestions: suggestions });
        });

        // Error
        onEvent('ai:error', ({ sessionId, clientRequestId, message }) => {
          if (shouldIgnoreStreamEvent(get(), sessionId, clientRequestId)) return;
          set({
            isStreaming: false,
            streamingContent: '',
            streamingMessageId: null,
            activeStreamSessionId: null,
            activeStreamClientRequestId: null,
            error: message,
          });
        });

        // ── Agentic tool-call lifecycle ──────────────────────────────────
        // turn-start / turn-end mostly carry semantic boundaries for the UI;
        // the actual tool work flows through tool-call → tool-result. We
        // log all four so the agentic chain is visible in DevTools, even
        // before the ToolCallCard UI lands in #05.

        onEvent('ai:turn-start', (payload: AgentTurnStartPayload) => {
          if (shouldIgnoreStreamEvent(get(), payload.sessionId)) return;
          console.log('[agent] turn-start', payload);
        });

        onEvent('ai:tool-call', (payload: AgentToolCallPayload) => {
          if (shouldIgnoreStreamEvent(get(), payload.sessionId)) return;
          console.log('[agent] tool-call', payload);
          set((state) => {
            const existing = state.toolCallTimelines[payload.messageId] || [];
            const entry: ToolCallEntry = {
              toolCallId: payload.toolCallId,
              toolName: payload.toolName,
              args: payload.args,
              startedAt: Date.now(),
              status: 'pending',
            };
            return {
              toolCallTimelines: {
                ...state.toolCallTimelines,
                [payload.messageId]: [...existing, entry],
              },
            };
          });
        });

        onEvent('ai:tool-result', (payload: AgentToolResultPayload) => {
          if (shouldIgnoreStreamEvent(get(), payload.sessionId)) return;
          console.log('[agent] tool-result', payload);
          set((state) => {
            const existing = state.toolCallTimelines[payload.messageId];
            if (!existing) return state;
            const updated = existing.map((entry) =>
              entry.toolCallId === payload.toolCallId
                ? {
                    ...entry,
                    result: payload.result,
                    isError: payload.isError,
                    durationMs: payload.durationMs,
                    completedAt: Date.now(),
                    status: 'done' as const,
                  }
                : entry
            );
            return {
              toolCallTimelines: {
                ...state.toolCallTimelines,
                [payload.messageId]: updated,
              },
            };
          });
        });

        onEvent('ai:thinking-delta', (payload: AgentThinkingDeltaPayload) => {
          if (shouldIgnoreStreamEvent(get(), payload.sessionId)) return;
          console.log('[agent] thinking-delta', {
            ...payload,
            text: `${payload.text.length} chars`,
          });
          set((state) => ({
            thinkingByMessageId: {
              ...state.thinkingByMessageId,
              [payload.messageId]: (state.thinkingByMessageId[payload.messageId] || '') + payload.text,
            },
          }));
        });

        onEvent('ai:turn-end', (payload: AgentTurnEndPayload) => {
          if (shouldIgnoreStreamEvent(get(), payload.sessionId)) return;
          console.log('[agent] turn-end', payload);
        });
      },

      cleanupSocketListeners: () => {
        offEvent('ai:response-start');
        offEvent('ai:response-chunk');
        offEvent('ai:response-complete');
        offEvent('ai:suggestion');
        offEvent('ai:error');
        offEvent('ai:turn-start');
        offEvent('ai:tool-call');
        offEvent('ai:tool-result');
        offEvent('ai:thinking-delta');
        offEvent('ai:turn-end');
        listenersSetup = false;
      },

      // Utilities
      clearError: () => set({ error: null }),

      reset: () => {
        const { cleanupSocketListeners } = get();
        cleanupSocketListeners();
        set(initialState);
      },
    }),
    {
      name: 'ai-storage',
      partialize: (state) => ({
        // Only persist panel preferences
        activeTab: state.activeTab,
      }),
    }
  )
);
