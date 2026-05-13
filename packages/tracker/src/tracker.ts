import { TrackerConfig, TrackerEvent, EventType } from './types';
import { initSession, sendEvents, submitSession } from './api-client';
import { EventBuffer } from './event-buffer';
import {
  findInputElements,
  getElementSelector,
  getUserId,
  observeDynamicElements,
  getElementText,
  getCursorPosition,
  getSelectionRange,
  safeGetElementValue,
} from './dom-utils';

/**
 * Main HumanlyTracker class
 */
export class HumanlyTracker {
  private config: TrackerConfig;
  private sessionId: string | null = null;
  private eventBuffer: EventBuffer | null = null;
  private trackedElements: Set<HTMLElement> = new Set();
  private eventListeners: Map<HTMLElement, Map<string, EventListener>> = new Map();
  private mutationObserver: MutationObserver | null = null;
  private debounceTimers: Map<string, number> = new Map();
  private isInitialized = false;
  private isDestroyed = false;

  constructor(config: TrackerConfig) {
    this.config = {
      debounceMs: 100,
      maxBatchSize: 20,
      maxBatchTime: 30,
      retryAttempts: 3,
      debug: false,
      ...config,
    };

    if (this.config.debug) {
      console.log('[Humanly] Tracker initialized with config:', this.config);
    }

    // Set up beforeunload handler to flush events
    this.setupBeforeUnload();
  }

  /**
   * Initialize the tracker and start a session
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[Humanly] Tracker already initialized');
      return;
    }

    if (this.isDestroyed) {
      throw new Error('[Humanly] Cannot initialize destroyed tracker');
    }

    try {
      // Extract user ID from page
      const externalUserId = getUserId(this.config);

      // Initialize session
      const response = await initSession(this.config, externalUserId);

      if (!response.success) {
        throw new Error(response.message || 'Failed to initialize session');
      }

      this.sessionId = response.sessionId;

      // Set up event buffer
      this.eventBuffer = new EventBuffer(this.config, (events) =>
        this.flushEvents(events)
      );

      this.isInitialized = true;

      if (this.config.debug) {
        console.log('[Humanly] Session initialized:', this.sessionId);
      }
    } catch (error) {
      console.error('[Humanly] Failed to initialize tracker:', error);
      throw error;
    }
  }

  /**
   * Attach tracking to elements
   */
  attach(selector?: string | HTMLElement[]): void {
    if (!this.isInitialized) {
      throw new Error('[Humanly] Tracker not initialized. Call init() first.');
    }

    let elements: HTMLElement[];

    if (Array.isArray(selector)) {
      elements = selector;
    } else if (typeof selector === 'string') {
      elements = findInputElements(selector);
    } else {
      elements = findInputElements();
    }

    if (this.config.debug) {
      console.log(`[Humanly] Attaching to ${elements.length} elements`);
      if (elements.length === 0) {
        console.warn('[Humanly] ⚠️ No elements found to track! Selector:', selector || 'default');
        console.log('[Humanly] Available text fields on page:',
          document.querySelectorAll('input[type="text"], textarea, input:not([type])').length);
      } else {
        console.log('[Humanly] Elements found:', elements.map(el => getElementSelector(el)));
      }
    }

    elements.forEach((element) => this.attachToElement(element));

    // Set up MutationObserver for dynamic elements
    if (!this.mutationObserver) {
      this.mutationObserver = observeDynamicElements(
        (newElements) => {
          if (this.config.debug) {
            console.log(`[Humanly] Found ${newElements.length} new elements`);
          }
          newElements.forEach((element) => this.attachToElement(element));
        },
        typeof selector === 'string' ? selector : undefined
      );
    }
  }

  /**
   * Attach event listeners to a single element
   */
  private attachToElement(element: HTMLElement): void {
    if (this.trackedElements.has(element)) {
      return; // Already tracking this element
    }

    const listeners = new Map<string, EventListener>();

    // Keydown event
    const keydownListener = (e: Event) => {
      const event = e as KeyboardEvent;
      this.handleKeyEvent('keydown', element, event);
    };
    element.addEventListener('keydown', keydownListener, { passive: true });
    listeners.set('keydown', keydownListener);

    // Keyup event
    const keyupListener = (e: Event) => {
      const event = e as KeyboardEvent;
      this.handleKeyEvent('keyup', element, event);
    };
    element.addEventListener('keyup', keyupListener, { passive: true });
    listeners.set('keyup', keyupListener);

    // Paste event
    const pasteListener = (e: Event) => {
      const event = e as ClipboardEvent;
      this.handleClipboardEvent('paste', element, event);
    };
    element.addEventListener('paste', pasteListener);
    listeners.set('paste', pasteListener);

    // Copy event
    const copyListener = (e: Event) => {
      const event = e as ClipboardEvent;
      this.handleClipboardEvent('copy', element, event);
    };
    element.addEventListener('copy', copyListener);
    listeners.set('copy', copyListener);

    // Cut event
    const cutListener = (e: Event) => {
      const event = e as ClipboardEvent;
      this.handleClipboardEvent('cut', element, event);
    };
    element.addEventListener('cut', cutListener);
    listeners.set('cut', cutListener);

    // Focus event
    const focusListener = () => {
      this.handleFocusEvent('focus', element);
    };
    element.addEventListener('focus', focusListener, { passive: true });
    listeners.set('focus', focusListener);

    // Blur event
    const blurListener = () => {
      this.handleFocusEvent('blur', element);
    };
    element.addEventListener('blur', blurListener, { passive: true });
    listeners.set('blur', blurListener);

    // Change event
    const changeListener = () => {
      this.handleChangeEvent(element);
    };
    element.addEventListener('change', changeListener, { passive: true });
    listeners.set('change', changeListener);

    this.trackedElements.add(element);
    this.eventListeners.set(element, listeners);

    if (this.config.debug) {
      console.log('[Humanly] Attached to element:', getElementSelector(element));
    }
  }

  /**
   * Handle keyboard events
   */
  private handleKeyEvent(
    eventType: 'keydown' | 'keyup',
    element: HTMLElement,
    event: KeyboardEvent
  ): void {
    if (this.config.debug) {
      console.log(`[Humanly] 🎹 ${eventType} event captured:`, {
        key: event.key,
        element: getElementSelector(element)
      });
    }

    this.debounce(`${eventType}-${getElementSelector(element)}`, () => {
      const selection = getSelectionRange(element);

      const trackerEvent: TrackerEvent = {
        timestamp: new Date().toISOString(),
        eventType,
        targetElement: getElementSelector(element),
        keyCode: event.keyCode?.toString(),
        keyChar: event.key,
        textAfter: safeGetElementValue(element),
        cursorPosition: getCursorPosition(element),
        selectionStart: selection.start,
        selectionEnd: selection.end,
      };

      if (this.config.debug) {
        console.log(`[Humanly] 📝 Creating tracker event:`, trackerEvent);
      }

      this.trackEvent(trackerEvent);
    });
  }

  /**
   * Handle clipboard events
   */
  private handleClipboardEvent(
    eventType: 'paste' | 'copy' | 'cut',
    element: HTMLElement,
    event: ClipboardEvent
  ): void {
    // Use setTimeout to get text after paste
    setTimeout(() => {
      const clipboardData = event.clipboardData?.getData('text') || '';
      const selection = getSelectionRange(element);

      const trackerEvent: TrackerEvent = {
        timestamp: new Date().toISOString(),
        eventType,
        targetElement: getElementSelector(element),
        textAfter: safeGetElementValue(element),
        cursorPosition: getCursorPosition(element),
        selectionStart: selection.start,
        selectionEnd: selection.end,
        pastedContent: eventType === 'paste' ? clipboardData : undefined,
        clipboardContent: eventType === 'copy' || eventType === 'cut' ? clipboardData : undefined,
      };

      this.trackEvent(trackerEvent);
    }, 10);
  }

  /**
   * Handle focus/blur events
   */
  private handleFocusEvent(eventType: 'focus' | 'blur', element: HTMLElement): void {
    const trackerEvent: TrackerEvent = {
      timestamp: new Date().toISOString(),
      eventType,
      targetElement: getElementSelector(element),
      textAfter: safeGetElementValue(element),
      cursorPosition: getCursorPosition(element),
    };

    this.trackEvent(trackerEvent);
  }

  /**
   * Handle change events
   */
  private handleChangeEvent(element: HTMLElement): void {
    const trackerEvent: TrackerEvent = {
      timestamp: new Date().toISOString(),
      eventType: 'change',
      targetElement: getElementSelector(element),
      textAfter: safeGetElementValue(element),
    };

    this.trackEvent(trackerEvent);
  }

  /**
   * Track a single event
   */
  trackEvent(event: TrackerEvent): void {
    if (!this.isInitialized || !this.eventBuffer) {
      console.warn('[Humanly] Cannot track event: tracker not initialized');
      return;
    }

    if (this.isDestroyed) {
      console.warn('[Humanly] Cannot track event: tracker destroyed');
      return;
    }

    this.eventBuffer.add(event);
  }

  /**
   * Flush events to backend
   */
  private async flushEvents(events: TrackerEvent[]): Promise<void> {
    if (!this.sessionId) {
      throw new Error('[Humanly] No session ID');
    }

    try {
      const response = await sendEvents(this.config, this.sessionId, events);

      if (!response.success) {
        throw new Error(response.message || 'Failed to send events');
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('[Humanly] Failed to flush events:', error);
      }
      throw error;
    }
  }

  /**
   * Mark session as submitted
   */
  async markSubmitted(): Promise<void> {
    if (!this.isInitialized || !this.sessionId) {
      throw new Error('[Humanly] Tracker not initialized');
    }

    // Flush any remaining events first
    if (this.eventBuffer) {
      await this.eventBuffer.flush();
    }

    try {
      const response = await submitSession(this.config, this.sessionId);

      if (!response.success) {
        throw new Error(response.message || 'Failed to submit session');
      }

      if (this.config.debug) {
        console.log('[Humanly] Session submitted successfully');
      }
    } catch (error) {
      console.error('[Humanly] Failed to submit session:', error);
      throw error;
    }
  }

  /**
   * Destroy the tracker and clean up
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    if (this.config.debug) {
      console.log('[Humanly] Destroying tracker');
    }

    // Stop observing mutations
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    // Remove all event listeners
    this.eventListeners.forEach((listeners, element) => {
      listeners.forEach((listener, eventType) => {
        element.removeEventListener(eventType, listener);
      });
    });
    this.eventListeners.clear();
    this.trackedElements.clear();

    // Clear debounce timers
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();

    // Flush and destroy event buffer
    if (this.eventBuffer) {
      await this.eventBuffer.destroy();
      this.eventBuffer = null;
    }

    this.isDestroyed = true;
    this.isInitialized = false;
  }

  /**
   * Debounce helper
   */
  private debounce(key: string, fn: () => void): void {
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      fn();
      this.debounceTimers.delete(key);
    }, this.config.debounceMs || 100);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Set up beforeunload handler to flush events
   */
  private setupBeforeUnload(): void {
    window.addEventListener('beforeunload', () => {
      if (this.eventBuffer && this.eventBuffer.size() > 0) {
        // Use sendBeacon for reliable event sending on page unload
        if (this.sessionId && navigator.sendBeacon) {
          const events = (this.eventBuffer as any).events || [];
          const payload = JSON.stringify({
            sessionId: this.sessionId,
            taskToken: this.config.taskToken,
            events,
          });

          // Create a Blob with the correct content-type
          const blob = new Blob([payload], { type: 'application/json' });

          navigator.sendBeacon(
            `${this.config.apiUrl}/api/v1/track/events`,
            blob
          );
        }
      }
    });
  }
}
