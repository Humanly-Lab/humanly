import { User } from './user.types';
import { Event, EventType } from './event.types';

// Common API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Auth API types
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

// Task API types
export interface CreateTaskRequest {
  name: string;
  description?: string;
  userIdKey?: string;
  externalServiceType?: string;
  externalServiceUrl?: string;
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  userIdKey?: string;
  externalServiceType?: string;
  externalServiceUrl?: string;
  isActive?: boolean;
}

export interface TaskSnippetsResponse {
  javascriptSnippet: string;
  iframeSnippet: string;
  taskToken: string;
}

// Tracking API types
export interface InitSessionRequest {
  externalUserId: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export interface InitSessionResponse {
  sessionId: string;
}

export interface TrackEventsRequest {
  events: Array<{
    eventType: EventType;
    timestamp: string;
    targetElement?: string;
    keyCode?: string;
    keyChar?: string;
    textBefore?: string;
    textAfter?: string;
    cursorPosition?: number;
    selectionStart?: number;
    selectionEnd?: number;
    metadata?: Record<string, any>;
  }>;
}

export interface TrackEventsResponse {
  received: number;
}

// Analytics API types
export interface AnalyticsSummary {
  totalEvents: number;
  totalSessions: number;
  uniqueUsers?: number;
  totalUsers: number;
  avgEventsPerSession: number;
  avgSessionDuration: number; // seconds
  completionRate: number; // percentage
  activeUsers24h?: number;
}

export interface EventsTimelineDataPoint {
  date: string;
  eventCount: number;
}

export interface EventTypeDistribution {
  eventType: EventType;
  count: number;
  percentage: number;
}

export interface UserActivity {
  externalUserId: string;
  sessionCount: number;
  eventCount: number;
  lastActive: Date;
  avgDuration: number;
}

export interface AnalyticsQueryParams {
  startDate?: string;
  endDate?: string;
  userIds?: string[];
  groupBy?: 'hour' | 'day' | 'week';
}

// WebSocket types
export interface WebSocketJoinTask {
  taskId: string;
  token: string;
}

export interface WebSocketLeaveTask {
  taskId: string;
}

export interface WebSocketEventReceived {
  sessionId: string;
  externalUserId: string;
  event: Event;
}

export interface WebSocketSessionStarted {
  sessionId: string;
  externalUserId: string;
}

export interface WebSocketSessionEnded {
  sessionId: string;
  externalUserId: string;
  submitted: boolean;
}

// Export types
export type ExportFormat = 'json' | 'csv';

export interface ExportRequest {
  format: ExportFormat;
  startDate?: string;
  endDate?: string;
  sessionIds?: string[];
  userIds?: string[];
}
