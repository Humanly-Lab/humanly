/**
 * Humanly Tracker - Lightweight JavaScript tracking library
 *
 * This library tracks user input events (keystrokes, paste, copy, etc.)
 * and sends them to the Humanly backend for analysis.
 *
 * @example
 * ```javascript
 * // Initialize tracker
 * const tracker = new HumanlyTracker({
 *   taskToken: 'your-task-token',
 *   apiUrl: 'https://api.writehumanly.net',
 *   debug: true
 * });
 *
 * // Start tracking
 * await tracker.init();
 * tracker.attach(); // Track all inputs
 *
 * // Or attach to specific elements
 * tracker.attach('.my-form input');
 *
 * // Mark form as submitted
 * await tracker.markSubmitted();
 *
 * // Clean up
 * await tracker.destroy();
 * ```
 */

export { HumanlyTracker } from './tracker';
export type {
  TrackerConfig,
  TrackerEvent,
  EventType,
  SessionInitResponse,
  EventsResponse,
  SessionSubmitResponse,
  SessionMetadata,
} from './types';

// Make HumanlyTracker available globally for non-module usage
import { HumanlyTracker } from './tracker';

if (typeof window !== 'undefined') {
  // Export as HumanlyTracker
  (window as any).HumanlyTracker = HumanlyTracker;
  // Also export as humanly for convenience
  (window as any).humanly = { HumanlyTracker };
}
