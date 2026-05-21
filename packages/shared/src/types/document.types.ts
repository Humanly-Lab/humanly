/**
 * Document types for user-created documents
 */

import { EventType } from './event.types';
import { WritingEnvironmentConfig } from './environment.types';

export type DocumentStatus = 'draft' | 'published' | 'archived';

export interface Document {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  content: Record<string, any>; // Lexical editor state (JSON)
  plainText: string;
  status: DocumentStatus;
  version: number;
  wordCount: number;
  characterCount: number;
  environmentConfig?: WritingEnvironmentConfig | null;
  writingStartedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastEditedAt: Date;
}

export interface DocumentInsertData {
  userId: string;
  title: string;
  description?: string | null;
  content: Record<string, any>;
  plainText: string;
  status?: DocumentStatus;
  wordCount?: number;
  characterCount?: number;
  environmentConfig?: WritingEnvironmentConfig | null;
}

export interface DocumentUpdateData {
  title?: string;
  description?: string | null;
  content?: Record<string, any>;
  plainText?: string;
  status?: DocumentStatus;
  wordCount?: number;
  characterCount?: number;
  environmentConfig?: WritingEnvironmentConfig | null;
}

export interface DocumentFilters {
  status?: DocumentStatus;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface DocumentStatistics {
  documentId: string;
  userId: string;
  title: string;
  status: DocumentStatus;
  wordCount: number;
  characterCount: number;
  totalEvents: number;
  typingEvents: number;
  pasteEvents: number;
  firstEvent: Date | null;
  lastEvent: Date | null;
  editingDurationSeconds: number;
}

export type SubmissionStatus = 'active' | 'historical';

export interface Submission {
  id: string;
  taskId: string;
  userId: string;
  userEmail?: string | null;
  documentId: string;
  documentTitle?: string | null;
  certificateId?: string | null;
  certificateVerificationToken?: string | null;
  submittedAt: Date;
  payloadSnapshot: Record<string, any>;
  plainTextSnapshot: string;
  supersedesSubmissionId?: string | null;
  status: SubmissionStatus;
  createdAt: Date;
}

export interface SubmissionInsertData {
  taskId: string;
  userId: string;
  documentId: string;
  payloadSnapshot: Record<string, any>;
  plainTextSnapshot: string;
  supersedesSubmissionId?: string | null;
  status?: SubmissionStatus;
}

// Document event types (extends existing event types)
export interface DocumentEvent {
  id: string;
  documentId: string;
  userId: string;
  sessionId?: string;
  eventType: EventType;
  timestamp: Date;
  keyCode?: string;
  keyChar?: string;
  textBefore?: string;
  textAfter?: string;
  cursorPosition?: number;
  selectionStart?: number;
  selectionEnd?: number;
  editorStateBefore?: Record<string, any>;
  editorStateAfter?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface DocumentEventInsertData {
  documentId: string;
  userId: string;
  sessionId?: string;
  eventType: EventType;
  timestamp: Date;
  keyCode?: string;
  keyChar?: string;
  textBefore?: string;
  textAfter?: string;
  cursorPosition?: number;
  selectionStart?: number;
  selectionEnd?: number;
  editorStateBefore?: Record<string, any>;
  editorStateAfter?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface DocumentEventQueryFilters {
  eventType?: EventType | EventType[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export type DocumentEventTimelineItemKind =
  | 'typing_burst'
  | 'line_break'
  | 'ai_insert'
  | 'replace'
  | 'paste'
  | 'delete'
  | 'event';

export interface DocumentEventTimelineRawEvent {
  id: string;
  eventType: EventType;
  timestamp: Date | string;
  keyCode?: string;
  keyChar?: string;
  insertedText?: string;
  deletedText?: string;
  cursorPosition?: number;
  selectionStart?: number;
  selectionEnd?: number;
  metadata?: Record<string, any>;
}

export interface DocumentEventTimelineItem {
  id: string;
  kind: DocumentEventTimelineItemKind;
  label: string;
  timestamp: Date | string;
  startTimestamp: Date | string;
  endTimestamp: Date | string;
  sessionId?: string;
  text?: string;
  charCount?: number;
  wordCount?: number;
  cursorStart?: number;
  cursorEnd?: number;
  rawEventCount: number;
  rawEvents: DocumentEventTimelineRawEvent[];
  metadata?: Record<string, any>;
}

export interface DocumentEventTimelineSummary {
  rawEventTotal: number;
  timelineItemTotal: number;
  typingBursts: number;
  typedCharacters: number;
  typedWords: number;
  pasteCharacters: number;
  deletedCharacters: number;
}

export interface DocumentEventTimelineResponse {
  items: DocumentEventTimelineItem[];
  summary: DocumentEventTimelineSummary;
}

// Certificate types
export type CertificateType = 'full_authorship' | 'partial_authorship';
export type CertificateStatus = 'active' | 'superseded' | 'historical';

export interface Certificate {
  id: string;
  submissionId?: string | null;
  documentId: string;
  userId: string;
  certificateType: CertificateType;
  status?: CertificateStatus;

  // Certificate data
  title: string;
  documentSnapshot: Record<string, any>;
  plainTextSnapshot: string;

  // Statistics
  totalEvents: number;
  typingEvents: number;
  pasteEvents: number;
  totalCharacters: number;
  typedCharacters: number;
  pastedCharacters: number;
  editingTimeSeconds: number;

  // Verification
  signature: string;
  verificationToken: string;

  // Certificate options
  signerName?: string | null;
  includeFullText: boolean;
  includeEditHistory: boolean;
  isProtected: boolean;
  accessCode?: string | null; // Plaintext access code (only for owner)
  accessCodeHash?: string | null; // Hashed access code for verification

  // Metadata
  generatedAt: Date;
  pdfGenerated: boolean;
  pdfUrl: string | null;
  jsonUrl: string | null;
  createdAt: Date;
}

export interface CertificateInsertData {
  submissionId?: string | null;
  documentId: string;
  userId: string;
  certificateType: CertificateType;
  status?: CertificateStatus;
  title: string;
  documentSnapshot: Record<string, any>;
  plainTextSnapshot: string;
  totalEvents: number;
  typingEvents: number;
  pasteEvents: number;
  totalCharacters: number;
  typedCharacters: number;
  pastedCharacters: number;
  editingTimeSeconds: number;
  signature: string;
  verificationToken: string;
  signerName?: string;
  includeFullText?: boolean;
  includeEditHistory?: boolean;
  accessCode?: string;
  accessCodeHash?: string;
  isProtected?: boolean;
}

export interface CertificateGenerationOptions {
  documentId: string;
  certificateType: CertificateType;
  signerName?: string;
  includeFullText: boolean;
  includeEditHistory: boolean;
  accessCode?: string;
}

export interface CertificateFilters {
  documentId?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'generatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface CertificateVerification {
  valid: boolean;
  certificate: Certificate | null;
  verifiedAt: Date;
  message: string;
}

export interface CertificateMetrics {
  totalEvents: number;
  typingEvents: number;
  pasteEvents: number;
  totalCharacters: number;
  typedCharacters: number;
  pastedCharacters: number;
  editingTimeSeconds: number;
  typedPercentage: number;
  pastedPercentage: number;
}

// AI Authorship Statistics for certificates
export interface AIAuthorshipStats {
  // AI Selection Actions (Fix Grammar, Improve Writing, etc.)
  selectionActions: {
    total: number;
    grammarFixes: number;
    improveWriting: number;
    simplify: number;
    makeFormal: number;
    accepted: number;
    rejected: number;
    acceptanceRate: number; // percentage
  };
  // AI Assistant Questions
  aiQuestions: {
    total: number;
    understanding: number; // Questions about understanding content
    generation: number; // Requests to create/modify content
    other: number;
  };
}

// JSON certificate format for export
export interface JSONCertificate {
  version: string;
  certificateId: string;
  submissionId?: string;
  documentId: string;
  userId: string;
  generatedAt: string;
  document: {
    title: string;
    wordCount: number;
    characterCount: number;
  };
  authorship: {
    totalCharacters: number;
    typedCharacters: number;
    pastedCharacters: number;
    typedPercentage: number;
    pastedPercentage: number;
    totalEvents: number;
    typingEvents: number;
    pasteEvents: number;
    editingTimeMinutes: number;
  };
  aiAuthorshipStats?: AIAuthorshipStats;
  verification: {
    token: string;
    verifyUrl: string;
    signature: string;
  };
}

// Paginated results
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
