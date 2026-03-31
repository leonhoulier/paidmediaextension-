/**
 * Telemetry Module
 *
 * Provides telemetry collection and storage for extension diagnostics:
 * - Field extraction success rates per strategy
 * - SSE connection health metrics
 * - Compliance event delivery tracking
 *
 * All telemetry data is stored in chrome.storage.local with automatic
 * rotation to prevent unbounded growth.
 *
 * @module telemetry
 */

import { logger } from './logger.js';

// ─── Type Definitions ─────────────────────────────────────────────────────────

/**
 * Field extraction telemetry entry.
 * Records which extraction strategy succeeded for a given field.
 */
export interface FieldExtractionTelemetry {
  /** Timestamp when extraction was attempted */
  timestamp: number;
  /** Field path (e.g., 'campaign.name') */
  field: string;
  /** Strategy that successfully extracted the value */
  strategyUsed: 'require' | 'remoteEval' | 'fiber' | 'dom' | 'failed';
  /** Extraction duration in milliseconds */
  durationMs: number;
  /** Error message if extraction failed */
  error?: string;
}

/**
 * SSE connection health metrics.
 * Tracks connection state and message delivery statistics.
 */
export interface SSEHealthMetrics {
  /** Current connection state */
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Timestamp of last successful connection */
  lastConnected: number | null;
  /** Timestamp of last message received */
  lastMessageReceived: number | null;
  /** Number of reconnection attempts since last success */
  reconnectAttempts: number;
  /** Total messages received in current session */
  messagesReceived: number;
  /** Average message latency in milliseconds */
  averageLatencyMs: number;
  /** Cumulative latency for average calculation */
  cumulativeLatencyMs: number;
}

/**
 * Compliance event delivery telemetry.
 * Tracks POST /api/v1/compliance/events success/failure rates.
 */
export interface ComplianceEventTelemetry {
  /** Timestamp of POST attempt */
  timestamp: number;
  /** Whether POST succeeded */
  success: boolean;
  /** Number of events in the batch */
  eventCount: number;
  /** HTTP status code (if available) */
  statusCode?: number;
  /** Error message (if failed) */
  error?: string;
  /** Number of retry attempts */
  retryAttempt: number;
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  FIELD_EXTRACTION: 'telemetry_field_extraction',
  SSE_HEALTH: 'telemetry_sse_health',
  COMPLIANCE_EVENTS: 'telemetry_compliance_events',
} as const;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum field extraction telemetry entries to store (FIFO rotation) */
const MAX_FIELD_EXTRACTION_ENTRIES = 1000;

/** Maximum compliance event telemetry entries to store (FIFO rotation) */
const MAX_COMPLIANCE_EVENT_ENTRIES = 500;

// ─── Field Extraction Telemetry ───────────────────────────────────────────────

/**
 * Log a field extraction attempt.
 *
 * @param entry - The telemetry entry to record
 */
export async function logFieldExtraction(
  entry: FieldExtractionTelemetry,
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.FIELD_EXTRACTION);
    const entries = (result[STORAGE_KEYS.FIELD_EXTRACTION] as FieldExtractionTelemetry[]) || [];

    // Add new entry
    entries.push(entry);

    // Rotate if exceeds max size (FIFO)
    if (entries.length > MAX_FIELD_EXTRACTION_ENTRIES) {
      entries.splice(0, entries.length - MAX_FIELD_EXTRACTION_ENTRIES);
    }

    await chrome.storage.local.set({
      [STORAGE_KEYS.FIELD_EXTRACTION]: entries,
    });
  } catch (err) {
    logger.error('Failed to log field extraction telemetry:', err);
  }
}

/**
 * Get field extraction telemetry entries.
 *
 * @param limit - Maximum number of entries to return (default: all)
 * @returns Array of telemetry entries, newest first
 */
export async function getFieldExtractionTelemetry(
  limit?: number,
): Promise<FieldExtractionTelemetry[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.FIELD_EXTRACTION);
    const entries = (result[STORAGE_KEYS.FIELD_EXTRACTION] as FieldExtractionTelemetry[]) || [];

    // Return newest first
    const sorted = entries.slice().reverse();
    return limit ? sorted.slice(0, limit) : sorted;
  } catch (err) {
    logger.error('Failed to get field extraction telemetry:', err);
    return [];
  }
}

/**
 * Get field extraction success rates aggregated by strategy.
 *
 * @param sinceTimestamp - Only include entries after this timestamp (default: last 24 hours)
 * @returns Success rates per strategy
 */
export async function getFieldExtractionStats(
  sinceTimestamp?: number,
): Promise<{
  total: number;
  byStrategy: Record<string, { count: number; percentage: number }>;
  avgDurationMs: number;
  failureRate: number;
}> {
  const since = sinceTimestamp ?? Date.now() - 24 * 60 * 60 * 1000; // Default: last 24h
  const entries = await getFieldExtractionTelemetry();
  const filtered = entries.filter((e) => e.timestamp >= since);

  if (filtered.length === 0) {
    return {
      total: 0,
      byStrategy: {},
      avgDurationMs: 0,
      failureRate: 0,
    };
  }

  const byStrategy: Record<string, number> = {};
  let totalDuration = 0;
  let failedCount = 0;

  for (const entry of filtered) {
    byStrategy[entry.strategyUsed] = (byStrategy[entry.strategyUsed] || 0) + 1;
    totalDuration += entry.durationMs;
    if (entry.strategyUsed === 'failed') {
      failedCount++;
    }
  }

  return {
    total: filtered.length,
    byStrategy: Object.fromEntries(
      Object.entries(byStrategy).map(([strategy, count]) => [
        strategy,
        {
          count,
          percentage: (count / filtered.length) * 100,
        },
      ]),
    ),
    avgDurationMs: totalDuration / filtered.length,
    failureRate: (failedCount / filtered.length) * 100,
  };
}

/**
 * Clear all field extraction telemetry.
 */
export async function clearFieldExtractionTelemetry(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.FIELD_EXTRACTION);
}

// ─── SSE Health Metrics ───────────────────────────────────────────────────────

/**
 * Initialize SSE health metrics (call once on startup).
 */
export async function initSSEHealthMetrics(): Promise<void> {
  const existing = await getSSEHealthMetrics();
  if (!existing) {
    await updateSSEHealthMetrics({
      state: 'disconnected',
      lastConnected: null,
      lastMessageReceived: null,
      reconnectAttempts: 0,
      messagesReceived: 0,
      averageLatencyMs: 0,
      cumulativeLatencyMs: 0,
    });
  }
}

/**
 * Update SSE health metrics.
 *
 * @param updates - Partial metrics to update
 */
export async function updateSSEHealthMetrics(
  updates: Partial<SSEHealthMetrics>,
): Promise<void> {
  try {
    const current = await getSSEHealthMetrics();
    const updated = { ...current, ...updates };

    await chrome.storage.local.set({
      [STORAGE_KEYS.SSE_HEALTH]: updated,
    });
  } catch (err) {
    logger.error('Failed to update SSE health metrics:', err);
  }
}

/**
 * Get current SSE health metrics.
 *
 * @returns SSE health metrics, or default values if not initialized
 */
export async function getSSEHealthMetrics(): Promise<SSEHealthMetrics> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SSE_HEALTH);
    return (
      (result[STORAGE_KEYS.SSE_HEALTH] as SSEHealthMetrics) || {
        state: 'disconnected',
        lastConnected: null,
        lastMessageReceived: null,
        reconnectAttempts: 0,
        messagesReceived: 0,
        averageLatencyMs: 0,
        cumulativeLatencyMs: 0,
      }
    );
  } catch (err) {
    logger.error('Failed to get SSE health metrics:', err);
    return {
      state: 'error',
      lastConnected: null,
      lastMessageReceived: null,
      reconnectAttempts: 0,
      messagesReceived: 0,
      averageLatencyMs: 0,
      cumulativeLatencyMs: 0,
    };
  }
}

/**
 * Record a received SSE message and update latency metrics.
 *
 * @param serverTimestamp - Timestamp from backend when message was published
 */
export async function recordSSEMessage(serverTimestamp?: number): Promise<void> {
  const current = await getSSEHealthMetrics();
  const now = Date.now();

  const messagesReceived = current.messagesReceived + 1;

  // Calculate latency if server timestamp provided
  let averageLatencyMs = current.averageLatencyMs;
  let cumulativeLatencyMs = current.cumulativeLatencyMs;

  if (serverTimestamp) {
    const latency = now - serverTimestamp;
    cumulativeLatencyMs += latency;
    averageLatencyMs = cumulativeLatencyMs / messagesReceived;
  }

  await updateSSEHealthMetrics({
    lastMessageReceived: now,
    messagesReceived,
    averageLatencyMs,
    cumulativeLatencyMs,
  });
}

/**
 * Clear SSE health metrics.
 */
export async function clearSSEHealthMetrics(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.SSE_HEALTH);
}

// ─── Compliance Event Telemetry ───────────────────────────────────────────────

/**
 * Log a compliance event POST attempt.
 *
 * @param entry - The telemetry entry to record
 */
export async function logComplianceEvent(
  entry: ComplianceEventTelemetry,
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.COMPLIANCE_EVENTS);
    const entries = (result[STORAGE_KEYS.COMPLIANCE_EVENTS] as ComplianceEventTelemetry[]) || [];

    // Add new entry
    entries.push(entry);

    // Rotate if exceeds max size (FIFO)
    if (entries.length > MAX_COMPLIANCE_EVENT_ENTRIES) {
      entries.splice(0, entries.length - MAX_COMPLIANCE_EVENT_ENTRIES);
    }

    await chrome.storage.local.set({
      [STORAGE_KEYS.COMPLIANCE_EVENTS]: entries,
    });
  } catch (err) {
    logger.error('Failed to log compliance event telemetry:', err);
  }
}

/**
 * Get compliance event telemetry entries.
 *
 * @param limit - Maximum number of entries to return (default: all)
 * @returns Array of telemetry entries, newest first
 */
export async function getComplianceEventTelemetry(
  limit?: number,
): Promise<ComplianceEventTelemetry[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.COMPLIANCE_EVENTS);
    const entries = (result[STORAGE_KEYS.COMPLIANCE_EVENTS] as ComplianceEventTelemetry[]) || [];

    // Return newest first
    const sorted = entries.slice().reverse();
    return limit ? sorted.slice(0, limit) : sorted;
  } catch (err) {
    logger.error('Failed to get compliance event telemetry:', err);
    return [];
  }
}

/**
 * Get compliance event delivery statistics.
 *
 * @param sinceTimestamp - Only include entries after this timestamp (default: last 24 hours)
 * @returns Delivery stats
 */
export async function getComplianceEventStats(
  sinceTimestamp?: number,
): Promise<{
  total: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgRetryAttempts: number;
}> {
  const since = sinceTimestamp ?? Date.now() - 24 * 60 * 60 * 1000; // Default: last 24h
  const entries = await getComplianceEventTelemetry();
  const filtered = entries.filter((e) => e.timestamp >= since);

  if (filtered.length === 0) {
    return {
      total: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      avgRetryAttempts: 0,
    };
  }

  const successCount = filtered.filter((e) => e.success).length;
  const failureCount = filtered.length - successCount;
  const totalRetries = filtered.reduce((sum, e) => sum + e.retryAttempt, 0);

  return {
    total: filtered.length,
    successCount,
    failureCount,
    successRate: (successCount / filtered.length) * 100,
    avgRetryAttempts: totalRetries / filtered.length,
  };
}

/**
 * Clear all compliance event telemetry.
 */
export async function clearComplianceEventTelemetry(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.COMPLIANCE_EVENTS);
}

// ─── Export All Telemetry Data ────────────────────────────────────────────────

/**
 * Export all telemetry data for diagnostics.
 *
 * @returns Complete telemetry snapshot
 */
export async function exportAllTelemetry(): Promise<{
  fieldExtraction: FieldExtractionTelemetry[];
  sseHealth: SSEHealthMetrics;
  complianceEvents: ComplianceEventTelemetry[];
  exportedAt: number;
}> {
  return {
    fieldExtraction: await getFieldExtractionTelemetry(),
    sseHealth: await getSSEHealthMetrics(),
    complianceEvents: await getComplianceEventTelemetry(),
    exportedAt: Date.now(),
  };
}

/**
 * Clear all telemetry data.
 */
export async function clearAllTelemetry(): Promise<void> {
  await Promise.all([
    clearFieldExtractionTelemetry(),
    clearSSEHealthMetrics(),
    clearComplianceEventTelemetry(),
  ]);
}
