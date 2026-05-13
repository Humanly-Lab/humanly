# Live Preview - Quick Start Guide

## Installation Complete!

The live preview page has been successfully created and is ready to use.

## What Was Built

### Main Page
**Location**: `/home/ubuntu/humanly/packages/frontend/src/app/(dashboard)/tasks/[id]/live-preview/page.tsx`

A fully-featured real-time event monitoring page with:
- WebSocket connection via Socket.IO
- Real-time event feed
- Session monitoring
- Advanced filtering
- Live statistics
- Responsive design

### New UI Components
1. **Badge Component**: `/home/ubuntu/humanly/packages/frontend/src/components/ui/badge.tsx`
2. **ScrollArea Component**: `/home/ubuntu/humanly/packages/frontend/src/components/ui/scroll-area.tsx`

### Dependencies Added
```json
"@radix-ui/react-scroll-area": "^1.0.5"
```

## How to Use

### 1. Install Dependencies
```bash
cd /home/ubuntu/humanly/packages/frontend
npm install
# or
pnpm install
# or
yarn install
```

### 2. Set Environment Variables
Ensure your `.env.local` file has:
```bash
NEXT_PUBLIC_WS_URL=http://localhost:3001  # Your WebSocket server URL
```

### 3. Start the Development Server
```bash
npm run dev
# or
pnpm dev
```

### 4. Access the Page
Navigate to: `http://localhost:3000/tasks/[your-task-id]/live-preview`

Replace `[your-task-id]` with an actual task ID from your database.

## Backend Requirements

Your WebSocket server must:

### 1. Accept Socket.IO Connections
```typescript
import { Server } from 'socket.io';

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
});
```

### 2. Handle Authentication
```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  // Verify JWT token
  // Attach user to socket
  next();
});
```

### 3. Handle Room Joining
```typescript
socket.on('join-task', (taskId) => {
  socket.join(`task:${taskId}`);
  console.log(`Socket ${socket.id} joined task ${taskId}`);
});

socket.on('leave-task', (taskId) => {
  socket.leave(`task:${taskId}`);
  console.log(`Socket ${socket.id} left task ${taskId}`);
});
```

### 4. Emit Events to Rooms
```typescript
// When a session starts
io.to(`task:${taskId}`).emit('session-started', {
  sessionId: session.id,
  userId: session.externalUserId,
  timestamp: new Date().toISOString(),
});

// When an event is received
io.to(`task:${taskId}`).emit('event-received', {
  eventId: event.id,
  sessionId: event.sessionId,
  userId: session.externalUserId,
  eventType: event.eventType,
  timestamp: event.timestamp,
  data: {
    keyCode: event.keyCode,
    keyChar: event.keyChar,
    textBefore: event.textBefore,
    textAfter: event.textAfter,
    targetElement: event.targetElement,
    cursorPosition: event.cursorPosition,
  },
  metadata: event.metadata,
});

// When a session ends
io.to(`task:${taskId}`).emit('session-ended', {
  sessionId: session.id,
  userId: session.externalUserId,
  timestamp: new Date().toISOString(),
});
```

## Testing the Page

### 1. Test Connection
1. Open the live preview page
2. Check that connection status shows "Connected"
3. Look for green badge with wifi icon

### 2. Test Event Reception
1. Open another browser tab/window
2. Navigate to a tracked form/survey for the task
3. Interact with the form (type, paste, focus fields)
4. Switch back to live preview page
5. Events should appear in real-time

### 3. Test Filters
1. Click "Filters" button to expand filter panel
2. Check/uncheck event type checkboxes
3. Enter text in User ID or Session ID filters
4. Verify events are filtered correctly

### 4. Test Controls
1. **Pause**: Click pause button, interact with form, verify no new events
2. **Resume**: Click play button, verify events start appearing again
3. **Auto-scroll**: Toggle off, scroll down, add events, verify it doesn't scroll
4. **Clear**: Click clear button, verify all events are removed

### 5. Test Sessions
1. Open multiple tabs with the tracked form
2. Use different user IDs in each
3. Verify multiple sessions appear in sidebar
4. Check that event counts update correctly

## Troubleshooting

### Connection Issues

**Problem**: Page shows "Disconnected" or "Error"

**Solutions**:
1. Check that WebSocket server is running
2. Verify `NEXT_PUBLIC_WS_URL` is correct
3. Check browser console for error messages
4. Ensure JWT token is valid
5. Check CORS settings on backend

### No Events Appearing

**Problem**: Connected but no events show up

**Solutions**:
1. Verify tracking code is installed on form
2. Check that task ID matches
3. Ensure backend is emitting events to correct room
4. Check browser console for errors
5. Verify events are being sent from tracking script

### Filters Not Working

**Problem**: Filters don't seem to filter events

**Solutions**:
1. Clear browser cache
2. Hard refresh page (Ctrl+Shift+R or Cmd+Shift+R)
3. Check that filter values match event data exactly
4. User ID and Session ID filters are case-insensitive

### Performance Issues

**Problem**: Page becomes slow with many events

**Solutions**:
1. Use the Clear button periodically
2. Apply filters to reduce visible events
3. The page automatically limits to 500 events in memory
4. If issue persists, check browser performance tools

## Key Features to Demonstrate

### 1. Real-time Updates
- Show how events appear instantly as users interact
- Highlight the live event counter
- Demonstrate events/second calculation

### 2. Session Tracking
- Show multiple active sessions
- Point out event counts per session
- Demonstrate relative time display

### 3. Filtering Power
- Filter by specific event types (e.g., only paste events)
- Search for specific users
- Combine multiple filters

### 4. Control Features
- Pause to study specific events
- Auto-scroll for continuous monitoring
- Clear for fresh start

### 5. Event Details
- Show rich event information
- Point out color coding
- Demonstrate field names and content

## Integration with Other Pages

### From Task Overview
The task overview page has a "Live Preview" card linking here:
```typescript
{
  icon: Eye,
  label: 'Live Preview',
  href: `/tasks/${taskId}/live-preview`,
  description: 'Monitor user sessions in real-time',
}
```

### To Tracking Snippets
Link back to tracking code page:
```typescript
<Link href={`/tasks/${taskId}/snippets`}>
  <Button>
    <Code className="h-4 w-4 mr-2" />
    Tracking Code
  </Button>
</Link>
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Live Preview Page (page.tsx)               │ │
│  │  • WebSocket Client (socket-client.ts)             │ │
│  │  • State Management (React hooks)                  │ │
│  │  • UI Components (shadcn/ui)                       │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                           ↕ Socket.IO
┌─────────────────────────────────────────────────────────┐
│                  Backend (WebSocket Server)              │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Socket.IO Server                           │ │
│  │  • Authentication                                  │ │
│  │  • Room Management                                 │ │
│  │  • Event Broadcasting                              │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                           ↕ HTTP/API
┌─────────────────────────────────────────────────────────┐
│              Tracking Script (on Form Site)              │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Event Tracker                              │ │
│  │  • Capture user interactions                       │ │
│  │  • Batch and send events                           │ │
│  │  • Session management                              │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Next Steps

1. **Backend Implementation**: Implement the WebSocket server endpoints
2. **Testing**: Test with real user sessions
3. **Monitoring**: Monitor performance with many concurrent users
4. **Enhancements**: Consider adding features like:
   - Event export
   - Session replay
   - Alerts for specific patterns
   - Advanced analytics overlay

## Support

For issues or questions:
1. Check the README.md for detailed documentation
2. Review FEATURES.md for complete feature list
3. Check browser console for error messages
4. Verify backend server logs
5. Test with simple cases first

## Production Checklist

Before deploying to production:

- [ ] WebSocket server is running and accessible
- [ ] Environment variables are set correctly
- [ ] JWT authentication is working
- [ ] CORS is configured properly
- [ ] SSL/TLS is enabled for WebSocket connection
- [ ] Error handling is robust
- [ ] Performance has been tested with load
- [ ] Memory limits are appropriate
- [ ] Reconnection logic works reliably
- [ ] All UI components render correctly
- [ ] Mobile experience is smooth
- [ ] Accessibility has been tested
- [ ] Browser compatibility verified

## Success Criteria

The page is working correctly when:

✅ Connection status shows "Connected"
✅ Events appear in real-time as users interact
✅ Session sidebar updates with active sessions
✅ Statistics show accurate counts and rates
✅ Filters work as expected
✅ Controls (pause/resume/clear) function properly
✅ Auto-scroll behaves correctly
✅ No console errors
✅ Smooth performance with many events
✅ Responsive on all screen sizes

---

**Congratulations!** Your live preview page is ready to monitor user sessions in real-time. Start tracking and gain valuable insights into user behavior!
