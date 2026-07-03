# Humanly Tracker

Lightweight JavaScript tracking library for capturing user input events in web forms and surveys.

## Features

- **Small Bundle Size**: < 15KB gzipped, no runtime dependencies
- **Comprehensive Event Tracking**: Captures keystrokes, paste, copy, cut, focus, blur, and change events
- **Smart Batching**: Buffers events and sends them efficiently to reduce network calls
- **Retry Logic**: Exponential backoff with configurable retry attempts
- **Dynamic Element Support**: Automatically tracks dynamically added form elements via MutationObserver
- **TypeScript Support**: Full TypeScript definitions included
- **Browser Compatible**: Works across modern browsers (ES2015+)
- **Multiple Usage Modes**: Supports both ES modules and global window usage

## Installation

First, install dependencies:

```bash
pnpm install
```

## Building

Build the library:

```bash
pnpm build:tracker
```

This creates three files in the `dist/` directory:
- `humanly-tracker.esm.js` - ES Module build (unminified)
- `humanly-tracker.js` - UMD build (unminified)
- `humanly-tracker.min.js` - UMD build (minified, production-ready)

## Usage

### Basic Usage

```html
<!-- Include the script -->
<script src="https://cdn.yoursite.com/humanly-tracker.min.js"></script>

<script>
  // Initialize tracker
  const tracker = new window.HumanlyTracker({
    projectToken: 'your-project-token',
    apiUrl: 'https://api.humanly.art',
    debug: false // Set to true for development
  });

  // Start tracking
  async function startTracking() {
    try {
      await tracker.init();
      tracker.attach(); // Track all inputs on the page
      console.log('Tracking started');
    } catch (error) {
      console.error('Failed to start tracking:', error);
    }
  }

  // Mark form as submitted
  async function onFormSubmit() {
    try {
      await tracker.markSubmitted();
      console.log('Session marked as submitted');
    } catch (error) {
      console.error('Failed to mark submission:', error);
    }
  }

  // Start tracking when page loads
  startTracking();
</script>
```

### ES Module Usage

```javascript
import { HumanlyTracker } from '@humanly/tracker';

const tracker = new HumanlyTracker({
  projectToken: 'your-project-token',
  apiUrl: 'https://api.humanly.art',
  userIdSelector: '#user-id', // Optional: CSS selector to find user ID
  debounceMs: 100, // Optional: debounce time between events
  maxBatchSize: 20, // Optional: max events before auto-flush
  maxBatchTime: 30, // Optional: max seconds before auto-flush
  retryAttempts: 3, // Optional: number of retry attempts
  debug: true // Optional: enable debug logging
});

// Initialize and start tracking
await tracker.init();
tracker.attach();

// Track specific elements only
tracker.attach('.my-form input, .my-form textarea');

// Or track specific elements
const elements = document.querySelectorAll('.tracked-input');
tracker.attach(Array.from(elements));

// Mark as submitted when form is submitted
document.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await tracker.markSubmitted();
  // Submit form normally
});

// Clean up when done
await tracker.destroy();
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectToken` | string | **required** | Your project authentication token |
| `apiUrl` | string | **required** | Backend API base URL |
| `userIdSelector` | string | undefined | CSS selector to extract user ID from page |
| `userIdKey` | string | undefined | Meta tag key to extract user ID from |
| `debounceMs` | number | 100 | Debounce time in ms between events |
| `maxBatchSize` | number | 20 | Maximum events before auto-flush |
| `maxBatchTime` | number | 30 | Maximum seconds before auto-flush |
| `retryAttempts` | number | 3 | Number of retry attempts for API calls |
| `debug` | boolean | false | Enable debug logging |

## Events Tracked

The tracker captures the following events:

- **keydown** - Key press events with key code and character
- **keyup** - Key release events
- **paste** - Paste operations with clipboard content
- **copy** - Copy operations
- **cut** - Cut operations
- **focus** - Input field focus events
- **blur** - Input field blur events
- **change** - Input value change events

Each event includes:
- Timestamp
- Event type
- Target element (CSS selector)
- Text state (before/after)
- Cursor position
- Selection range
- Clipboard content (for paste/copy/cut)

## API Methods

### `constructor(config: TrackerConfig)`
Creates a new tracker instance with the specified configuration.

### `async init(): Promise<void>`
Initializes the tracker and creates a tracking session with the backend.

### `attach(selector?: string | HTMLElement[]): void`
Attaches event listeners to elements:
- No argument: tracks all inputs, textareas, and contenteditable elements
- String selector: tracks elements matching the CSS selector
- Element array: tracks specific elements

### `trackEvent(event: TrackerEvent): void`
Manually track a custom event (advanced usage).

### `async markSubmitted(): Promise<void>`
Marks the session as submitted. Call this when the user submits the form.

### `async destroy(): Promise<void>`
Cleans up all event listeners and flushes remaining events.

## Backend API

The tracker expects these endpoints to be available:

### POST /api/v1/track/init
Initialize a tracking session.

**Request:**
```json
{
  "projectToken": "string",
  "externalUserId": "string (optional)",
  "metadata": {
    "url": "string",
    "userAgent": "string",
    "screenWidth": "number",
    "screenHeight": "number",
    "language": "string",
    "timezone": "string"
  }
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "string"
}
```

### POST /api/v1/track/events
Send batched events.

**Request:**
```json
{
  "sessionId": "string",
  "events": [
    {
      "timestamp": "number",
      "eventType": "keydown|keyup|paste|copy|cut|focus|blur|change",
      "targetElement": "string",
      "keyCode": "number (optional)",
      "keyChar": "string (optional)",
      "textAfter": "string (optional)",
      "cursorPosition": "number (optional)",
      "selectionStart": "number (optional)",
      "selectionEnd": "number (optional)",
      "pastedContent": "string (optional)",
      "clipboardContent": "string (optional)"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "eventsReceived": "number"
}
```

### POST /api/v1/track/submit
Mark session as submitted.

**Request:**
```json
{
  "sessionId": "string"
}
```

**Response:**
```json
{
  "success": true
}
```

## Browser Support

- Chrome/Edge 51+
- Firefox 54+
- Safari 10+
- Opera 38+

Requires ES2015 support (all modern browsers).

## Development

### Watch Mode

```bash
pnpm dev:tracker
```

### Clean Build

```bash
pnpm --filter @humanly/tracker clean
pnpm build:tracker
```

## Security Considerations

- The tracker captures all input events including potentially sensitive data
- Ensure your backend implements proper encryption and security measures
- Consider GDPR and privacy regulations in your jurisdiction
- Always inform users about tracking and get consent
- Use HTTPS for all API communications

## License

MIT
