import { io, Socket } from 'socket.io-client';
import { TokenManager } from './api-client';

const CONFIGURED_WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export function resolveSocketUrl(configuredUrl: string = CONFIGURED_WS_URL): string {
  try {
    const url = new URL(configuredUrl);
    if (
      url.hostname === 'writehumanly.net'
      || url.hostname === 'app.writehumanly.net'
      || url.hostname === 'admin.writehumanly.net'
    ) {
      return 'https://api.writehumanly.net';
    }
  } catch {
    return configuredUrl;
  }

  return configuredUrl;
}

const WS_URL = resolveSocketUrl();

/**
 * Socket client instance
 */
let socket: Socket | null = null;

/**
 * Initialize socket connection
 */
export const initializeSocket = (): Socket => {
  if (socket && socket.connected) {
    console.log('Socket already connected, reusing existing connection');
    return socket;
  }

  const token = TokenManager.getAccessToken();

  if (!token) {
    console.warn('[Socket] No in-memory authentication token found.');
    console.warn('[Socket] Falling back to auth cookies if they are available.');
  } else {
    console.log('[Socket] Token found, length:', token.length);
    console.log('[Socket] Token preview:', token.substring(0, 20) + '...');
  }

  console.log('[Socket] Connecting to:', WS_URL);

  socket = io(WS_URL, {
    auth: {
      token,
    },
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 3, // Reduced from 5 to 3
    autoConnect: true,
  });

  // Connection event listeners
  socket.on('connect', () => {
    console.log('✓ Socket connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    // Only log if not a normal disconnect
    if (reason !== 'io client disconnect' && reason !== 'io server disconnect') {
      console.warn('Unexpected socket disconnect:', reason);
    }
  });

  socket.on('connect_error', (error: any) => {
    // Only log authentication errors once, not repeatedly
    if (error.message === 'Authentication required') {
      console.error('Socket authentication failed: Please ensure you are logged in.');
      // Stop reconnection attempts on auth failure
      socket?.disconnect();
    } else {
      console.error('Socket connection error:', error.message || error);
    }
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
