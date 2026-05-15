import { Server as SocketIOServer } from 'socket.io';
import {
  TrackerEvent,
  AIChatRequest,
  AIChatResponse,
  AISuggestion,
  AgentTurnStartPayload,
  AgentToolCallPayload,
  AgentToolResultPayload,
  AgentThinkingDeltaPayload,
  AgentTurnEndPayload,
} from '@humanly/shared';
import { logger } from './logger';

/**
 * WebSocket event types for client-server communication
 */
export interface ClientToServerEvents {
  'join-project': (data: JoinProjectData) => void;
  'leave-project': (data: LeaveProjectData) => void;
  // AI Assistant events
  'ai:message': (data: AIChatRequest) => void;
  'ai:cancel': (data: { sessionId: string }) => void;
  'ai:join-session': (data: { documentId: string; sessionId?: string }) => void;
  'ai:leave-session': (data: { sessionId: string }) => void;
}

export interface ServerToClientEvents {
  'event-received': (data: EventReceivedData) => void;
  'session-started': (data: SessionStartedData) => void;
  'session-ended': (data: SessionEndedData) => void;
  error: (data: ErrorData) => void;
  // AI Assistant events
  'ai:response-start': (data: { sessionId: string; messageId: string; clientRequestId?: string }) => void;
  'ai:response-chunk': (data: { sessionId: string; messageId: string; clientRequestId?: string; chunk: string }) => void;
  'ai:response-complete': (data: AIChatResponse & { clientRequestId?: string }) => void;
  'ai:suggestion': (data: { sessionId: string; suggestions: AISuggestion[] }) => void;
  'ai:error': (data: { sessionId: string; clientRequestId?: string; message: string; code?: string }) => void;
  // Agentic tool-call lifecycle events (mirrored from @humanly/shared
  // AIServerToClientEvents until this local duplicate is removed).
  'ai:turn-start': (data: AgentTurnStartPayload) => void;
  'ai:tool-call': (data: AgentToolCallPayload) => void;
  'ai:tool-result': (data: AgentToolResultPayload) => void;
  'ai:thinking-delta': (data: AgentThinkingDeltaPayload) => void;
  'ai:turn-end': (data: AgentTurnEndPayload) => void;
}

/**
 * Data structures for WebSocket events
 */
export interface JoinProjectData {
  projectId: string;
  token: string;
}

export interface LeaveProjectData {
  projectId: string;
}

export interface EventReceivedData {
  sessionId: string;
  externalUserId: string;
  event: TrackerEvent;
}

export interface SessionStartedData {
  sessionId: string;
  externalUserId: string;
  timestamp: Date;
}

export interface SessionEndedData {
  sessionId: string;
  externalUserId: string;
  submitted: boolean;
  timestamp: Date;
}

export interface ErrorData {
  message: string;
  code?: string;
}

/**
 * Socket data interface for storing authenticated user info
 */
export interface SocketData {
  userId: string;
  email: string;
  projectRooms: Set<string>;
}

/**
 * Helper function to get the room name for a project
 */
export function getProjectRoom(projectId: string): string {
  return `project:${projectId}`;
}

/**
 * Broadcast an event to all clients in a project room
 */
export function broadcastToProject(
  io: SocketIOServer,
  projectId: string,
  event: keyof ServerToClientEvents,
  data: any
): void {
  const room = getProjectRoom(projectId);
  io.to(room).emit(event, data);

  logger.debug('Broadcasting to project room', {
    projectId,
    room,
    event,
  });
}

/**
 * Get all connected users in a project room
 */
export async function getConnectedUsersInProject(
  io: SocketIOServer,
  projectId: string
): Promise<string[]> {
  const room = getProjectRoom(projectId);
  const sockets = await io.in(room).fetchSockets();

  const userIds = new Set<string>();
  sockets.forEach(socket => {
    const data = socket.data as SocketData;
    if (data?.userId) {
      userIds.add(data.userId);
    }
  });

  return Array.from(userIds);
}

/**
 * Get count of connected sockets in a project room
 */
export async function getProjectRoomSize(
  io: SocketIOServer,
  projectId: string
): Promise<number> {
  const room = getProjectRoom(projectId);
  const sockets = await io.in(room).fetchSockets();
  return sockets.length;
}
