import { io, Socket } from 'socket.io-client';
import { TokenManager } from './api-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

/**
 * Socket client instance
 */
let socket: Socket | null = null;

/**
 * Initialize socket connection
 */
export const initializeSocket = (): Socket => {
  if (socket && socket.connected) {
    return socket;
  }

  const token = TokenManager.getAccessToken();

  socket = io(WS_URL, {
    auth: {
      token,
    },
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  // Connection event listeners
  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  return socket;
};

/**
 * Get socket instance
 */
export const getSocket = (): Socket | null => {
  return socket;
};

/**
 * Disconnect socket
 */
export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

/**
 * Emit event to server
 */
export const emitEvent = (event: string, data?: any): void => {
  if (socket && socket.connected) {
    socket.emit(event, data);
  } else {
    console.warn('Socket not connected. Event not emitted:', event);
  }
};

/**
 * Listen to event from server
 */
export const onEvent = (event: string, callback: (data: any) => void): void => {
  if (socket) {
    socket.on(event, callback);
  }
};

/**
 * Remove event listener
 */
export const offEvent = (event: string, callback?: (data: any) => void): void => {
  if (socket) {
    socket.off(event, callback);
  }
};

export default {
  initializeSocket,
  getSocket,
  disconnectSocket,
  emitEvent,
  onEvent,
  offEvent,
};
