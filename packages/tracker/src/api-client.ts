import {
  TrackerConfig,
  TrackerEvent,
  SessionInitResponse,
  EventsResponse,
  SessionSubmitResponse,
  SessionMetadata,
} from './types';

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, baseDelay = 1000): number {
  return Math.min(baseDelay * Math.pow(2, attempt), 10000);
}

/**
 * Generic retry wrapper with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  debug = false
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts - 1) {
        const delay = getBackoffDelay(attempt);
        if (debug) {
          console.log(
            `[Humanly] Retry attempt ${attempt + 1}/${maxAttempts} after ${delay}ms`
          );
        }
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Unknown error during retry');
}

/**
 * Make HTTP request with error handling
 */
async function makeRequest<T>(
  url: string,
  options: RequestInit,
  debug = false
): Promise<T> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    // Extract and merge data property if it exists (backend wraps responses in { success, data, message })
    let data;
    if (json.data !== undefined) {
      // Merge top-level fields (success, message) with data fields
      data = {
        success: json.success,
        message: json.message,
        ...json.data,
      };
    } else {
      data = json;
    }

    if (debug) {
      console.log('[Humanly] API response:', data);
    }

    return data as T;
  } catch (error) {
    if (debug) {
      console.error('[Humanly] API request failed:', error);
    }
    throw error;
  }
}

/**
 * Initialize a new tracking session
 */
export async function initSession(
  config: TrackerConfig,
  externalUserId?: string,
  metadata?: SessionMetadata
): Promise<SessionInitResponse> {
  const url = `${config.apiUrl}/api/v1/track/init`;

  const defaultMetadata: SessionMetadata = {
    url: window.location.href,
    userAgent: navigator.userAgent,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...metadata,
  };

  const payload = {
    externalUserId: externalUserId || 'anonymous',
    metadata: defaultMetadata,
  };

  if (config.debug) {
    console.log('[Humanly] Initializing session:', payload);
  }

  return withRetry(
    () =>
      makeRequest<SessionInitResponse>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Task-Token': config.taskToken,
        },
        body: JSON.stringify(payload),
      }, config.debug),
    config.retryAttempts || 3,
    config.debug
  );
}

/**
 * Send batched events to the backend
 */
export async function sendEvents(
  config: TrackerConfig,
  sessionId: string,
  events: TrackerEvent[]
): Promise<EventsResponse> {
  if (events.length === 0) {
    return { success: true, eventsReceived: 0 };
  }

  const url = `${config.apiUrl}/api/v1/track/events`;

  const payload = {
    events,
  };

  if (config.debug) {
    console.log(`[Humanly] Sending ${events.length} events:`, payload);
  }

  return withRetry(
    () =>
      makeRequest<EventsResponse>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Task-Token': config.taskToken,
          'X-Session-Id': sessionId,
        },
        body: JSON.stringify(payload),
      }, config.debug),
    config.retryAttempts || 3,
    config.debug
  );
}

/**
 * Submit session to mark it as complete
 */
export async function submitSession(
  config: TrackerConfig,
  sessionId: string
): Promise<SessionSubmitResponse> {
  const url = `${config.apiUrl}/api/v1/track/submit`;

  const payload = {};

  if (config.debug) {
    console.log('[Humanly] Submitting session:', sessionId);
  }

  return withRetry(
    () =>
      makeRequest<SessionSubmitResponse>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Task-Token': config.taskToken,
          'X-Session-Id': sessionId,
        },
        body: JSON.stringify(payload),
      }, config.debug),
    config.retryAttempts || 3,
    config.debug
  );
}
