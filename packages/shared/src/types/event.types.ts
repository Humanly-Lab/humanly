export type EventType =
  // Basic input events
  | 'keydown'
  | 'keyup'
  | 'paste'
  | 'copy'
  | 'cut'
  | 'focus'
  | 'blur'
  | 'input'
  | 'delete'
  | 'select'
  // Text formatting
  | 'font-family-change'
  | 'font-size-change'
  | 'text-color-change'
  | 'highlight-color-change'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'subscript'
  | 'superscript'
  // Headings
  | 'heading-change'
  // Lists
  | 'list-create'
  | 'list-delete'
  | 'list-indent'
  | 'list-outdent'
  | 'list-item-check'
  // Alignment
  | 'alignment-change'
  // Find/Replace
  | 'find-open'
  | 'find-search'
  | 'find-next'
  | 'find-previous'
  | 'replace'
  | 'replace-all'
  | 'find-close'
  // Other formatting
  | 'line-spacing-change'
  | 'indent-change'
  | 'clear-formatting'
  // AI Assistant events
  | 'ai_panel_open'
  | 'ai_panel_close'
  | 'ai_query_sent'
  | 'ai_response_received'
  | 'ai_suggestion_shown'
  | 'ai_suggestion_accepted'
  | 'ai_suggestion_rejected'
  | 'ai_modification_applied'
  | 'ai_logs_viewed'
  | 'ai_logs_exported'
  // AI Selection Menu events (inline quick actions)
  | 'ai_selection_action'
  // AI chat insert events
  | 'ai_insert_from_chat';

export type TextRenderMode = 'plain' | 'markdown';

export interface TrackerEvent {
  eventType: EventType;
  timestamp: Date | string;
  targetElement?: string;
  keyCode?: string;
  keyChar?: string;
  textBefore?: string;
  textAfter?: string;
  cursorPosition?: number;
  selectionStart?: number;
  selectionEnd?: number;
  metadata?: Record<string, any>;
}

export interface Event extends TrackerEvent {
  id: string;
  sessionId: string;
  taskId: string;
  createdAt: Date;
}

export interface EventBatchInput {
  sessionId: string;
  events: TrackerEvent[];
}

export interface EventQueryFilters {
  taskId?: string;
  sessionId?: string;
  externalUserId?: string;
  startDate?: Date;
  endDate?: Date;
  eventTypes?: EventType[];
  limit?: number;
  offset?: number;
}
