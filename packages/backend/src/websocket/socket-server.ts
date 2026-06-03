import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../utils/websocket';
import { setupLivePreviewHandlers } from './handlers/live-preview.handler';
import { setupAIHandlers } from './handlers/ai.handler';

/**
 * Socket type with typed events and data
 */
export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  SocketData
>;

/**
 * Middleware to authenticate WebSocket connections
 * Extracts JWT token from handshake auth or query params
 */
function authenticateSocket(
  socket: TypedSocket,
  next: (err?: Error) => void
): void {
  try {
    // Try to get token from auth object (preferred)
    let token = socket.handshake.auth.token;

    // Fallback to query parameter
    if (!token) {
      token = socket.handshake.query.token as string;
    }

    if (!token) {
      logger.warn('WebSocket connection rejected: No token provided', {
        socketId: socket.id,
        remoteAddress: socket.handshake.address,
        authKeys: Object.keys(socket.handshake.auth),
        queryKeys: Object.keys(socket.handshake.query),
        hasAuthObject: !!socket.handshake.auth,
      });
      return next(new Error('Authentication required'));
    }

    // Verify JWT token
    const payload = verifyToken(token);

    // Store user data in socket
    socket.data.userId = payload.userId;
    socket.data.email = payload.email;
    socket.data.taskRooms = new Set<string>();

    logger.info('WebSocket authenticated', {
      socketId: socket.id,
      userId: payload.userId,
      email: payload.email,
    });

    next();
  } catch (error) {
    logger.warn('WebSocket authentication failed', {
      socketId: socket.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      remoteAddress: socket.handshake.address,
    });
    next(new Error('Invalid or expired token'));
  }
}

/**
 * Setup WebSocket server with authentication and handlers
 */
export function setupWebSocketServer(io: SocketIOServer): void {
  // Apply authentication middleware
  io.use(authenticateSocket);

  // Handle connections
  io.on('connection', (socket: TypedSocket) => {
    const { userId, email } = socket.data;

    logger.info('Client connected to WebSocket', {
      socketId: socket.id,
      userId,
      email,
    });

    // Setup live preview handlers
    setupLivePreviewHandlers(io, socket);

    // Setup AI handlers
    setupAIHandlers(io, socket);

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      const rooms = Array.from(socket.data.taskRooms || []);

      logger.info('Client disconnected from WebSocket', {
        socketId: socket.id,
        userId,
        email,
        reason,
        taskRooms: rooms,
      });

      // Clean up rooms
      socket.data.taskRooms?.clear();
    });

    // Handle socket errors
    socket.on('error', (error) => {
      logger.error('WebSocket error', {
        socketId: socket.id,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Emit error to client
      socket.emit('error', {
        message: 'An error occurred',
      });
    });

  });

  logger.info('WebSocket server configured successfully');
}
