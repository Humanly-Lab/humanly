# Live Preview Page

## Overview

The Live Preview page provides real-time monitoring of user sessions and events as they are tracked. It uses WebSocket connections via Socket.IO to receive events instantly from the backend server.

## File Location

`/home/ubuntu/humanly/packages/frontend/src/app/(dashboard)/tasks/[id]/live-preview/page.tsx`

## Features

### 1. WebSocket Connection
- **Auto-connect**: Automatically establishes Socket.IO connection when the page loads
- **Authentication**: Uses access token from auth store for secure connection
- **Connection States**: Displays connection status (Connecting, Connected, Disconnected, Error)
- **Auto-reconnect**: Automatically attempts to reconnect on disconnection
- **Room Management**: Joins task-specific room to receive only relevant events
- **Cleanup**: Properly disconnects and cleans up on component unmount

### 2. Real-time Event Display
- **Live Feed**: Shows events in real-time as they arrive from users
- **Most Recent First**: Events appear at the top of the list
- **Event Details**: Displays comprehensive information for each event:
  - Timestamp (formatted as "2:34:15 PM")
  - Event type (keydown, keyup, paste, copy, cut, focus, blur, input)
  - User ID
  - Session ID (shortened for display)
  - Field name (if available)
  - Key pressed (for keyboard events)
  - Text content (for paste/input events)
  - Cursor position

### 3. Event Type Color Coding
Each event type has a distinct color for easy visual scanning:
- **keydown**: Blue (darker)
- **keyup**: Blue (lighter)
- **paste**: Green
- **copy**: Yellow
- **cut**: Orange
- **focus**: Purple
- **blur**: Gray
- **input**: Cyan

### 4. Filters
- **Event Type Filter**: Checkboxes to filter by specific event types
- **User ID Filter**: Text input to filter events by user ID
- **Session ID Filter**: Text input to filter events by session ID
- **Clear Filters**: Button to reset all filters at once
- **Active Filter Indicator**: Shows count of active filters

### 5. Auto-scroll Control
- **Toggle Button**: Enable/disable auto-scroll to newest events
- **Smart Scrolling**: When enabled, automatically scrolls to top when new events arrive
- **Manual Control**: When disabled, allows user to scroll and view historical events

### 6. Session Information Sidebar
- **Active Sessions List**: Shows all currently active sessions
- **Session Details**:
  - User ID
  - Session ID (shortened)
  - Start time (relative, e.g., "5m ago", "Just now")
  - Event count for that session
- **Hover Effects**: Interactive cards with hover states
- **Scrollable**: Independent scroll area for many sessions

### 7. Real-time Statistics
Four stat cards display:
- **Connection Status**: Visual indicator with icon
- **Active Sessions**: Count of currently tracked sessions
- **Events Received**: Total events in current monitoring session
  - Shows filtered count when filters are active
- **Events/Second**: Live rate calculated over 5-second window

### 8. Controls
- **Pause/Resume**: Temporarily stop receiving new events (connection stays active)
- **Clear Events**: Clear the displayed events list without disconnecting
- **Filter Toggle**: Show/hide the filter panel
- **Auto-scroll Toggle**: Enable/disable automatic scrolling

### 9. Performance Optimizations
- **Memory Limit**: Keeps only the last 500 events in memory
- **Efficient Updates**: Uses React state updates optimally
- **Event Timestamps**: Tracks recent event timestamps for rate calculation
- **Filtered Display**: Only renders filtered events, not all events

### 10. Empty States
- **No Connection**: Shows loading spinner while connecting
- **No Events**: Helpful message when no events have been received yet
- **Instructions**: Guides user to tracking snippets page
- **Filter Results**: Different message when filters yield no results

## WebSocket Events

### Emitted Events
```typescript
// Join task room
socket.emit('join-task', taskId);

// Leave task room (on cleanup)
socket.emit('leave-task', taskId);
```

### Listened Events
```typescript
// Session lifecycle
socket.on('session-started', (data) => {
  // { sessionId, userId, timestamp }
});

socket.on('session-ended', (data) => {
  // { sessionId, userId, timestamp }
});

// Real-time events
socket.on('event-received', (data) => {
  // {
  //   eventId, sessionId, userId, eventType,
  //   timestamp, data: { keyCode, keyChar, textBefore, etc. }
  // }
});

// Connection events
socket.on('connect', () => { /* ... */ });
socket.on('disconnect', (reason) => { /* ... */ });
socket.on('connect_error', (error) => { /* ... */ });
```

## TypeScript Types

### RealtimeEvent
```typescript
interface RealtimeEvent {
  id: string;
  eventType: EventType;
  sessionId: string;
  userId: string;
  timestamp: string;
  fieldName?: string;
  keyCode?: string;
  keyChar?: string;
  textBefore?: string;
  textAfter?: string;
  cursorPosition?: number;
  metadata?: Record<string, any>;
}
```

### SessionInfo
```typescript
interface SessionInfo {
  sessionId: string;
  userId: string;
  startTime: string;
  eventCount: number;
  lastEventTime: string;
}
```

### ConnectionStatus
```typescript
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
```

## UI Components Used

### shadcn/ui Components
- `Card`, `CardContent`, `CardDescription`, `CardHeader`, `CardTitle`
- `Button`
- `Input`
- `Label`
- `Checkbox`
- `ScrollArea`
- `Badge`
- `Alert`, `AlertDescription`, `AlertTitle`

### Icons (lucide-react)
- `Activity`, `Pause`, `Play`, `Trash2`
- `Wifi`, `WifiOff`, `AlertCircle`, `Loader2`
- `ChevronDown`, `ChevronUp`, `Eye`, `EyeOff`, `X`, `Code`

## Styling Features

- **Responsive Layout**: Adapts to different screen sizes
- **Dark Mode Support**: All colors work in dark mode
- **Alternating Rows**: Even/odd rows have different background colors
- **Hover Effects**: Interactive elements respond to hover
- **Color-coded Badges**: Event types use semantic colors
- **Fixed Header**: Stats and controls remain visible while scrolling
- **Scrollable Areas**: Independent scroll areas for events and sessions

## Usage

1. **Navigate to Page**: Go to `/tasks/[id]/live-preview`
2. **Wait for Connection**: Page automatically connects to WebSocket server
3. **Monitor Events**: Events appear in real-time as users interact with tracked forms
4. **Apply Filters**: Use filters to focus on specific event types, users, or sessions
5. **Control Display**: Use pause/resume, auto-scroll, and clear controls as needed

## Integration with Backend

The page expects the backend WebSocket server to:
- Accept Socket.IO connections at `NEXT_PUBLIC_WS_URL`
- Authenticate connections using JWT tokens
- Support room-based event distribution
- Emit events in the format described above

## Environment Variables

```bash
NEXT_PUBLIC_WS_URL=http://localhost:3001  # WebSocket server URL
```

## Performance Considerations

- **Memory Management**: Events are limited to 500 to prevent memory leaks
- **Rate Calculation**: Uses a sliding window approach for events/second
- **Efficient Filtering**: Filters are applied during render, not stored separately
- **Connection Management**: Proper cleanup prevents memory leaks
- **State Updates**: Optimized React state updates for smooth performance

## Error Handling

- **Connection Errors**: Displays error message with details
- **Reconnection**: Automatically attempts to reconnect on failure
- **Graceful Degradation**: Shows helpful messages when connection fails
- **User Feedback**: Clear visual indicators for all connection states

## Accessibility

- **Semantic HTML**: Uses proper heading hierarchy
- **ARIA Labels**: Interactive elements have appropriate labels
- **Keyboard Navigation**: All controls are keyboard accessible
- **Screen Reader Friendly**: Proper text alternatives for icons

## Future Enhancements

Possible improvements:
- Export events to CSV/JSON
- Search within events
- Virtual scrolling for very large event lists
- Event replay functionality
- Session recording and playback
- Advanced analytics overlay
- Real-time user behavior heatmaps
- Alert system for specific event patterns
