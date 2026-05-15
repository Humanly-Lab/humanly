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
    attachments?: {
      type: 'selection' | 'document';
      content: string;
    }[];
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
  // When true, the backend skips session creation and interaction-log
  // persistence and streams the result over a `sessionId: 'silent'`
  // sentinel channel. Used by selection-menu quick actions where the user
  // wants a one-shot rewrite, not a chat turn.
  silent?: boolean;
  // Client-generated id for matching one-shot silent streams. Multiple quick
  // actions can overlap when a user retries/cancels quickly, so the shared
  // `sessionId: 'silent'` sentinel is not specific enough by itself.
  clientRequestId?: string;
  context?: {
    fullContent?: string;
    selection?: {
      text: string;
      startOffset: number;
      endOffset: number;
    };
    cursorPosition?: number;
    pdfContext?: string; // PDF document text for answering questions about papers
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
export interface UserAISettings {
  baseUrl: string;
  model: string;
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
