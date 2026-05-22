import { Server as SocketIOServer } from 'socket.io';
import { TypedSocket } from '../socket-server';
import { AgentRunner } from '../../services/agent-runner.service';
import { AIService } from '../../services/ai.service';
import { AIModel } from '../../models/ai.model';
import { DocumentModel } from '../../models/document.model';
import { DocumentEventModel } from '../../models/document-event.model';
import { AIChatRequest, AgentEvent, DocumentEventInsertData } from '@humanly/shared';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Sentinel session id used by quick-action streams so the chat-panel
 * listeners can tell them apart from a real conversation turn.
 */
const SILENT_SESSION_ID = 'silent';

/**
 * Track AI event to document events table
 */
async function trackAIEvent(
  documentId: string,
  userId: string,
  eventType: 'ai_query_sent' | 'ai_response_received' | 'ai_panel_open' | 'ai_panel_close',
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    const event: DocumentEventInsertData = {
      documentId,
      userId,
      eventType,
      timestamp: new Date(),
      metadata,
    };
    await DocumentEventModel.batchInsert([event]);
  } catch (error) {
    logger.error('Failed to track AI event', { documentId, eventType, error });
  }
}

/**
 * Map to track active AI streaming sessions
 * Key: sessionId, Value: cancel flag
 */
const activeStreams = new Map<string, { cancelled: boolean }>();

/**
 * Get AI document room name
 */
function getAIDocumentRoom(documentId: string): string {
  return `ai:document:${documentId}`;
}

/**
 * Handle client joining an AI session for a document
 */
export async function handleAIJoinSession(
  io: SocketIOServer,
  socket: TypedSocket,
  data: { documentId: string; sessionId?: string }
): Promise<void> {
  const { userId } = socket.data;
  const { documentId, sessionId } = data;

  try {
    if (!documentId) {
      socket.emit('ai:error', {
        sessionId: sessionId || '',
        message: 'Document ID is required',
        code: 'MISSING_DOCUMENT_ID',
      });
      return;
    }

    // Verify document ownership
    const isOwner = await DocumentModel.isOwner(documentId, userId);
    if (!isOwner) {
      socket.emit('ai:error', {
        sessionId: sessionId || '',
        message: 'Document not found or unauthorized',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    // Join the document's AI room
    const room = getAIDocumentRoom(documentId);
    await socket.join(room);

    // Get or create session
    const session = sessionId
      ? await AIModel.findSessionById(sessionId)
      : await AIModel.getOrCreateSession(documentId, userId);

    if (!session) {
      socket.emit('ai:error', {
        sessionId: sessionId || '',
        message: 'Failed to create session',
        code: 'SESSION_ERROR',
      });
      return;
    }

    logger.info('User joined AI session', {
      socketId: socket.id,
      userId,
      documentId,
      sessionId: session.id,
    });

    // Send back session info (client can use this to restore conversation)
    socket.emit('ai:response-complete', {
      sessionId: session.id,
      message: {
        id: 'system',
        role: 'system',
        content: 'Connected to AI assistant',
        timestamp: new Date(),
      },
      logId: '',
    });
  } catch (error) {
    logger.error('Failed to join AI session', {
      socketId: socket.id,
      userId,
      documentId,
      error,
    });

    socket.emit('ai:error', {
      sessionId: sessionId || '',
      message: 'Failed to join AI session',
      code: 'JOIN_ERROR',
    });
  }
}

/**
 * Handle client leaving an AI session
 */
export async function handleAILeaveSession(
  io: SocketIOServer,
  socket: TypedSocket,
  data: { sessionId: string }
): Promise<void> {
  const { userId } = socket.data;
  const { sessionId } = data;

  try {
    // Cancel any active stream for this session
    const streamState = activeStreams.get(sessionId);
    if (streamState) {
      streamState.cancelled = true;
    }

    // Find the session to get documentId
    const session = await AIModel.findSessionById(sessionId);
    if (session) {
      const room = getAIDocumentRoom(session.documentId);
      await socket.leave(room);
    }

    logger.info('User left AI session', {
      socketId: socket.id,
      userId,
      sessionId,
    });
  } catch (error) {
    logger.error('Failed to leave AI session', {
      socketId: socket.id,
      userId,
      sessionId,
      error,
    });
  }
}

/**
 * Handle incoming AI chat message with streaming response
 */
export async function handleAIMessage(
  io: SocketIOServer,
  socket: TypedSocket,
  data: AIChatRequest
): Promise<void> {
  const { userId } = socket.data;
  const { documentId, sessionId, message, context, clientRequestId } = data;

  const messageId = uuidv4();

  try {
    if (!documentId) {
      socket.emit('ai:error', {
        sessionId: sessionId || '',
        clientRequestId,
        message: 'Document ID is required',
        code: 'MISSING_DOCUMENT_ID',
      });
      return;
    }

    // Validate the websocket-supplied attachments shape before letting it
    // reach the dispatch layer. Keeps a malicious client from passing
    // 10k entries or a path-traversal storageKey (#93 security follow-up).
    const MAX_ATTACHMENTS = 5;
    const STORAGE_KEY_RE = /^[A-Za-z0-9._\-/]{1,512}$/;
    const rawAttachments = Array.isArray(data.attachments) ? data.attachments : [];
    if (rawAttachments.length > MAX_ATTACHMENTS) {
      socket.emit('ai:error', {
        sessionId: sessionId || '',
        clientRequestId,
        message: `At most ${MAX_ATTACHMENTS} attachments per turn`,
        code: 'TOO_MANY_ATTACHMENTS',
      });
      return;
    }
    for (const att of rawAttachments) {
      if (
        !att ||
        typeof att !== 'object' ||
        (att as any).type !== 'image' ||
        typeof (att as any).storageKey !== 'string' ||
        !STORAGE_KEY_RE.test((att as any).storageKey) ||
        typeof (att as any).mimeType !== 'string'
      ) {
        socket.emit('ai:error', {
          sessionId: sessionId || '',
          clientRequestId,
          message: 'Malformed attachment payload',
          code: 'INVALID_ATTACHMENT',
        });
        return;
      }
    }
    const hasAttachments = rawAttachments.length > 0;

    // An image-only turn (no text, ≥1 attachment) is a legitimate vision
    // query (#93). Refuse only when both text and attachments are absent.
    if ((!message || message.trim().length === 0) && !hasAttachments) {
      socket.emit('ai:error', {
        sessionId: sessionId || '',
        clientRequestId,
        message: 'Message or image attachment is required',
        code: 'MISSING_MESSAGE',
      });
      return;
    }

    // Quick action / silent path: stream the rewrite back over a sentinel
    // sessionId without touching ai_chat_sessions or interaction-log rows.
    // The chat-panel listeners filter frames with this sessionId so they
    // never adopt the result as a conversation turn.
    if (data.silent) {
      const { clientRequestId } = data;
      socket.emit('ai:response-start', {
        sessionId: SILENT_SESSION_ID,
        messageId,
        clientRequestId,
      });

      logger.info('AI silent stream started', {
        socketId: socket.id,
        userId,
        documentId,
        messageId,
        clientRequestId,
      });

      await AIService.silentStreamChat(
        userId,
        data,
        (chunk: string) => {
          socket.emit('ai:response-chunk', {
            sessionId: SILENT_SESSION_ID,
            messageId,
            clientRequestId,
            chunk,
          });
        },
        (content: string) => {
          socket.emit('ai:response-complete', {
            sessionId: SILENT_SESSION_ID,
            clientRequestId,
            message: {
              id: messageId,
              role: 'assistant',
              content,
              timestamp: new Date(),
            },
            logId: '',
          });
        },
        (error: Error) => {
          socket.emit('ai:error', {
            sessionId: SILENT_SESSION_ID,
            clientRequestId,
            message: error.message || 'Silent AI request failed',
            code: 'SILENT_AI_ERROR',
          });
        },
      );
      return;
    }

    // Verify document ownership
    const isOwner = await DocumentModel.isOwner(documentId, userId);
    if (!isOwner) {
      socket.emit('ai:error', {
        sessionId: sessionId || '',
        clientRequestId,
        message: 'Document not found or unauthorized',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    // Get or create session
    const session = sessionId
      ? await AIModel.findSessionById(sessionId)
      : await AIModel.getOrCreateSession(documentId, userId);

    if (!session) {
      socket.emit('ai:error', {
        sessionId: sessionId || '',
        clientRequestId,
        message: 'Failed to create session',
        code: 'SESSION_ERROR',
      });
      return;
    }

    // Track active stream
    const streamState = { cancelled: false };
    activeStreams.set(session.id, streamState);

    // Emit response start
    socket.emit('ai:response-start', {
      sessionId: session.id,
      messageId,
      clientRequestId,
    });

    logger.info('AI message received', {
      socketId: socket.id,
      userId,
      documentId,
      sessionId: session.id,
      messageLength: message.length,
    });

    // Store the query for tracking after response completes
    const queryText = message.trim();

    // Translate AgentRunner's internal AgentEvent stream into typed Socket.IO
    // frames so the chat UI can render the tool-call timeline. Drops events
    // when the client has cancelled the stream.
    const onAgentEvent = (event: AgentEvent) => {
      if (streamState.cancelled) return;
      switch (event.type) {
        case 'turn-start':
          socket.emit('ai:turn-start', {
            sessionId: session.id,
            messageId,
            turnIndex: event.turnIndex,
          });
          break;
        case 'tool-call':
          socket.emit('ai:tool-call', {
            sessionId: session.id,
            messageId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
          });
          break;
        case 'tool-result':
          socket.emit('ai:tool-result', {
            sessionId: session.id,
            messageId,
            toolCallId: event.toolCallId,
            result: event.result,
            isError: event.isError,
            durationMs: event.durationMs,
          });
          break;
        case 'thinking-delta':
          socket.emit('ai:thinking-delta', {
            sessionId: session.id,
            messageId,
            text: event.text,
          });
          break;
        case 'turn-end':
          socket.emit('ai:turn-end', {
            sessionId: session.id,
            messageId,
            turnIndex: event.turnIndex,
          });
          break;
        // text-delta is already surfaced via the onChunk path; error is handled
        // by the AgentRunner.run rejection.
        default:
          break;
      }
    };

    // Stream the response
    await AgentRunner.run({
      userId,
      request: {
        documentId,
        sessionId: session.id,
        message: message.trim(),
        context,
        // Pass through image attachments uploaded via
        // `POST /api/v1/ai/chat/attachments` so capability gating and the
        // provider-side image inlining in AIService see them (#93).
        attachments: data.attachments,
      },
      onTextChunk: (chunk: string) => {
        if (!streamState.cancelled) {
          socket.emit('ai:response-chunk', {
            sessionId: session.id,
            messageId,
            clientRequestId,
            chunk,
          });
        }
      },
      onAgentEvent,
      onComplete: (response) => {
        activeStreams.delete(session.id);

        if (!streamState.cancelled) {
          socket.emit('ai:response-complete', {
            ...response,
            clientRequestId,
          });

          // If there are suggestions, emit them separately
          if (response.suggestions && response.suggestions.length > 0) {
            socket.emit('ai:suggestion', {
              sessionId: session.id,
              suggestions: response.suggestions,
            });
          }

          logger.info('AI response completed', {
            socketId: socket.id,
            userId,
            documentId,
            sessionId: session.id,
            logId: response.logId,
          });

          // Track ai_query_sent event with logId for linking to the specific Q&A
          trackAIEvent(documentId, userId, 'ai_query_sent', {
            query: queryText,
            sessionId: session.id,
            logId: response.logId,
          });
        }
      },
      onError: (error) => {
        activeStreams.delete(session.id);

        logger.error('AI streaming error', {
          socketId: socket.id,
          userId,
          documentId,
          sessionId: session.id,
          error: error.message,
        });

        socket.emit('ai:error', {
          sessionId: session.id,
          clientRequestId,
          message: error.message || 'An error occurred while processing your request',
          code: 'AI_ERROR',
        });
      },
    });
  } catch (error) {
    logger.error('Failed to process AI message', {
      socketId: socket.id,
      userId,
      documentId,
      error,
    });

    socket.emit('ai:error', {
      sessionId: sessionId || '',
      clientRequestId,
      message: 'Failed to process message',
      code: 'PROCESS_ERROR',
    });
  }
}

/**
 * Handle cancellation of AI streaming
 */
export async function handleAICancel(
  io: SocketIOServer,
  socket: TypedSocket,
  data: { sessionId: string }
): Promise<void> {
  const { userId } = socket.data;
  const { sessionId } = data;

  try {
    const streamState = activeStreams.get(sessionId);
    if (streamState) {
      streamState.cancelled = true;
      activeStreams.delete(sessionId);

      logger.info('AI stream cancelled', {
        socketId: socket.id,
        userId,
        sessionId,
      });
    }
  } catch (error) {
    logger.error('Failed to cancel AI stream', {
      socketId: socket.id,
      userId,
      sessionId,
      error,
    });
  }
}

/**
 * Setup all AI event handlers for a socket
 */
export function setupAIHandlers(
  io: SocketIOServer,
  socket: TypedSocket
): void {
  // Handle AI session join
  socket.on('ai:join-session', (data) => {
    handleAIJoinSession(io, socket, data);
  });

  // Handle AI session leave
  socket.on('ai:leave-session', (data) => {
    handleAILeaveSession(io, socket, data);
  });

  // Handle AI message
  socket.on('ai:message', (data) => {
    handleAIMessage(io, socket, data);
  });

  // Handle AI cancel
  socket.on('ai:cancel', (data) => {
    handleAICancel(io, socket, data);
  });

  logger.debug('AI handlers setup', {
    socketId: socket.id,
    userId: socket.data.userId,
  });
}
