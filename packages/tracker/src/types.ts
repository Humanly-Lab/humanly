/**
 * Configuration options for the Humanly tracker
 */
export interface TrackerConfig {
  /** Task token for authentication */
  taskToken: string;

  /** API base URL (e.g., https://api.writehumanly.net) */
  apiUrl: string;

  /** CSS selector to extract user ID from page */
  userIdSelector?: string;

  /** Meta tag key to extract user ID from */
  userIdKey?: string;

  /** Debounce time in milliseconds between events */
  debounceMs?: number;

  /** Maximum number of events before auto-flush */
  maxBatchSize?: number;

  /** Maximum time in seconds before auto-flush */
  maxBatchTime?: number;

  /** Number of retry attempts for failed API calls */
  retryAttempts?: number;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Types of events tracked by the library
 */
export type EventType =
  | 'keydown'
  | 'keyup'
  | 'paste'
  | 'copy'
  | 'cut'
  | 'focus'
  | 'blur'
  | 'change';

/**
 * Individual tracking event
 */
export interface TrackerEvent {
  /** Timestamp when event occurred (ISO 8601 string) */
  timestamp: string;

  /** Type of event */
  eventType: EventType;

  /** CSS selector of target element */
  targetElement: string;

  /** Key code (for keyboard events) as string */
  keyCode?: string;

  /** Character representation of key */
  keyChar?: string;

  /** Text content before the event */
  textBefore?: string;

  /** Text content after the event */
  textAfter?: string;

  /** Cursor position */
  cursorPosition?: number;

  /** Selection start position */
  selectionStart?: number;

  /** Selection end position */
  selectionEnd?: number;

  /** Pasted content (for paste events) */
  pastedContent?: string;

  /** Copied/cut content */
  clipboardContent?: string;
}

/**
 * Event buffer for batching events before sending
 */
export interface EventBuffer {
  /** Array of buffered events */
  events: TrackerEvent[];

  /** Timestamp of when buffer was created */
  createdAt: number;

  /** Callback to flush events */
  flush: () => Promise<void>;

  /** Add event to buffer */
  add: (event: TrackerEvent) => void;

  /** Clear buffer */
  clear: () => void;

  /** Check if buffer should be flushed */
  shouldFlush: () => boolean;
}

/**
 * Session initialization response
 */
export interface SessionInitResponse {
  sessionId: string;
  success: boolean;
  message?: string;
}

/**
 * Events submission response
 */
export interface EventsResponse {
  success: boolean;
  eventsReceived: number;
  message?: string;
}

/**
 * Session submit response
 */
export interface SessionSubmitResponse {
  success: boolean;
  message?: string;
}

/**
 * Metadata for session initialization
 */
export interface SessionMetadata {
  url?: string;
  userAgent?: string;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
  timezone?: string;
  [key: string]: any;
}
