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

type SocketTokenCandidate = {
  source: 'auth' | 'query' | 'cookie';
  token: string;
};

function parseCookieHeader(cookieHeader?: string | string[]): Record<string, string> {
  const rawHeader = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
  if (!rawHeader) return {};

  return rawHeader.split(';').reduce<Record<string, string>>((cookies, part) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) return cookies;

    const key = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();
    if (!key) return cookies;

    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
    return cookies;
  }, {});
}

export function getSocketTokenCandidates(socket: Pick<TypedSocket, 'handshake'>): SocketTokenCandidate[] {
  const candidates: SocketTokenCandidate[] = [];
  const authToken = socket.handshake.auth?.token;
  const queryToken = socket.handshake.query?.token;
  const cookieToken = parseCookieHeader(socket.handshake.headers?.cookie).accessToken;

  if (typeof authToken === 'string' && authToken.trim()) {
    candidates.push({ source: 'auth', token: authToken.trim() });
  }

  if (typeof queryToken === 'string' && queryToken.trim()) {
    candidates.push({ source: 'query', token: queryToken.trim() });
  }

  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    candidates.push({ source: 'cookie', token: cookieToken.trim() });
  }

  return candidates;
}

/**
 * Middleware to authenticate WebSocket connections
 * Extracts JWT token from handshake auth, query params, or auth cookies.
 */
export function authenticateSocket(
  socket: TypedSocket,
  next: (err?: Error) => void
): void {
  try {
    const tokenCandidates = getSocketTokenCandidates(socket);

    if (tokenCandidates.length === 0) {
      logger.warn('WebSocket connection rejected: No token provided', {
        socketId: socket.id,
        remoteAddress: socket.handshake.address,
        authKeys: Object.keys(socket.handshake.auth || {}),
        queryKeys: Object.keys(socket.handshake.query || {}),
        hasCookieHeader: Boolean(socket.handshake.headers?.cookie),
        hasAuthObject: !!socket.handshake.auth,
      });
      return next(new Error('Authentication required'));
    }

    let authenticatedSource: SocketTokenCandidate['source'] | null = null;
    let payload: ReturnType<typeof verifyToken> | null = null;

    for (const candidate of tokenCandidates) {
      try {
        payload = verifyToken(candidate.token);
        authenticatedSource = candidate.source;
        break;
      } catch (error) {
        logger.debug('WebSocket token candidate rejected', {
          socketId: socket.id,
          source: candidate.source,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (!payload) {
      throw new Error('No valid socket authentication token');
    }

    // Store user data in socket
    socket.data.userId = payload.userId;
    socket.data.email = payload.email;
    socket.data.taskRooms = new Set<string>();

    logger.info('WebSocket authenticated', {
      socketId: socket.id,
      userId: payload.userId,
      email: payload.email,
      authSource: authenticatedSource,
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
