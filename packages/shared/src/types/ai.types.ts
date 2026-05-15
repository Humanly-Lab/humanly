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
  'ai:response-start': (data: { sessionId: string; messageId: string }) => void;
  'ai:response-chunk': (data: { sessionId: string; messageId: string; chunk: string }) => void;
  'ai:response-complete': (data: AIChatResponse) => void;
  'ai:suggestion': (data: { sessionId: string; suggestions: AISuggestion[] }) => void;
  'ai:error': (data: { sessionId: string; message: string; code?: string }) => void;
}
