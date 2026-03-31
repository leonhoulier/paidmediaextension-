/**
 * SSE-Based Rule Sync Module
 *
 * Replaces the 60-second polling mechanism with a Server-Sent Events (SSE)
 * connection to `GET /api/v1/extension/rules-stream`. When the backend
 * publishes a `rules_updated` event, the extension immediately invalidates
 * its IndexedDB cache and re-fetches the latest rules.
 *
 * Fallback behaviour:
 *   - If the SSE connection fails to open or drops, the module automatically
 *     falls back to the legacy 60-second polling via chrome.alarms.
 *   - Reconnection is attempted with exponential back-off (1s, 2s, 4s, …, 30s).
 *   - After a successful reconnection the polling alarm is cleared.
 *
 * @module sse-sync
 */

import { logger } from '../utils/logger.js';
import {
  invalidateCache,
  invalidateAllCaches,
} from '../storage/rule-cache.js';
import { syncRules } from '../storage/sync.js';
import type {
  RulesUpdatedMessage,
  WebSocketMessage,
} from '@media-buying-governance/shared';
import {
  updateSSEHealthMetrics,
  recordSSEMessage,
  initSSEHealthMetrics,
} from '../utils/telemetry.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** SSE stream endpoint path */
const SSE_STREAM_PATH = '/api/v1/extension/rules-stream';

/** Default API base URL */
const DEFAULT_API_BASE = 'http://localhost:3000';

/** Polling alarm name (shared with service-worker.ts) */
const RULES_POLL_ALARM = 'rules-version-poll';

/** Polling interval when in fallback mode (minutes) */
const FALLBACK_POLL_INTERVAL_MINUTES = 1;

/** Initial reconnection delay (ms) */
const INITIAL_RECONNECT_DELAY_MS = 1_000;

/** Maximum reconnection delay (ms) - reduced from 30s to 10s for faster recovery */
const MAX_RECONNECT_DELAY_MS = 10_000;

/** Maximum consecutive reconnection attempts before giving up temporarily */
const MAX_RECONNECT_ATTEMPTS = 20;

// ─── State ────────────────────────────────────────────────────────────────────

/** The active EventSource instance, if any */
let eventSource: EventSource | null = null;

/** Current reconnection delay (exponential back-off) */
let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

/** Current reconnection attempt counter */
let reconnectAttempts = 0;

/** Timeout handle for scheduled reconnection */
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** Whether SSE is currently the active sync mechanism (vs. polling fallback) */
let sseActive = false;

/** Callback invoked when rules are updated so the caller can notify content scripts */
type RulesUpdatedCallback = (accountId: string) => void;

/** Registered callback for rule update notifications */
let onRulesUpdated: RulesUpdatedCallback | null = null;

/** Last received message sequence number (for catch-up after reconnection) */
let lastSequence = 0;

/** Heartbeat timeout handle */
let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;

/** Heartbeat timeout duration: 45 seconds (30s interval + 15s grace) */
const HEARTBEAT_TIMEOUT_MS = 45_000;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the SSE rule sync connection.
 *
 * Call this once from the service worker's `onInstalled` or startup handler.
 * The module will attempt to open an SSE connection; if that fails, it will
 * automatically fall back to alarm-based polling.
 *
 * @param callback - Invoked with the affected accountId when rules are updated.
 *                   The caller should forward this to active content scripts.
 */
export function startSSESync(callback: RulesUpdatedCallback): void {
  onRulesUpdated = callback;
  // Initialize telemetry
  initSSEHealthMetrics().catch((err) => {
    logger.error('Failed to initialize SSE health metrics:', err);
  });
  connect();
}

/**
 * Shut down the SSE connection and any pending reconnection timers.
 *
 * Call this during extension unload or when unpairing.
 */
export function stopSSESync(): void {
  teardownEventSource();
  cancelReconnect();
  sseActive = false;
  onRulesUpdated = null;
  logger.info('SSE sync stopped');
}

/**
 * Returns whether the SSE connection is currently active and healthy.
 */
export function isSSEActive(): boolean {
  return sseActive && eventSource !== null && eventSource.readyState === EventSource.OPEN;
}

/**
 * Returns the current connection state for diagnostics.
 */
export function getSSEStatus(): {
  connected: boolean;
  reconnectAttempts: number;
  reconnectDelay: number;
  fallbackPolling: boolean;
} {
  return {
    connected: isSSEActive(),
    reconnectAttempts,
    reconnectDelay,
    fallbackPolling: !sseActive,
  };
}

// ─── Connection Management ────────────────────────────────────────────────────

/**
 * Establish the SSE connection to the backend stream endpoint.
 */
async function connect(): Promise<void> {
  // Clean up any prior connection
  teardownEventSource();

  // Update telemetry: connecting state
  await updateSSEHealthMetrics({ state: 'connecting' });

  try {
    const token = await getExtensionToken();
    if (!token) {
      logger.warn('No extension token available; SSE sync cannot start. Falling back to polling.');
      await updateSSEHealthMetrics({ state: 'disconnected' });
      enableFallbackPolling();
      return;
    }

    const apiBase = await getApiBase();
    const url = new URL(SSE_STREAM_PATH, apiBase);

    // Append token as query parameter since native EventSource does not
    // support custom headers.  The backend should accept both header and
    // query param authentication for the SSE endpoint.
    url.searchParams.set('token', token);

    // Append last sequence number for catch-up after reconnection
    if (lastSequence > 0) {
      url.searchParams.set('since', String(lastSequence));
      logger.info(`Reconnecting with sequence catch-up from ${lastSequence}`);
    }

    logger.info(`Opening SSE connection to ${url.toString()}`);

    eventSource = new EventSource(url.toString());

    // ── onopen ──────────────────────────────────────────────────────────
    eventSource.onopen = () => {
      logger.info('SSE connection established');
      sseActive = true;
      reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      reconnectAttempts = 0;

      // Update telemetry: connected state
      updateSSEHealthMetrics({
        state: 'connected',
        lastConnected: Date.now(),
        reconnectAttempts: 0,
      }).catch((err) => {
        logger.error('Failed to update SSE health metrics:', err);
      });

      // Disable polling alarm since SSE is now active
      disableFallbackPolling();

      // Start heartbeat timeout monitoring
      resetHeartbeatTimeout();
    };

    // ── onmessage (default event) ───────────────────────────────────────
    eventSource.onmessage = (event: MessageEvent) => {
      handleSSEMessage(event);
    };

    // ── named events ────────────────────────────────────────────────────
    eventSource.addEventListener('rules_updated', (event: Event) => {
      handleSSEMessage(event as MessageEvent);
    });

    eventSource.addEventListener('force_refresh', (event: Event) => {
      handleSSEMessage(event as MessageEvent);
    });

    eventSource.addEventListener('heartbeat', () => {
      logger.debug('SSE heartbeat received');
      resetHeartbeatTimeout();
    });

    // ── onerror ─────────────────────────────────────────────────────────
    eventSource.onerror = (error: Event) => {
      logger.warn('SSE connection error:', error);
      sseActive = false;

      // Update telemetry: error state
      updateSSEHealthMetrics({ state: 'error' }).catch((err) => {
        logger.error('Failed to update SSE health metrics:', err);
      });

      teardownEventSource();
      scheduleReconnect();
    };
  } catch (err) {
    logger.error('Failed to create SSE connection:', err);
    sseActive = false;

    // Update telemetry: error state
    updateSSEHealthMetrics({ state: 'error' }).catch((err2) => {
      logger.error('Failed to update SSE health metrics:', err2);
    });

    enableFallbackPolling();
  }
}

/**
 * Close the EventSource and clean up its listeners.
 */
function teardownEventSource(): void {
  if (eventSource) {
    try {
      eventSource.close();
    } catch {
      // Ignore close errors
    }
    eventSource = null;
  }
}

// ─── Reconnection ─────────────────────────────────────────────────────────────

/**
 * Schedule a reconnection attempt with exponential back-off.
 */
function scheduleReconnect(): void {
  cancelReconnect();

  reconnectAttempts++;

  // Update telemetry: reconnection attempt
  updateSSEHealthMetrics({ reconnectAttempts }).catch((err) => {
    logger.error('Failed to update SSE health metrics:', err);
  });

  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    logger.warn(
      `SSE reconnect limit reached (${MAX_RECONNECT_ATTEMPTS} attempts). ` +
      'Staying on polling fallback. Will retry on next alarm cycle.',
    );
    enableFallbackPolling();
    return;
  }

  logger.info(
    `Scheduling SSE reconnect in ${reconnectDelay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
  );

  // Enable polling as a safety net while we wait to reconnect
  enableFallbackPolling();

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);

  // Exponential back-off with cap
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
}

/**
 * Cancel any pending reconnection timer.
 */
function cancelReconnect(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// ─── Message Handling ─────────────────────────────────────────────────────────

/**
 * Process an incoming SSE message.
 *
 * Messages are expected to be JSON-encoded and conform to the
 * `WebSocketMessage` union type from the shared package.
 */
function handleSSEMessage(event: MessageEvent): void {
  let message: WebSocketMessage;

  try {
    message = JSON.parse(event.data as string) as WebSocketMessage;
  } catch {
    logger.debug('Non-JSON SSE message received:', event.data);
    return;
  }

  logger.info('SSE message received:', message.type);

  // Track sequence number for catch-up after reconnection
  const sequence = (message as { sequence?: number }).sequence;
  if (typeof sequence === 'number') {
    lastSequence = sequence;
  }

  // Record message receipt with latency tracking
  const serverTimestamp = (message as { timestamp?: string }).timestamp
    ? new Date((message as { timestamp?: string }).timestamp!).getTime()
    : undefined;

  recordSSEMessage(serverTimestamp).catch((err) => {
    logger.error('Failed to record SSE message telemetry:', err);
  });

  // Reset heartbeat timeout on any message received
  resetHeartbeatTimeout();

  switch (message.type) {
    case 'rules_updated':
      handleRulesUpdated(message as RulesUpdatedMessage);
      break;

    case 'force_refresh':
      handleForceRefresh();
      break;

    default:
      logger.debug('Unknown SSE message type:', (message as Record<string, unknown>).type);
  }
}

/**
 * Handle a `rules_updated` message.
 *
 * Invalidates the IndexedDB cache for every affected account and triggers
 * a re-fetch. Notifies active content scripts via the registered callback.
 */
async function handleRulesUpdated(message: RulesUpdatedMessage): Promise<void> {
  const { accountIdsAffected, version } = message;

  logger.info(
    `Rules updated to version ${version}. Affected accounts: ${accountIdsAffected.join(', ')}`,
  );

  for (const accountId of accountIdsAffected) {
    try {
      // 1. Invalidate the cached rules for this account
      await invalidateCache(accountId);

      // 2. Re-fetch rules immediately
      await syncRules(accountId);

      // 3. Notify caller (service worker) so it can forward to content scripts
      onRulesUpdated?.(accountId);
    } catch (err) {
      logger.error(`Failed to refresh rules for account ${accountId}:`, err);
    }
  }
}

/**
 * Handle a `force_refresh` message.
 *
 * Invalidates ALL cached rules and notifies the active account.
 */
async function handleForceRefresh(): Promise<void> {
  logger.info('Force refresh requested via SSE');

  try {
    await invalidateAllCaches();

    // Re-sync the active account if one is set
    const result = await chrome.storage.local.get('activeAccountId');
    const accountId = result.activeAccountId as string | undefined;

    if (accountId) {
      await syncRules(accountId);
      onRulesUpdated?.(accountId);
    }
  } catch (err) {
    logger.error('Force refresh failed:', err);
  }
}

// ─── Fallback Polling ─────────────────────────────────────────────────────────

/**
 * Enable the legacy alarm-based polling as a fallback.
 */
async function enableFallbackPolling(): Promise<void> {
  try {
    const existing = await chrome.alarms.get(RULES_POLL_ALARM);
    if (!existing) {
      await chrome.alarms.create(RULES_POLL_ALARM, {
        periodInMinutes: FALLBACK_POLL_INTERVAL_MINUTES,
      });
      logger.info('Fallback polling alarm enabled');
    }
  } catch (err) {
    logger.error('Failed to create fallback polling alarm:', err);
  }
}

/**
 * Disable the legacy alarm-based polling (SSE is active).
 */
async function disableFallbackPolling(): Promise<void> {
  try {
    await chrome.alarms.clear(RULES_POLL_ALARM);
    logger.info('Fallback polling alarm disabled (SSE is active)');
  } catch (err) {
    logger.debug('Could not clear polling alarm:', err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Retrieve the extension token from chrome.storage.local.
 */
async function getExtensionToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get('extensionToken');
    return (result.extensionToken as string) || null;
  } catch {
    return null;
  }
}

/**
 * Retrieve the API base URL from chrome.storage.local.
 */
async function getApiBase(): Promise<string> {
  try {
    const result = await chrome.storage.local.get('apiBaseUrl');
    return (result.apiBaseUrl as string) || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

/**
 * Reset the heartbeat timeout.
 *
 * If no heartbeat is received within HEARTBEAT_TIMEOUT_MS, the connection
 * is considered stale and we force a reconnection.
 */
function resetHeartbeatTimeout(): void {
  // Clear any existing timeout
  if (heartbeatTimeout) {
    clearTimeout(heartbeatTimeout);
  }

  // Set new timeout
  heartbeatTimeout = setTimeout(() => {
    logger.warn('SSE connection stale (no heartbeat received). Forcing reconnect.');
    sseActive = false;
    updateSSEHealthMetrics({ state: 'error' }).catch((err) => {
      logger.error('Failed to update SSE health metrics:', err);
    });
    teardownEventSource();
    scheduleReconnect();
  }, HEARTBEAT_TIMEOUT_MS);
}
