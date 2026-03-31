/**
 * PostHog Product Analytics — Chrome Extension
 *
 * Lightweight event tracking for the extension.
 * Uses a simple HTTP POST approach instead of the full PostHog JS SDK
 * to avoid bundle size overhead in the extension.
 *
 * Sampling: 10% of extension field extraction events.
 * All pairing/initialization events are captured at 100%.
 *
 * Events are batched in memory and flushed periodically via the
 * service worker alarm handler.
 */

/** Queued events waiting to be flushed */
interface PostHogEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

/** In-memory event queue */
const eventQueue: PostHogEvent[] = [];

/** Maximum events to queue before auto-flush */
const MAX_QUEUE_SIZE = 50;

/** Sampling rate for field extraction events (10%) */
const FIELD_EXTRACTION_SAMPLE_RATE = 0.1;

/** Event names that are always captured (not sampled) */
const ALWAYS_CAPTURE_EVENTS = [
  'extension_initialized',
  'extension_paired',
  'extension_unpaired',
  'rules_synced',
  'error_occurred',
];

/**
 * Track an extension event in PostHog.
 *
 * Field extraction events are sampled at 10%.
 * Pairing/initialization events are always captured.
 *
 * @param eventName - Event name
 * @param properties - Event properties
 */
export function trackExtensionEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  // Always capture critical events; sample field extraction events
  const shouldCapture =
    ALWAYS_CAPTURE_EVENTS.includes(eventName) ||
    Math.random() < FIELD_EXTRACTION_SAMPLE_RATE;

  if (!shouldCapture) return;

  eventQueue.push({
    event: eventName,
    properties: {
      ...properties,
      source: 'extension',
      extension_version: chrome?.runtime?.getManifest?.()?.version ?? 'unknown',
    },
    timestamp: new Date().toISOString(),
  });

  // Auto-flush if queue is getting large
  if (eventQueue.length >= MAX_QUEUE_SIZE) {
    flushEvents();
  }
}

/**
 * Flush all queued events to PostHog.
 *
 * Called by the service worker alarm handler on each tick.
 * Events are sent as a batch POST to the PostHog capture API.
 */
export function flushEvents(): void {
  if (eventQueue.length === 0) return;

  const apiKey = typeof process !== 'undefined'
    ? process.env.POSTHOG_API_KEY
    : undefined;
  const host = typeof process !== 'undefined'
    ? (process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com')
    : 'https://us.i.posthog.com';

  if (!apiKey) {
    // Clear the queue silently when PostHog is not configured
    eventQueue.length = 0;
    return;
  }

  // Drain the queue
  const events = eventQueue.splice(0, eventQueue.length);

  // Get a distinct ID from storage or use anonymous
  const distinctId = 'extension-anonymous';

  const batch = events.map((e) => ({
    event: e.event,
    properties: {
      ...e.properties,
      distinct_id: distinctId,
      $lib: 'mbg-extension',
    },
    timestamp: e.timestamp,
  }));

  // Fire-and-forget batch send
  fetch(`${host}/batch/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      batch,
    }),
  }).catch(() => {
    // Silently swallow network errors — analytics should never break the extension
  });
}

/**
 * Get the current event queue size (for testing).
 */
export function getQueueSize(): number {
  return eventQueue.length;
}
