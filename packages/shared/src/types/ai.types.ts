/**
 * AI Query Types - categorized types of AI requests
 */
export type AIQueryType =
  | 'grammar_check'
  | 'spelling_check'
  | 'rewrite'
  | 'summarize'
  | 'expand'
  | 'translate'
  | 'format'
  | 'question'
  | 'reference'
  | 'other';

/**
 * AI Chat Message Role
 */
export type AIChatRole = 'user' | 'assistant' | 'system';

/**
 * Input modalities a chat model can accept. Models may support text-only or
 * text + image. The frontend reads `ModelCapabilities.inputs` to gate the
 * image picker; the backend reads the same to validate inbound attachments
 * before dispatching to the provider, and to compare a session's locked
 * capability snapshot against the model picked for the current turn.
 */
export type AIInputModality = 'text' | 'image';

/**
 * Static capability descriptor for a chat model. Stored alongside the model
 * id in the frontend whitelist and replicated by the backend so the
 * websocket layer can validate without round-tripping to the frontend.
 */
export interface ModelCapabilities {
  /** Input modalities the model accepts. `text` is always present. */
  inputs: AIInputModality[];
}

/**
 * Whitelist entry describing one supported chat model. Replaces the prior
 * `string[]` whitelist so the picker UI can render capability badges and
 * the backend can refuse `IMAGE_NOT_SUPPORTED` requests before dispatching
 * to the provider.
 */
export interface AIModelDescriptor {
  /** Raw model id passed to the provider (e.g. `gpt-4o`, `moonshotai/Kimi-K2.6`). */
  id: string;
  capabilities: ModelCapabilities;
}

/**
 * Persisted reference to an image (or other binary) attachment carried by a
 * chat message. The frontend uploads the bytes to the backend's file
 * storage adapter first and only references `storageKey`; the chat payload
 * never carries base64-inline image bytes so that the websocket frame and
 * the `ai_chat_messages` rows stay small.
 */
export interface ChatImageAttachment {
  type: 'image';
  /** Opaque storage adapter key; backend resolves to a signed URL or local path. */
  storageKey: string;
  /** MIME type as reported by the browser at upload time. */
  mimeType: string;
  /** Optional original filename for display in the chat bubble. */
  filename?: string;
}

export type ChatAttachment = ChatImageAttachment;

/**
 * Error codes surfaced over the websocket `ai:error` channel and HTTP 4xx
 * responses when capability gating rejects a request. The frontend matches
 * on these to render a precise user-facing message instead of the raw
 * provider error.
 */
export const AI_ERROR_CODES = {
  /** Attachments present on a request whose model does not accept images. */
  IMAGE_NOT_SUPPORTED: 'IMAGE_NOT_SUPPORTED',
  /**
   * A mid-session model switch dropped a modality the conversation history
   * has already used. Frontend must prompt the user to start a new session.
   */
  MODEL_CAPABILITY_MISMATCH: 'MODEL_CAPABILITY_MISMATCH',
} as const;
export type AIErrorCode = typeof AI_ERROR_CODES[keyof typeof AI_ERROR_CODES];

/**
 * AI Chat Message
 */
export interface AIChatMessage {
  id: string;
  role: AIChatRole;
  content: string;
  timestamp: Date | string;
  metadata?: {
    logId?: string;
    suggestions?: AISuggestion[];
    attachments?: (
      | {
          type: 'selection' | 'document';
          content: string;
        }
      | ChatImageAttachment
    )[];
    /**
     * Persisted record of the agent's tool-call timeline for this assistant
     * turn. Populated by the backend's AgentToolCallCollector so reopening
     * the chat panel rehydrates the ls / grep / read trail from the
     * `ai_chat_messages.metadata` JSONB column instead of only showing the
     * live websocket stream (#94).
     */
    toolCalls?: AgentToolCallRecord[];
  };
}

/**
 * AI Chat Session
 */
export interface AIChatSession {
  id: string;
  documentId: string;
  userId: string;
  messages: AIChatMessage[];
  createdAt: Date | string;
  updatedAt: Date | string;
  status: 'active' | 'closed';
  /**
   * Provider model id (e.g. `gpt-4o`, `moonshotai/Kimi-K2.6`) captured at
   * session creation. Used by capability gating (#93) to detect mid-session
   * model switches that drop a modality already used in the conversation
   * history.
   */
  modelVersion?: string;
  /**
   * Static capability descriptor captured at session creation, so the
   * websocket layer can validate inbound requests without re-resolving
   * the per-document execution settings each turn.
   */
  modelCapabilities?: ModelCapabilities;
}

/**
 * AI Suggestion for content modification
 */
export interface AISuggestion {
  id: string;
  type: 'replace' | 'insert' | 'delete' | 'format';
  originalText?: string;
  suggestedText?: string;
  location: {
    startOffset: number;
    endOffset: number;
  };
  explanation?: string;
  applied: boolean;
}

/**
 * Content modification record
 */
export interface AIContentModification {
  id: string;
  type: 'replace' | 'insert' | 'delete';
  before: string;
  after: string;
  location: {
    startOffset: number;
    endOffset: number;
  };
  timestamp: Date | string;
}

/**
 * AI Interaction Log - full record of an AI interaction
 */
export interface AIInteractionLog {
  id: string;
  documentId: string;
  userId: string;
  sessionId?: string;
  timestamp: Date | string;

  // Request
  query: string;
  queryType: AIQueryType;
  contextSnapshot?: {
    fullContent?: string;
    selection?: {
      text: string;
      startOffset: number;
      endOffset: number;
    };
    selectedText?: string;
    cursorPosition?: number;
    conversationDeleted?: boolean;
    deletedSessionId?: string;
    conversationDeletedAt?: string;
  };
  questionCategory?: 'understanding' | 'generation' | 'other';

  // Response
  response: string;
  suggestions?: AISuggestion[];
  responseTimeMs?: number;
  tokensUsed?: {
    input: number;
    output: number;
  };

  // Modifications
  modificationsApplied: boolean;
  modifications?: AIContentModification[];

  // Metadata
  modelVersion?: string;
  status: 'success' | 'error' | 'cancelled' | 'pending';
  errorMessage?: string;

  createdAt: Date | string;
}

/**
 * AI Log Query Filters
 */
export interface AILogQueryFilters {
  documentId?: string;
  userId?: string;
  sessionId?: string;
  queryType?: AIQueryType;
  status?: 'success' | 'error' | 'cancelled' | 'pending';
  startDate?: Date | string;
  endDate?: Date | string;
  limit?: number;
  offset?: number;
}

/**
 * AI Chat Request payload
 */
export interface AIChatRequest {
  documentId: string;
  sessionId?: string;
  message: string;
  /**
   * Image attachments uploaded out-of-band via the file-storage adapter.
   * The backend validates each attachment against the resolved model's
   * `ModelCapabilities.inputs` before dispatching to the provider; a
   * mismatch returns `IMAGE_NOT_SUPPORTED`. Empty / undefined arrays leave
   * the call as a pure text turn (legacy behaviour preserved).
   */
  attachments?: ChatAttachment[];
  // When true, the backend skips session creation and interaction-log
  // persistence and streams the result over a `sessionId: 'silent'`
  // sentinel channel. Used by selection-menu quick actions where the user
  // wants a one-shot rewrite, not a chat turn.
  silent?: boolean;
  // Client-generated id for matching one-shot silent streams. Multiple quick
  // actions can overlap when a user retries/cancels quickly, so the shared
  // `sessionId: 'silent'` sentinel is not specific enough by itself.
  clientRequestId?: string;
  // Explicitly create a fresh durable chat session instead of reusing the
  // latest active session for this document. Used by the AI panel New Chat
  // action to make session boundaries real on the backend.
  forceNewSession?: boolean;
  context?: {
    fullContent?: string;
    selection?: {
      text: string;
      startOffset: number;
      endOffset: number;
    };
    cursorPosition?: number;
    pdfContext?: string; // PDF document text for answering questions about linked files
    selectedText?: string; // Quoted text from editor selection
    // Pre/post text around a selection and the document title, supplied so
    // quick-action prompts can instruct the model to preserve the author's
    // voice instead of treating the selection as isolated.
    surroundingContext?: {
      before: string;
      after: string;
      documentTitle: string;
    };
  };
}

/**
 * AI Chat Response
 */
export interface AIChatResponse {
  sessionId: string;
  message: AIChatMessage;
  suggestions?: AISuggestion[];
  logId: string;
}

/**
 * Apply AI Suggestion Request
 */
export interface AIApplySuggestionRequest {
  logId: string;
  suggestionId: string;
  documentId: string;
}

/**
 * AI Configuration
 */
export interface AIConfig {
  enabled: boolean;
  streamingEnabled: boolean;
  suggestionsEnabled: boolean;
  logsEnabled: boolean;
  maxContextLength: number;
  allowedQueryTypes: AIQueryType[];
  rateLimitRequests: number;
  rateLimitWindowMs: number;
}

/**
 * User AI Settings (returned to frontend, API key masked)
 */
export const AI_SHORTCUT_MAX_TOKENS_DEFAULT = 1024;
export const AI_CHAT_MAX_TOKENS_DEFAULT = 4096;
export const AI_MAX_TOKENS_MIN = 256;
export const AI_MAX_TOKENS_MAX = 16384;

export interface UserAISettings {
  baseUrl: string;
  model: string;
  shortcutMaxTokens: number;
  chatMaxTokens: number;
  hasApiKey: boolean;
  maskedApiKey?: string;
  updatedAt?: string;
}

/**
 * Save AI Settings Request
 */
export interface SaveAISettingsRequest {
  apiKey: string;
  baseUrl: string;
  model: string;
  shortcutMaxTokens?: number;
  chatMaxTokens?: number;
}

/**
 * Test AI Connection Request
 */
export interface TestAIConnectionRequest {
  apiKey: string;
  baseUrl: string;
}

/**
 * Test AI Connection Response
 */
export interface TestAIConnectionResponse {
  success: boolean;
  message: string;
  models?: string[];
}

/**
 * WebSocket AI Events - Client to Server
 */
export interface AIClientToServerEvents {
  'ai:message': (data: AIChatRequest) => void;
  'ai:cancel': (data: { sessionId: string }) => void;
  'ai:join-session': (data: { documentId: string; sessionId?: string }) => void;
  'ai:leave-session': (data: { sessionId: string }) => void;
}

/**
 * WebSocket AI Events - Server to Client
 */
export interface AIServerToClientEvents {
  'ai:response-start': (data: { sessionId: string; messageId: string; clientRequestId?: string }) => void;
  'ai:response-chunk': (data: { sessionId: string; messageId: string; clientRequestId?: string; chunk: string }) => void;
  'ai:response-complete': (data: AIChatResponse & { clientRequestId?: string }) => void;
  'ai:suggestion': (data: { sessionId: string; suggestions: AISuggestion[] }) => void;
  'ai:error': (data: { sessionId: string; clientRequestId?: string; message: string; code?: string }) => void;
  // Agentic tool-call lifecycle events. Emitted by the AgentRunner so the
  // chat panel can render a Cursor-style tool-call timeline alongside the
  // streaming assistant text.
  'ai:turn-start': (data: AgentTurnStartPayload) => void;
  'ai:tool-call': (data: AgentToolCallPayload) => void;
  'ai:tool-result': (data: AgentToolResultPayload) => void;
  'ai:thinking-delta': (data: AgentThinkingDeltaPayload) => void;
  'ai:turn-end': (data: AgentTurnEndPayload) => void;
}

/**
 * Canonical agent event union emitted internally by the AgentRunner.
 *
 * The runner emits these into an event sink; the WebSocket adapter maps each
 * variant onto the corresponding `ai:*` client event. Persisted interaction
 * logs and replay tooling also consume this shape.
 */
export type AgentEvent =
  | { type: 'turn-start'; turnIndex: number }
  | { type: 'text-delta'; text: string }
  | { type: 'thinking-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: Record<string, any> }
  | {
      type: 'tool-result';
      toolCallId: string;
      result: string;
      isError: boolean;
      durationMs?: number;
    }
  | { type: 'turn-end'; turnIndex: number }
  | { type: 'error'; message: string; code?: string };

/**
 * Persisted record of a single tool invocation. Used by interaction logs and
 * timeline replay; mirrors the on-the-wire `tool-call` / `tool-result` pair.
 */
export interface AgentToolCallRecord {
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
  result?: string;
  isError?: boolean;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface AgentTurnStartPayload {
  sessionId: string;
  messageId: string;
  turnIndex: number;
}

export interface AgentToolCallPayload {
  sessionId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
}

export interface AgentToolResultPayload {
  sessionId: string;
  messageId: string;
  toolCallId: string;
  result: string;
  isError: boolean;
  durationMs?: number;
}

export interface AgentThinkingDeltaPayload {
  sessionId: string;
  messageId: string;
  text: string;
}

export interface AgentTurnEndPayload {
  sessionId: string;
  messageId: string;
  turnIndex: number;
}
