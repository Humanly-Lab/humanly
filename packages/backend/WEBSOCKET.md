# WebSocket Implementation for Live Preview

This document describes the enhanced WebSocket implementation for real-time event tracking preview in humanly.

## Architecture

The WebSocket implementation consists of four main components:

1. **Socket Server** (`src/websocket/socket-server.ts`)
   - Configures Socket.IO with authentication middleware
   - Sets up connection lifecycle handlers
   - Manages error handling

2. **Live Preview Handlers** (`src/websocket/handlers/live-preview.handler.ts`)
   - Handles project room join/leave operations
   - Verifies user ownership of projects
   - Manages room membership tracking

3. **WebSocket Utilities** (`src/utils/websocket.ts`)
   - Type definitions for WebSocket events
   - Helper functions for broadcasting
   - Room name generation utilities

4. **Server Integration** (`src/server.ts`)
   - Integrates WebSocket setup with HTTP server
   - Configures Socket.IO with proper types

## Features

### Authentication
- JWT token-based authentication for all WebSocket connections
- Tokens can be provided via:
  - `auth.token` (recommended)
  - `query.token` (fallback)
- Automatic disconnection for invalid/expired tokens

### Room Management
- Project-based rooms with format `project:{projectId}`
- Ownership verification before joining rooms
- Automatic room cleanup on disconnect
- Track which rooms each socket belongs to

### Event Broadcasting
- Real-time broadcast of tracking events
- Session lifecycle events (started/ended)
- Individual event streaming for live preview

## Client Usage

### Connecting

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});

socket.on('connect', () => {
  console.log('Connected to WebSocket server');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});
```

### Joining a Project Room

```typescript
socket.emit('join-project', {
  projectId: 'your-project-id',
  token: 'your-jwt-token' // optional, can be included for additional verification
});
```

### Leaving a Project Room

```typescript
socket.emit('leave-project', {
  projectId: 'your-project-id'
});
```

### Listening for Events

```typescript
// New tracking event received
socket.on('event-received', (data) => {
  console.log('Event:', data);
  // data: { sessionId, externalUserId, event }
});

// Session started
socket.on('session-started', (data) => {
  console.log('Session started:', data);
  // data: { sessionId, externalUserId, timestamp }
});

// Session ended
socket.on('session-ended', (data) => {
  console.log('Session ended:', data);
  // data: { sessionId, externalUserId, submitted, timestamp }
});

// Error handling
socket.on('error', (data) => {
  console.error('WebSocket error:', data);
  // data: { message, code? }
});
```

## Server Usage

### Broadcasting Events

The WebSocket utilities can be used from any service to broadcast events:

```typescript
import { broadcastToProject } from '../utils/websocket';

// Broadcast to all clients watching a project
broadcastToProject(io, projectId, 'event-received', {
  sessionId: 'session-123',
  externalUserId: 'user-456',
  event: {
    eventType: 'keydown',
    timestamp: new Date(),
    keyChar: 'a'
  }
});
```

### Getting Connected Users

```typescript
import { getConnectedUsersInProject } from '../utils/websocket';

const userIds = await getConnectedUsersInProject(io, projectId);
console.log(`${userIds.length} users watching project ${projectId}`);
```

## Event Types

### Client to Server

#### join-project
```typescript
{
  projectId: string;
  token: string;
}
```

#### leave-project
```typescript
{
  projectId: string;
}
```

### Server to Client

#### event-received
```typescript
{
  sessionId: string;
  externalUserId: string;
  event: TrackerEvent;
}
```

#### session-started
```typescript
{
  sessionId: string;
  externalUserId: string;
  timestamp: Date;
}
```

#### session-ended
```typescript
{
  sessionId: string;
  externalUserId: string;
  submitted: boolean;
  timestamp: Date;
}
```

#### error
```typescript
{
  message: string;
  code?: string;
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `MISSING_PROJECT_ID` | Project ID not provided in request |
| `UNAUTHORIZED` | User does not own the project |
| `PROJECT_NOT_FOUND` | Project does not exist |
| `PROJECT_INACTIVE` | Project exists but is not active |
| `JOIN_FAILED` | Failed to join project room |
| `LEAVE_FAILED` | Failed to leave project room |

## Security Considerations

1. **Authentication Required**: All WebSocket connections must provide a valid JWT token
2. **Ownership Verification**: Users can only join rooms for projects they own
3. **Token Expiration**: Tokens are verified on connection and must be valid
4. **Room Isolation**: Users in one project cannot see events from other projects
5. **Active Projects Only**: Only active projects can be joined

## Configuration

Socket.IO is configured with the following settings:

```typescript
{
  cors: {
    origin: env.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  connectTimeout: 10000,     // 10 seconds
  pingTimeout: 60000,        // 60 seconds
  pingInterval: 25000        // 25 seconds
}
```

## Logging

All WebSocket operations are logged with appropriate levels:

- `info`: Connections, disconnections, room joins/leaves
- `warn`: Authentication failures, invalid requests
- `error`: Unexpected errors, connection errors
- `debug`: Room status, handler setup

## Integration with Event Service

The `EventService` automatically broadcasts events via WebSocket when:

1. A new session is initialized → `session-started` event
2. Events are ingested → `event-received` event (first 10 events)
3. A session is submitted → `session-ended` event

This happens automatically without any additional code needed.

## Testing

### Manual Testing with Socket.IO Client

```bash
npm install -g socket.io-client
```

```javascript
const { io } = require('socket.io-client');

const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});

socket.on('connect', () => {
  console.log('Connected');
  socket.emit('join-project', {
    projectId: 'your-project-id',
    token: 'your-jwt-token'
  });
});

socket.on('event-received', console.log);
socket.on('session-started', console.log);
socket.on('session-ended', console.log);
socket.on('error', console.error);
```

## Future Enhancements

Potential improvements for the WebSocket implementation:

1. **Presence System**: Show which users are currently viewing a project
2. **Event Filtering**: Allow clients to filter which events they receive
3. **Rate Limiting**: Limit event emission rate per client
4. **Reconnection Handling**: Automatic room rejoining after reconnection
5. **Compression**: Enable WebSocket compression for large payloads
6. **Binary Events**: Support binary data for efficient large event transmission
